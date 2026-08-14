/**
 * <ww-settings> — Settings page
 *
 * - CEFR level selector
 * - Blacklist batch editor
 * - Whitelist batch editor
 * - Config import/export
 */

import { getProficiencyLevel, setProficiencyLevel, getBlacklist, setBlacklist, getWhitelist, setWhitelist, getCustomCss, setCustomCss, exportConfig, importConfig, clearAllData } from '../lib/storage.js';
import { downloadFile, toast } from '../lib/utils.js';
import { CEFR_LEVELS } from '../lib/gloss-engine.js';
import { downloadGlossData, importGlossData } from '../lib/annotator.js';
import { applyI18n, resetLang, t } from '../lib/i18n.js';

const template = document.createElement('template');
template.innerHTML = `
  <link rel="stylesheet" href="src/styles/main.css">
  <div>
    <div class="page-header">
      <h1 data-i18n="settings.title">Settings</h1>
    </div>

    <!-- Proficiency Level -->
    <div class="settings-section">
      <h2 data-i18n="settings.proficiency">Proficiency Level</h2>
      <div class="setting-row">
        <label for="settings-level" data-i18n="settings.yourLevel">Your CEFR Level</label>
        <select id="settings-level">
          ${CEFR_LEVELS.map(l => `<option value="${l}">${l}</option>`).join('')}
        </select>
      </div>
      <p style="font-size:0.85rem;color:var(--color-text-secondary);margin-top:8px;" data-i18n="settings.levelHint">
        Words above your level will be annotated with Chinese translations.
      </p>
    </div>

    <!-- Blacklist -->
    <div class="settings-section">
      <h2 data-i18n="settings.blacklist">Blacklist</h2>
      <p style="font-size:0.85rem;color:var(--color-text-secondary);margin-bottom:12px;" data-i18n-html="settings.blacklistHint">
        Words you already know — they will <strong>not</strong> be annotated.
      </p>
      <div class="word-list-editor" id="blacklist-editor">
        <input type="text" class="search-box" id="blacklist-search" data-i18n-placeholder="settings.searchBlacklist" placeholder="Search blacklist...">
        <div class="word-list" id="blacklist-words"></div>
        <div class="add-word-form">
          <input type="text" id="blacklist-add-input" data-i18n-placeholder="settings.addWord" placeholder="Add word...">
          <button id="blacklist-add-btn" class="btn primary" data-i18n="settings.add">Add</button>
        </div>
      </div>
    </div>

    <!-- Whitelist -->
    <div class="settings-section">
      <h2 data-i18n="settings.whitelist">Whitelist</h2>
      <p style="font-size:0.85rem;color:var(--color-text-secondary);margin-bottom:12px;" data-i18n-html="settings.whitelistHint">
        Words you struggle with — they <strong>will</strong> be annotated even if below your level.
      </p>
      <div class="word-list-editor" id="whitelist-editor">
        <input type="text" class="search-box" id="whitelist-search" data-i18n-placeholder="settings.searchWhitelist" placeholder="Search whitelist...">
        <div class="word-list" id="whitelist-words"></div>
        <div class="add-word-form">
          <input type="text" id="whitelist-add-input" data-i18n-placeholder="settings.addWord" placeholder="Add word...">
          <button id="whitelist-add-btn" class="btn primary" data-i18n="settings.add">Add</button>
        </div>
      </div>
    </div>

    <!-- Custom CSS -->
    <div class="settings-section">
      <h2 data-i18n="settings.customCss">Custom CSS</h2>
      <p style="font-size:0.85rem;color:var(--color-text-secondary);margin-bottom:12px;" data-i18n="settings.customCssHint">
        Styles applied to the reading view and to exported documents. Plain text is copied with
        inline styles, HTML embeds an internal stylesheet, EPUB gets an external stylesheet.
      </p>
      <textarea id="settings-css" class="css-editor" spellcheck="false"
        data-i18n-placeholder="settings.customCssPlaceholder"
        placeholder="e.g. ruby rt { background:#fecaca; color:#7f1d1d; }"></textarea>
      <div class="css-actions">
        <button id="save-css-btn" class="btn primary" data-i18n="settings.saveCss">Save CSS</button>
      </div>
    </div>

    <!-- Config -->
    <div class="settings-section">
      <h2 data-i18n="settings.config">Config</h2>
      <p style="font-size:0.85rem;color:var(--color-text-secondary);margin-bottom:12px;" data-i18n="settings.configHint">
        Export or import your settings (level, blacklist, whitelist, custom CSS). Documents are not included.
      </p>
      <div class="config-actions">
        <button id="export-config-btn" class="btn" data-i18n="settings.exportConfig">Export Config</button>
        <button id="import-config-btn" class="btn" data-i18n="settings.importConfig">Import Config</button>
      </div>
      <input type="file" id="config-file-input" accept=".json" style="display:none">
    </div>

    <!-- Gloss Pack -->
    <div class="settings-section">
      <h2 data-i18n="settings.gloss">Gloss Pack</h2>
      <p style="font-size:0.85rem;color:var(--color-text-secondary);margin-bottom:12px;" data-i18n="settings.glossHint">
        The gloss pack (en-zh.json) drives annotation. Download it from the deployment, or import it from a local file.
      </p>
      <div class="config-actions">
        <button id="download-gloss-btn" class="btn" data-i18n="settings.downloadGloss">Download Gloss Pack</button>
        <button id="import-gloss-btn" class="btn" data-i18n="settings.importGloss">Import Gloss Pack</button>
      </div>
      <input type="file" id="gloss-file-input" accept=".json" style="display:none">
    </div>

    <!-- Clear All Cache -->
    <div class="settings-section">
      <h2 data-i18n="settings.clearCache">Clear All Cache</h2>
      <p style="font-size:0.85rem;color:var(--color-text-secondary);margin-bottom:12px;" data-i18n="settings.clearCacheHint">
        Delete all documents, settings (proficiency level, blacklist, whitelist, custom CSS) and language preference. This cannot be undone.
      </p>
      <div class="config-actions">
        <button id="clear-cache-btn" class="btn danger" data-i18n="settings.clearCache">Clear All Cache</button>
      </div>
    </div>
  </div>

  <div class="modal-overlay" id="clear-modal" hidden>
    <div class="modal">
      <h2 data-i18n="settings.clearCache">Clear All Cache</h2>
      <p style="color:var(--color-text-secondary);font-size:0.9rem;" data-i18n="settings.clearCacheHint">
        Delete all documents, settings (proficiency level, blacklist, whitelist, custom CSS) and language preference. This cannot be undone.
      </p>
      <div class="modal-actions">
        <button id="clear-cancel" class="btn" data-i18n="settings.cancel">Cancel</button>
        <button id="clear-confirm" class="btn danger" data-i18n="settings.clearCacheConfirm">Clear All Data</button>
      </div>
    </div>
  </div>
`;

