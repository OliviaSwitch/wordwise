/**
 * <ww-settings> — Settings page
 *
 * - CEFR level selector
 * - Blacklist batch editor
 * - Whitelist batch editor
 * - Config import/export
 */

import { getProficiencyLevel, setProficiencyLevel, getBlacklist, setBlacklist, getWhitelist, setWhitelist, exportConfig, importConfig } from '../lib/storage.js';
import { downloadFile, toast } from '../lib/utils.js';
import { CEFR_LEVELS } from '../lib/gloss-engine.js';

const template = document.createElement('template');
template.innerHTML = `
  <div>
    <div class="page-header">
      <h1>Settings</h1>
    </div>

    <!-- Proficiency Level -->
    <div class="settings-section">
      <h2>Proficiency Level</h2>
      <div class="setting-row">
        <label for="settings-level">Your CEFR Level</label>
        <select id="settings-level">
          ${CEFR_LEVELS.map(l => `<option value="${l}">${l}</option>`).join('')}
        </select>
      </div>
      <p style="font-size:0.85rem;color:var(--color-text-secondary);margin-top:8px;">
        Words above your level will be annotated with Chinese translations.
      </p>
    </div>

    <!-- Blacklist -->
    <div class="settings-section">
      <h2>Blacklist</h2>
      <p style="font-size:0.85rem;color:var(--color-text-secondary);margin-bottom:12px;">
        Words you already know — they will <strong>not</strong> be annotated.
      </p>
      <div class="word-list-editor" id="blacklist-editor">
        <input type="text" class="search-box" id="blacklist-search" placeholder="Search blacklist...">
        <div class="word-list" id="blacklist-words"></div>
        <div class="add-word-form">
          <input type="text" id="blacklist-add-input" placeholder="Add word...">
          <button id="blacklist-add-btn" class="btn primary">Add</button>
        </div>
      </div>
    </div>

    <!-- Whitelist -->
    <div class="settings-section">
      <h2>Whitelist</h2>
      <p style="font-size:0.85rem;color:var(--color-text-secondary);margin-bottom:12px;">
        Words you struggle with — they <strong>will</strong> be annotated even if below your level.
      </p>
      <div class="word-list-editor" id="whitelist-editor">
        <input type="text" class="search-box" id="whitelist-search" placeholder="Search whitelist...">
        <div class="word-list" id="whitelist-words"></div>
        <div class="add-word-form">
          <input type="text" id="whitelist-add-input" placeholder="Add word...">
          <button id="whitelist-add-btn" class="btn primary">Add</button>
        </div>
      </div>
    </div>

    <!-- Config -->
    <div class="settings-section">
      <h2>Config</h2>
      <p style="font-size:0.85rem;color:var(--color-text-secondary);margin-bottom:12px;">
        Export or import your settings (level, blacklist, whitelist). Documents are not included.
      </p>
      <div class="config-actions">
        <button id="export-config-btn" class="btn">Export Config</button>
        <button id="import-config-btn" class="btn">Import Config</button>
      </div>
      <input type="file" id="config-file-input" accept=".json" style="display:none">
    </div>
  </div>
`;

export class WwSettings extends HTMLElement {
  #level = 'B1';
  #blacklist = [];
  #whitelist = [];

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

    // Config
    this.shadowRoot.querySelector('#export-config-btn').addEventListener('click', () => this.#exportConfig());
    this.shadowRoot.querySelector('#import-config-btn').addEventListener('click', () => this.#selectConfigFile());
    this.shadowRoot.querySelector('#config-file-input').addEventListener('change', (e) => this.#importConfig(e));
  }

  async #load() {
    this.#level = await getProficiencyLevel();
    this.#blacklist = await getBlacklist();
    this.#whitelist = await getWhitelist();

    this.shadowRoot.querySelector('#settings-level').value = this.#level;
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
      container.innerHTML = '<span style="color:var(--color-text-secondary);font-size:0.85rem;padding:8px;">Empty</span>';
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
    toast(`"${word}" added to ${type}`, 'success');
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
    toast(`Level changed to ${this.#level}`, 'info');
  }

  async #exportConfig() {
    const config = await exportConfig();
    const json = JSON.stringify(config, null, 2);
    downloadFile(json, 'wordwise-config.json', 'application/json');
    toast('Config exported', 'success');
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
      toast('Config imported', 'success');
    } catch (err) {
      toast('Import failed: ' + err.message, 'error');
    }

    e.target.value = '';
  }

  #escapeHtml(s) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(s)));
    return div.innerHTML;
  }
}

customElements.define('ww-settings', WwSettings);