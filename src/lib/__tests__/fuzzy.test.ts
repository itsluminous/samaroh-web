import {
  DUPLICATE_CHIP_THRESHOLD,
  calculateSimilarity,
  findSimilarItems,
  isDuplicateName,
} from '@/lib/fuzzy';

const items = [
  { id: '1', name: 'Steel Plate' },
  { id: '2', name: 'Steel Glass' },
  { id: '3', name: 'Plastic Chair' },
  { id: '4', name: 'Water Drum' },
];

describe('findSimilarItems', () => {
  it('returns nothing for queries shorter than 3 characters', () => {
    expect(findSimilarItems('st', items)).toEqual([]);
    expect(findSimilarItems('  a ', items)).toEqual([]);
  });

  it('matches prefixes and substrings case-insensitively', () => {
    const results = findSimilarItems('steel', items);
    expect(results.map((r) => r.item.id).sort()).toEqual(['1', '2']);
  });

  it('tolerates typos via Levenshtein similarity', () => {
    const results = findSimilarItems('Steal Plate', items, DUPLICATE_CHIP_THRESHOLD);
    expect(results.map((r) => r.item.id)).toContain('1');
  });

  it('handles word-order swaps', () => {
    const results = findSimilarItems('Plate Steel', items, DUPLICATE_CHIP_THRESHOLD);
    expect(results[0]?.item.id).toBe('1');
  });

  it('sorts by score and respects maxResults', () => {
    const results = findSimilarItems('steel', items, 0.4, 1);
    expect(results).toHaveLength(1);
    expect(results[0]!.score).toBeGreaterThanOrEqual(0.4);
  });

  it('excludes exact matches only when asked', () => {
    const withExact = findSimilarItems('Steel Plate', items);
    expect(withExact.map((r) => r.item.id)).toContain('1');
    const withoutExact = findSimilarItems('Steel Plate', items, 0.6, 5, true);
    expect(withoutExact.map((r) => r.item.id)).not.toContain('1');
  });
});

describe('calculateSimilarity', () => {
  it('is 1 for identical strings and 0 for fully different ones', () => {
    expect(calculateSimilarity('abc', 'abc')).toBe(1);
    expect(calculateSimilarity('abc', 'xyz')).toBe(0);
  });
});

describe('isDuplicateName', () => {
  it('flags word-order and near-identical duplicates', () => {
    expect(isDuplicateName('Steel Plate', 'plate  steel')).toBe(true);
    expect(isDuplicateName('Steel Plate', 'Steel Plates')).toBe(true);
    expect(isDuplicateName('Steel Plate', 'Water Drum')).toBe(false);
  });
});
