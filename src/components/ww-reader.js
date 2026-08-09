/**
 * <ww-reader> — Reading view with ruby annotations
 *
 * Displays annotated document content.
 * Click a ruby-annotated word → add to Blacklist (re-annotate)
 * Click a whitelisted word badge → remove from Whitelist (re-annotate)
 * Blacklisted words render as plain text, with no wrapper or styling.
 * CEFR level adjustable in toolbar.
 */

import { getDocument, getProficiencyLevel, setProficiencyLevel, getBlacklist, setBlacklist, getWhitelist, setWhitelist, saveDocument } from '../lib/storage.js';
import { annotateHtml, initGloss } from '../lib/annotator.js';
import { exportEpub, parseEpub, normalizeBuffer } from '../lib/epub.js';
import { downloadFile, downloadBlob, toast, escapeHtml } from '../lib/utils.js';
import { CEFR_LEVELS } from '../lib/gloss-engine.js';

const template = document.createElement('template');
template.innerHTML = `
  <link rel="stylesheet" href="src/styles/main.css">
  <div>
    <div class="reader-toolbar">
      <button class="back-btn" id="back-btn">← Back</button>
      <div class="level-selector">
        <label for="level-select">Level:</label>
        <select id="level-select">
          ${CEFR_LEVELS.map(l => `<option value="${l}">${l}</option>`).join('')}
        </select>
      </div>
      <div class="chapter-nav" id="chapter-nav" hidden>
        <button id="prev-chapter" class="btn">←</button>
        <span id="chapter-indicator">1 / 1</span>
        <button id="next-chapter" class="btn">→</button>
      </div>
      <button id="export-btn" class="btn" data-copy-label="Copy" hidden>Copy</button>
    </div>
    <div class="reader-panes" id="reader-panes">
      <div id="reader-content" class="reader-content"></div>
      <pre id="raw-panel" class="raw-panel" hidden></pre>
    </div>
    <div id="reader-loading" class="loading">
      <div class="spinner"></div>
      <span>Loading...</span>
    </div>
  </div>
`;

