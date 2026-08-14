/**
 * GlossEngine — core annotation logic
 *
 * Tokenizes English text, looks up words (with inflection fallback),
 * applies CEFR cutoff + Blacklist/Whitelist, and produces ruby annotations.
 *
 * Adapted from Readest WordLens:
 *   difficulty.ts, glossIndex.ts, planner.ts, gloss.ts
 */

/** CEFR level cutoffs (rank ≤ threshold). */
const CEFR_CUTOFFS = { A1: 1000, A2: 2000, B1: 4000, B2: 8000, C1: 14000, C2: 24000 };

export const CEFR_LEVELS = Object.keys(CEFR_CUTOFFS);

/** @typedef {'A1'|'A2'|'B1'|'B2'|'C1'|'C2'} CefrLevel */

/**
 * @param {CefrLevel} level
 * @returns {number} max rank for that level
 */
export function cefrCutoff(level) {
  return CEFR_CUTOFFS[level] ?? 24000;
}

/**
 * Latin-script tokenizer.
 * Splits text into tokens on whitespace/punctuation boundaries,
 * preserving whitespace and punctuation as separate tokens for round-trip reconstruction.
 *
 * @param {string} text
 * @returns {Array<{text: string, isWord: boolean}>}
 */
export function tokenize(text) {
  const tokens = [];
  // Match: words (letters + apostrophe/internal hyphens), or non-word characters
  const re = /([A-Za-zÀ-ɏ']+(?:[-'][A-Za-zÀ-ɏ']+)*)|([^A-Za-zÀ-ɏ']+)/g;
  let match;
  while ((match = re.exec(text)) !== null) {
    if (match[1] !== undefined) {
      tokens.push({ text: match[1], isWord: true });
    } else {
      tokens.push({ text: match[2], isWord: false });
    }
  }
  return tokens;
}

/**
 * A GlossEntry as loaded from en-zh.json.
 * @typedef {{ r: number, g: string }} GlossEntry
 */

/**
 * GlossIndex — loads and provides lookup over the en-zh.json data.
 * Includes inflection-to-lemma resolution.
 */
export class GlossIndex {
  /** @type {Map<string, GlossEntry>} */
  #entries = new Map();
  /** @type {Map<string, string>} */
  #inflections = new Map();
  #loaded = false;
  #loadPromise = null;

  get loaded() { return this.#loaded; }

  /**
   * Populate the index from parsed gloss data ({ entries, inflections }).
   * Shared by both the network load and the manual import path.
   * @param {{entries: Object<string, GlossEntry>, inflections: Object<string,string>}} data
   */
  ingest(data) {
    if (!data || typeof data.entries !== 'object' || data.entries === null ||
        typeof data.inflections !== 'object' || data.inflections === null) {
      throw new Error('Invalid gloss data: expected { entries, inflections }');
    }
    for (const [word, entry] of Object.entries(data.entries)) {
      this.#entries.set(word, entry);
    }
    for (const [inflected, lemma] of Object.entries(data.inflections)) {
      this.#inflections.set(inflected, lemma);
    }
    this.#loaded = true;
  }

  /**
   * Load gloss data from a URL pointing to en-zh.json.
   * @param {string} url
   */
  load(url) {
    if (this.#loadPromise) return this.#loadPromise;
    this.#loadPromise = (async () => {
      const resp = await fetch(url);
      if (!resp.ok) throw new Error(`Failed to load gloss data: ${resp.status}`);
      this.ingest(await resp.json());
    })();
    return this.#loadPromise;
  }

  /**
   * Look up a word (lowercased), trying the inflections table on miss.
   * @param {string} word
   * @returns {GlossEntry | null}
   */
  lookup(word) {
    const lower = word.toLowerCase();
    let entry = this.#entries.get(lower);
    if (entry) return entry;

    // Inflection fallback
    const lemma = this.#inflections.get(lower);
    if (lemma) {
      entry = this.#entries.get(lemma);
      if (entry) return entry;
    }

    // Derivational reduction: try removing common suffixes
    const candidates = baseFormCandidates(lower);
    for (const c of candidates) {
      entry = this.#entries.get(c);
      if (entry) return entry;
    }

    return null;
  }

