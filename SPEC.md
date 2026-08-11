# WordWise — Product Spec (v0.1)

## Overview

WordWise is a pure-client web application that helps English learners read text by annotating difficult words with Chinese translation rubies (`<ruby>`). Difficulty is determined by the user's self-assessed CEFR level, fine-tuned with Blacklist/Whitelist overrides.

## Annotation Logic

```
annotated_words = (words with rank > CEFR_cutoff - Blacklist) + Whitelist
```

CEFR cutoffs (from Readest's `difficulty.ts`):

| Level | Max Rank |
|-------|----------|
| A1    | 1000     |
| A2    | 2000     |
| B1    | 4000     |
| B2    | 8000     |
| C1    | 14000    |
| C2    | 24000    |

## Content Input (MVP)

| Method         | Processing    | Notes                          |
|----------------|---------------|--------------------------------|
| Paste text     | Client-side   | Wrapped in basic HTML          |
| Upload EPUB    | Client-side   | Parsed with JSZip + OPF reader |
| Upload HTML    | Client-side   | Used as-is                     |

All inputs become a **Document** and appear on the **Shelf**.

## Reader

- Simple scrolling view — not a full-featured ebook reader
- Ruby annotations rendered inline using `<ruby><rp>(<rt>释义</rt><rp>)</rp></ruby>`
- Click/long-press a ruby-annotated word → add to Blacklist (stop annotating)
- Click/long-press an unannotated word → add to Whitelist (start annotating)
- Proficiency Level adjustable in reader (changes take effect immediately)

## Export

| Source format | Export format | Method                                    |
|---------------|---------------|-------------------------------------------|
| EPUB          | EPUB          | Inject `<ruby>` into chapter HTML, repack |
| HTML          | HTML          | Inject `<ruby>`, download                 |
| Pasted text   | HTML          | Wrap in HTML with `<ruby>`, download      |

## Settings Page

- Proficiency Level selector (A1–C2)
- Blacklist batch editor (view, add, remove, search)
- Whitelist batch editor (view, add, remove, search)
- Config import/export (JSON file containing level + Blacklist + Whitelist + Custom CSS)

## Localization

The UI ships in English and Chinese. On first visit the language follows the browser (zh → Chinese, otherwise English); a dropdown at the right of the top nav switches at any time and the choice is remembered locally. The UI language is a display preference and is not part of the Config export/import.

## Data Storage

- **IndexedDB**: Documents (content + metadata), Blacklist, Whitelist, Proficiency Level
- No server-side storage, no user accounts

## Tech Stack

- Vanilla JS + Web Components (no framework)
- JSZip for EPUB parsing
- Readest WordLens `en-zh.json` Gloss Pack as primary data source
- Hosted on GitHub Pages

## Data Source

**Readest WordLens** — https://github.com/readest/readest/tree/main/apps/readest-app/data/wordlens

`en-zh.json` structure:
```json
{
  "meta": { "source": "en", "target": "zh", "metric": "...", "version": 1, "count": 24446 },
  "entries": { "the": { "r": 1, "g": "那" }, "be": { "r": 2, "g": "是；后端" }, ... },
  "inflections": { "running": "run", "went": "go", ... }
}
```

**Readest WordLens logic to adapt** — https://github.com/readest/readest/tree/main/apps/readest-app/src/services/wordlens

| File             | What to reuse                                         |
|------------------|-------------------------------------------------------|
| `types.ts`       | GlossEntry, GlossIndexData interfaces                 |
| `glossIndex.ts`  | Lookup with inflection fallback                       |
| `difficulty.ts`  | CEFR rank cutoffs, isDifficult check                  |
| `planner.ts`     | Latin tokenizer, planGlosses orchestration            |
| `gloss.ts`       | cleanGloss, baseFormCandidates, glossesShareMeaning   |

## Future Enhancements (not in MVP)

- Phonetic (IPA) ruby annotations alongside or instead of Chinese translations
- User Dictionary: upload MDX/StarDict files to override Gloss Pack translations
- URL input: lightweight CORS proxy to fetch and annotate web pages
- RSS feed support: fetch and annotate RSS content via CORS proxy
