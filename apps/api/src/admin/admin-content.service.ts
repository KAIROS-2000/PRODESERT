import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Role } from '@prisma/client';
import { type AuthenticatedPrincipal } from '../auth/auth.types';
import { PrismaService } from '../prisma/prisma.service';
import {
  type CreateBannerDto,
  type CreateContentPageDto,
  type CreatePromotionDto,
  type ProductCatalogQueryDto,
  type ReplaceProductImagesDto,
  type ReplaceRelatedProductsDto,
  type SearchSynonymDto,
  type UpdateBannerDto,
  type UpdateContentPageDto,
  type UpdateProductContentDto,
  type UpdatePromotionDto,
} from './dto/admin.dto';

const productInclude = {
  brand: { select: { id: true, name: true, slug: true } },
  images: { orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }] },
  categories: {
    include: { category: { select: { id: true, name: true, slug: true, path: true } } },
    orderBy: [{ isPrimary: 'desc' as const }, { sortOrder: 'asc' as const }],
  },
  relatedProducts: {
    include: { targetProduct: { select: { id: true, baseName: true, slug: true, active: true } } },
    orderBy: { sortOrder: 'asc' as const },
  },
  variants: {
    select: {
      id: true,
      sku: true,
      offerName: true,
      active: true,
      prices: { select: { amount: true, currency: true, priceType: true } },
      stockBalances: { select: { available: true } },
    },
    orderBy: { sortOrder: 'asc' as const },
  },
} satisfies Prisma.ProductInclude;

type ContentProduct = Prisma.ProductGetPayload<{ include: typeof productInclude }>;

@Injectable()
export class AdminContentService {
  constructor(private readonly prisma: PrismaService) {}

