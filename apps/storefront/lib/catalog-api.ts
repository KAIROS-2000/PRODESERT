import 'server-only';

import type {
  CatalogCategoryNode,
  CatalogProductDetail,
  CatalogProductsPage,
  CatalogProductSummary,
  CatalogSearchSuggestion,
} from '@pro-dessert/contracts';

import type {
  CatalogCategory,
  CatalogProductsResponse,
  CatalogQuery,
  ProductDetail,
  SearchSuggestion,
} from '@/lib/catalog-types';

const API_ORIGIN = (process.env.API_INTERNAL_URL ?? 'http://localhost:4000').replace(/\/$/, '');
const API_PREFIX = '/api/v1';

export class CatalogApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'CatalogApiError';
  }
}

function numberFrom(value: string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeCategory(category: CatalogCategoryNode): CatalogCategory {
  return {
    id: category.id,
    slug: category.slug,
    path: category.path,
    name: category.name,
    description: category.description,
    seoTitle: category.seoTitle,
    seoDescription: category.seoDescription,
    image: category.image,
    productCount: category.productCount,
    children: category.children.map(normalizeCategory),
  };
}

function normalizeSummary(product: CatalogProductSummary) {
  const price = numberFrom(product.price?.amount);
  const oldPrice = numberFrom(product.price?.oldAmount);
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    sku: product.sku,
    brand: product.brand,
    primaryImage: product.image,
    packagingLabel:
      product.packDescription ??
      (product.variantCount > 1 ? `${product.variantCount} варианта` : null),
    unit: product.unit,
    price,
    oldPrice,
    discountPercent: product.discountPercent,
    availability: product.availability,
    isNew: product.isNew,
    isHit: product.isHit,
    isSale: product.isSale,
    variantCount: product.variantCount,
    defaultVariant: product.defaultVariant ? { ...product.defaultVariant } : null,
  };
}

function normalizeSuggestion(
  suggestion: CatalogSearchSuggestion & { readonly categoryPath?: string },
): SearchSuggestion {
  const slug =
    suggestion.productSlug ?? (suggestion.type === 'CATEGORY' ? suggestion.value : undefined);
  return {
    type:
      suggestion.type === 'PRODUCT' || suggestion.type === 'SKU'
        ? 'product'
        : suggestion.type === 'CATEGORY'
          ? 'category'
          : 'query',
    label: suggestion.label,
    ...(slug ? { slug } : {}),
    ...(suggestion.categoryPath ? { categoryPath: suggestion.categoryPath } : {}),
  };
}

async function catalogFetch<T>(path: string, revalidate = 30): Promise<T> {
  let response: Response;

  try {
    response = await fetch(`${API_ORIGIN}${API_PREFIX}${path}`, {
      headers: { Accept: 'application/json' },
      next: { revalidate },
      signal: AbortSignal.timeout(7_000),
    });
  } catch {
    throw new CatalogApiError('Каталог временно недоступен. Попробуйте ещё раз позже.');
  }

  if (!response.ok) {
    throw new CatalogApiError(
      response.status === 404
        ? 'Запрошенная страница каталога не найдена.'
        : 'Не удалось загрузить каталог.',
      response.status,
    );
  }

  return (await response.json()) as T;
}

function appendMany(params: URLSearchParams, key: string, values?: readonly string[]) {
  values?.forEach((value) => params.append(key, value));
}

export function buildCatalogParams(query: CatalogQuery): URLSearchParams {
  const params = new URLSearchParams();

  if (query.q) params.set('q', query.q);
  if (query.category) params.set('category', query.category);
  appendMany(params, 'brand', query.brand);
  if (query.priceMin) params.set('priceMin', query.priceMin);
  if (query.priceMax) params.set('priceMax', query.priceMax);
  appendMany(params, 'availability', query.availability);
  if (query.sale) params.set('sale', 'true');
  if (query.isNew) params.set('isNew', 'true');
  if (query.isHit) params.set('isHit', 'true');
  Object.entries(query.attributes ?? {}).forEach(([key, values]) => {
    appendMany(
      params,
      'attribute',
      values.map((value) => `${key}:${value}`),
    );
  });
  if (query.sort) params.set('sort', query.sort);
  if (query.page && query.page > 1) params.set('page', String(query.page));
  params.set('limit', String(query.limit ?? 24));

  return params;
}

