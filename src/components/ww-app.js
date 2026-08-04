/**
 * <ww-app> — Root application shell
 *
 * Handles navigation between Shelf, Reader, and Settings views.
 */

import './ww-shelf.js';
import './ww-reader.js';
import './ww-settings.js';
import { initGloss } from '../lib/annotator.js';

const template = document.createElement('template');
template.innerHTML = `
  <div>
    <nav class="top-nav">
      <a data-view="shelf" class="active">Shelf</a>
      <a data-view="settings">Settings</a>
    </nav>
    <main id="main-content"></main>
  </div>
`;

export class WwApp extends HTMLElement {
  /** @type {'shelf'|'reader'|'settings'} */
  #currentView = 'shelf';
  /** @type {number|null} */
  #currentDocId = null;

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this.shadowRoot.appendChild(template.content.cloneNode(true));
  }

  async connectedCallback() {
    // Initialize gloss data on load
    try {
      await initGloss();
    } catch (err) {
      console.warn('Gloss data not loaded yet, will retry on first use:', err);
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

    // Listen for navigate events from children
    this.addEventListener('navigate', (e) => {
      const { view, docId } = e.detail;
      if (view === 'reader' && docId) {
        this.#navigateTo('reader', docId);
      } else if (view === 'shelf') {
        this.#navigateTo('shelf');
      }
    });

    this.#navigateTo('shelf');
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