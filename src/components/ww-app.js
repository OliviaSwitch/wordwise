/**
 * <ww-app> — Root application shell
 *
 * Handles navigation between Shelf, Reader, and Settings views.
 */

import './ww-shelf.js';
import './ww-reader.js';
import './ww-settings.js';
import { initGloss, isGlossReady, importGlossData } from '../lib/annotator.js';
import { applyI18n, getLang, setLang, t } from '../lib/i18n.js';
import { toast } from '../lib/utils.js';

const template = document.createElement('template');
template.innerHTML = `
  <link rel="stylesheet" href="src/styles/main.css">
  <div>
    <nav class="top-nav">
      <a data-view="shelf" class="active" data-i18n="nav.shelf">Shelf</a>
      <a data-view="settings" data-i18n="nav.settings">Settings</a>
      <select id="lang-select" class="lang-select" aria-label="Language">
        <option value="en">English</option>
        <option value="zh">中文</option>
      </select>
    </nav>
    <div id="gloss-warning" class="gloss-warning" hidden>
      <span class="gloss-warning-text" data-i18n="gloss.warning">Gloss pack data (en-zh.json) is missing.</span>
      <button type="button" id="gloss-import-btn" class="btn gloss-import-btn" data-i18n="gloss.importBtn">Import Gloss Pack</button>
      <input type="file" id="gloss-file" accept=".json" hidden>
    </div>
    <main id="main-content"></main>
  </div>
`;

export class WwApp extends HTMLElement {
  /** @type {'shelf'|'reader'|'settings'} */
  #currentView = 'shelf';
  /** @type {number|null} */
  #currentDocId = null;
  /** @type {(() => void)|null} */
  #onLangChange = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  async connectedCallback() {
    // Initialize gloss data on load. With no network copy and no imported
    // pack it resolves empty instead of throwing, and the banner below offers
    // a manual import.
    await initGloss();
    if (!isGlossReady()) {
      this.shadowRoot.querySelector('#gloss-warning').hidden = false;
    }

    // Setup nav
    this.shadowRoot.querySelectorAll('.top-nav a').forEach(link => {
      link.addEventListener('click', () => {
        const view = link.dataset.view;
        if (view === 'shelf' || view === 'settings') {
          this.#navigateTo(view);
        }
      });
    });

    // Gloss pack import — feeds the "no data" banner. On success the page
    // reloads so the freshly persisted pack is picked up everywhere.
    const glossFileInput = this.shadowRoot.querySelector('#gloss-file');
    this.shadowRoot.querySelector('#gloss-import-btn').addEventListener('click', () => {
      glossFileInput.click();
    });
    glossFileInput.addEventListener('change', async () => {
      const file = glossFileInput.files?.[0];
      glossFileInput.value = '';
      if (!file) return;
      try {
        const data = JSON.parse(await file.text());
        await importGlossData(data);
        // Reload so every view re-annotates with the freshly imported pack.
        location.reload();
      } catch (err) {
        toast(t('gloss.importFailed', { msg: err.message }), 'error');
      }
    });

    // Listen for navigate events from children
    this.addEventListener('navigate', (e) => {
      const { view, docId } = e.detail;
      if (view === 'reader' && docId) {
        this.#navigateTo('reader', docId);
      } else if (view === 'shelf') {
        this.#navigateTo('shelf');
      }
    });

    // Language switcher — reflect the current language and re-apply nav labels.
    applyI18n(this.shadowRoot);
    const langSelect = this.shadowRoot.querySelector('#lang-select');
    langSelect.value = getLang();
    langSelect.addEventListener('change', (e) => setLang(e.target.value));
    this.#onLangChange = () => applyI18n(this.shadowRoot);
    document.addEventListener('ww:langchange', this.#onLangChange);

    this.#navigateTo('shelf');
  }

  disconnectedCallback() {
    if (this.#onLangChange) {
      document.removeEventListener('ww:langchange', this.#onLangChange);
      this.#onLangChange = null;
    }
  }

  #navigateTo(view, docId = null) {
    this.#currentView = view;
    this.#currentDocId = docId;
    this.#render();
  }

  #render() {
    const main = this.shadowRoot.querySelector('#main-content');
    const navLinks = this.shadowRoot.querySelectorAll('.top-nav a');

    navLinks.forEach(link => {
      link.classList.toggle('active', link.dataset.view === this.#currentView);
    });

    switch (this.#currentView) {
      case 'shelf': {
        main.innerHTML = '<ww-shelf></ww-shelf>';
        break;
      }
      case 'reader': {
        main.innerHTML = '<ww-reader></ww-reader>';
        const reader = main.querySelector('ww-reader');
        if (reader && this.#currentDocId) {
          reader.load(this.#currentDocId);
        }
        break;
      }
      case 'settings': {
        main.innerHTML = '<ww-settings></ww-settings>';
        break;
      }
    }
  }
}

customElements.define('ww-app', WwApp);