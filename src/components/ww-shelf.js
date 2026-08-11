/**
 * <ww-shelf> — Document list view
 *
 * Shows all saved documents with options to:
 * - Click to open for reading
 * - Delete a document
 * - Import by paste, EPUB upload, or HTML upload
 */

import { getDocuments, saveDocument, deleteDocument, getProficiencyLevel } from '../lib/storage.js';
import { toast } from '../lib/utils.js';
import { annotateHtml, initGloss } from '../lib/annotator.js';
import { parseEpub } from '../lib/epub.js';
import { applyI18n, getLang, t } from '../lib/i18n.js';

const template = document.createElement('template');
template.innerHTML = `
  <link rel="stylesheet" href="src/styles/main.css">
  <div>
    <div class="page-header">
      <h1>WordWise</h1>
    </div>

    <div class="input-methods">
      <div class="input-method-card" data-action="paste">
        <span class="icon">📝</span>
        <span data-i18n="shelf.paste">Paste Text</span>
      </div>
      <div class="input-method-card" data-action="upload-epub">
        <span class="icon">📚</span>
        <span data-i18n="shelf.uploadEpub">Upload EPUB</span>
      </div>
      <div class="input-method-card" data-action="upload-html">
        <span class="icon">🌐</span>
        <span data-i18n="shelf.uploadHtml">Upload HTML</span>
      </div>
    </div>
    <input type="file" id="epub-input" accept=".epub" style="display:none">
    <input type="file" id="html-input" accept=".html,.htm" style="display:none">

    <div id="text-input-area" class="text-input-area" style="display:none">
      <textarea id="paste-textarea" data-i18n-placeholder="shelf.pastePlaceholder" placeholder="Paste English text here..."></textarea>
      <div class="text-input-actions">
        <button id="cancel-paste" class="btn" data-i18n="shelf.cancel">Cancel</button>
        <button id="submit-paste" class="btn primary" data-i18n="shelf.addDocument">Add Document</button>
      </div>
    </div>

    <div id="loading-indicator" class="loading" style="display:none">
      <div class="spinner"></div>
      <span data-i18n="shelf.processing">Processing...</span>
    </div>

    <div id="shelf-list" class="shelf-grid"></div>

    <div id="empty-state" class="empty-state">
      <p data-i18n="shelf.empty">No documents yet.</p>
      <p data-i18n="shelf.emptyHint">Paste text or upload an EPUB to get started.</p>
    </div>
  </div>
`;

