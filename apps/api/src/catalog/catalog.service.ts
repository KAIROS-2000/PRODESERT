import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, type ProductImage } from '@prisma/client';
import {
  type CatalogAvailability,
  type CatalogAttributeFacet,
  type CatalogAttributeValue,
  type CatalogBrand,
  type CatalogBreadcrumb,
  type CatalogCategoryNode,
  type CatalogDocumentLink,
  type CatalogFacets,
  type CatalogImage,
  type CatalogMoney,
  type CatalogProductDetail,
  type CatalogProductsPage,
  type CatalogProductSummary,
  type CatalogSearchSuggestion,
  type CatalogVariant,
} from '@pro-dessert/contracts';
import { PrismaService } from '../prisma/prisma.service';
import {
  classifyAvailability,
  buildSearchTermVariants,
  normalizeCatalogQuery,
  parseAttributeFilters,
} from './catalog-domain';
import {
  type CatalogProductsQueryDto,
  type CatalogSuggestionsQueryDto,
} from './dto/catalog-query.dto';

const catalogAvailabilityValues = [
  'IN_STOCK',
  'LOW_STOCK',
  'BACKORDER',
  'OUT_OF_STOCK',
] as const satisfies readonly CatalogAvailability[];

const summaryInclude = {
  brand: true,
  images: {
    where: { published: true },
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
  },
  variants: {
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      prices: { where: { priceType: 'RETAIL' } },
      stockBalances: {
        where: {
          warehouse: { active: true, pickupLocation: { is: { active: true } } },
        },
      },
    },
  },
} satisfies Prisma.ProductInclude;

type SummaryProduct = Prisma.ProductGetPayload<{ include: typeof summaryInclude }>;

const detailInclude = {
  ...summaryInclude,
  categories: {
    orderBy: [{ isPrimary: 'desc' }, { sortOrder: 'asc' }],
    include: { category: true },
  },
  attributeValues: {
    include: { definition: true, value: true },
  },
  relatedProducts: {
    orderBy: { sortOrder: 'asc' },
    include: { targetProduct: { include: summaryInclude } },
  },
  variants: {
    where: { active: true },
    orderBy: { sortOrder: 'asc' },
    include: {
      prices: { where: { priceType: 'RETAIL' } },
      stockBalances: {
        where: {
          warehouse: { active: true, pickupLocation: { is: { active: true } } },
        },
      },
      attributeValues: { include: { definition: true, value: true } },
    },
  },
} satisfies Prisma.ProductInclude;

type DetailProduct = Prisma.ProductGetPayload<{ include: typeof detailInclude }>;

interface RankedProductRow {
  id: string;
  totalCount: number;
}

interface AttributeFacetRow {
  code: string;
  name: string;
  unit: string | null;
  value: string;
  label: string;
  count: number;
}

interface AvailabilityFacetRow {
  availability: string;
  count: number;
}

interface CategoryFacetRow {
  value: string;
  label: string;
  count: number;
}

interface CollectionFacetRow {
  sale: number;
  isNew: number;
  isHit: number;
}

interface PriceFacetRow {
  min: Prisma.Decimal | null;
  max: Prisma.Decimal | null;
}

