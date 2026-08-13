/**
 * Storage — IndexedDB persistence layer
 *
 * Stores Documents, Blacklist, Whitelist, and Proficiency Level.
 * All async, all client-side.
 */

const DB_NAME = 'wordwise';
const DB_VERSION = 1;
const STORES = {
  documents: '++id, title, &type, createdAt, updatedAt',
  settings: 'key',
};

let dbPromise = null;

/** @returns {Promise<IDBDatabase>} */
function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('documents')) {
        db.createObjectStore('documents', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('settings')) {
        db.createObjectStore('settings', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

// ── Generic helpers ──

async function getAll(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function get(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const req = store.get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function put(storeName, value) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.put(value);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function del(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const req = store.delete(key);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

// ── Settings (key-value) ──

const SETTINGS = {
  PROFICIENCY_LEVEL: 'proficiencyLevel',
  BLACKLIST: 'blacklist',
  WHITELIST: 'whitelist',
  CUSTOM_CSS: 'customCss',
};

/** @returns {Promise<string>} */
export async function getProficiencyLevel() {
  const entry = await get('settings', SETTINGS.PROFICIENCY_LEVEL);
  return entry?.value ?? 'B1';
}

/** @param {string} level */
export async function setProficiencyLevel(level) {
  await put('settings', { key: SETTINGS.PROFICIENCY_LEVEL, value: level });
}

/** @returns {Promise<string[]>} */
export async function getBlacklist() {
  const entry = await get('settings', SETTINGS.BLACKLIST);
  return entry?.value ?? [];
}

/** @param {string[]} words */
export async function setBlacklist(words) {
  await put('settings', { key: SETTINGS.BLACKLIST, value: [...new Set(words)] });
}

/** @returns {Promise<string[]>} */
export async function getWhitelist() {
  const entry = await get('settings', SETTINGS.WHITELIST);
  return entry?.value ?? [];
}

/** @param {string[]} words */
export async function setWhitelist(words) {
  await put('settings', { key: SETTINGS.WHITELIST, value: [...new Set(words)] });
}

/** @returns {Promise<string>} */
export async function getCustomCss() {
  const entry = await get('settings', SETTINGS.CUSTOM_CSS);
  return entry?.value ?? '';
}

/** @param {string} css */
export async function setCustomCss(css) {
  await put('settings', { key: SETTINGS.CUSTOM_CSS, value: css });
}

// ── Documents ──

/**
 * @typedef {Object} Document
 * @property {number} [id]
 * @property {string} title
 * @property {'text'|'epub'|'html'} type
 * @property {string} content — HTML content for reading (text/html docs)
 * @property {string[]} [chapters] — raw per-chapter HTML (epub docs; annotated on read)
 * @property {string[]} [fileNames] — per-chapter file names (epub docs; shown in the TOC)
 * @property {string|ArrayBuffer} [rawContent] — original uploaded content (for EPUB re-export)
 * @property {number} createdAt
 * @property {number} updatedAt
 */

/** @returns {Promise<Document[]>} */
export async function getDocuments() {
  const docs = await getAll('documents');
  // Return sorted by updatedAt descending
  return docs.sort((a, b) => (b.updatedAt ?? b.createdAt) - (a.updatedAt ?? a.createdAt));
}

/** @param {number} id @returns {Promise<Document|null>} */
export async function getDocument(id) {
  return get('documents', id);
}

/** @param {Document} doc @returns {Promise<number>} id */
export async function saveDocument(doc) {
  const now = Date.now();
  if (doc.id) {
    doc.updatedAt = now;
  } else {
    doc.createdAt = now;
    doc.updatedAt = now;
  }
  return put('documents', doc);
}

/** @param {number} id */
export async function deleteDocument(id) {
  await del('documents', id);
}

// ── Config export/import ──

/**
 * Delete the entire database and all local settings, returning the app to a
 * fresh state. Closes the cached connection first so `deleteDatabase` isn't
 * blocked; the next `openDB()` recreates the schema via `onupgradeneeded`.
 * @returns {Promise<void>}
 */
export async function clearAllData() {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  await new Promise((resolve, reject) => {
    const req = indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
    // `onblocked` fires only if another tab holds the DB open — ignore it;
    // the deletion completes once that tab closes.
  });
}

/**
 * Export config as a downloadable JSON object.
 * @returns {Promise<{level: string, blacklist: string[], whitelist: string[], customCss: string}>}
 */
export async function exportConfig() {
  const level = await getProficiencyLevel();
  const blacklist = await getBlacklist();
  const whitelist = await getWhitelist();
  const customCss = await getCustomCss();
  return { level, blacklist, whitelist, customCss };
}

/**
 * Import a config JSON object (overwrites current settings).
 * @param {{level: string, blacklist: string[], whitelist: string[], customCss?: string}} config
 */
export async function importConfig(config) {
  await setProficiencyLevel(config.level);
  await setBlacklist(config.blacklist ?? []);
  await setWhitelist(config.whitelist ?? []);
  await setCustomCss(config.customCss ?? '');
}