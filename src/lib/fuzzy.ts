/**
 * Fuzzy matching for duplicate detection and type-ahead suggestions.
 * Combines Levenshtein similarity, substring/prefix boosts, word-level
 * matching and word-order normalisation into a single 0–1 score.
 *
 * Used by: expenses add-person dedupe dropdown, inventory transaction item
 * type-ahead, and master-item duplicate chips (3+ chars, 40% threshold).
 */

export interface FuzzyMatchResult<T> {
  item: T;
  score: number;
  matchedWords: string[];
}

/** Minimum query length before any suggestions are produced. */
export const FUZZY_MIN_QUERY_LENGTH = 3;

/** Threshold for duplicate-suggestion chips (40% similarity per spec §4.3). */
export const DUPLICATE_CHIP_THRESHOLD = 0.4;

function levenshteinDistance(str1: string, str2: string): number {
  // Row-based DP keeps strict indexed-access typing happy.
  let previousRow: number[] = Array.from({ length: str1.length + 1 }, (_, i) => i);
  for (let j = 1; j <= str2.length; j++) {
    const currentRow: number[] = [j];
    for (let i = 1; i <= str1.length; i++) {
      const indicator = str1[i - 1] === str2[j - 1] ? 0 : 1;
      currentRow.push(
        Math.min(
          (currentRow[i - 1] ?? 0) + 1,
          (previousRow[i] ?? 0) + 1,
          (previousRow[i - 1] ?? 0) + indicator,
        ),
      );
    }
    previousRow = currentRow;
  }
  return previousRow[str1.length] ?? 0;
}

/** Similarity in [0, 1] where 1 means identical. */
export function calculateSimilarity(str1: string, str2: string): number {
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) {
    return 1;
  }
  return (maxLength - levenshteinDistance(str1, str2)) / maxLength;
}

/** Lowercase, collapse whitespace and sort words — handles word-order swaps. */
function normalizeString(str: string): string {
  return str.toLowerCase().trim().replace(/\s+/g, ' ').split(' ').sort().join(' ');
}

function extractWords(str: string): string[] {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .split(/\s+/)
    .filter((word) => word.length > 0);
}

function calculateWordSimilarity(
  query: string,
  target: string,
): { score: number; matchedWords: string[] } {
  const queryWords = extractWords(query);
  const targetWords = extractWords(target);
  if (queryWords.length === 0 || targetWords.length === 0) {
    return { score: 0, matchedWords: [] };
  }

  let totalMatches = 0;
  const matchedWords: string[] = [];
  for (const queryWord of queryWords) {
    let bestMatch = 0;
    let bestMatchWord = '';
    for (const targetWord of targetWords) {
      const similarity = calculateSimilarity(queryWord, targetWord);
      if (similarity > bestMatch) {
        bestMatch = similarity;
        bestMatchWord = targetWord;
      }
    }
    if (bestMatch > 0.7) {
      totalMatches += bestMatch;
      if (!matchedWords.includes(bestMatchWord)) {
        matchedWords.push(bestMatchWord);
      }
    }
  }

  return {
    score: totalMatches / Math.max(queryWords.length, targetWords.length),
    matchedWords,
  };
}

/**
 * Finds items similar to `query`, best score first. Returns [] for queries
 * shorter than {@link FUZZY_MIN_QUERY_LENGTH}. Exact (case-insensitive)
 * matches are excluded when `excludeExact` is set — a duplicate *warning*
 * should not flag the item the user is editing.
 */
export function findSimilarItems<T extends { name: string }>(
  query: string,
  items: T[],
  threshold = 0.6,
  maxResults = 5,
  excludeExact = false,
): FuzzyMatchResult<T>[] {
  const trimmed = query.trim();
  if (trimmed.length < FUZZY_MIN_QUERY_LENGTH) {
    return [];
  }

  const queryLower = trimmed.toLowerCase();
  const normalizedQuery = normalizeString(trimmed);
  const results: FuzzyMatchResult<T>[] = [];

  for (const item of items) {
    const itemNameLower = item.name.toLowerCase().trim();
    if (excludeExact && queryLower === itemNameLower) {
      continue;
    }

    const directSimilarity = calculateSimilarity(queryLower, itemNameLower);
    const substringMatch = itemNameLower.includes(queryLower) ? 0.8 : 0;
    const startsWithMatch = itemNameLower.startsWith(queryLower) ? 0.9 : 0;
    const wordSimilarity = calculateWordSimilarity(trimmed, item.name);
    const normalizedSimilarity = calculateSimilarity(normalizedQuery, normalizeString(item.name));

    const combinedScore = Math.max(
      startsWithMatch,
      substringMatch,
      directSimilarity * 0.6 + wordSimilarity.score * 0.4,
      normalizedSimilarity * 0.7,
      wordSimilarity.score,
    );

    if (combinedScore >= threshold) {
      results.push({ item, score: combinedScore, matchedWords: wordSimilarity.matchedWords });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

/** True when two names are near-certain duplicates (normalised/highly similar). */
export function isDuplicateName(name1: string, name2: string): boolean {
  const normalized1 = normalizeString(name1);
  const normalized2 = normalizeString(name2);
  if (normalized1 === normalized2) {
    return true;
  }
  const similarity = calculateSimilarity(normalized1, normalized2);
  const wordSimilarity = calculateWordSimilarity(name1, name2);
  return similarity > 0.85 || wordSimilarity.score > 0.9;
}