export async function getCategories(): Promise<CatalogCategory[]> {
  const payload = await catalogFetch<readonly CatalogCategoryNode[]>('/catalog/categories', 300);
  return payload.map(normalizeCategory);
}

export async function getProducts(query: CatalogQuery): Promise<CatalogProductsResponse> {
  const params = buildCatalogParams(query);
  const payload = await catalogFetch<CatalogProductsPage>(`/catalog/products?${params.toString()}`);
  return {
    items: payload.items.map(normalizeSummary),
    page: payload.page,
    limit: payload.limit,
    total: payload.total,
    totalPages: payload.totalPages,
    facets: {
      brands: [...payload.facets.brands],
      availability: [...payload.facets.availability],
      collections: [...payload.facets.collections],
      attributes: Object.fromEntries(
        payload.facets.attributes.map((attribute) => [
          attribute.code,
          { label: attribute.name, options: [...attribute.options] },
        ]),
      ),
      price:
        payload.facets.price.min !== null && payload.facets.price.max !== null
          ? { min: Number(payload.facets.price.min), max: Number(payload.facets.price.max) }
          : null,
    },
  };
}

export async function getProduct(slug: string): Promise<ProductDetail> {
  const payload = await catalogFetch<CatalogProductDetail>(
    `/catalog/products/${encodeURIComponent(slug)}`,
  );
  const summary = normalizeSummary(payload);
  const firstVariant = payload.variants[0];
  return {
    ...summary,
    sku: firstVariant?.sku ?? null,
    shortDescription: payload.shortDescription,
    description: payload.description,
    composition: payload.composition,
    images: [...payload.images],
    breadcrumbs: payload.breadcrumbs.map((item) => ({ ...item })),
    specifications: payload.attributes.map((attribute) => ({
      name: attribute.name,
      value: `${attribute.value}${attribute.unit ? ` ${attribute.unit}` : ''}`,
    })),
    storageDescription: payload.storageDescription,
    usage: payload.application,
    restrictions: payload.restrictions,
    seoTitle: payload.seoTitle,
    seoDescription: payload.seoDescription,
    canonicalUrl: payload.canonicalUrl,
    documents: payload.documents.map((document) => ({ ...document })),
    packagingLabel: firstVariant?.packDescription ?? summary.packagingLabel,
    variants: payload.variants.map((variant) => ({
      id: variant.id,
      name: variant.name,
      sku: variant.sku,
      packagingLabel: variant.packDescription,
      unit: variant.unit,
      vatRate: variant.vatRate,
      shelfLifeDays: variant.shelfLifeDays,
      minOrderQuantity: variant.minOrderQuantity,
      salesMultiple: variant.salesMultiple,
      country: variant.countryOfOrigin,
      manufacturer: variant.manufacturer,
      storageConditions: variant.storageConditions,
      price: numberFrom(variant.price?.amount),
      oldPrice: numberFrom(variant.price?.oldAmount),
      availability: variant.availability,
    })),
    relatedProducts: payload.related.map(normalizeSummary),
  };
}

export async function getSearchSuggestions(query: string, limit = 6): Promise<SearchSuggestion[]> {
  const params = new URLSearchParams({ q: query, limit: String(limit) });
  const payload = await catalogFetch<readonly CatalogSearchSuggestion[]>(
    `/catalog/search/suggestions?${params.toString()}`,
    60,
  );
  return payload.map(normalizeSuggestion);
}
