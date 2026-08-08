/**
 * annotator — generates annotated HTML from raw content
 *
 * Orchestrates: tokenization → gloss lookup → CEFR filter → ruby injection
 *
 * Three parsing routes:
 * - Full XHTML documents (input starts with `<?xml`) are parsed strictly as
 *   XHTML and serialized back with XMLSerializer, which preserves the `<?xml?>`
 *   declaration, root tags, and self-closing void elements. Used by EPUB
 *   chapter export.
 * - Full HTML documents (input starts with `<!DOCTYPE` or `<html`) are parsed
 *   leniently as HTML5 and re-serialized via the root element's outerHTML,
 *   preserving the doctype, `<html>` root, `<head>`, and `<body>`. Used by
 *   full-HTML file export.
 * - Fragments / plain text go through the lenient HTML5 path (wrapped in a
 *   `<div>`, serialized via innerHTML). Used by the reading view and for
 *   pasted-text export.
 */

import { GlossIndex, planGlosses, CEFR_LEVELS } from './gloss-engine.js';

export { CEFR_LEVELS } from './gloss-engine.js';

/** @type {GlossIndex|null} */
let glossIndex = null;
let glossLoadPromise = null;

/**
 * Initialize the gloss index. Called once at app startup.
 * @returns {Promise<void>}
 */
export function initGloss() {
  if (glossLoadPromise) return glossLoadPromise;
  glossIndex = new GlossIndex();
  glossLoadPromise = glossIndex.load('data/en-zh.json');
  return glossLoadPromise;
}

/**
 * Annotate raw content with ruby annotations.
 *
 * Full documents are routed by their leading marker:
 * - `<?xml` → strict XHTML path (EPUB chapters)
 * - `<!DOCTYPE` or `<html` → lenient HTML5 document path (full HTML files)
 * Anything else is treated as a fragment or plain text.
 *
 * @param {string} html — raw HTML (may contain tags)
 * @param {string} level — CEFR level
 * @param {string[]} blacklist — words to skip
 * @param {string[]} whitelist — words to always annotate
 * @returns {string} annotated HTML
 */
export function annotateHtml(html, level, blacklist, whitelist) {
  const trimmed = html.trimStart();
  if (/^<\?xml/i.test(trimmed)) {
    return annotateXhtmlDocument(html, level, blacklist, whitelist);
  }
  if (/^<!doctype/i.test(trimmed) || /^<html\b/i.test(trimmed)) {
    return annotateHtmlDocument(html, level, blacklist, whitelist);
  }
  return annotateHtmlFragment(html, level, blacklist, whitelist);
}

/**
 * Common HTML5 named entities mapped to numeric XML-safe equivalents.
 * EPUB content frequently uses these; XML strict parsing rejects them.
 */
const NAMED_ENTITY_MAP = {
  '&nbsp;': '&#160;',
  '&copy;': '&#169;',
  '&hellip;': '&#8230;',
  '&mdash;': '&#8212;',
  '&ndash;': '&#8211;',
  '&ldquo;': '&#8220;',
  '&rdquo;': '&#8221;',
  '&lsquo;': '&#8216;',
  '&rsquo;': '&#8217;',
};

/**
 * Replace the most common HTML5 named entities with numeric entities so the
 * string survives strict XML parsing. Unknown entities are left untouched.
 * @param {string} s
 * @returns {string}
 */
function replaceNamedEntities(s) {
  return s.replace(/&[a-z]+;/gi, (match) => {
    const replacement = NAMED_ENTITY_MAP[match.toLowerCase()];
    return replacement !== undefined ? replacement : match;
  });
}

/**
 * Annotate a full XHTML document, preserving strict XML structure.
 *
 * Named entities are normalized to numeric entities before the strict parse;
 * if the parse still fails, falls back to the lenient fragment path so
 * reading/export never crashes on unusual input.
 *
 * @param {string} html — full XHTML document string
 * @param {string} level — CEFR level
 * @param {string[]} blacklist — words to skip
 * @param {string[]} whitelist — words to always annotate
 * @returns {string} annotated XHTML document
 */
export function annotateXhtmlDocument(html, level, blacklist, whitelist) {
  if (!glossIndex) throw new Error('GlossIndex not loaded. Call initGloss() first.');

  const blacklistSet = new Set(blacklist.map(w => w.toLowerCase()));
  const whitelistSet = new Set(whitelist.map(w => w.toLowerCase()));

  const prepped = replaceNamedEntities(html);
  const doc = new DOMParser().parseFromString(prepped, 'application/xhtml+xml');

  // XML strict mode reports parse failures by producing a <parsererror> root.
  if (!doc.documentElement || doc.documentElement.nodeName.toLowerCase() !== 'html') {
    console.warn('[annotator] XHTML strict parse failed; falling back to lenient HTML parsing.');
    return annotateHtmlFragment(html, level, blacklist, whitelist);
  }

  // Only the body is reading content — leave <head> untouched.
  const container = doc.getElementsByTagName('body')[0] || doc.documentElement;
  walkTextNodes(container, (text) => {
    const plans = planGlosses(text, glossIndex, level, blacklistSet, whitelistSet);
    return renderAnnotations(plans);
  });

  // Whether XMLSerializer re-emits the XML declaration varies by browser —
  // Chrome does, Firefox doesn't. Normalize: strip whatever it emitted, then
  // re-attach the original declaration from the input so only one appears.
  const serialized = new XMLSerializer().serializeToString(doc);
  const body = serialized.replace(/^\s*<\?xml[^>]*\?>\s*/i, '');
  const decl = prepped.match(/^\s*<\?xml[^>]*\?>\s*/i);
  return decl ? decl[0] + body : body;
}

