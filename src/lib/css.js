/**
 * css — applies user custom CSS per document format
 *
 * Three embed mechanisms, one per output format:
 * - Inline styles (plain-text copy): fold CSS rules into element `style`
 *   attributes so the styling travels with the copied fragment.
 * - Internal stylesheet (HTML export): inject a `<style>` into `<head>`.
 * - External stylesheet (EPUB export): handled in epub.js, which drops the
 *   CSS into a real styles.css file and links it from each chapter.
 */

/**
 * Apply a stylesheet to an HTML fragment by converting matching rules to
 * inline `style` attributes. Pseudo-class selectors (containing `:`) are
 * skipped — they can't be represented inline. Media rules are applied
 * unconditionally (no viewport matching), so a rule inside `@media` is
 * still applied inline.
 * @param {string} fragment
 * @param {string} css
 * @returns {string} the fragment with matching rules inlined
 */
export function applyCssInline(fragment, css) {
  const holder = document.createElement('div');
  holder.innerHTML = `<style>${css}</style>${fragment}`;

  const styleEl = holder.querySelector('style');
  if (styleEl?.sheet) {
    inlineRules(styleEl.sheet.cssRules, holder);
  }

  // Strip the temporary <style> before returning the fragment.
  styleEl?.remove();
  return holder.innerHTML;
}

/**
 * Walk a rule list, inlining each matching style rule onto the matching
 * elements inside the holder (recursing into @media).
 * @param {CSSRuleList} rules
 * @param {HTMLElement} holder
 */
function inlineRules(rules, holder) {
  for (const rule of rules) {
    if (rule instanceof CSSMediaRule) {
      inlineRules(rule.cssRules, holder);
      continue;
    }
    if (!(rule instanceof CSSStyleRule)) continue;
    // Pseudo-class selectors can't become inline styles — skip.
    if (rule.selectorText.includes(':')) continue;
    const selector = rule.selectorText;
    if (!selector) continue;
    let matched;
    try {
      matched = holder.querySelectorAll(selector);
    } catch {
      // Unsupported selector — skip rather than throw.
      continue;
    }
    const decl = rule.style.cssText;
    if (!decl) continue;
    matched.forEach(el => {
      el.style.cssText = (el.style.cssText ? el.style.cssText + ';' : '') + decl;
    });
  }
}

/**
 * Embed a stylesheet into a full HTML document as an internal `<style>`.
 * @param {string} html — full HTML document string
 * @param {string} css
 * @returns {string} the document with `<style>` inserted before `</head>`
 */
export function embedInternalCss(html, css) {
  const style = `<style>\n${css}\n</style>`;
  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, () => style + '\n</head>');
  }
  // No head — prepend so the rules still apply to the document body.
  return style + '\n' + html;
}
