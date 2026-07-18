export const CatalogAvailability = {
  IN_STOCK: 'IN_STOCK',
  LOW_STOCK: 'LOW_STOCK',
  BACKORDER: 'BACKORDER',
  OUT_OF_STOCK: 'OUT_OF_STOCK',
} as const;

export type CatalogAvailability = (typeof CatalogAvailability)[keyof typeof CatalogAvailability];

export const CatalogSort = {
  RELEVANCE: 'relevance',
  PRICE_ASC: 'price_asc',
  PRICE_DESC: 'price_desc',
  NEWEST: 'newest',
  POPULAR: 'popular',
  DISCOUNT_DESC: 'discount_desc',
  AVAILABILITY: 'availability',
  NAME_ASC: 'name_asc',
} as const;

export type CatalogSort = (typeof CatalogSort)[keyof typeof CatalogSort];

export interface CatalogMoney {
  readonly amount: string;
  readonly oldAmount: string | null;
  readonly currency: 'RUB';
}

export interface CatalogBrand {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
}

export interface CatalogImage {
  readonly id: string;
  readonly url: string;
  readonly alt: string;
  readonly width?: number;
  readonly height?: number;
}

export interface CatalogCategoryNode {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly path: string;
  readonly description: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly image: CatalogImage | null;
  readonly productCount: number;
  readonly children: readonly CatalogCategoryNode[];
}

export interface CatalogProductSummary {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly brand: CatalogBrand | null;
  readonly image: CatalogImage | null;
  readonly price: CatalogMoney | null;
  readonly sku: string | null;
  readonly packDescription: string | null;
  readonly unit: string | null;
  readonly isSale: boolean;
  readonly discountPercent: number | null;
  readonly availability: CatalogAvailability;
  readonly isHit: boolean;
  readonly isNew: boolean;
  readonly variantCount: number;
  readonly defaultVariant: {
    readonly id: string;
    readonly minOrderQuantity: string;
    readonly salesMultiple: string;
    readonly availability: CatalogAvailability;
  } | null;
}

export interface CatalogAttributeValue {
  readonly code: string;
  readonly name: string;
  readonly value: string;
  readonly unit: string | null;
}

export interface CatalogVariant {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly packDescription: string | null;
  readonly unit: string;
  readonly vatRate: string;
  readonly minOrderQuantity: string;
  readonly salesMultiple: string;
  readonly countryOfOrigin: string | null;
  readonly manufacturer: string | null;
  readonly shelfLifeDays: number | null;
  readonly storageConditions: string | null;
  readonly price: CatalogMoney | null;
  readonly availability: CatalogAvailability;
  readonly attributes: readonly CatalogAttributeValue[];
}

export interface CatalogBreadcrumb {
  readonly name: string;
  readonly slug: string;
  readonly path: string;
}

export interface CatalogDocumentLink {
  readonly title: string;
  readonly url: string;
  readonly kind: 'CERTIFICATE' | 'DECLARATION' | 'SPECIFICATION' | 'OTHER';
}

export interface CatalogProductDetail extends CatalogProductSummary {
  readonly shortDescription: string | null;
  readonly description: string | null;
  readonly composition: string | null;
  readonly application: string | null;
  readonly restrictions: string | null;
  readonly storageDescription: string | null;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly canonicalUrl: string | null;
  readonly images: readonly CatalogImage[];
  readonly variants: readonly CatalogVariant[];
  readonly attributes: readonly CatalogAttributeValue[];
  readonly breadcrumbs: readonly CatalogBreadcrumb[];
  readonly related: readonly CatalogProductSummary[];
  readonly documents: readonly CatalogDocumentLink[];
}

export interface CatalogFacetOption {
  readonly value: string;
  readonly label: string;
  readonly count: number;
}

export interface CatalogAttributeFacet {
  readonly code: string;
  readonly name: string;
  readonly unit: string | null;
  readonly options: readonly CatalogFacetOption[];
}

export interface CatalogFacets {
  readonly brands: readonly CatalogFacetOption[];
  readonly categories: readonly CatalogFacetOption[];
  readonly availability: readonly CatalogFacetOption[];
  readonly collections: readonly CatalogFacetOption[];
  readonly attributes: readonly CatalogAttributeFacet[];
  readonly price: { readonly min: string | null; readonly max: string | null };
}

export interface CatalogProductsPage {
  readonly items: readonly CatalogProductSummary[];
  readonly page: number;
  readonly limit: number;
  readonly total: number;
  readonly totalPages: number;
  readonly facets: CatalogFacets;
}

export interface CatalogSearchSuggestion {
  readonly type: 'PRODUCT' | 'SKU' | 'CATEGORY' | 'BRAND' | 'QUERY' | 'SYNONYM';
  readonly label: string;
  readonly value: string;
  readonly productSlug?: string;
  readonly categoryPath?: string;
}

export interface CatalogImportResult {
  readonly importId: string;
  readonly sourceVersion: string;
  readonly productsProcessed: number;
  readonly variantsProcessed: number;
  readonly completedAt: string;
}
