/**
 * EPUB utilities — import and export using JSZip.
 *
 * Import: unzips the EPUB, reads OPF to find the spine and manifest,
 * extracts chapter HTML in order as raw strings (annotation happens later,
 * one chapter at a time, in the reader).
 *
 * Export: takes the original EPUB zip, injects ruby annotations into
 * chapter HTML files, and re-bundles.
 *
 * JSZip is loaded globally via <script> tag in index.html (UMD build).
 */

function getJSZip() {
  if (!window.JSZip || !window.JSZip.loadAsync) {
    throw new Error('JSZip not loaded. Ensure the script tag is present in index.html.');
  }
  return window.JSZip;
}

/**
 * Parse an EPUB ArrayBuffer into its raw chapters.
 * @param {ArrayBuffer} buffer
 * @returns {Promise<{title: string, chapters: string[], fileNames: string[]}>}
 */
export async function parseEpub(buffer) {
  const JSZip = getJSZip();
  const zip = await JSZip.loadAsync(buffer);

  // Find the OPF file from META-INF/container.xml
  const containerXml = await zip.file('META-INF/container.xml').async('string');
  const opfPath = parseContainerXml(containerXml);

  // Read OPF
  const opfXml = await zip.file(opfPath).async('string');
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
  const { title, spine, manifest } = parseOpf(opfXml, opfDir);

  // Read spine items in order (raw, unannotated — annotation happens per chapter at read time).
  // Track the file name of each spine item so the reader can list them in its TOC.
  const chapters = [];
  const fileNames = [];
  for (const href of spine) {
    const file = zip.file(href);
    if (!file) continue;
    chapters.push(await file.async('string'));
    fileNames.push(href.substring(href.lastIndexOf('/') + 1));
  }

  return { title, chapters, fileNames };
}

/**
 * Coerce a stored rawContent (ArrayBuffer or Uint8Array, as structured clone
 * may return either) into a plain ArrayBuffer.
 * @param {ArrayBuffer|Uint8Array} buffer
 * @returns {ArrayBuffer}
 */
export function normalizeBuffer(buffer) {
  return buffer instanceof ArrayBuffer ? buffer : new Uint8Array(buffer).buffer;
}

/**
 * Re-export an EPUB with annotated content.
 * @param {ArrayBuffer} originalBuffer
 * @param {(html: string) => string} annotateFn
 * @param {string} [customCss] — user CSS embedded as an external stylesheet
 * @returns {Promise<Blob>}
 */
export async function exportEpub(originalBuffer, annotateFn, customCss = '') {
  const JSZip = getJSZip();
  const zip = await JSZip.loadAsync(originalBuffer);

  // Find OPF path
  const containerXml = await zip.file('META-INF/container.xml').async('string');
  const opfPath = parseContainerXml(containerXml);
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
  const opfXml = await zip.file(opfPath).async('string');
  const { spine, manifest } = parseOpf(opfXml, opfDir);

  // External user stylesheet: write styles/user.css, register it in the
  // manifest, and link it from every chapter head.
  const userCssPath = opfDir + 'styles/user.css';
  if (customCss.trim()) {
    zip.file(userCssPath, customCss);
    if (!/<\/manifest>/i.test(opfXml)) {
      throw new Error('Cannot find </manifest> in OPF to register user stylesheet.');
    }
    const item = `<item id="user-css" href="styles/user.css" media-type="text/css"/>`;
    zip.file(opfPath, opfXml.replace(/<\/manifest>/i, () => `    ${item}\n  </manifest>`));
  }

  // Re-annotate each spine item and replace in zip
  for (const href of spine) {
    const file = zip.file(href);
    if (!file) continue;
    const html = await file.async('string');
    let annotated = annotateFn(html);
    if (customCss.trim()) {
      annotated = addCssLink(annotated, relativePath(dirname(href), userCssPath));
    }
    zip.file(href, annotated);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return blob;
}

/** Directory portion of a path ('' when there is none). */
function dirname(path) {
  const i = path.lastIndexOf('/');
  return i >= 0 ? path.substring(0, i) : '';
}

/**
 * Relative path from a directory to a target path, e.g.
 * relativePath('OEBPS/chapters', 'OEBPS/styles/user.css') → '../styles/user.css'.
 * @param {string} fromDir
 * @param {string} toPath
 * @returns {string}
 */
function relativePath(fromDir, toPath) {
  const fromParts = fromDir ? fromDir.split('/') : [];
  const toParts = toPath.split('/');

  // Drop the common prefix.
  let i = 0;
  while (i < fromParts.length && i < toParts.length && fromParts[i] === toParts[i]) i++;
  const up = fromParts.length - i;
  const down = toParts.slice(i);
  return (up > 0 ? '../'.repeat(up) : '') + down.join('/');
}

/**
 * Insert a stylesheet <link> into a chapter's <head>.
 * Falls back to prepending before the first element when no head exists.
 * @param {string} html
 * @param {string} href — relative path to the stylesheet
 * @returns {string}
 */
function addCssLink(html, href) {
  const link = `<link rel="stylesheet" type="text/css" href="${href}"/>`;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, () => link + '\n</head>');
  }
  return link + '\n' + html;
}

/**
 * Parse container.xml to get the OPF path.
 * @param {string} xml
 * @returns {string}
 */
function parseContainerXml(xml) {
  const match = xml.match(/full-path="([^"]+)"/);
  if (!match) throw new Error('Cannot find OPF path in container.xml');
  return match[1];
}

/**
 * Parse OPF XML to extract title, spine (hrefs), and manifest.
 * @param {string} xml
 * @param {string} opfDir
 * @returns {{title: string, spine: string[], manifest: Object}}
 */
function parseOpf(xml, opfDir) {
  // Extract title
  const titleMatch = xml.match(/<dc:title[^>]*>([^<]+)<\/dc:title>/);
  const title = titleMatch ? titleMatch[1].trim() : 'Untitled';

  // Build manifest map: id → href
  const manifest = {};
  const manifestRe = /<item[^>]+>/g;
  let m;
  while ((m = manifestRe.exec(xml)) !== null) {
    const idMatch = m[0].match(/id="([^"]+)"/);
    const hrefMatch = m[0].match(/href="([^"]+)"/);
    const mediaTypeMatch = m[0].match(/media-type="([^"]+)"/);
    if (idMatch && hrefMatch) {
      const mt = mediaTypeMatch ? mediaTypeMatch[1] : '';
      manifest[idMatch[1]] = { href: opfDir + hrefMatch[1], mediaType: mt };
    }
  }

  // Extract spine itemrefs in order
  const spine = [];
  const spineRe = /<itemref[^>]+>/g;
  while ((m = spineRe.exec(xml)) !== null) {
    const idrefMatch = m[0].match(/idref="([^"]+)"/);
    if (idrefMatch && manifest[idrefMatch[1]]) {
      const href = manifest[idrefMatch[1]].href;
      // Only include XHTML/HTML items
      const mt = manifest[idrefMatch[1]].mediaType;
      if (mt.includes('xhtml') || mt.includes('html')) {
        spine.push(href);
      }
    }
  }

  return { title, spine, manifest };
}
