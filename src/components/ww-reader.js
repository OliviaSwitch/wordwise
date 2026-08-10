/**
 * <ww-reader> — Reading view with ruby annotations
 *
 * Displays annotated document content.
 * Click a ruby-annotated word → add to Blacklist (re-annotate)
 * Click a whitelisted word badge → remove from Whitelist (re-annotate)
 * Blacklisted words render as plain text, with no wrapper or styling.
 * CEFR level adjustable in toolbar.
 */

import { getDocument, getProficiencyLevel, setProficiencyLevel, getBlacklist, setBlacklist, getWhitelist, setWhitelist, getCustomCss, saveDocument } from '../lib/storage.js';
import { annotateHtml, initGloss } from '../lib/annotator.js';
import { applyCssInline, embedInternalCss } from '../lib/css.js';
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
    <div class="reader-layout" id="reader-layout">
      <nav class="toc-panel" id="toc-panel" hidden></nav>
      <div class="reader-panes" id="reader-panes">
        <div id="reader-content" class="reader-content"></div>
        <pre id="raw-panel" class="raw-panel" hidden></pre>
      </div>
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
  /** @type {string} */
  #customCss = '';
  /** @type {string[]} */
  #chapters = [];
  /** @type {string[]} */
  #fileNames = [];
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
    this.#fileNames = [];
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
      this.#customCss = await getCustomCss();

      this.shadowRoot.querySelector('#level-select').value = this.#level;

      if (this.#doc.type === 'epub') {
        await this.#ensureChapters();
        this.#buildToc();
      } else {
        // Only EPUB docs get a table-of-contents sidebar.
        this.shadowRoot.querySelector('#toc-panel').hidden = true;
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
   * Ensure an EPUB document has raw chapters and their file names.
   * New docs have both; docs imported before file names existed (or before
   * chapters existed) are rebuilt once from rawContent.
   */
  async #ensureChapters() {
    const chaptersOk = Array.isArray(this.#doc.chapters);
    const fileNamesOk = chaptersOk
      && Array.isArray(this.#doc.fileNames)
      && this.#doc.fileNames.length === this.#doc.chapters.length;

    if (chaptersOk && fileNamesOk) {
      this.#chapters = this.#doc.chapters;
      this.#fileNames = this.#doc.fileNames;
      return;
    }

    // No raw source to rebuild from — keep whatever chapters we have.
    if (!this.#doc.rawContent) {
      this.#chapters = chaptersOk ? this.#doc.chapters : [];
      return;
    }

    try {
      const { chapters, fileNames } = await parseEpub(normalizeBuffer(this.#doc.rawContent));
      this.#doc.chapters = chapters;
      this.#doc.fileNames = fileNames;
      this.#chapters = chapters;
      this.#fileNames = fileNames;
      await saveDocument(this.#doc);
    } catch (err) {
      // Rebuild failed — fall back to stored chapters if any.
      if (chaptersOk) this.#chapters = this.#doc.chapters;
      console.warn('[reader] Failed to rebuild chapters from rawContent:', err);
    }
  }

  /** Build the sidebar table of contents from chapter file names. */
  #buildToc() {
    const panel = this.shadowRoot.querySelector('#toc-panel');
    if (!this.#chapters.length) {
      panel.hidden = true;
      return;
    }

    panel.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'toc-header';
    header.textContent = '目录';
    panel.appendChild(header);

    const list = document.createElement('ul');
    list.className = 'toc-list';
    this.#chapters.forEach((_, i) => {
      const item = document.createElement('li');
      const button = document.createElement('button');
      button.type = 'button';
      const name = this.#fileNames[i];
      button.textContent = name || `Chapter ${i + 1}`;
      button.title = name || button.textContent;
      button.classList.toggle('active', i === this.#chapterIndex);
      button.addEventListener('click', () => this.#goToChapter(i));
      item.appendChild(button);
      list.appendChild(item);
    });
    panel.appendChild(list);
    panel.hidden = false;
  }

  /** Highlight the entry matching the currently rendered chapter. */
  #updateTocActive(index) {
    this.shadowRoot.querySelectorAll('#toc-panel .toc-list button').forEach((btn, i) => {
      btn.classList.toggle('active', i === index);
    });
  }

  #showLoading(show) {
    this.shadowRoot.querySelector('#reader-loading').style.display = show ? 'flex' : 'none';
  }

  /**
   * Wrap annotated content with the user's custom CSS as an internal
   * `<style>` for reading preview. Applies identically to all formats —
   * per-format embedding only matters at export time.
   * @param {string} annotated
   * @returns {string}
   */
  #withPreviewCss(annotated) {
    return this.#customCss ? `<style>${this.#customCss}</style>${annotated}` : annotated;
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
      container.innerHTML = this.#withPreviewCss(annotated);
      rawPanel.textContent = annotated;
      rawPanel.hidden = false;
    } else {
      container.innerHTML = this.#withPreviewCss(annotated);
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
      container.innerHTML = this.#withPreviewCss(annotateHtml(
        this.#extractTextFromAnnotated(this.#doc.content || ''),
        this.#level, this.#blacklist, this.#whitelist
      ));
      container.addEventListener('click', (e) => this.#onWordClick(e));
      return;
    }

    const index = Math.min(Math.max(this.#chapterIndex, 0), this.#chapters.length - 1);
    this.#chapterIndex = index;

    await initGloss();
    const annotated = annotateHtml(this.#chapters[index], this.#level, this.#blacklist, this.#whitelist);
    container.innerHTML = this.#withPreviewCss(annotated);

    container.addEventListener('click', (e) => this.#onWordClick(e));

    this.shadowRoot.querySelector('#chapter-indicator').textContent = `${index + 1} / ${this.#chapters.length}`;
    this.shadowRoot.querySelector('#prev-chapter').disabled = index <= 0;
    this.shadowRoot.querySelector('#next-chapter').disabled = index >= this.#chapters.length - 1;
    chapterNav.hidden = false;
    this.#updateTocActive(index);
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
        // Custom CSS is folded into inline styles so it travels with the fragment.
        const rawContent = this.#doc.rawContent && typeof this.#doc.rawContent === 'string'
          ? this.#doc.rawContent
          : this.#extractTextFromAnnotated(this.#doc.content);
        let annotated = annotateHtml(rawContent, this.#level, this.#blacklist, this.#whitelist);
        if (this.#customCss) {
          annotated = applyCssInline(annotated, this.#customCss);
        }
        try {
          await navigator.clipboard.writeText(annotated);
          toast('Copied to clipboard', 'success');
        } catch (err) {
          toast('Copy failed: ' + err.message, 'error');
        }
        return;
      }

      if (this.#doc.type === 'epub' && this.#doc.rawContent) {
        // Re-export EPUB with current annotations and the custom CSS as an
        // external stylesheet.
        const blob = await exportEpub(normalizeBuffer(this.#doc.rawContent), (html) => {
          return annotateHtml(html, this.#level, this.#blacklist, this.#whitelist);
        }, this.#customCss);
        downloadBlob(blob, this.#doc.title.replace(/[^a-zA-Z0-9_\-]/g, '_') + '_annotated.epub');
        toast('EPUB exported', 'success');
      } else {
        // Export as HTML
        const rawContent = this.#doc.rawContent
          ? (typeof this.#doc.rawContent === 'string' ? this.#doc.rawContent : '')
          : this.#extractTextFromAnnotated(this.#doc.content);

        if (this.#doc.type === 'html' && this.#doc.rawContent && typeof this.#doc.rawContent === 'string') {
          // For HTML uploads, annotate the original HTML and embed the custom
          // CSS as an internal stylesheet.
          let annotated = annotateHtml(rawContent, this.#level, this.#blacklist, this.#whitelist);
          if (this.#customCss) {
            annotated = embedInternalCss(annotated, this.#customCss);
          }
          downloadFile(annotated, this.#doc.title.replace(/[^a-zA-Z0-9_\-]/g, '_') + '_annotated.html', 'text/html');
        } else {
          // For pasted text, wrap in clean HTML
          const annotated = annotateHtml(`<p>${escapeHtml(rawContent)}</p>`, this.#level, this.#blacklist, this.#whitelist);
          let html = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${escapeHtml(this.#doc.title)}</title><style>body{max-width:700px;margin:2em auto;padding:0 1em;line-height:2;font-size:1.125rem}ruby{cursor:pointer}rt{font-size:0.65em;color:#92400e;background:#fef3c7;padding:1px 3px;border-radius:3px;user-select:none}</style></head><body>${annotated}</body></html>`;
          if (this.#customCss) {
            html = embedInternalCss(html, this.#customCss);
          }
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