  async products(query: ProductCatalogQueryDto): Promise<Record<string, unknown>> {
    const q = query.q?.trim();
    const where: Prisma.ProductWhereInput = q
      ? {
          OR: [
            { baseName: { contains: q, mode: 'insensitive' } },
            { slug: { contains: q, mode: 'insensitive' } },
            { variants: { some: { sku: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : {};
    const [total, rows] = await Promise.all([
      this.prisma.product.count({ where }),
      this.prisma.product.findMany({
        where,
        include: productInclude,
        orderBy: { updatedAt: 'desc' },
        skip: (query.page - 1) * query.limit,
        take: query.limit,
      }),
    ]);
    return this.page(rows.map((product) => this.toProduct(product)), query.page, query.limit, total);
  }

  async product(id: string): Promise<Record<string, unknown>> {
    const product = await this.prisma.product.findUnique({ where: { id }, include: productInclude });
    if (!product) throw this.productNotFound();
    return this.toProduct(product);
  }

  async updateProductContent(
    id: string,
    dto: UpdateProductContentDto,
    principal: AuthenticatedPrincipal,
    correlationId?: string,
  ): Promise<Record<string, unknown>> {
    const data = this.productContentData(dto);
    const product = await this.prisma.$transaction(async (transaction) => {
      const update = await transaction.product.updateMany({
        where: { id, contentVersion: dto.expectedContentVersion },
        data: { ...data, contentVersion: { increment: 1 } },
      });
      if (update.count === 0) await this.throwProductVersionError(transaction, id);
      await transaction.auditLog.create({
        data: {
          action: 'PRODUCT_CONTENT_UPDATED',
          entityType: 'Product',
          entityId: id,
          source: 'ADMIN',
          actorUserId: principal.userId,
          actorRole: principal.role,
          correlationId,
          metadata: { fields: Object.keys(data) },
        },
      });
      return transaction.product.findUniqueOrThrow({ where: { id }, include: productInclude });
    });
    return this.toProduct(product);
  }

  async replaceImages(
    id: string,
    dto: ReplaceProductImagesDto,
    principal: AuthenticatedPrincipal,
    correlationId?: string,
  ): Promise<Record<string, unknown>> {
    const primaryCount = dto.images.filter((image) => image.isPrimary === true).length;
    if (primaryCount > 1) {
      throw new BadRequestException({
        code: 'PRODUCT_IMAGES_MULTIPLE_PRIMARY',
        message: 'У товара может быть только одно главное изображение.',
      });
    }
    const product = await this.prisma.$transaction(async (transaction) => {
      const variantIds = [...new Set(dto.images.flatMap((image) => (image.variantId ? [image.variantId] : [])))];
      if (variantIds.length > 0) {
        const variants = await transaction.productVariant.count({
          where: { id: { in: variantIds }, productId: id },
        });
        if (variants !== variantIds.length) {
          throw new BadRequestException({
            code: 'PRODUCT_IMAGE_VARIANT_MISMATCH',
            message: 'Изображение связано с вариантом другого товара.',
          });
        }
      }
      const update = await transaction.product.updateMany({
        where: { id, contentVersion: dto.expectedContentVersion },
        data: { contentVersion: { increment: 1 } },
      });
      if (update.count === 0) await this.throwProductVersionError(transaction, id);
      await transaction.productImage.deleteMany({ where: { productId: id } });
      if (dto.images.length > 0) {
        await transaction.productImage.createMany({
          data: dto.images.map((image, index) => ({
            productId: id,
            objectKey: image.objectKey.trim(),
            publicUrl: image.publicUrl.trim(),
            alt: image.alt.trim(),
            ...(image.variantId ? { variantId: image.variantId } : {}),
            sortOrder: image.sortOrder,
            isPrimary: image.isPrimary ?? index === 0,
            published: image.published ?? true,
          })),
        });
      }
      await transaction.auditLog.create({
        data: {
          action: 'PRODUCT_IMAGES_REPLACED',
          entityType: 'Product',
          entityId: id,
          source: 'ADMIN',
          actorUserId: principal.userId,
          actorRole: principal.role,
          correlationId,
          metadata: { imageCount: dto.images.length },
        },
      });
      return transaction.product.findUniqueOrThrow({ where: { id }, include: productInclude });
    });
    return this.toProduct(product);
  }

  async replaceRelations(
    id: string,
    dto: ReplaceRelatedProductsDto,
    principal: AuthenticatedPrincipal,
    correlationId?: string,
  ): Promise<Record<string, unknown>> {
    if (dto.relations.some((relation) => relation.targetProductId === id)) {
      throw new BadRequestException({
        code: 'RELATED_PRODUCT_SELF_REFERENCE',
        message: 'Товар нельзя связать с самим собой.',
      });
    }
    const relationKeys = new Set(
      dto.relations.map((relation) => `${relation.targetProductId}:${relation.relationType}`),
    );
    if (relationKeys.size !== dto.relations.length) {
      throw new BadRequestException({
        code: 'RELATED_PRODUCT_DUPLICATE',
        message: 'Повторяющиеся связи товаров недопустимы.',
      });
    }
    const product = await this.prisma.$transaction(async (transaction) => {
      const targetIds = [...new Set(dto.relations.map((relation) => relation.targetProductId))];
      if (targetIds.length > 0) {
        const targets = await transaction.product.count({ where: { id: { in: targetIds } } });
        if (targets !== targetIds.length) {
          throw new BadRequestException({
            code: 'RELATED_PRODUCT_NOT_FOUND',
            message: 'Один из связанных товаров не найден.',
          });
        }
      }
      const update = await transaction.product.updateMany({
        where: { id, contentVersion: dto.expectedContentVersion },
        data: { contentVersion: { increment: 1 } },
      });
      if (update.count === 0) await this.throwProductVersionError(transaction, id);
      await transaction.relatedProduct.deleteMany({ where: { sourceProductId: id } });
      if (dto.relations.length > 0) {
        await transaction.relatedProduct.createMany({
          data: dto.relations.map((relation) => ({
            sourceProductId: id,
            targetProductId: relation.targetProductId,
            relationType: relation.relationType,
            sortOrder: relation.sortOrder,
          })),
        });
      }
      await transaction.auditLog.create({
        data: {
          action: 'PRODUCT_RELATIONS_REPLACED',
          entityType: 'Product',
          entityId: id,
          source: 'ADMIN',
          actorUserId: principal.userId,
          actorRole: principal.role,
          correlationId,
          metadata: { relationCount: dto.relations.length },
        },
      });
      return transaction.product.findUniqueOrThrow({ where: { id }, include: productInclude });
    });
    return this.toProduct(product);
  }

  async synonyms(): Promise<Record<string, unknown>> {
    const items = await this.prisma.searchSynonym.findMany({
      orderBy: [{ canonicalTerm: 'asc' }, { normalizedTerm: 'asc' }],
      take: 500,
    });
    return {
      items: items.map((item) => ({
        id: item.id,
        normalizedTerm: item.normalizedTerm,
        canonicalTerm: item.canonicalTerm,
        locale: item.locale,
        weight: item.weight.toFixed(2),
        active: item.active,
        updatedAt: item.updatedAt.toISOString(),
      })),
    };
  }

  async createSynonym(
    dto: SearchSynonymDto,
    principal: AuthenticatedPrincipal,
    correlationId?: string,
  ): Promise<Record<string, unknown>> {
    const item = await this.prisma.$transaction(async (transaction) => {
      const synonym = await transaction.searchSynonym.create({
        data: {
          normalizedTerm: dto.normalizedTerm.trim().toLowerCase(),
          canonicalTerm: dto.canonicalTerm.trim().toLowerCase(),
          locale: dto.locale?.trim() || 'ru',
          ...(dto.weight !== undefined ? { weight: dto.weight } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
      });
      await this.contentAudit(transaction, 'SEARCH_SYNONYM_CREATED', 'SearchSynonym', synonym.id, principal, correlationId);
      return synonym;
    });
    return this.toSynonym(item);
  }

  async updateSynonym(
    id: string,
    dto: SearchSynonymDto,
    principal: AuthenticatedPrincipal,
    correlationId?: string,
  ): Promise<Record<string, unknown>> {
    const item = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.searchSynonym.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException({ code: 'SEARCH_SYNONYM_NOT_FOUND', message: 'Синоним не найден.' });
      const synonym = await transaction.searchSynonym.update({
        where: { id },
        data: {
          normalizedTerm: dto.normalizedTerm.trim().toLowerCase(),
          canonicalTerm: dto.canonicalTerm.trim().toLowerCase(),
          ...(dto.locale !== undefined ? { locale: dto.locale.trim() } : {}),
          ...(dto.weight !== undefined ? { weight: dto.weight } : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
      });
      await this.contentAudit(transaction, 'SEARCH_SYNONYM_UPDATED', 'SearchSynonym', id, principal, correlationId);
      return synonym;
    });
    return this.toSynonym(item);
  }

  async deleteSynonym(
    id: string,
    principal: AuthenticatedPrincipal,
    correlationId?: string,
  ): Promise<void> {
    await this.prisma.$transaction(async (transaction) => {
      const result = await transaction.searchSynonym.deleteMany({ where: { id } });
      if (result.count === 0) throw new NotFoundException({ code: 'SEARCH_SYNONYM_NOT_FOUND', message: 'Синоним не найден.' });
      await this.contentAudit(transaction, 'SEARCH_SYNONYM_DELETED', 'SearchSynonym', id, principal, correlationId);
    });
  }

  async catalogTaxonomy(): Promise<Record<string, unknown>> {
    const [categories, brands] = await Promise.all([
      this.prisma.category.findMany({
        select: { id: true, name: true, slug: true, path: true, active: true, hidden: true },
        orderBy: [{ path: 'asc' }, { name: 'asc' }],
      }),
      this.prisma.brand.findMany({
        select: { id: true, name: true, slug: true, active: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    return { categories, brands };
  }

  async promotions(): Promise<Record<string, unknown>> {
    await this.expireScheduledContent();
    const promotions = await this.prisma.promotion.findMany({
      include: {
        products: { include: { product: { select: { id: true, baseName: true, slug: true } } } },
        categories: { include: { category: { select: { id: true, name: true, slug: true } } } },
      },
      orderBy: [{ priority: 'desc' }, { startsAt: 'desc' }],
    });
    return { items: promotions.map((promotion) => this.toPromotion(promotion)) };
  }

  async createPromotion(
    dto: CreatePromotionDto,
    principal: AuthenticatedPrincipal,
    correlationId?: string,
  ): Promise<Record<string, unknown>> {
    this.assertSchedule(dto.startsAt, dto.endsAt);
    this.assertPromotionCommercialPermission(dto, principal.role, false);
    const promotion = await this.prisma.$transaction(async (transaction) => {
      await this.assertPromotionTargets(transaction, dto.productIds, dto.categoryIds);
      const created = await transaction.promotion.create({
        data: {
          ...this.promotionData(dto),
          products: dto.productIds?.length
            ? { create: dto.productIds.map((productId) => ({ productId })) }
            : undefined,
          categories: dto.categoryIds?.length
            ? { create: dto.categoryIds.map((categoryId) => ({ categoryId })) }
            : undefined,
        },
        include: { products: { include: { product: true } }, categories: { include: { category: true } } },
      });
      await this.contentAudit(transaction, 'PROMOTION_CREATED', 'Promotion', created.id, principal, correlationId);
      return created;
    });
    return this.toPromotion(promotion);
  }

  async updatePromotion(
    id: string,
    dto: UpdatePromotionDto,
    principal: AuthenticatedPrincipal,
    correlationId?: string,
  ): Promise<Record<string, unknown>> {
    this.assertSchedule(dto.startsAt, dto.endsAt);
    const promotion = await this.prisma.$transaction(async (transaction) => {
      const existing = await transaction.promotion.findUnique({ where: { id } });
      if (!existing) throw new NotFoundException({ code: 'PROMOTION_NOT_FOUND', message: 'Акция не найдена.' });
      this.assertPromotionCommercialPermission(dto, principal.role, existing.discountManagedBySite);
      await this.assertPromotionTargets(transaction, dto.productIds, dto.categoryIds);
      const update = await transaction.promotion.updateMany({
        where: { id, version: dto.expectedVersion },
        data: { ...this.promotionData(dto), version: { increment: 1 } },
      });
      if (update.count === 0) throw this.versionConflict('Акция уже изменена. Обновите данные.');
      if (dto.productIds !== undefined) {
        await transaction.promotionProduct.deleteMany({ where: { promotionId: id } });
        if (dto.productIds.length > 0) {
          await transaction.promotionProduct.createMany({
            data: dto.productIds.map((productId) => ({ promotionId: id, productId })),
          });
        }
      }
      if (dto.categoryIds !== undefined) {
        await transaction.promotionCategory.deleteMany({ where: { promotionId: id } });
        if (dto.categoryIds.length > 0) {
          await transaction.promotionCategory.createMany({
            data: dto.categoryIds.map((categoryId) => ({ promotionId: id, categoryId })),
          });
        }
      }
      await this.contentAudit(transaction, 'PROMOTION_UPDATED', 'Promotion', id, principal, correlationId);
      return transaction.promotion.findUniqueOrThrow({
        where: { id },
        include: { products: { include: { product: true } }, categories: { include: { category: true } } },
      });
    });
    return this.toPromotion(promotion);
  }

  async banners(): Promise<Record<string, unknown>> {
    await this.expireScheduledContent();
    const banners = await this.prisma.banner.findMany({
      orderBy: [{ priority: 'desc' }, { startsAt: 'desc' }],
    });
    return { items: banners.map((banner) => this.toBanner(banner)) };
  }

  async createBanner(
    dto: CreateBannerDto,
    principal: AuthenticatedPrincipal,
    correlationId?: string,
  ): Promise<Record<string, unknown>> {
    this.assertSchedule(dto.startsAt, dto.endsAt);
    const banner = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.banner.create({ data: this.bannerData(dto) });
      await this.contentAudit(transaction, 'BANNER_CREATED', 'Banner', created.id, principal, correlationId);
      return created;
    });
    return this.toBanner(banner);
  }

  async updateBanner(
    id: string,
    dto: UpdateBannerDto,
    principal: AuthenticatedPrincipal,
    correlationId?: string,
  ): Promise<Record<string, unknown>> {
    this.assertSchedule(dto.startsAt, dto.endsAt);
    const banner = await this.prisma.$transaction(async (transaction) => {
      const update = await transaction.banner.updateMany({
        where: { id, version: dto.expectedVersion },
        data: { ...this.bannerData(dto), version: { increment: 1 } },
      });
      if (update.count === 0) await this.throwBannerVersionError(transaction, id);
      await this.contentAudit(transaction, 'BANNER_UPDATED', 'Banner', id, principal, correlationId);
      return transaction.banner.findUniqueOrThrow({ where: { id } });
    });
    return this.toBanner(banner);
  }

  async pages(): Promise<Record<string, unknown>> {
    const pages = await this.prisma.contentPage.findMany({ orderBy: { updatedAt: 'desc' } });
    return { items: pages.map((page) => this.toPage(page)) };
  }

  async createPage(
    dto: CreateContentPageDto,
    principal: AuthenticatedPrincipal,
    correlationId?: string,
  ): Promise<Record<string, unknown>> {
    const page = await this.prisma.$transaction(async (transaction) => {
      const created = await transaction.contentPage.create({
        data: {
          slug: dto.slug,
          title: dto.title.trim(),
          body: dto.body.trim(),
          ...(dto.seoTitle !== undefined ? { seoTitle: dto.seoTitle?.trim() || null } : {}),
          ...(dto.seoDescription !== undefined
            ? { seoDescription: dto.seoDescription?.trim() || null }
            : {}),
          ...(dto.published !== undefined ? { published: dto.published } : {}),
          ...(dto.published ? { publishedAt: new Date() } : {}),
        },
      });
      await this.contentAudit(transaction, 'CONTENT_PAGE_CREATED', 'ContentPage', created.id, principal, correlationId);
      return created;
    });
    return this.toPage(page);
  }

  async updatePage(
    id: string,
    dto: UpdateContentPageDto,
    principal: AuthenticatedPrincipal,
    correlationId?: string,
  ): Promise<Record<string, unknown>> {
    const page = await this.prisma.$transaction(async (transaction) => {
      const update = await transaction.contentPage.updateMany({
        where: { id, version: dto.expectedVersion },
        data: {
          slug: dto.slug,
          title: dto.title.trim(),
          body: dto.body.trim(),
          ...(dto.seoTitle !== undefined ? { seoTitle: dto.seoTitle?.trim() || null } : {}),
          ...(dto.seoDescription !== undefined
            ? { seoDescription: dto.seoDescription?.trim() || null }
            : {}),
          ...(dto.published !== undefined ? { published: dto.published } : {}),
          ...(dto.published === true ? { publishedAt: new Date() } : {}),
          ...(dto.published === false ? { publishedAt: null } : {}),
          version: { increment: 1 },
        },
      });
      if (update.count === 0) await this.throwPageVersionError(transaction, id);
      await this.contentAudit(transaction, 'CONTENT_PAGE_UPDATED', 'ContentPage', id, principal, correlationId);
      return transaction.contentPage.findUniqueOrThrow({ where: { id } });
    });
    return this.toPage(page);
  }

  private productContentData(dto: UpdateProductContentDto): Prisma.ProductUpdateManyMutationInput {
    return {
      ...(dto.shortDescription !== undefined ? { shortDescription: dto.shortDescription?.trim() || null } : {}),
      ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
      ...(dto.composition !== undefined ? { composition: dto.composition?.trim() || null } : {}),
      ...(dto.application !== undefined ? { application: dto.application?.trim() || null } : {}),
      ...(dto.restrictions !== undefined ? { restrictions: dto.restrictions?.trim() || null } : {}),
      ...(dto.storageDescription !== undefined
        ? { storageDescription: dto.storageDescription?.trim() || null }
        : {}),
      ...(dto.seoTitle !== undefined ? { seoTitle: dto.seoTitle?.trim() || null } : {}),
      ...(dto.seoDescription !== undefined ? { seoDescription: dto.seoDescription?.trim() || null } : {}),
      ...(dto.canonicalUrl !== undefined ? { canonicalUrl: dto.canonicalUrl?.trim() || null } : {}),
      ...(dto.isHit !== undefined ? { isHit: dto.isHit } : {}),
      ...(dto.isNew !== undefined ? { isNew: dto.isNew } : {}),
    };
  }

  private promotionData(dto: CreatePromotionDto): Prisma.PromotionUncheckedCreateInput {
    return {
      title: dto.title.trim(),
      ...(dto.body !== undefined ? { body: dto.body?.trim() || null } : {}),
      ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl?.trim() || null } : {}),
      ...(dto.imageAlt !== undefined ? { imageAlt: dto.imageAlt?.trim() || null } : {}),
      ...(dto.linkUrl !== undefined ? { linkUrl: dto.linkUrl?.trim() || null } : {}),
      ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null } : {}),
      ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null } : {}),
      ...(dto.active !== undefined ? { active: dto.active } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
      ...(dto.badgeColor !== undefined ? { badgeColor: dto.badgeColor?.toUpperCase() || null } : {}),
      ...(dto.textColor !== undefined ? { textColor: dto.textColor?.toUpperCase() || null } : {}),
      ...(dto.discountPercent !== undefined ? { discountPercent: dto.discountPercent } : {}),
      ...(dto.discountManagedBySite !== undefined
        ? { discountManagedBySite: dto.discountManagedBySite }
        : {}),
    };
  }

  private bannerData(dto: CreateBannerDto): Prisma.BannerUncheckedCreateInput {
    return {
      title: dto.title.trim(),
      ...(dto.body !== undefined ? { body: dto.body?.trim() || null } : {}),
      ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl?.trim() || null } : {}),
      ...(dto.imageAlt !== undefined ? { imageAlt: dto.imageAlt?.trim() || null } : {}),
      ...(dto.linkUrl !== undefined ? { linkUrl: dto.linkUrl?.trim() || null } : {}),
      ...(dto.startsAt !== undefined ? { startsAt: dto.startsAt ? new Date(dto.startsAt) : null } : {}),
      ...(dto.endsAt !== undefined ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null } : {}),
      ...(dto.active !== undefined ? { active: dto.active } : {}),
      ...(dto.priority !== undefined ? { priority: dto.priority } : {}),
    };
  }

  private toProduct(product: ContentProduct): Record<string, unknown> {
    return {
      id: product.id,
      oneCId: product.oneCId,
      baseName: product.baseName,
      slug: product.slug,
      active: product.active,
      contentVersion: product.contentVersion,
      shortDescription: product.shortDescription,
      description: product.description,
      composition: product.composition,
      application: product.application,
      restrictions: product.restrictions,
      storageDescription: product.storageDescription,
      seoTitle: product.seoTitle,
      seoDescription: product.seoDescription,
      canonicalUrl: product.canonicalUrl,
      isHit: product.isHit,
      isNew: product.isNew,
      brand: product.brand,
      images: product.images.map((image) => ({
        id: image.id,
        objectKey: image.objectKey,
        publicUrl: image.publicUrl,
        alt: image.alt,
        variantId: image.variantId,
        sortOrder: image.sortOrder,
        isPrimary: image.isPrimary,
        published: image.published,
      })),
      categories: product.categories.map((category) => ({
        ...category.category,
        isPrimary: category.isPrimary,
        sortOrder: category.sortOrder,
      })),
      relations: product.relatedProducts.map((relation) => ({
        target: relation.targetProduct,
        relationType: relation.relationType,
        sortOrder: relation.sortOrder,
      })),
      variants: product.variants.map((variant) => ({
        id: variant.id,
        sku: variant.sku,
        offerName: variant.offerName,
        active: variant.active,
        prices: variant.prices.map((price) => ({
          priceType: price.priceType,
          amount: price.amount.toFixed(2),
          currency: price.currency,
        })),
        available: variant.stockBalances.reduce((total, balance) => total + balance.available.toNumber(), 0),
      })),
      updatedAt: product.updatedAt.toISOString(),
    };
  }

  private toPromotion(promotion: {
    id: string;
    title: string;
    body: string | null;
    imageUrl: string | null;
    imageAlt: string | null;
    linkUrl: string | null;
    startsAt: Date | null;
    endsAt: Date | null;
    active: boolean;
    priority: number;
    badgeColor: string | null;
    textColor: string | null;
    discountPercent: Prisma.Decimal | null;
    discountManagedBySite: boolean;
    version: number;
    updatedAt: Date;
    products: { product: { id: string; baseName: string; slug: string } }[];
    categories: { category: { id: string; name: string; slug: string } }[];
  }): Record<string, unknown> {
    const now = Date.now();
    const activeNow =
      promotion.active &&
      (!promotion.startsAt || promotion.startsAt.getTime() <= now) &&
      (!promotion.endsAt || promotion.endsAt.getTime() > now);
    return {
      id: promotion.id,
      title: promotion.title,
      body: promotion.body,
      imageUrl: promotion.imageUrl,
      imageAlt: promotion.imageAlt,
      linkUrl: promotion.linkUrl,
      startsAt: promotion.startsAt?.toISOString() ?? null,
      endsAt: promotion.endsAt?.toISOString() ?? null,
      active: promotion.active,
      activeNow,
      priority: promotion.priority,
      badgeColor: promotion.badgeColor,
      textColor: promotion.textColor,
      discountPercent: promotion.discountPercent?.toFixed(2) ?? null,
      discountManagedBySite: promotion.discountManagedBySite,
      version: promotion.version,
      productIds: promotion.products.map((entry) => entry.product.id),
      categoryIds: promotion.categories.map((entry) => entry.category.id),
      products: promotion.products.map((entry) => entry.product),
      categories: promotion.categories.map((entry) => entry.category),
      updatedAt: promotion.updatedAt.toISOString(),
    };
  }

  private toBanner(banner: {
    id: string;
    title: string;
    body: string | null;
    imageUrl: string | null;
    imageAlt: string | null;
    linkUrl: string | null;
    startsAt: Date | null;
    endsAt: Date | null;
    active: boolean;
    priority: number;
    version: number;
    updatedAt: Date;
  }): Record<string, unknown> {
    const now = Date.now();
    return {
      id: banner.id,
      title: banner.title,
      body: banner.body,
      imageUrl: banner.imageUrl,
      imageAlt: banner.imageAlt,
      linkUrl: banner.linkUrl,
      startsAt: banner.startsAt?.toISOString() ?? null,
      endsAt: banner.endsAt?.toISOString() ?? null,
      active: banner.active,
      activeNow:
        banner.active &&
        (!banner.startsAt || banner.startsAt.getTime() <= now) &&
        (!banner.endsAt || banner.endsAt.getTime() > now),
      priority: banner.priority,
      version: banner.version,
      updatedAt: banner.updatedAt.toISOString(),
    };
  }

  private toPage(page: {
    id: string;
    slug: string;
    title: string;
    body: string;
    seoTitle: string | null;
    seoDescription: string | null;
    published: boolean;
    publishedAt: Date | null;
    version: number;
    updatedAt: Date;
  }): Record<string, unknown> {
    return {
      id: page.id,
      slug: page.slug,
      title: page.title,
      body: page.body,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
      published: page.published,
      publishedAt: page.publishedAt?.toISOString() ?? null,
      version: page.version,
      updatedAt: page.updatedAt.toISOString(),
    };
  }

  private toSynonym(item: {
    id: string;
    normalizedTerm: string;
    canonicalTerm: string;
    locale: string;
    weight: Prisma.Decimal;
    active: boolean;
    updatedAt: Date;
  }): Record<string, unknown> {
    return {
      id: item.id,
      normalizedTerm: item.normalizedTerm,
      canonicalTerm: item.canonicalTerm,
      locale: item.locale,
      weight: item.weight.toFixed(2),
      active: item.active,
      updatedAt: item.updatedAt.toISOString(),
    };
  }

  private assertSchedule(startsAt?: string | null, endsAt?: string | null): void {
    if (startsAt && endsAt && new Date(endsAt) <= new Date(startsAt)) {
      throw new BadRequestException({
        code: 'SCHEDULE_INVALID',
        message: 'Дата окончания должна быть позже даты начала.',
      });
    }
  }

  private assertPromotionCommercialPermission(
    dto: CreatePromotionDto,
    role: Role,
    currentManagedBySite: boolean,
  ): void {
    const changesCommercialFields =
      dto.discountPercent !== undefined || dto.discountManagedBySite !== undefined;
    if (changesCommercialFields && role !== Role.ADMIN) {
      throw new ForbiddenException({
        code: 'PROMOTION_COMMERCIAL_FIELDS_FORBIDDEN',
        message: 'Цена и скидка акции могут изменяться только администратором после согласования с 1С.',
      });
    }
    if (dto.discountPercent !== undefined && dto.discountPercent !== null) {
      const managedBySite = dto.discountManagedBySite ?? currentManagedBySite;
      if (!managedBySite) {
        throw new BadRequestException({
          code: 'PROMOTION_DISCOUNT_OWNER_REQUIRED',
          message: 'Для скидки необходимо подтвердить, что ценой управляет сайт по согласованию с 1С.',
        });
      }
    }
  }

  private async assertPromotionTargets(
    transaction: Prisma.TransactionClient,
    productIds?: readonly string[],
    categoryIds?: readonly string[],
  ): Promise<void> {
    const distinctProducts = [...new Set(productIds ?? [])];
    const distinctCategories = [...new Set(categoryIds ?? [])];
    if (distinctProducts.length !== (productIds?.length ?? 0) || distinctCategories.length !== (categoryIds?.length ?? 0)) {
      throw new BadRequestException({
        code: 'PROMOTION_TARGET_DUPLICATE',
        message: 'Товары и категории в акции не должны повторяться.',
      });
    }
    const [productCount, categoryCount] = await Promise.all([
      distinctProducts.length
        ? transaction.product.count({ where: { id: { in: distinctProducts } } })
        : Promise.resolve(0),
      distinctCategories.length
        ? transaction.category.count({ where: { id: { in: distinctCategories } } })
        : Promise.resolve(0),
    ]);
    if (productCount !== distinctProducts.length || categoryCount !== distinctCategories.length) {
      throw new BadRequestException({
        code: 'PROMOTION_TARGET_NOT_FOUND',
        message: 'Один из товаров или разделов акции не найден.',
      });
    }
  }

  private async expireScheduledContent(): Promise<void> {
    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.promotion.updateMany({
        where: { active: true, endsAt: { lte: now } },
        data: { active: false, version: { increment: 1 } },
      }),
      this.prisma.banner.updateMany({
        where: { active: true, endsAt: { lte: now } },
        data: { active: false, version: { increment: 1 } },
      }),
    ]);
  }

