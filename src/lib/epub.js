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
