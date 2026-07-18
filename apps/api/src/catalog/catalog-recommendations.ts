export interface CartRecommendationCandidate<TProduct> {
  readonly sourceProductId: string;
  readonly targetProductId: string;
  readonly sortOrder: number;
  readonly targetProduct: TProduct;
}

/**
 * Keeps explicit merchandising relations deterministic across all cart lines.
 * Filtering for active/purchasable targets remains in the database query.
 */
export function selectCartRecommendationTargets<TProduct>(
  candidates: readonly CartRecommendationCandidate<TProduct>[],
  cartProductIds: readonly string[],
  limit: number,
): TProduct[] {
  const safeLimit = Number.isFinite(limit) ? Math.max(0, Math.floor(limit)) : 0;
  if (safeLimit === 0) return [];

  const excluded = new Set(cartProductIds);
  const sourcePriority = new Map(cartProductIds.map((id, index) => [id, index]));
  const selectedTargetIds = new Set<string>();
  const selected: TProduct[] = [];

  const ordered = [...candidates].sort((left, right) => {
    const sortOrderDifference = left.sortOrder - right.sortOrder;
    if (sortOrderDifference !== 0) return sortOrderDifference;
    const sourceDifference =
      (sourcePriority.get(left.sourceProductId) ?? Number.MAX_SAFE_INTEGER) -
      (sourcePriority.get(right.sourceProductId) ?? Number.MAX_SAFE_INTEGER);
    if (sourceDifference !== 0) return sourceDifference;
    return left.targetProductId.localeCompare(right.targetProductId);
  });

  for (const candidate of ordered) {
    if (
      excluded.has(candidate.targetProductId) ||
      selectedTargetIds.has(candidate.targetProductId)
    ) {
      continue;
    }
    selectedTargetIds.add(candidate.targetProductId);
    selected.push(candidate.targetProduct);
    if (selected.length === safeLimit) break;
  }

  return selected;
}