  private async contentAudit(
    transaction: Prisma.TransactionClient,
    action: string,
    entityType: string,
    entityId: string,
    principal: AuthenticatedPrincipal,
    correlationId?: string,
  ): Promise<void> {
    await transaction.auditLog.create({
      data: {
        action,
        entityType,
        entityId,
        source: 'ADMIN',
        actorUserId: principal.userId,
        actorRole: principal.role,
        correlationId,
      },
    });
  }

  private async throwProductVersionError(transaction: Prisma.TransactionClient, id: string): Promise<never> {
    const product = await transaction.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) throw this.productNotFound();
    throw this.versionConflict('Контент товара уже изменён. Обновите данные.');
  }

  private async throwBannerVersionError(transaction: Prisma.TransactionClient, id: string): Promise<never> {
    const banner = await transaction.banner.findUnique({ where: { id }, select: { id: true } });
    if (!banner) throw new NotFoundException({ code: 'BANNER_NOT_FOUND', message: 'Баннер не найден.' });
    throw this.versionConflict('Баннер уже изменён. Обновите данные.');
  }

  private async throwPageVersionError(transaction: Prisma.TransactionClient, id: string): Promise<never> {
    const page = await transaction.contentPage.findUnique({ where: { id }, select: { id: true } });
    if (!page) throw new NotFoundException({ code: 'CONTENT_PAGE_NOT_FOUND', message: 'Страница не найдена.' });
    throw this.versionConflict('Страница уже изменена. Обновите данные.');
  }

  private productNotFound(): NotFoundException {
    return new NotFoundException({ code: 'PRODUCT_NOT_FOUND', message: 'Товар не найден.' });
  }

  private versionConflict(message: string): ConflictException {
    return new ConflictException({ code: 'CONTENT_VERSION_CONFLICT', message });
  }

  private page<T>(items: readonly T[], page: number, limit: number, total: number): Record<string, unknown> {
    return { items, page, limit, total, totalPages: total === 0 ? 0 : Math.ceil(total / limit) };
  }
}