export class WwShelf extends HTMLElement {
  /** @type {(() => void)|null} */
  #onLangChange = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    this.shadowRoot.querySelector('[data-action="paste"]').addEventListener('click', () => this.#showPasteInput());
    this.shadowRoot.querySelector('[data-action="upload-epub"]').addEventListener('click', () => this.#uploadEpub());
    this.shadowRoot.querySelector('[data-action="upload-html"]').addEventListener('click', () => this.#uploadHtml());
    this.shadowRoot.querySelector('#epub-input').addEventListener('change', (e) => this.#handleEpubFile(e));
    this.shadowRoot.querySelector('#html-input').addEventListener('change', (e) => this.#handleHtmlFile(e));
    this.shadowRoot.querySelector('#cancel-paste').addEventListener('click', () => this.#hidePasteInput());
    this.shadowRoot.querySelector('#submit-paste').addEventListener('click', () => this.#submitPaste());

    applyI18n(this.shadowRoot);
    this.#onLangChange = () => {
      applyI18n(this.shadowRoot);
      this.#render();
    };
    document.addEventListener('ww:langchange', this.#onLangChange);

    this.#render();
  }

  disconnectedCallback() {
    if (this.#onLangChange) {
      document.removeEventListener('ww:langchange', this.#onLangChange);
      this.#onLangChange = null;
    }
  }

  async #render() {
    const list = this.shadowRoot.querySelector('#shelf-list');
    const empty = this.shadowRoot.querySelector('#empty-state');
    const locale = getLang() === 'zh' ? 'zh-CN' : 'en-US';

    try {
      const docs = await getDocuments();
      list.innerHTML = docs.map(doc => `
        <div class="document-card" data-id="${doc.id}">
          <div class="doc-info">
            <div class="doc-title">${this.#escapeHtml(doc.title)}</div>
            <div class="doc-meta">${t('type.' + doc.type)} · ${new Date(doc.updatedAt ?? doc.createdAt).toLocaleDateString(locale)}</div>
          </div>
          <div class="doc-actions">
            <button class="delete-btn" data-id="${doc.id}">${t('shelf.delete')}</button>
          </div>
        </div>
      `).join('');

      empty.style.display = docs.length === 0 ? 'block' : 'none';

      // Event listeners for cards
      list.querySelectorAll('.document-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.delete-btn')) return;
          const id = parseInt(card.dataset.id);
          this.#openDocument(id);
        });
      });

      list.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = parseInt(btn.dataset.id);
          await deleteDocument(id);
          this.#render();
          toast(t('shelf.deleted'), 'success');
        });
      });
    } catch (err) {
      console.error('Failed to render shelf:', err);
    }
  }

  #showPasteInput() {
    this.shadowRoot.querySelector('#text-input-area').style.display = 'block';
  }

  #hidePasteInput() {
    this.shadowRoot.querySelector('#text-input-area').style.display = 'none';
    this.shadowRoot.querySelector('#paste-textarea').value = '';
  }

  async #submitPaste() {
    const textarea = this.shadowRoot.querySelector('#paste-textarea');
    const text = textarea.value.trim();
    if (!text) return;

    this.#showLoading(true);

    try {
      await initGloss();
      const level = await getProficiencyLevel();
      const annotated = annotateHtml(text, level, [], []);

      const doc = {
        title: text.split('\n')[0].slice(0, 60) || t('shelf.pastedTitle'),
        type: 'text',
        content: annotated,
        rawContent: text,
      };

      await saveDocument(doc);

      this.#hidePasteInput();
      this.#showLoading(false);
      toast(t('shelf.added'), 'success');
      this.#render();
    } catch (err) {
      this.#showLoading(false);
      toast(t('shelf.addFailed', { msg: err.message }), 'error');
      console.error(err);
    }
  }

  async #uploadEpub() {
    this.shadowRoot.querySelector('#epub-input').click();
  }

  #uploadHtml() {
    this.shadowRoot.querySelector('#html-input').click();
  }

  async #handleEpubFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    this.#showLoading(true);

    try {
      const buffer = await file.arrayBuffer();
      const { title, chapters, fileNames } = await parseEpub(buffer);

      const doc = {
        title: title || file.name.replace(/\.epub$/i, ''),
        type: 'epub',
        chapters,
        fileNames,
        rawContent: buffer,
      };

      await saveDocument(doc);
      this.#showLoading(false);
      toast(t('shelf.epubImported'), 'success');
      this.#render();
    } catch (err) {
      this.#showLoading(false);
      toast(t('shelf.epubImportFailed', { msg: err.message }), 'error');
      console.error(err);
    }

    e.target.value = '';
  }

  async #handleHtmlFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    this.#showLoading(true);

    try {
      const html = await file.text();
      await initGloss();
      const level = await getProficiencyLevel();
      const annotated = annotateHtml(html, level, [], []);

      const doc = {
        title: file.name.replace(/\.(html?)$/i, '') || t('shelf.uploadedHtmlTitle'),
        type: 'html',
        content: annotated,
        rawContent: html,
      };

      await saveDocument(doc);
      this.#showLoading(false);
      toast(t('shelf.htmlImported'), 'success');
      this.#render();
    } catch (err) {
      this.#showLoading(false);
      toast(t('shelf.htmlImportFailed', { msg: err.message }), 'error');
      console.error(err);
    }

    e.target.value = '';
  }

  #showLoading(show) {
    this.shadowRoot.querySelector('#loading-indicator').style.display = show ? 'flex' : 'none';
  }

  #openDocument(id) {
    this.dispatchEvent(new CustomEvent('navigate', {
      detail: { view: 'reader', docId: id },
      bubbles: true,
      composed: true,
    }));
  }

  #escapeHtml(s) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(s)));
    return div.innerHTML;
  }
}

customElements.define('ww-shelf', WwShelf);