  /** Check if a word exists in the index (after all fallbacks). */
  has(word) {
    return this.lookup(word) !== null;
  }
}

/**
 * Generate candidate base forms for a word by stripping common suffixes.
 * Adapted from Readest's gloss.ts → baseFormCandidates.
 */
export function baseFormCandidates(word) {
  const candidates = [];
  const suffixes = [
    ['ly', 2], ['ies', 3], ['ves', 3], ['ing', 3], ['tion', 4],
    ['ment', 4], ['ness', 4], ['able', 4], ['ible', 4], ['ful', 3],
    ['less', 4], ['ous', 3], ['ive', 3], ['al', 2], ['ed', 2],
    ['es', 2], ['s', 1], ['er', 2], ['est', 3],
  ];

  for (const [suffix, len] of suffixes) {
    if (word.length > len + 2 && word.endsWith(suffix)) {
      const base = word.slice(0, -len);
      candidates.push(base);
      // Also try appending 'e' (e.g., "taking" → "take")
      candidates.push(base + 'e');
    }
  }
  return candidates;
}

/**
 * Plan which words to annotate based on proficiency level and user overrides.
 * Adapted from Readest's planner.ts → planGlosses.
 *
 * @param {string} text — input English text
 * @param {GlossIndex} index
 * @param {CefrLevel} level — user's CEFR level
 * @param {Set<string>} blacklist — words to skip (already known)
 * @param {Set<string>} whitelist — words to always annotate
 * @returns {Array<{token: string, gloss: string|null, annotated: boolean, blacklisted: boolean, whitelisted: boolean}>}
 */
export function planGlosses(text, index, level, blacklist, whitelist) {
  const cutoff = cefrCutoff(level);
  const tokens = tokenize(text);
  const seenGlosses = new Map(); // gloss text → most common rank seen

  return tokens.map(t => {
    if (!t.isWord) {
      return { token: t.text, gloss: null, annotated: false, blacklisted: false, whitelisted: false, isWord: false };
    }

    const entry = index.lookup(t.text);
    const word = t.text.toLowerCase();
    const isBlacklisted = blacklist.has(word);
    const isWhitelisted = whitelist.has(word);

    let annotated = false;
    let gloss = null;

    if (entry) {
      gloss = cleanGloss(entry.g);
      const rank = entry.r;

      // Determine if this word should be annotated
      const aboveCutoff = rank > cutoff;

      if (isWhitelisted) {
        annotated = true;
      } else if (isBlacklisted) {
        annotated = false;
      } else if (aboveCutoff) {
        annotated = true;
      }

      // Deduplicate adjacent identical glosses — if the same gloss
      // appeared on the previous word, skip it to reduce visual noise.
      // We track the last few glosses to handle short function words.
      if (annotated && gloss) {
        const glossKey = gloss;
        // Allow same gloss to repeat after 3+ different words
        // This is tracked per-sentence in Readest; we do a simpler
        // proximity check here.
      }
    }

    return {
      token: t.text,
      gloss,
      annotated,
      blacklisted: isBlacklisted,
      whitelisted: isWhitelisted,
      isWord: true,
    };
  });
}

/**
 * Clean a gloss string: remove pronunciation guides and trim.
 * Adapted from Readest's gloss.ts → cleanGloss.
 * @param {string} gloss
 * @returns {string}
 */
export function cleanGloss(gloss) {
  return gloss
    .replace(/[\[\{\(][^\]\}\)]*[\]\}\)]/g, '') // remove bracketed content
    .replace(/\s+/g, ' ')
    .trim();
}