export class WwReader extends HTMLElement {
  /** @type {number|null} */
  #docId = null;
  /** @type {import('../lib/storage.js').Document|null} */
  #doc = null;
  /** @type {string} */
  #level = 'B1';
  /** @type {string[]} */
  #blacklist = [];
  /** @type {string[]} */
  #whitelist = [];
  /** @type {string[]} */
  #chapters = [];
  /** @type {number} */
  #chapterIndex = 0;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    this.shadowRoot.querySelector('#back-btn').addEventListener('click', () => this.#goBack());
    this.shadowRoot.querySelector('#level-select').addEventListener('change', (e) => this.#onLevelChange(e));
    this.shadowRoot.querySelector('#export-btn').addEventListener('click', () => this.#export());
    this.shadowRoot.querySelector('#prev-chapter').addEventListener('click', () => this.#goToChapter(this.#chapterIndex - 1));
    this.shadowRoot.querySelector('#next-chapter').addEventListener('click', () => this.#goToChapter(this.#chapterIndex + 1));
  }

  /** @param {number} docId */
  async load(docId) {
    this.#docId = docId;
    this.#chapterIndex = 0;
    this.#showLoading(true);
    this.shadowRoot.querySelector('#reader-content').innerHTML = '';

    try {
      this.#doc = await getDocument(docId);
      if (!this.#doc) {
        this.shadowRoot.querySelector('#reader-content').innerHTML = '<p>Document not found.</p>';
        this.#showLoading(false);
        return;
      }

      this.#level = await getProficiencyLevel();
      this.#blacklist = await getBlacklist();
      this.#whitelist = await getWhitelist();

      this.shadowRoot.querySelector('#level-select').value = this.#level;

      if (this.#doc.type === 'epub') {
        await this.#ensureChapters();
      }

      // Plain-text docs export by copying the ruby fragment; others download a file.
      const exportBtn = this.shadowRoot.querySelector('#export-btn');
      exportBtn.hidden = false;
      exportBtn.textContent = this.#doc.type === 'text'
        ? (exportBtn.dataset.copyLabel || 'Copy')
        : 'Export';

      this.#render();
      this.#showLoading(false);
    } catch (err) {
      this.#showLoading(false);
      toast('Failed to load document: ' + err.message, 'error');
      console.error(err);
    }
  }

  /**
   * Ensure an EPUB document has raw chapters. New docs have them; legacy docs
   * (stored before chapters existed) are rebuilt once from rawContent.
   */
  async #ensureChapters() {
    if (Array.isArray(this.#doc.chapters)) {
      this.#chapters = this.#doc.chapters;
      return;
    }
    if (!this.#doc.rawContent) return;

    try {
      const { chapters } = await parseEpub(normalizeBuffer(this.#doc.rawContent));
      this.#doc.chapters = chapters;
      this.#chapters = chapters;
      await saveDocument(this.#doc);
    } catch (err) {
      console.warn('[reader] Failed to rebuild chapters from rawContent:', err);
    }
  }

  #showLoading(show) {
    this.shadowRoot.querySelector('#reader-loading').style.display = show ? 'flex' : 'none';
  }

  async #render() {
    const container = this.shadowRoot.querySelector('#reader-content');

    if (this.#doc.type === 'epub') {
      this.#renderChapter();
      return;
    }

    // Re-annotate based on current level + blacklist + whitelist.
    // For text & HTML documents, rawContent is the original plain text/HTML
    // (a string) — use it directly so structure is preserved.
    let rawContent;
    if (typeof this.#doc.rawContent === 'string') {
      rawContent = this.#doc.rawContent;
    } else {
      rawContent = this.#extractTextFromAnnotated(this.#doc.content);
    }

    await initGloss();
    const annotated = annotateHtml(rawContent, this.#level, this.#blacklist, this.#whitelist);

    const rawPanel = this.shadowRoot.querySelector('#raw-panel');
    if (this.#doc.type === 'text') {
      // Plain text: show the rendered ruby alongside the literal markup so the
      // `<ruby>/<rt>` tags are visible for comparison. textContent displays the
      // tags verbatim.
      container.innerHTML = annotated;
      rawPanel.textContent = annotated;
      rawPanel.hidden = false;
    } else {
      container.innerHTML = annotated;
      rawPanel.hidden = true;
    }

    // Setup click handlers for word interaction
    container.addEventListener('click', (e) => this.#onWordClick(e));
  }

  /** Render and annotate only the current chapter (EPUB docs). */
  async #renderChapter() {
    const container = this.shadowRoot.querySelector('#reader-content');
    const chapterNav = this.shadowRoot.querySelector('#chapter-nav');
    const rawPanel = this.shadowRoot.querySelector('#raw-panel');
    rawPanel.hidden = true;

    if (this.#chapters.length === 0) {
      // Legacy fallback: no rebuildable chapters — show flattened legacy content
      chapterNav.hidden = true;
      container.innerHTML = annotateHtml(
        this.#extractTextFromAnnotated(this.#doc.content || ''),
        this.#level, this.#blacklist, this.#whitelist
      );
      container.addEventListener('click', (e) => this.#onWordClick(e));
      return;
    }

    const index = Math.min(Math.max(this.#chapterIndex, 0), this.#chapters.length - 1);
    this.#chapterIndex = index;

    await initGloss();
    const annotated = annotateHtml(this.#chapters[index], this.#level, this.#blacklist, this.#whitelist);
    container.innerHTML = annotated;

    container.addEventListener('click', (e) => this.#onWordClick(e));

    this.shadowRoot.querySelector('#chapter-indicator').textContent = `${index + 1} / ${this.#chapters.length}`;
    this.shadowRoot.querySelector('#prev-chapter').disabled = index <= 0;
    this.shadowRoot.querySelector('#next-chapter').disabled = index >= this.#chapters.length - 1;
    chapterNav.hidden = false;
  }

  #goToChapter(index) {
    this.#chapterIndex = index;
    this.#renderChapter();
  }

  #extractTextFromAnnotated(html) {
    // Strip tags but exclude ruby rt content (Chinese translations)
    const div = document.createElement('div');
    div.innerHTML = html;
    // Remove all rt elements (Chinese translations) before extracting text
    div.querySelectorAll('rt').forEach(el => el.remove());
    // Remove ruby wrappers but keep their text content
    div.querySelectorAll('ruby').forEach(el => {
      const text = el.childNodes[0]?.textContent || '';
      el.replaceWith(text);
    });
    // Remove word badges but keep their text
    div.querySelectorAll('.word-badge').forEach(el => {
      el.replaceWith(el.textContent || '');
    });
    return div.textContent || '';
  }

  async #onWordClick(e) {
    // Click on a ruby or word-badge → toggle blacklist/whitelist
    const ruby = e.target.closest('ruby');
    const badge = e.target.closest('.word-badge');

    if (ruby) {
      const word = ruby.dataset.word;
      if (word) await this.#toggleBlacklist(word);
    } else if (badge) {
      const word = badge.dataset.word;
      if (word) await this.#toggleWhitelist(word);
    }
  }

  async #toggleBlacklist(word) {
    const idx = this.#blacklist.indexOf(word);
    if (idx >= 0) {
      this.#blacklist.splice(idx, 1);
    } else {
      this.#blacklist.push(word);
      // Remove from whitelist if present
      const wIdx = this.#whitelist.indexOf(word);
      if (wIdx >= 0) this.#whitelist.splice(wIdx, 1);
    }
    await setBlacklist(this.#blacklist);
    await setWhitelist(this.#whitelist);
    this.#render();
  }

  async #toggleWhitelist(word) {
    const idx = this.#whitelist.indexOf(word);
    if (idx >= 0) {
      this.#whitelist.splice(idx, 1);
    } else {
      this.#whitelist.push(word);
      // Remove from blacklist if present
      const bIdx = this.#blacklist.indexOf(word);
      if (bIdx >= 0) this.#blacklist.splice(bIdx, 1);
    }
    await setBlacklist(this.#blacklist);
    await setWhitelist(this.#whitelist);
    this.#render();
  }

  async #onLevelChange(e) {
    this.#level = e.target.value;
    await setProficiencyLevel(this.#level);
    this.#render();
    toast(`Level changed to ${this.#level}`, 'info');
  }

  async #export() {
    if (!this.#doc) return;

    try {
      await initGloss();

      if (this.#doc.type === 'text') {
        // Plain text: copy only the ruby-annotated fragment (no full HTML document).
        const rawContent = this.#doc.rawContent && typeof this.#doc.rawContent === 'string'
          ? this.#doc.rawContent
          : this.#extractTextFromAnnotated(this.#doc.content);
        const annotated = annotateHtml(rawContent, this.#level, this.#blacklist, this.#whitelist);
        try {
          await navigator.clipboard.writeText(annotated);
          toast('Copied to clipboard', 'success');
        } catch (err) {
          toast('Copy failed: ' + err.message, 'error');
        }
        return;
      }

      if (this.#doc.type === 'epub' && this.#doc.rawContent) {
        // Re-export EPUB with current annotations
        const blob = await exportEpub(normalizeBuffer(this.#doc.rawContent), (html) => {
          return annotateHtml(html, this.#level, this.#blacklist, this.#whitelist);
        });
        downloadBlob(blob, this.#doc.title.replace(/[^a-zA-Z0-9_\-]/g, '_') + '_annotated.epub');
        toast('EPUB exported', 'success');
      } else {
        // Export as HTML
        const rawContent = this.#doc.rawContent
          ? (typeof this.#doc.rawContent === 'string' ? this.#doc.rawContent : '')
          : this.#extractTextFromAnnotated(this.#doc.content);

        if (this.#doc.type === 'html' && this.#doc.rawContent && typeof this.#doc.rawContent === 'string') {
          // For HTML uploads, annotate the original HTML
          const annotated = annotateHtml(rawContent, this.#level, this.#blacklist, this.#whitelist);
          downloadFile(annotated, this.#doc.title.replace(/[^a-zA-Z0-9_\-]/g, '_') + '_annotated.html', 'text/html');
        } else {
          // For pasted text, wrap in clean HTML
          const annotated = annotateHtml(`<p>${escapeHtml(rawContent)}</p>`, this.#level, this.#blacklist, this.#whitelist);
          const html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${escapeHtml(this.#doc.title)}</title><style>body{max-width:700px;margin:2em auto;padding:0 1em;line-height:2;font-size:1.125rem}ruby{cursor:pointer}rt{font-size:0.65em;color:#92400e;background:#fef3c7;padding:1px 3px;border-radius:3px;user-select:none}</style></head><body>${annotated}</body></html>`;
          downloadFile(html, this.#doc.title.replace(/[^a-zA-Z0-9_\-]/g, '_') + '.html', 'text/html');
        }
        toast('HTML exported', 'success');
      }
    } catch (err) {
      toast('Export failed: ' + err.message, 'error');
      console.error(err);
    }
  }

  #goBack() {
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: { view: 'shelf' },
      bubbles: true,
      composed: true,
    }));
  }
}

customElements.define('ww-reader', WwReader);