# Inline JS dictionary module for i18n (no async locale files)

UI text is localized in English and Chinese through a single inline JS dictionary module (`src/lib/i18n.js`) with a flat key space and a lightweight `t()` lookup, instead of per-locale JSON resource files fetched at runtime. Templates mark static strings with `data-i18n`-family attributes that a runtime `applyI18n()` sweep fills in; components re-render on a `ww:langchange` event.

On first visit the language follows the browser (`zh` → Chinese, otherwise English); a dropdown at the right of the top nav switches at any time, persisted to `localStorage` (`wordwise:lang`). The app has no build step and is served as static files on GitHub Pages, so shipping the dictionary inline loads it before first paint with no extra requests. The UI language is a display preference and is deliberately excluded from the Config export/import (level, blacklist, whitelist, custom CSS), which stays device-level settings.
