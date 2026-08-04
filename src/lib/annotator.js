/**
 * annotator — generates annotated HTML from raw content
 *
 * Orchestrates: tokenization → gloss lookup → CEFR filter → ruby injection
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
 * Annotate raw HTML content with ruby annotations.
 *
 * @param {string} html — raw HTML (may contain tags)
 * @param {string} level — CEFR level
 * @param {string[]} blacklist — words to skip
 * @param {string[]} whitelist — words to always annotate
 * @returns {string} annotated HTML
 */
export function annotateHtml(html, level, blacklist, whitelist) {
  if (!glossIndex) throw new Error('GlossIndex not loaded. Call initGloss() first.');

  const blacklistSet = new Set(blacklist.map(w => w.toLowerCase()));
  const whitelistSet = new Set(whitelist.map(w => w.toLowerCase()));

  // Process text nodes within HTML, leaving tags intact
  return annotateTextNodes(html, (text) => {
    const plans = planGlosses(text, glossIndex, level, blacklistSet, whitelistSet);
    return renderAnnotations(plans);
  });
}

/**
 * Walk HTML and annotate text nodes, preserving HTML structure.
 * @param {string} html
 * @param {(text: string) => string} annotateText
 * @returns {string}
 */
function annotateTextNodes(html, annotateText) {
  // Use DOM parsing to handle this properly
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
  const container = doc.body.firstElementChild;

  walkTextNodes(container, annotateText);

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
      const fragment = document.createElement('span');
      fragment.innerHTML = fn(text);
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
  return div.innerHTML;
}