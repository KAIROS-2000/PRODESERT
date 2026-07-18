import { selectCartRecommendationTargets } from './catalog-recommendations';

describe('selectCartRecommendationTargets', () => {
  it('excludes cart products, deduplicates targets and respects explicit ordering and limit', () => {
    const candidates = [
      { sourceProductId: 'cart-b', targetProductId: 'target-2', sortOrder: 0, targetProduct: 2 },
      { sourceProductId: 'cart-a', targetProductId: 'target-1', sortOrder: 0, targetProduct: 1 },
      { sourceProductId: 'cart-a', targetProductId: 'target-2', sortOrder: 1, targetProduct: 2 },
      { sourceProductId: 'cart-b', targetProductId: 'cart-a', sortOrder: 0, targetProduct: 99 },
      { sourceProductId: 'cart-a', targetProductId: 'target-3', sortOrder: 2, targetProduct: 3 },
    ];

    expect(selectCartRecommendationTargets(candidates, ['cart-a', 'cart-b'], 2)).toEqual([1, 2]);
  });

  it('returns no targets for an empty or non-positive request', () => {
    expect(selectCartRecommendationTargets([], [], 4)).toEqual([]);
    expect(
      selectCartRecommendationTargets(
        [
          {
            sourceProductId: 'cart-a',
            targetProductId: 'target-1',
            sortOrder: 0,
            targetProduct: 1,
          },
        ],
        ['cart-a'],
        0,
      ),
    ).toEqual([]);
  });
});
