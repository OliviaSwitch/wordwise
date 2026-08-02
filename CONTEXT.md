# WordWise

A pure-client web application for English learners that annotates English text with Chinese translation rubies, filtered by the reader's CEFR proficiency level.

## Language

**Ruby**:
An inline annotation displayed above an English word showing its Chinese translation, using the HTML `<ruby>` element.
_Avoid_: annotation, furigana, gloss

**Document**:
A unit of content the user opens for reading. Created by pasting text, uploading EPUB, or uploading HTML. Persisted in IndexedDB. Displayed on the Shelf with title, type, and last-opened time.
_Avoid_: file, book, article

**Shelf**:
The document list view showing all Documents the user has opened.
_Avoid_: library, bookshelf, home

**Gloss Pack**:
A JSON data file mapping headwords to frequency ranks and Chinese translations, plus an inflection-to-lemma table. Sourced from Readest's WordLens data (ECDICT + FrequencyWords). The `en-zh.json` pack is the primary data source.
_Avoid_: dictionary file, data file

**User Dictionary**:
A user-uploaded dictionary file (e.g. MDX) that overrides Gloss Pack translations. Frequency Rank still comes from the Gloss Pack. Falls back to Gloss Pack when a word is not found. Planned for a future release.
_Avoid_: custom dictionary, external dictionary

**Frequency Rank**:
A word's position in a corpus-derived frequency list (rank 1 = most common). Used to assign each word a Proficiency Level.
_Avoid_: word rank, popularity

**Proficiency Level**:
The user's self-assessed CEFR level (A1–C2), mapped from Frequency Rank bands (A1≤1000, A2≤2000, B1≤4000, B2≤8000, C1≤14000, C2≤24000). Words ranked above the cutoff for the user's level are annotated by default.
_Avoid_: difficulty, tier

**Blacklist**:
Words above the user's Proficiency Level that the user has already learned. Blacklisted words are excluded from annotation. Managed via click/long-press in the reader or batch editing in settings.
_Avoid_: known words, mastered words

**Whitelist**:
Words at or below the user's Proficiency Level that the user does not actually know. Whitelisted words are included in annotation despite their grade. Managed via click/long-press in the reader or batch editing in settings.
_Avoid_: word list, vocabulary book, glossary, exceptions

**Config**:
An exportable/importable file containing the user's Proficiency Level, Blacklist, and Whitelist. Does not include Documents or reading progress.
_Avoid_: settings file, profile
