export type Availability = 'IN_STOCK' | 'LOW_STOCK' | 'BACKORDER' | 'OUT_OF_STOCK';

export interface CatalogBreadcrumb {
  name: string;
  slug: string;
  path?: string;
}

export interface CatalogCategory {
  id: string;
  slug: string;
  path?: string;
  name: string;
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  image?: CatalogImage | null;
  productCount?: number;
  parentId?: string | null;
  children: CatalogCategory[];
  breadcrumbs?: CatalogBreadcrumb[];
}

export interface CatalogImage {
  id?: string;
  url: string;
  alt: string;
  width?: number;
  height?: number;
}

export interface ProductBrand {
  name: string;
  slug?: string;
}

export interface ProductVariant {
  id: string;
  name: string;
  sku: string;
  packagingLabel: string | null;
  unit: string;
  vatRate: string;
  shelfLifeDays: number | null;
  minOrderQuantity: string;
  salesMultiple: string;
  country: string | null;
  manufacturer: string | null;
  storageConditions: string | null;
  price: number | null;
  oldPrice?: number | null;
  availability: Availability;
}

export interface ProductSummary {
  id: string;
  slug: string;
  name: string;
  sku?: string | null;
  brand?: ProductBrand | null;
  primaryImage?: CatalogImage | null;
  packagingLabel?: string | null;
  unit?: string | null;
  price: number | null;
  oldPrice?: number | null;
  discountPercent?: number | null;
  availability: Availability;
  isNew: boolean;
  isHit: boolean;
  isSale: boolean;
  variantCount?: number;
}

export interface ProductSpecification {
  name: string;
  value: string;
  group?: string | null;
}

export interface ProductDetail extends ProductSummary {
  shortDescription?: string | null;
  description?: string | null;
  composition?: string | null;
  images: CatalogImage[];
  category?: CatalogCategory | null;
  breadcrumbs: CatalogBreadcrumb[];
  specifications: ProductSpecification[];
  storageDescription?: string | null;
  usage?: string | null;
  restrictions?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  canonicalUrl?: string | null;
  documents: { title: string; url: string; kind: string }[];
  variants: ProductVariant[];
  relatedProducts: ProductSummary[];
}

export interface FacetOption {
  value: string;
  label: string;
  count: number;
}

export interface CatalogFacets {
  brands: FacetOption[];
  availability: FacetOption[];
  collections: FacetOption[];
  price: { min: number; max: number } | null;
  attributes: Record<string, { label: string; options: FacetOption[] }>;
}

export interface CatalogProductsResponse {
  items: ProductSummary[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  facets: CatalogFacets;
}

export type SearchSuggestionType = 'product' | 'category' | 'query';

export interface SearchSuggestion {
  id?: string;
  type: SearchSuggestionType;
  label: string;
  slug?: string;
  categorySlug?: string;
  categoryPath?: string;
}

export interface CatalogQuery {
  q?: string | undefined;
  category?: string | undefined;
  brand?: string[] | undefined;
  priceMin?: string | undefined;
  priceMax?: string | undefined;
  availability?: Availability[] | undefined;
  sale?: boolean | undefined;
  isNew?: boolean | undefined;
  isHit?: boolean | undefined;
  attributes?: Record<string, string[]> | undefined;
  sort?:
    | 'relevance'
    | 'price_asc'
    | 'price_desc'
    | 'newest'
    | 'popular'
    | 'discount_desc'
    | 'availability'
    | 'name_asc'
    | undefined;
  page?: number | undefined;
  limit?: number | undefined;
}
