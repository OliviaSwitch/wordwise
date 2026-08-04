/**
 * EPUB utilities — import and export using JSZip.
 *
 * Import: unzips the EPUB, reads OPF to find the spine and manifest,
 * extracts chapter HTML in order, merges into one document.
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
 * Parse an EPUB ArrayBuffer into document content.
 * @param {ArrayBuffer} buffer
 * @param {(html: string) => string} annotateFn — function that takes raw HTML and returns annotated HTML
 * @returns {Promise<{title: string, content: string, rawContent: ArrayBuffer}>}
 */
export async function parseEpub(buffer, annotateFn) {
  const JSZip = getJSZip();
  const zip = await JSZip.loadAsync(buffer);

  // Find the OPF file from META-INF/container.xml
  const containerXml = await zip.file('META-INF/container.xml').async('string');
  const opfPath = parseContainerXml(containerXml);

  // Read OPF
  const opfXml = await zip.file(opfPath).async('string');
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
  const { title, spine, manifest } = parseOpf(opfXml, opfDir);

  // Read spine items in order, annotate, merge
  const chapters = [];
  for (const href of spine) {
    const file = zip.file(href);
    if (!file) continue;
    const html = await file.async('string');
    chapters.push(annotateFn(html));
  }

  const content = chapters.join('\n');

  return {
    title,
    content: `<div class="epub-content">${content}</div>`,
    rawContent: buffer,
  };
}

/**
 * Re-export an EPUB with annotated content.
 * @param {ArrayBuffer} originalBuffer
 * @param {(html: string) => string} annotateFn
 * @returns {Promise<Blob>}
 */
export async function exportEpub(originalBuffer, annotateFn) {
  const JSZip = getJSZip();
  const zip = await JSZip.loadAsync(originalBuffer);

  // Find OPF path
  const containerXml = await zip.file('META-INF/container.xml').async('string');
  const opfPath = parseContainerXml(containerXml);
  const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);
  const opfXml = await zip.file(opfPath).async('string');
  const { spine, manifest } = parseOpf(opfXml, opfDir);

  // Re-annotate each spine item and replace in zip
  for (const href of spine) {
    const file = zip.file(href);
    if (!file) continue;
    const html = await file.async('string');
    const annotated = annotateFn(html);
    zip.file(href, annotated);
  }

  const blob = await zip.generateAsync({ type: 'blob' });
  return blob;
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