export class WwSettings extends HTMLElement {
  #level = 'B1';
  #blacklist = [];
  #whitelist = [];
  #customCss = '';
  /** @type {(() => void)|null} */
  #onLangChange = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  connectedCallback() {
    this.#load();
    this.shadowRoot.querySelector('#settings-level').addEventListener('change', (e) => this.#onLevelChange(e));

    // Blacklist
    this.shadowRoot.querySelector('#blacklist-search').addEventListener('input', () => this.#renderBlacklist());
    this.shadowRoot.querySelector('#blacklist-add-btn').addEventListener('click', () => this.#addWord('blacklist'));
    this.shadowRoot.querySelector('#blacklist-add-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.#addWord('blacklist');
    });

    // Whitelist
    this.shadowRoot.querySelector('#whitelist-search').addEventListener('input', () => this.#renderWhitelist());
    this.shadowRoot.querySelector('#whitelist-add-btn').addEventListener('click', () => this.#addWord('whitelist'));
    this.shadowRoot.querySelector('#whitelist-add-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.#addWord('whitelist');
    });

    // Custom CSS
    this.shadowRoot.querySelector('#save-css-btn').addEventListener('click', () => this.#saveCss());
    this.shadowRoot.querySelector('#settings-css').addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        this.#saveCss();
      }
    });

    // Config
    this.shadowRoot.querySelector('#export-config-btn').addEventListener('click', () => this.#exportConfig());
    this.shadowRoot.querySelector('#import-config-btn').addEventListener('click', () => this.#selectConfigFile());
    this.shadowRoot.querySelector('#config-file-input').addEventListener('change', (e) => this.#importConfig(e));

    // Gloss Pack
    this.shadowRoot.querySelector('#download-gloss-btn').addEventListener('click', () => this.#downloadGloss());
    this.shadowRoot.querySelector('#import-gloss-btn').addEventListener('click', () => this.#selectGlossFile());
    this.shadowRoot.querySelector('#gloss-file-input').addEventListener('change', (e) => this.#importGloss(e));

    // Clear All Cache
    this.shadowRoot.querySelector('#clear-cache-btn').addEventListener('click', () => this.#showClearModal());
    this.shadowRoot.querySelector('#clear-cancel').addEventListener('click', () => this.#hideClearModal());
    this.shadowRoot.querySelector('#clear-confirm').addEventListener('click', () => this.#clearAll());

    applyI18n(this.shadowRoot);
    this.#onLangChange = () => {
      applyI18n(this.shadowRoot);
      this.#renderBlacklist();
      this.#renderWhitelist();
    };
    document.addEventListener('ww:langchange', this.#onLangChange);
  }

  disconnectedCallback() {
    if (this.#onLangChange) {
      document.removeEventListener('ww:langchange', this.#onLangChange);
      this.#onLangChange = null;
    }
  }

  async #load() {
    this.#level = await getProficiencyLevel();
    this.#blacklist = await getBlacklist();
    this.#whitelist = await getWhitelist();
    this.#customCss = await getCustomCss();

    this.shadowRoot.querySelector('#settings-level').value = this.#level;
    this.shadowRoot.querySelector('#settings-css').value = this.#customCss;
    this.#renderBlacklist();
    this.#renderWhitelist();
  }

  #renderBlacklist() {
    this.#renderWordList('blacklist');
  }

  #renderWhitelist() {
    this.#renderWordList('whitelist');
  }

  #renderWordList(type) {
    const list = type === 'blacklist' ? this.#blacklist : this.#whitelist;
    const searchInput = this.shadowRoot.querySelector(`#${type}-search`);
    const container = this.shadowRoot.querySelector(`#${type}-words`);
    const query = (searchInput?.value || '').toLowerCase();

    const filtered = query ? list.filter(w => w.includes(query)) : list;

    if (filtered.length === 0) {
      container.innerHTML = `<span style="color:var(--color-text-secondary);font-size:0.85rem;padding:8px;">${t('settings.empty')}</span>`;
      return;
    }

    container.innerHTML = filtered.map(word => `
      <span class="word-tag">
        ${this.#escapeHtml(word)}
        <span class="remove" data-type="${type}" data-word="${this.#escapeHtml(word)}">×</span>
      </span>
    `).join('');

    container.querySelectorAll('.remove').forEach(btn => {
      btn.addEventListener('click', () => this.#removeWord(btn.dataset.type, btn.dataset.word));
    });
  }

  async #addWord(type) {
    const input = this.shadowRoot.querySelector(`#${type}-add-input`);
    const word = input.value.trim().toLowerCase();
    if (!word) return;

    if (type === 'blacklist') {
      if (!this.#blacklist.includes(word)) {
        this.#blacklist.push(word);
        this.#whitelist = this.#whitelist.filter(w => w !== word);
        await setBlacklist(this.#blacklist);
        await setWhitelist(this.#whitelist);
      }
    } else {
      if (!this.#whitelist.includes(word)) {
        this.#whitelist.push(word);
        this.#blacklist = this.#blacklist.filter(w => w !== word);
        await setBlacklist(this.#blacklist);
        await setWhitelist(this.#whitelist);
      }
    }

    input.value = '';
    this.#renderBlacklist();
    this.#renderWhitelist();
    const label = t(type === 'blacklist' ? 'settings.blacklistLabel' : 'settings.whitelistLabel');
    toast(t('settings.wordAddedTo', { word, list: label }), 'success');
  }

  async #removeWord(type, word) {
    if (type === 'blacklist') {
      this.#blacklist = this.#blacklist.filter(w => w !== word);
      await setBlacklist(this.#blacklist);
    } else {
      this.#whitelist = this.#whitelist.filter(w => w !== word);
      await setWhitelist(this.#whitelist);
    }
    this.#renderBlacklist();
    this.#renderWhitelist();
  }

  async #onLevelChange(e) {
    this.#level = e.target.value;
    await setProficiencyLevel(this.#level);
    toast(t('reader.levelChanged', { level: this.#level }), 'info');
  }

  async #saveCss() {
    this.#customCss = this.shadowRoot.querySelector('#settings-css').value;
    await setCustomCss(this.#customCss);
    toast(t('settings.cssSaved'), 'success');
  }

  async #exportConfig() {
    const config = await exportConfig();
    const json = JSON.stringify(config, null, 2);
    downloadFile(json, 'wordwise-config.json', 'application/json');
    toast(t('settings.configExported'), 'success');
  }

  #selectConfigFile() {
    this.shadowRoot.querySelector('#config-file-input').click();
  }

  async #importConfig(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const config = JSON.parse(text);

      if (!config.level || !Array.isArray(config.blacklist) || !Array.isArray(config.whitelist)) {
        throw new Error('Invalid config format');
      }

      await importConfig(config);
      await this.#load();
      toast(t('settings.configImported'), 'success');
    } catch (err) {
      toast(t('settings.importFailed', { msg: err.message }), 'error');
    }

    e.target.value = '';
  }

  async #downloadGloss() {
    try {
      const data = await downloadGlossData();
      await importGlossData(data);
      toast(t('settings.glossDownloaded'), 'success');
      // Reload so every view re-annotates with the freshly downloaded pack.
      location.reload();
    } catch (err) {
      toast(t('settings.glossDownloadFailed', { msg: err.message }), 'error');
    }
  }

  #selectGlossFile() {
    this.shadowRoot.querySelector('#gloss-file-input').click();
  }

  async #importGloss(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = JSON.parse(await file.text());
      await importGlossData(data);
      toast(t('settings.glossImported'), 'success');
      location.reload();
    } catch (err) {
      toast(t('settings.glossImportFailed', { msg: err.message }), 'error');
    }

    e.target.value = '';
  }

  #showClearModal() {
    this.shadowRoot.querySelector('#clear-modal').hidden = false;
  }

  #hideClearModal() {
    this.shadowRoot.querySelector('#clear-modal').hidden = true;
  }

  async #clearAll() {
    try {
      await clearAllData();
      resetLang();
      // Hard reload — drops the cached gloss index and every module-level
      // setting, presenting the app in its fresh state.
      location.reload();
    } catch (err) {
      toast(t('settings.clearFailed', { msg: err.message }), 'error');
    }
  }

  #escapeHtml(s) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(s)));
    return div.innerHTML;
  }
}

customElements.define('ww-settings', WwSettings);