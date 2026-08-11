/**
 * i18n — lightweight client-side internationalization (English / 中文)
 *
 * No build step, no async resource loading: the dictionary lives in this
 * module and UI strings are annotated in templates with `data-i18n` attributes.
 * Language preference is persisted to localStorage (wordwise:lang) and follows
 * the browser language on first visit (zh → Chinese, anything else → English).
 *
 * Module load runs the initialization immediately so `<html lang>` is set
 * before first paint.
 */

const STORAGE_KEY = 'wordwise:lang';

export const messages = {
  en: {
    // Nav
    'nav.shelf': 'Shelf',
    'nav.settings': 'Settings',
    // Shelf
    'shelf.paste': 'Paste Text',
    'shelf.uploadEpub': 'Upload EPUB',
    'shelf.uploadHtml': 'Upload HTML',
    'shelf.pastePlaceholder': 'Paste English text here...',
    'shelf.cancel': 'Cancel',
    'shelf.addDocument': 'Add Document',
    'shelf.processing': 'Processing...',
    'shelf.empty': 'No documents yet.',
    'shelf.emptyHint': 'Paste text or upload an EPUB to get started.',
    'shelf.delete': 'Delete',
    'shelf.deleted': 'Document deleted',
    'shelf.added': 'Document added',
    'shelf.pastedTitle': 'Pasted Text',
    'shelf.uploadedHtmlTitle': 'Uploaded HTML',
    'shelf.addFailed': 'Failed to process text: {msg}',
    'shelf.epubImported': 'EPUB imported',
    'shelf.epubImportFailed': 'Failed to import EPUB: {msg}',
    'shelf.htmlImported': 'HTML imported',
    'shelf.htmlImportFailed': 'Failed to import HTML: {msg}',
    // Document type labels
    'type.text': 'Text',
    'type.epub': 'EPUB',
    'type.html': 'HTML',
    // Reader
    'reader.back': '← Back',
    'reader.level': 'Level:',
    'reader.loading': 'Loading...',
    'reader.notFound': 'Document not found.',
    'reader.copy': 'Copy',
    'reader.export': 'Export',
    'reader.toc': 'Contents',
    'reader.chapter': 'Chapter {n}',
    'reader.levelChanged': 'Level changed to {level}',
    'reader.copied': 'Copied to clipboard',
    'reader.copyFailed': 'Copy failed: {msg}',
    'reader.loadFailed': 'Failed to load document: {msg}',
    'reader.epubExported': 'EPUB exported',
    'reader.htmlExported': 'HTML exported',
    'reader.exportFailed': 'Export failed: {msg}',
    // Settings
    'settings.title': 'Settings',
    'settings.proficiency': 'Proficiency Level',
    'settings.yourLevel': 'Your CEFR Level',
    'settings.levelHint': 'Words above your level will be annotated with Chinese translations.',
    'settings.blacklist': 'Blacklist',
    'settings.blacklistHint': 'Words you already know — they will <strong>not</strong> be annotated.',
    'settings.whitelist': 'Whitelist',
    'settings.whitelistHint': 'Words you struggle with — they <strong>will</strong> be annotated even if below your level.',
    'settings.searchBlacklist': 'Search blacklist...',
    'settings.searchWhitelist': 'Search whitelist...',
    'settings.addWord': 'Add word...',
    'settings.add': 'Add',
    'settings.empty': 'Empty',
    'settings.customCss': 'Custom CSS',
    'settings.customCssHint': 'Styles applied to the reading view and to exported documents. Plain text is copied with inline styles, HTML embeds an internal stylesheet, EPUB gets an external stylesheet.',
    'settings.customCssPlaceholder': 'e.g. ruby rt { background:#fecaca; color:#7f1d1d; }',
    'settings.saveCss': 'Save CSS',
    'settings.config': 'Config',
    'settings.configHint': 'Export or import your settings (level, blacklist, whitelist, custom CSS). Documents are not included.',
    'settings.exportConfig': 'Export Config',
    'settings.importConfig': 'Import Config',
    'settings.wordAddedTo': '"{word}" added to {list}',
    'settings.blacklistLabel': 'blacklist',
    'settings.whitelistLabel': 'whitelist',
    'settings.cssSaved': 'Custom CSS saved',
    'settings.configExported': 'Config exported',
    'settings.configImported': 'Config imported',
    'settings.importFailed': 'Import failed: {msg}',
    // EPUB
    'epub.untitled': 'Untitled',
  },

  zh: {
    // Nav
    'nav.shelf': '书架',
    'nav.settings': '设置',
    // Shelf
    'shelf.paste': '粘贴文本',
    'shelf.uploadEpub': '上传 EPUB',
    'shelf.uploadHtml': '上传 HTML',
    'shelf.pastePlaceholder': '在此粘贴英文文本……',
    'shelf.cancel': '取消',
    'shelf.addDocument': '添加文档',
    'shelf.processing': '处理中……',
    'shelf.empty': '还没有文档。',
    'shelf.emptyHint': '粘贴文本或上传 EPUB 开始使用。',
    'shelf.delete': '删除',
    'shelf.deleted': '文档已删除',
    'shelf.added': '文档已添加',
    'shelf.pastedTitle': '粘贴的文本',
    'shelf.uploadedHtmlTitle': '上传的 HTML',
    'shelf.addFailed': '处理文本失败：{msg}',
    'shelf.epubImported': 'EPUB 已导入',
    'shelf.epubImportFailed': '导入 EPUB 失败：{msg}',
    'shelf.htmlImported': 'HTML 已导入',
    'shelf.htmlImportFailed': '导入 HTML 失败：{msg}',
    // Document type labels
    'type.text': '文本',
    'type.epub': 'EPUB',
    'type.html': 'HTML',
    // Reader
    'reader.back': '← 返回',
    'reader.level': '级别：',
    'reader.loading': '加载中……',
    'reader.notFound': '未找到文档。',
    'reader.copy': '复制',
    'reader.export': '导出',
    'reader.toc': '目录',
    'reader.chapter': '第 {n} 章',
    'reader.levelChanged': '级别已改为 {level}',
    'reader.copied': '已复制到剪贴板',
    'reader.copyFailed': '复制失败：{msg}',
    'reader.loadFailed': '加载文档失败：{msg}',
    'reader.epubExported': 'EPUB 已导出',
    'reader.htmlExported': 'HTML 已导出',
    'reader.exportFailed': '导出失败：{msg}',
    // Settings
    'settings.title': '设置',
    'settings.proficiency': '熟练度等级',
    'settings.yourLevel': '你的 CEFR 等级',
    'settings.levelHint': '高于你等级的单词会被标注中文释义。',
    'settings.blacklist': '黑名单',
    'settings.blacklistHint': '你已经认识的单词——<strong>不会</strong>被标注。',
    'settings.whitelist': '白名单',
    'settings.whitelistHint': '你还没掌握的单词——即使低于你的等级<strong>也</strong>会被标注。',
    'settings.searchBlacklist': '搜索黑名单……',
    'settings.searchWhitelist': '搜索白名单……',
    'settings.addWord': '添加单词……',
    'settings.add': '添加',
    'settings.empty': '空',
    'settings.customCss': '自定义 CSS',
    'settings.customCssHint': '应用于阅读视图和导出文档的样式。纯文本复制时内联样式，HTML 嵌入内部样式表，EPUB 使用外部样式表。',
    'settings.customCssPlaceholder': '例如 ruby rt { background:#fecaca; color:#7f1d1d; }',
    'settings.saveCss': '保存 CSS',
    'settings.config': '配置',
    'settings.configHint': '导出或导入你的设置（等级、黑名单、白名单、自定义 CSS）。不含文档。',
    'settings.exportConfig': '导出配置',
    'settings.importConfig': '导入配置',
    'settings.wordAddedTo': '已将“{word}”添加到{list}',
    'settings.blacklistLabel': '黑名单',
    'settings.whitelistLabel': '白名单',
    'settings.cssSaved': '自定义 CSS 已保存',
    'settings.configExported': '配置已导出',
    'settings.configImported': '配置已导入',
    'settings.importFailed': '导入失败：{msg}',
    // EPUB
    'epub.untitled': '未命名',
  },
};

