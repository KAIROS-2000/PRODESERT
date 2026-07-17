import type { Availability, CatalogQuery } from '@/lib/catalog-types';

export type RawSearchParams = Record<string, string | string[] | undefined>;

const availabilityValues = new Set<Availability>([
  'IN_STOCK',
  'LOW_STOCK',
  'BACKORDER',
  'OUT_OF_STOCK',
]);
const sortValues = new Set<NonNullable<CatalogQuery['sort']>>([
  'relevance',
  'price_asc',
  'price_desc',
  'newest',
  'popular',
  'discount_desc',
  'availability',
  'name_asc',
]);

function values(value: string | string[] | undefined): string[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function single(value: string | string[] | undefined): string | undefined {
  const candidate = values(value)[0]?.trim();
  return candidate || undefined;
}

function truthy(value: string | string[] | undefined): boolean {
  return values(value).some((item) => item === 'true' || item === '1');
}

export function parseCatalogQuery(
  params: RawSearchParams,
  defaults: Pick<CatalogQuery, 'category' | 'q'> = {},
): CatalogQuery {
  const query = single(params.q) ?? defaults.q;
  const sortCandidate = single(params.sort);
  const pageCandidate = Number.parseInt(single(params.page) ?? '1', 10);
  const attributeEntries = Object.entries(params).filter(([key]) =>
    /^attributes\[[^\]]+\]$/.test(key),
  );

  return {
    ...defaults,
    q: query,
    category: single(params.category) ?? defaults.category,
    brand: values(params.brand).filter(Boolean),
    priceMin: single(params.priceMin),
    priceMax: single(params.priceMax),
    availability: values(params.availability).filter((item): item is Availability =>
      availabilityValues.has(item as Availability),
    ),
    sale: truthy(params.sale),
    isNew: truthy(params.isNew),
    isHit: truthy(params.isHit),
    attributes: Object.fromEntries(
      attributeEntries.map(([key, value]) => [key.slice(11, -1), values(value)]),
    ),
    sort:
      sortCandidate && sortValues.has(sortCandidate as NonNullable<CatalogQuery['sort']>)
        ? (sortCandidate as NonNullable<CatalogQuery['sort']>)
        : query
          ? 'relevance'
          : 'popular',
    page: Number.isFinite(pageCandidate) && pageCandidate > 0 ? pageCandidate : 1,
    limit: 24,
  };
}

export function hasIndexBlockingFilters(params: RawSearchParams): boolean {
  return Object.keys(params).some((key) => key !== 'page');
}

export function paginatedCanonical(basePath: string, params: RawSearchParams): string {
  const rawPage = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = Number.parseInt(rawPage ?? '1', 10);
  return Number.isFinite(page) && page > 1 ? `${basePath}?page=${page}` : basePath;
}