/**
 * Annotate a full HTML5 document, preserving the document wrapper.
 *
 * Parses leniently as text/html (an HTML5 doc with void elements like
 * `<meta charset>` is not well-formed XML, so the strict XHTML path would
 * fail), annotates only the body, then re-serializes via the root element's
 * outerHTML — which keeps the `<html>` root with its attributes, `<head>`,
 * and `<body>`. The doctype, which outerHTML does not emit, is captured from
 * the input and re-attached.
 *
 * @param {string} html — full HTML document string
 * @param {string} level — CEFR level
 * @param {string[]} blacklist — words to skip
 * @param {string[]} whitelist — words to always annotate
 * @returns {string} annotated HTML document
 */
function annotateHtmlDocument(html, level, blacklist, whitelist) {
  if (!glossIndex) throw new Error('GlossIndex not loaded. Call initGloss() first.');

  const blacklistSet = new Set(blacklist.map(w => w.toLowerCase()));
  const whitelistSet = new Set(whitelist.map(w => w.toLowerCase()));

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body || doc.documentElement;

  walkTextNodes(body, (text) => {
    const plans = planGlosses(text, glossIndex, level, blacklistSet, whitelistSet);
    return renderAnnotations(plans);
  });

  const doctype = html.match(/^\s*<!doctype[^>]*>\s*/i);
  const serialized = doc.documentElement.outerHTML;
  return (doctype ? doctype[0].trim() + '\n' : '') + serialized;
}

/**
 * Annotate an HTML fragment or plain text using the lenient HTML5 path.
 * @param {string} html
 * @param {string} level — CEFR level
 * @param {string[]} blacklist — words to skip
 * @param {string[]} whitelist — words to always annotate
 * @returns {string}
 */
function annotateHtmlFragment(html, level, blacklist, whitelist) {
  if (!glossIndex) throw new Error('GlossIndex not loaded. Call initGloss() first.');

  const blacklistSet = new Set(blacklist.map(w => w.toLowerCase()));
  const whitelistSet = new Set(whitelist.map(w => w.toLowerCase()));

  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  const container = doc.body.firstElementChild;

  walkTextNodes(container, (text) => {
    const plans = planGlosses(text, glossIndex, level, blacklistSet, whitelistSet);
    return renderAnnotations(plans);
  });

  return container.innerHTML;
}

/**
 * Walk all text nodes in a DOM subtree and apply annotation.
 * @param {Node} node
 * @param {(text: string) => string} fn
 */
function walkTextNodes(node, fn) {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent;
    if (text.trim().length > 0) {
      // Parse the annotated HTML into a fragment so the text lands directly
      // under the original parent — no extra <span> wrapper. The range must
      // come from the node's own document (the XHTML path operates on a
      // different document than the main one).
      const range = node.ownerDocument.createRange();
      const fragment = range.createContextualFragment(fn(text));
      node.parentNode.replaceChild(fragment, node);
    }
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    // Skip script, style, and ruby elements (don't double-annotate)
    const tag = node.tagName.toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'ruby' || tag === 'rt' || tag === 'rp') {
      return;
    }
    // Walk children in reverse to avoid index issues
    const children = Array.from(node.childNodes);
    for (const child of children) {
      walkTextNodes(child, fn);
    }
  }
}

/**
 * Render annotation plans back to HTML with ruby elements and badges.
 * @param {Array} plans
 * @returns {string}
 */
function renderAnnotations(plans) {
  return plans.map(p => {
    if (!p.isWord) {
      return escapeHtml(p.token);
    }
    if (!p.annotated || !p.gloss) {
      // Still show as clickable badge for blacklist/whitelist interaction
      const cls = p.blacklisted ? 'word-badge blacklisted' : p.whitelisted ? 'word-badge whitelisted' : '';
      return cls
        ? `<span class="${cls}" data-word="${escapeHtml(p.token.toLowerCase())}">${escapeHtml(p.token)}</span>`
        : escapeHtml(p.token);
    }
    return `<ruby data-word="${escapeHtml(p.token.toLowerCase())}">${escapeHtml(p.token)}<rp>(</rp><rt>${escapeHtml(p.gloss)}</rt><rp>)</rp></ruby>`;
  }).join('');
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(s));
  // innerHTML serializes U+00A0 as &nbsp;, which is not a valid XML entity and
  // breaks createContextualFragment on the XHTML path — emit &#160; instead.
  return div.innerHTML.replace(/&nbsp;/g, '&#160;');
}