/** @type {'en'|'zh'} */
let currentLang = 'en';

/** Detect the user's language from the browser when nothing is stored yet. */
function detectLang() {
  const nav = (typeof navigator !== 'undefined' && navigator.language) || '';
  return nav.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

/** Read the persisted language (falls back to browser detection). */
function loadLang() {
  let stored = null;
  try {
    stored = localStorage.getItem(STORAGE_KEY);
  } catch {
    // localStorage unavailable (privacy mode etc.) — fall back to detection.
  }
  return stored === 'zh' || stored === 'en' ? stored : detectLang();
}

currentLang = loadLang();
if (typeof document !== 'undefined') {
  document.documentElement.lang = currentLang;
}

/**
 * Get the active language ('en' or 'zh').
 * @returns {'en'|'zh'}
 */
export function getLang() {
  return currentLang;
}

/**
 * Switch the active language, persist it, and notify the UI.
 * @param {'en'|'zh'} lang
 */
export function setLang(lang) {
  if (lang !== 'en' && lang !== 'zh') return;
  if (lang === currentLang) return;
  currentLang = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Non-fatal — language just won't persist across reloads.
  }
  document.documentElement.lang = lang;
  document.dispatchEvent(new CustomEvent('ww:langchange', { detail: { lang } }));
}

/**
 * Look up a message, interpolating `{name}` placeholders.
 * Falls back to the English entry, then to the key itself.
 * @param {string} key
 * @param {Object} [params]
 * @returns {string}
 */
export function t(key, params = {}) {
  let msg = messages[currentLang]?.[key] ?? messages.en[key] ?? key;
  for (const [name, value] of Object.entries(params)) {
    msg = msg.replaceAll(`{${name}}`, String(value));
  }
  return msg;
}

/**
 * Apply the current language to every annotated element under `root`
 * (works for both the light DOM and a shadow root).
 *
 * Attributes honored:
 * - data-i18n           → textContent
 * - data-i18n-html      → innerHTML (for strings containing inline markup)
 * - data-i18n-placeholder → placeholder
 * - data-i18n-title     → title
 * @param {Document|DocumentFragment|ShadowRoot|HTMLElement} root
 */
export function applyI18n(root) {
  if (!root || !root.querySelectorAll) return;
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    el.innerHTML = t(el.dataset.i18nHtml);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  root.querySelectorAll('[data-i18n-title]').forEach((el) => {
    el.title = t(el.dataset.i18nTitle);
  });
}