interface FacetProductScopes {
  brandIds: readonly string[];
  categoryIds: readonly string[];
  availabilityIds: readonly string[];
  priceIds: readonly string[];
  saleIds: readonly string[];
  isNewIds: readonly string[];
  isHitIds: readonly string[];
  attributeIds: readonly string[];
  attributeOverrides: ReadonlyMap<string, readonly string[]>;
}

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async categories(): Promise<readonly CatalogCategoryNode[]> {
    const [categories, subtreeCounts] = await Promise.all([
      this.prisma.category.findMany({
        where: { active: true, hidden: false },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.$queryRaw<{ id: string; count: number }[]>(Prisma.sql`
        SELECT parent.id, count(DISTINCT p.id)::integer AS count
        FROM categories parent
        LEFT JOIN categories assigned
          ON assigned.active AND NOT assigned.hidden
          AND (assigned.path = parent.path OR assigned.path LIKE parent.path || '/%')
        LEFT JOIN product_categories pc ON pc.category_id = assigned.id
        LEFT JOIN products p ON p.id = pc.product_id AND p.active
        WHERE parent.active AND NOT parent.hidden
        GROUP BY parent.id
      `),
    ]);
    const countById = new Map(subtreeCounts.map((row) => [row.id, row.count]));
    const nodes = new Map<string, CatalogCategoryNode & { children: CatalogCategoryNode[] }>();
    for (const category of categories) {
      nodes.set(category.id, {
        id: category.id,
        name: category.name,
        slug: category.slug,
        path: category.path,
        description: category.description,
        seoTitle: category.seoTitle,
        seoDescription: category.seoDescription,
        image: category.imageUrl
          ? {
              id: `category-${category.id}`,
              url: category.imageUrl,
              alt: category.imageAlt ?? category.name,
            }
          : null,
        productCount: countById.get(category.id) ?? 0,
        children: [],
      });
    }

    const roots: (CatalogCategoryNode & { children: CatalogCategoryNode[] })[] = [];
    for (const category of categories) {
      const node = nodes.get(category.id);
      if (!node) continue;
      const parent = category.parentId ? nodes.get(category.parentId) : undefined;
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
    return roots;
  }

  async categoryBySlug(slug: string): Promise<CatalogCategoryNode> {
    const pending = [...(await this.categories())];
    while (pending.length > 0) {
      const category = pending.shift();
      if (!category) break;
      if (category.slug === slug) return category;
      pending.push(...category.children);
    }
    throw new NotFoundException('Категория не найдена');
  }

  async brands(): Promise<readonly CatalogBrand[]> {
    const brands = await this.prisma.brand.findMany({
      where: { active: true, products: { some: { active: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return brands.map((brand) => ({ id: brand.id, name: brand.name, slug: brand.slug }));
  }

  async products(query: CatalogProductsQueryDto): Promise<CatalogProductsPage> {
    if (
      query.priceMin !== undefined &&
      query.priceMax !== undefined &&
      query.priceMin > query.priceMax
    ) {
      throw new BadRequestException('priceMin must not be greater than priceMax');
    }

    const normalizedQuery = query.q ? normalizeCatalogQuery(query.q) : '';
    const searchTerms = await this.expandSearchTerms(normalizedQuery);
    const predicates = this.buildPredicates(query, normalizedQuery, searchTerms);
    const orderBy = this.orderBy(
      query.sort ?? (normalizedQuery.length > 0 ? 'relevance' : 'popular'),
      normalizedQuery.length > 0,
    );
    const offset = (query.page - 1) * query.limit;
    const terms = searchTerms.length > 0 ? searchTerms : [''];

    const rows = await this.prisma.$queryRaw<RankedProductRow[]>(Prisma.sql`
      WITH catalog_rows AS (
        SELECT
          p.id,
          p.base_name,
          p.created_at,
          p.is_new,
          p.popularity_score,
          pricing.amount,
          pricing.old_amount,
          inventory.available,
          inventory.allow_backorder,
          (
            CASE WHEN ${normalizedQuery} <> '' AND EXISTS (
              SELECT 1 FROM product_variants exact_variant
              WHERE exact_variant.product_id = p.id
                AND exact_variant.active
                AND lower(exact_variant.sku) = ${normalizedQuery}
            ) THEN 10000.0 ELSE 0.0 END
            + COALESCE((
              SELECT max(ts_rank_cd(p.search_document, plainto_tsquery('russian', term))) * 100.0
              FROM unnest(${terms}::text[]) AS term
            ), 0.0)
            + COALESCE((
              SELECT max(similarity(lower(p.base_name), term)) * 20.0
              FROM unnest(${terms}::text[]) AS term
            ), 0.0)
            + CASE WHEN inventory.available > 0 THEN 5.0 ELSE 0.0 END
          ) AS relevance_score
        FROM products p
        LEFT JOIN LATERAL (
          SELECT pr.amount, pr.old_amount, pr.currency
          FROM product_variants pv
          JOIN prices pr ON pr.variant_id = pv.id AND pr.price_type = 'RETAIL'
          WHERE pv.product_id = p.id AND pv.active
            AND (pr.valid_from IS NULL OR pr.valid_from <= now())
            AND (pr.valid_to IS NULL OR pr.valid_to > now())
          ORDER BY pr.amount ASC
          LIMIT 1
        ) pricing ON true
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(sum(sb.available), 0) AS available,
            COALESCE(bool_or(pv.allow_backorder), false) AS allow_backorder
          FROM product_variants pv
          LEFT JOIN (
            stock_balances sb
            JOIN warehouses stock_warehouse
              ON stock_warehouse.id = sb.warehouse_id AND stock_warehouse.active
            JOIN pickup_locations stock_pickup
              ON stock_pickup.id = stock_warehouse.pickup_location_id AND stock_pickup.active
          ) ON sb.variant_id = pv.id
          WHERE pv.product_id = p.id AND pv.active
        ) inventory ON true
        WHERE ${Prisma.join(predicates, ' AND ')}
      )
      SELECT id, count(*) OVER()::integer AS "totalCount"
      FROM catalog_rows
      ORDER BY ${orderBy}
      LIMIT ${query.limit} OFFSET ${offset}
    `);

    const total = rows[0]?.totalCount ?? 0;
    const ids = rows.map((row) => row.id);
    const facetScopes = await this.buildFacetScopes(query, normalizedQuery, searchTerms);
    const [products, facets] = await Promise.all([
      ids.length > 0
        ? this.prisma.product.findMany({ where: { id: { in: ids } }, include: summaryInclude })
        : Promise.resolve([]),
      this.facets(facetScopes),
    ]);
    const positions = new Map(ids.map((id, index) => [id, index]));
    products.sort((left, right) => (positions.get(left.id) ?? 0) - (positions.get(right.id) ?? 0));

    return {
      items: products.map((product) => this.toSummary(product)),
      page: query.page,
      limit: query.limit,
      total,
      totalPages: total === 0 ? 0 : Math.ceil(total / query.limit),
      facets,
    };
  }

  async productBySlug(slug: string): Promise<CatalogProductDetail> {
    const product = await this.prisma.product.findFirst({
      where: { slug, active: true },
      include: detailInclude,
    });
    if (!product) throw new NotFoundException('Товар не найден');

    const primaryCategory = product.categories.find((entry) => entry.isPrimary)?.category;
    const breadcrumbs = primaryCategory ? await this.breadcrumbsForPath(primaryCategory.path) : [];

    return {
      ...this.toSummary(product),
      shortDescription: product.shortDescription,
      description: product.description,
      composition: product.composition,
      application: product.application,
      restrictions: product.restrictions,
      storageDescription: product.storageDescription,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
      canonicalUrl: product.canonicalUrl,
      images: product.images.map((image) => this.toImage(image)),
      variants: product.variants.map((variant) => this.toVariant(variant)),
      attributes: product.attributeValues.map((attribute) => this.toAttribute(attribute)),
      breadcrumbs,
      related: product.relatedProducts
        .filter((related) => related.targetProduct.active)
        .map((related) => this.toSummary(related.targetProduct)),
      documents: this.toDocumentLinks(product.documentLinks),
    };
  }

  async suggestions(
    query: CatalogSuggestionsQueryDto,
  ): Promise<readonly CatalogSearchSuggestion[]> {
    const normalized = normalizeCatalogQuery(query.q);
    if (normalized.length < 2) return [];
    const searchTerms = await this.expandSearchTerms(normalized);

    const [variants, products, categories, brands, synonyms] = await Promise.all([
      this.prisma.productVariant.findMany({
        where: {
          active: true,
          product: { active: true },
          OR: searchTerms.map((term) => ({ sku: { startsWith: term, mode: 'insensitive' } })),
        },
        orderBy: { sku: 'asc' },
        take: query.limit,
        include: { product: { select: { slug: true } } },
      }),
      this.prisma.$queryRaw<{ baseName: string; slug: string }[]>(Prisma.sql`
        SELECT p.base_name AS "baseName", p.slug
        FROM products p
        WHERE p.active AND (
          EXISTS (
            SELECT 1 FROM unnest(${searchTerms}::text[]) AS term
            WHERE p.search_document @@ plainto_tsquery('russian', term)
              OR lower(p.base_name) LIKE '%' || term || '%'
              OR regexp_replace(lower(p.base_name), '[\\s-]+', '', 'g')
                LIKE '%' || regexp_replace(term, '[\\s-]+', '', 'g') || '%'
              OR similarity(lower(p.base_name), term) >= 0.15
          )
        )
        ORDER BY
          CASE WHEN lower(p.base_name) LIKE ${`${normalized}%`} THEN 0 ELSE 1 END,
          similarity(lower(p.base_name), ${normalized}) DESC,
          p.popularity_score DESC
        LIMIT ${query.limit}
      `),
      this.prisma.category.findMany({
        where: {
          active: true,
          hidden: false,
          OR: searchTerms.map((term) => ({ name: { contains: term, mode: 'insensitive' } })),
        },
        orderBy: { sortOrder: 'asc' },
        take: query.limit,
      }),
      this.prisma.brand.findMany({
        where: {
          active: true,
          OR: searchTerms.map((term) => ({ name: { contains: term, mode: 'insensitive' } })),
          products: { some: { active: true } },
        },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        take: query.limit,
      }),
      this.prisma.searchSynonym.findMany({
        where: {
          active: true,
          OR: [
            ...searchTerms.map((term) => ({
              normalizedTerm: { contains: term, mode: 'insensitive' as const },
            })),
            ...searchTerms.map((term) => ({
              canonicalTerm: { contains: term, mode: 'insensitive' as const },
            })),
          ],
        },
        orderBy: { weight: 'desc' },
        take: query.limit,
      }),
    ]);

    const suggestions: CatalogSearchSuggestion[] = [];
    const seen = new Set<string>();
    const push = (suggestion: CatalogSearchSuggestion): void => {
      const key = `${suggestion.type}:${suggestion.value}`;
      if (seen.has(key) || suggestions.length >= query.limit) return;
      seen.add(key);
      suggestions.push(suggestion);
    };

    for (let index = 0; index < query.limit; index += 1) {
      const variant = variants[index];
      if (variant) {
        push({
          type: 'SKU',
          label: variant.sku,
          value: variant.sku,
          productSlug: variant.product.slug,
        });
      }
      const product = products[index];
      if (product) {
        push({
          type: 'PRODUCT',
          label: product.baseName,
          value: product.baseName,
          productSlug: product.slug,
        });
      }
      const category = categories[index];
      if (category) {
        push({
          type: 'CATEGORY',
          label: category.name,
          value: category.slug,
          categoryPath: category.path,
        });
      }
      const brand = brands[index];
      if (brand) push({ type: 'BRAND', label: brand.name, value: brand.slug });
      const synonym = synonyms[index];
      if (synonym) {
        push({ type: 'QUERY', label: synonym.canonicalTerm, value: synonym.canonicalTerm });
      }
    }
    return suggestions;
  }

  private async expandSearchTerms(normalizedQuery: string): Promise<string[]> {
    if (!normalizedQuery) return [];
    const genericTerms = buildSearchTermVariants(normalizedQuery);
    const matches = await this.prisma.searchSynonym.findMany({
      where: {
        active: true,
        OR: [{ normalizedTerm: { in: genericTerms } }, { canonicalTerm: { in: genericTerms } }],
      },
      orderBy: { weight: 'desc' },
      take: 20,
    });
    return [
      ...new Set([
        ...genericTerms,
        ...matches.flatMap((match) => [
          ...buildSearchTermVariants(match.normalizedTerm),
          ...buildSearchTermVariants(match.canonicalTerm),
        ]),
      ]),
    ];
  }

  private buildPredicates(
    query: CatalogProductsQueryDto,
    normalizedQuery: string,
    searchTerms: readonly string[],
  ): Prisma.Sql[] {
    const predicates: Prisma.Sql[] = [
      Prisma.sql`p.active`,
      Prisma.sql`EXISTS (
        SELECT 1 FROM product_variants active_variant
        WHERE active_variant.product_id = p.id AND active_variant.active
      )`,
    ];
    if (query.brand && query.brand.length > 0) {
      predicates.push(Prisma.sql`EXISTS (
        SELECT 1 FROM brands filter_brand
        WHERE filter_brand.id = p.brand_id
          AND filter_brand.active
          AND filter_brand.slug = ANY(${query.brand}::text[])
      )`);
    }
    if (query.category) {
      predicates.push(Prisma.sql`EXISTS (
        SELECT 1
        FROM product_categories filter_pc
        JOIN categories assigned_category ON assigned_category.id = filter_pc.category_id
        JOIN categories requested_category
          ON requested_category.slug = ${query.category}
          AND requested_category.active
          AND NOT requested_category.hidden
        WHERE filter_pc.product_id = p.id
          AND assigned_category.active
          AND NOT assigned_category.hidden
          AND (
            assigned_category.path = requested_category.path
            OR assigned_category.path LIKE requested_category.path || '/%'
          )
      )`);
    }
    if (query.priceMin !== undefined)
      predicates.push(Prisma.sql`pricing.amount >= ${query.priceMin}`);
    if (query.priceMax !== undefined)
      predicates.push(Prisma.sql`pricing.amount <= ${query.priceMax}`);
    if (query.sale === true) predicates.push(Prisma.sql`pricing.old_amount > pricing.amount`);
    if (query.isNew === true) predicates.push(Prisma.sql`p.is_new`);
    if (query.isHit === true) predicates.push(Prisma.sql`p.is_hit`);
    if (query.availability && query.availability.length > 0) {
      const availabilityPredicates = query.availability.map((availability) => {
        if (availability === 'IN_STOCK') return Prisma.sql`inventory.available > 5`;
        if (availability === 'LOW_STOCK') {
          return Prisma.sql`inventory.available > 0 AND inventory.available <= 5`;
        }
        if (availability === 'BACKORDER') {
          return Prisma.sql`inventory.available <= 0 AND inventory.allow_backorder`;
        }
        return Prisma.sql`inventory.available <= 0 AND NOT inventory.allow_backorder`;
      });
      predicates.push(Prisma.sql`(${Prisma.join(availabilityPredicates, ' OR ')})`);
    }

    const attributeFilters = new Map<string, string[]>();
    for (const attribute of parseAttributeFilters(query.attribute)) {
      const values = attributeFilters.get(attribute.code) ?? [];
      values.push(attribute.value);
      attributeFilters.set(attribute.code, values);
    }
    for (const [attributeCode, attributeValues] of attributeFilters) {
      predicates.push(Prisma.sql`EXISTS (
        SELECT 1
        FROM product_attribute_values filter_pav
        JOIN attribute_definitions filter_ad ON filter_ad.id = filter_pav.definition_id
        LEFT JOIN attribute_values filter_av ON filter_av.id = filter_pav.value_id
        LEFT JOIN product_variants filter_pv ON filter_pv.id = filter_pav.variant_id
        WHERE (filter_pav.product_id = p.id OR filter_pv.product_id = p.id)
          AND filter_ad.active
          AND filter_ad.filterable
          AND filter_ad.code = ${attributeCode}
          AND lower(COALESCE(
            filter_av.normalized_value,
            filter_pav.text_value,
            filter_pav.numeric_value::text,
            filter_pav.boolean_value::text
          )) = ANY(${attributeValues}::text[])
      )`);
    }

    if (normalizedQuery) {
      predicates.push(Prisma.sql`(
        EXISTS (
          SELECT 1 FROM product_variants search_variant
          WHERE search_variant.product_id = p.id
            AND search_variant.active
            AND (
              lower(search_variant.sku) = ${normalizedQuery}
              OR similarity(lower(search_variant.sku), ${normalizedQuery}) >= 0.3
            )
        )
        OR EXISTS (
          SELECT 1 FROM unnest(${searchTerms}::text[]) AS term
          WHERE p.search_document @@ plainto_tsquery('russian', term)
            OR lower(p.base_name) LIKE '%' || term || '%'
            OR regexp_replace(lower(p.base_name), '[\\s-]+', '', 'g')
              LIKE '%' || regexp_replace(term, '[\\s-]+', '', 'g') || '%'
            OR similarity(lower(p.base_name), term) >= 0.15
        )
        OR EXISTS (
          SELECT 1
          FROM brands search_brand
          CROSS JOIN unnest(${searchTerms}::text[]) AS term
          WHERE search_brand.id = p.brand_id
            AND search_brand.active
            AND (
              lower(search_brand.name) LIKE '%' || term || '%'
              OR regexp_replace(lower(search_brand.name), '[\\s-]+', '', 'g')
                LIKE '%' || regexp_replace(term, '[\\s-]+', '', 'g') || '%'
              OR similarity(lower(search_brand.name), term) >= 0.2
            )
        )
        OR EXISTS (
          SELECT 1
          FROM product_categories search_pc
          JOIN categories search_category ON search_category.id = search_pc.category_id
          CROSS JOIN unnest(${searchTerms}::text[]) AS term
          WHERE search_pc.product_id = p.id
            AND search_category.active
            AND NOT search_category.hidden
            AND (
              lower(search_category.name) LIKE '%' || term || '%'
              OR regexp_replace(lower(search_category.name), '[\\s-]+', '', 'g')
                LIKE '%' || regexp_replace(term, '[\\s-]+', '', 'g') || '%'
              OR similarity(lower(search_category.name), term) >= 0.2
            )
        )
        OR EXISTS (
          SELECT 1
          FROM product_attribute_values search_pav
          JOIN attribute_definitions search_ad ON search_ad.id = search_pav.definition_id
          LEFT JOIN attribute_values search_av ON search_av.id = search_pav.value_id
          LEFT JOIN product_variants search_pv ON search_pv.id = search_pav.variant_id
          CROSS JOIN unnest(${searchTerms}::text[]) AS term
          WHERE (search_pav.product_id = p.id OR search_pv.product_id = p.id)
            AND search_ad.active
            AND (
              lower(search_ad.name) LIKE '%' || term || '%'
              OR lower(COALESCE(search_av.display_value, search_pav.text_value, '')) LIKE '%' || term || '%'
              OR regexp_replace(
                lower(COALESCE(search_av.display_value, search_pav.text_value, '')),
                '[\\s-]+', '', 'g'
              ) LIKE '%' || regexp_replace(term, '[\\s-]+', '', 'g') || '%'
              OR similarity(
                lower(COALESCE(search_av.display_value, search_pav.text_value, '')),
                term
              ) >= 0.2
            )
        )
      )`);
    }
    return predicates;
  }

  private orderBy(
    sort: NonNullable<CatalogProductsQueryDto['sort']>,
    hasQuery: boolean,
  ): Prisma.Sql {
    switch (sort) {
      case 'price_asc':
        return Prisma.sql`amount ASC NULLS LAST, popularity_score DESC, id ASC`;
      case 'price_desc':
        return Prisma.sql`amount DESC NULLS LAST, popularity_score DESC, id ASC`;
      case 'newest':
        return Prisma.sql`is_new DESC, created_at DESC, id ASC`;
      case 'popular':
        return Prisma.sql`popularity_score DESC, id ASC`;
      case 'discount_desc':
        return Prisma.sql`((old_amount - amount) / NULLIF(old_amount, 0)) DESC NULLS LAST, popularity_score DESC, id ASC`;
      case 'availability':
        return Prisma.sql`CASE
          WHEN available > 5 THEN 0
          WHEN available > 0 THEN 1
          WHEN allow_backorder THEN 2
          ELSE 3
        END ASC, popularity_score DESC, id ASC`;
      case 'name_asc':
        return Prisma.sql`base_name ASC, id ASC`;
      case 'relevance':
      default:
        return hasQuery
          ? Prisma.sql`relevance_score DESC, popularity_score DESC, id ASC`
          : Prisma.sql`popularity_score DESC, created_at DESC, id ASC`;
    }
  }

  private async buildFacetScopes(
    query: CatalogProductsQueryDto,
    normalizedQuery: string,
    searchTerms: readonly string[],
  ): Promise<FacetProductScopes> {
    const idsFor = (overrides: Partial<CatalogProductsQueryDto>): Promise<string[]> => {
      const scopedQuery = { ...query, ...overrides };
      return this.filteredProductIds(
        this.buildPredicates(scopedQuery, normalizedQuery, searchTerms),
      );
    };
    const attributes = parseAttributeFilters(query.attribute);
    const selectedAttributeCodes = [...new Set(attributes.map((attribute) => attribute.code))];

    const [
      brandIds,
      categoryIds,
      availabilityIds,
      priceIds,
      saleIds,
      isNewIds,
      isHitIds,
      attributeIds,
      attributeOverrideEntries,
    ] = await Promise.all([
      idsFor({ brand: undefined }),
      idsFor({ category: undefined }),
      idsFor({ availability: undefined }),
      idsFor({ priceMin: undefined, priceMax: undefined }),
      idsFor({ sale: undefined }),
      idsFor({ isNew: undefined }),
      idsFor({ isHit: undefined }),
      idsFor({}),
      Promise.all(
        selectedAttributeCodes.map(async (code) => {
          const remainingAttributes = attributes
            .filter((attribute) => attribute.code !== code)
            .map((attribute) => `${attribute.code}:${attribute.value}`);
          return [
            code,
            await idsFor({
              attribute: remainingAttributes.length > 0 ? remainingAttributes : undefined,
            }),
          ] as const;
        }),
      ),
    ]);

    return {
      brandIds,
      categoryIds,
      availabilityIds,
      priceIds,
      saleIds,
      isNewIds,
      isHitIds,
      attributeIds,
      attributeOverrides: new Map(attributeOverrideEntries),
    };
  }

  private async filteredProductIds(predicates: readonly Prisma.Sql[]): Promise<string[]> {
    const rows = await this.prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT p.id
      FROM products p
      LEFT JOIN LATERAL (
        SELECT pr.amount, pr.old_amount
        FROM product_variants pv
        JOIN prices pr ON pr.variant_id = pv.id AND pr.price_type = 'RETAIL'
        WHERE pv.product_id = p.id AND pv.active
          AND (pr.valid_from IS NULL OR pr.valid_from <= now())
          AND (pr.valid_to IS NULL OR pr.valid_to > now())
        ORDER BY pr.amount ASC
        LIMIT 1
      ) pricing ON true
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(sum(sb.available), 0) AS available,
          COALESCE(bool_or(pv.allow_backorder), false) AS allow_backorder
        FROM product_variants pv
        LEFT JOIN (
          stock_balances sb
          JOIN warehouses stock_warehouse
            ON stock_warehouse.id = sb.warehouse_id AND stock_warehouse.active
          JOIN pickup_locations stock_pickup
            ON stock_pickup.id = stock_warehouse.pickup_location_id AND stock_pickup.active
        ) ON sb.variant_id = pv.id
        WHERE pv.product_id = p.id AND pv.active
      ) inventory ON true
      WHERE ${Prisma.join([...predicates], ' AND ')}
    `);
    return rows.map((row) => row.id);
  }

  private async facets(scopes: FacetProductScopes): Promise<CatalogFacets> {
    const [
      brands,
      categories,
      priceRows,
      availabilityRows,
      baseAttributeRows,
      attributeOverrideRows,
      collectionRows,
    ] = await Promise.all([
      this.prisma.brand.findMany({
        where: { active: true },
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        include: {
          _count: {
            select: {
              products: { where: { active: true, id: { in: [...scopes.brandIds] } } },
            },
          },
        },
      }),
      this.prisma.$queryRaw<CategoryFacetRow[]>(Prisma.sql`
        SELECT parent.slug AS value, parent.name AS label,
          count(DISTINCT p.id)::integer AS count
        FROM categories parent
        JOIN categories assigned
          ON assigned.active AND NOT assigned.hidden
          AND (assigned.path = parent.path OR assigned.path LIKE parent.path || '/%')
        JOIN product_categories pc ON pc.category_id = assigned.id
        JOIN products p ON p.id = pc.product_id AND p.active
          AND p.id = ANY(${scopes.categoryIds}::uuid[])
        WHERE parent.active AND NOT parent.hidden
        GROUP BY parent.id, parent.slug, parent.name, parent.sort_order
        ORDER BY parent.sort_order, parent.name
      `),
      this.prisma.$queryRaw<PriceFacetRow[]>(Prisma.sql`
        WITH product_min_prices AS (
          SELECT p.id, min(pr.amount) AS amount
          FROM products p
          JOIN product_variants pv ON pv.product_id = p.id AND pv.active
          JOIN prices pr ON pr.variant_id = pv.id AND pr.price_type = 'RETAIL'
            AND (pr.valid_from IS NULL OR pr.valid_from <= now())
            AND (pr.valid_to IS NULL OR pr.valid_to > now())
          WHERE p.active AND p.id = ANY(${scopes.priceIds}::uuid[])
          GROUP BY p.id
        )
        SELECT min(amount) AS min, max(amount) AS max
        FROM product_min_prices
      `),
      this.prisma.$queryRaw<AvailabilityFacetRow[]>(Prisma.sql`
        WITH product_inventory AS (
          SELECT p.id,
            COALESCE(sum(sb.available), 0) AS available,
            COALESCE(bool_or(pv.allow_backorder), false) AS allow_backorder
          FROM products p
          JOIN product_variants pv ON pv.product_id = p.id AND pv.active
          LEFT JOIN (
            stock_balances sb
            JOIN warehouses stock_warehouse
              ON stock_warehouse.id = sb.warehouse_id AND stock_warehouse.active
            JOIN pickup_locations stock_pickup
              ON stock_pickup.id = stock_warehouse.pickup_location_id AND stock_pickup.active
          ) ON sb.variant_id = pv.id
          WHERE p.active AND p.id = ANY(${scopes.availabilityIds}::uuid[])
          GROUP BY p.id
        )
        SELECT CASE
          WHEN available > 5 THEN 'IN_STOCK'
          WHEN available > 0 THEN 'LOW_STOCK'
          WHEN allow_backorder THEN 'BACKORDER'
          ELSE 'OUT_OF_STOCK'
        END AS availability, count(*)::integer AS count
        FROM product_inventory
        GROUP BY availability
      `),
      this.attributeFacetRows(scopes.attributeIds),
      Promise.all(
        [...scopes.attributeOverrides].map(async ([code, productIds]) => ({
          code,
          rows: await this.attributeFacetRows(productIds, code),
        })),
      ),
      this.prisma.$queryRaw<CollectionFacetRow[]>(Prisma.sql`
        SELECT
          count(DISTINCT p.id) FILTER (
            WHERE p.id = ANY(${scopes.saleIds}::uuid[]) AND EXISTS (
            SELECT 1 FROM product_variants pv
            JOIN prices pr ON pr.variant_id = pv.id AND pr.price_type = 'RETAIL'
            WHERE pv.product_id = p.id AND pv.active
              AND pr.old_amount > pr.amount
              AND (pr.valid_from IS NULL OR pr.valid_from <= now())
              AND (pr.valid_to IS NULL OR pr.valid_to > now())
            )
          )::integer AS sale,
          count(DISTINCT p.id) FILTER (
            WHERE p.id = ANY(${scopes.isNewIds}::uuid[]) AND p.is_new
          )::integer AS "isNew",
          count(DISTINCT p.id) FILTER (
            WHERE p.id = ANY(${scopes.isHitIds}::uuid[]) AND p.is_hit
          )::integer AS "isHit"
        FROM products p
        WHERE p.active
      `),
    ]);

    const overriddenAttributeCodes = new Set(attributeOverrideRows.map((entry) => entry.code));
    const attributeRows = [
      ...baseAttributeRows.filter((row) => !overriddenAttributeCodes.has(row.code)),
      ...attributeOverrideRows.flatMap((entry) => entry.rows),
    ];
    const price = priceRows[0] ?? { min: null, max: null };
    const availabilityCounts = new Map(
      availabilityRows.map((row) => [row.availability, row.count]),
    );
    const collectionCounts = collectionRows[0] ?? { sale: 0, isNew: 0, isHit: 0 };
    const attributeMap = new Map<string, CatalogAttributeFacet>();
    for (const row of attributeRows) {
      const facet = attributeMap.get(row.code) ?? {
        code: row.code,
        name: row.name,
        unit: row.unit,
        options: [],
      };
      (facet.options as { value: string; label: string; count: number }[]).push({
        value: row.value,
        label: row.label,
        count: row.count,
      });
      attributeMap.set(row.code, facet);
    }

    return {
      brands: brands
        .filter((brand) => brand._count.products > 0)
        .map((brand) => ({
          value: brand.slug,
          label: brand.name,
          count: brand._count.products,
        })),
      categories,
      availability: catalogAvailabilityValues
        .map((availability) => ({
          value: availability,
          label: availability,
          count: availabilityCounts.get(availability) ?? 0,
        }))
        .filter((option) => option.count > 0),
      collections: [
        { value: 'sale', label: 'Со скидкой', count: collectionCounts.sale },
        { value: 'isNew', label: 'Новинки', count: collectionCounts.isNew },
        { value: 'isHit', label: 'Хиты', count: collectionCounts.isHit },
      ].filter((option) => option.count > 0),
      attributes: [...attributeMap.values()],
      price: {
        min: price.min?.toFixed(2) ?? null,
        max: price.max?.toFixed(2) ?? null,
      },
    };
  }

  private attributeFacetRows(
    productIds: readonly string[],
    code?: string,
  ): Promise<AttributeFacetRow[]> {
    const codePredicate = code ? Prisma.sql`ad.code = ${code}` : Prisma.sql`TRUE`;
    return this.prisma.$queryRaw<AttributeFacetRow[]>(Prisma.sql`
      SELECT
        ad.code,
        ad.name,
        ad.unit,
        lower(COALESCE(
          av.normalized_value,
          pav.text_value,
          pav.numeric_value::text,
          pav.boolean_value::text
        )) AS value,
        COALESCE(
          av.display_value,
          pav.text_value,
          pav.numeric_value::text,
          pav.boolean_value::text
        ) AS label,
        count(DISTINCT COALESCE(pav.product_id, pv.product_id))::integer AS count
      FROM product_attribute_values pav
      JOIN attribute_definitions ad
        ON ad.id = pav.definition_id AND ad.active AND ad.filterable
      LEFT JOIN attribute_values av ON av.id = pav.value_id
      LEFT JOIN product_variants pv ON pv.id = pav.variant_id
      JOIN products p ON p.id = COALESCE(pav.product_id, pv.product_id)
        AND p.active AND p.id = ANY(${productIds}::uuid[])
      WHERE ${codePredicate}
      GROUP BY ad.code, ad.name, ad.unit, value, label, ad.sort_order, av.sort_order
      ORDER BY ad.sort_order, ad.name, av.sort_order, label
    `);
  }

  private toSummary(product: SummaryProduct): CatalogProductSummary {
    const now = new Date();
    const purchasable = product.variants
      .flatMap((variant) =>
        variant.prices
          .filter(
            (price) =>
              (price.validFrom === null || price.validFrom <= now) &&
              (price.validTo === null || price.validTo > now),
          )
          .map((price) => ({ variant, price })),
      )
      .sort((left, right) => left.price.amount.comparedTo(right.price.amount))[0];
    const price = purchasable?.price;
    const primaryVariant = purchasable?.variant ?? product.variants[0];
    const available = product.variants.reduce(
      (sum, variant) =>
        sum +
        variant.stockBalances.reduce(
          (variantSum, stock) => variantSum + stock.available.toNumber(),
          0,
        ),
      0,
    );
    const allowBackorder = product.variants.some((variant) => variant.allowBackorder);
    return {
      id: product.id,
      slug: product.slug,
      name: product.baseName,
      brand: product.brand
        ? { id: product.brand.id, name: product.brand.name, slug: product.brand.slug }
        : null,
      image: product.images[0] ? this.toImage(product.images[0]) : null,
      price: price ? this.toMoney(price) : null,
      sku: primaryVariant?.sku ?? null,
      packDescription: primaryVariant?.packDescription ?? null,
      unit: primaryVariant?.unit ?? null,
      isSale: price?.oldAmount !== null && price?.oldAmount !== undefined,
      discountPercent:
        price?.oldAmount !== null && price?.oldAmount !== undefined
          ? Math.round(
              price.oldAmount.minus(price.amount).dividedBy(price.oldAmount).times(100).toNumber(),
            )
          : null,
      availability: classifyAvailability(available, allowBackorder),
      isHit: product.isHit,
      isNew: product.isNew,
      variantCount: product.variants.length,
    };
  }

  private toVariant(variant: DetailProduct['variants'][number]): CatalogVariant {
    const now = new Date();
    const price = variant.prices
      .filter(
        (candidate) =>
          (candidate.validFrom === null || candidate.validFrom <= now) &&
          (candidate.validTo === null || candidate.validTo > now),
      )
      .sort((left, right) => left.amount.comparedTo(right.amount))[0];
    const available = variant.stockBalances.reduce(
      (sum, stock) => sum + stock.available.toNumber(),
      0,
    );
    return {
      id: variant.id,
      sku: variant.sku,
      name: variant.offerName,
      packDescription: variant.packDescription,
      unit: variant.unit,
      vatRate: variant.vatRate.toFixed(2),
      minOrderQuantity: variant.minOrderQuantity.toString(),
      salesMultiple: variant.salesMultiple.toString(),
      countryOfOrigin: variant.countryOfOrigin,
      manufacturer: variant.manufacturer,
      shelfLifeDays: variant.shelfLifeDays,
      storageConditions: variant.storageConditions,
      price: price ? this.toMoney(price) : null,
      availability: classifyAvailability(available, variant.allowBackorder),
      attributes: variant.attributeValues.map((attribute) => this.toAttribute(attribute)),
    };
  }

  private toMoney(price: {
    amount: Prisma.Decimal;
    oldAmount: Prisma.Decimal | null;
    currency: string;
  }): CatalogMoney {
    return {
      amount: price.amount.toFixed(2),
      oldAmount: price.oldAmount?.toFixed(2) ?? null,
      currency: 'RUB',
    };
  }

  private toImage(image: ProductImage): CatalogImage {
    return { id: image.id, url: image.publicUrl, alt: image.alt };
  }

  private toAttribute(attribute: {
    definition: { code: string; name: string; unit: string | null };
    value: { displayValue: string } | null;
    textValue: string | null;
    numericValue: Prisma.Decimal | null;
    booleanValue: boolean | null;
  }): CatalogAttributeValue {
    return {
      code: attribute.definition.code,
      name: attribute.definition.name,
      value:
        attribute.value?.displayValue ??
        attribute.textValue ??
        attribute.numericValue?.toString() ??
        String(attribute.booleanValue),
      unit: attribute.definition.unit,
    };
  }

  private async breadcrumbsForPath(path: string): Promise<CatalogBreadcrumb[]> {
    const slugs = path.split('/').filter(Boolean);
    const paths = slugs.map((_, index) => `/${slugs.slice(0, index + 1).join('/')}`);
    const categories = await this.prisma.category.findMany({
      where: { path: { in: paths }, active: true, hidden: false },
    });
    const byPath = new Map(categories.map((category) => [category.path, category]));
    return paths.flatMap((currentPath) => {
      const category = byPath.get(currentPath);
      return category ? [{ name: category.name, slug: category.slug, path: category.path }] : [];
    });
  }

  private toDocumentLinks(value: Prisma.JsonValue | null): CatalogDocumentLink[] {
    if (!Array.isArray(value)) return [];
    const allowedKinds = new Set(['CERTIFICATE', 'DECLARATION', 'SPECIFICATION', 'OTHER']);
    return value.flatMap((entry) => {
      if (
        typeof entry !== 'object' ||
        entry === null ||
        Array.isArray(entry) ||
        typeof entry.title !== 'string' ||
        typeof entry.url !== 'string' ||
        typeof entry.kind !== 'string' ||
        !this.isSafeDocumentUrl(entry.url) ||
        !allowedKinds.has(entry.kind)
      ) {
        return [];
      }
      return [
        {
          title: entry.title,
          url: entry.url,
          kind: entry.kind as CatalogDocumentLink['kind'],
        },
      ];
    });
  }

  private isSafeDocumentUrl(value: string): boolean {
    if (value.startsWith('/') && !value.startsWith('//')) return true;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }
}
