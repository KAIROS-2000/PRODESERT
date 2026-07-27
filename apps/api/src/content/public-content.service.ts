import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const PUBLIC_PAGE_SLUG = /^[a-z0-9][a-z0-9-]{0,219}$/;

interface ActiveScheduleWhere {
  active: true;
  AND: [
    { OR: [{ startsAt: null }, { startsAt: { lte: Date } }] },
    { OR: [{ endsAt: null }, { endsAt: { gt: Date } }] },
  ];
}

@Injectable()
export class PublicContentService {
  constructor(private readonly prisma: PrismaService) {}

  async banners(): Promise<Record<string, unknown>> {
    const now = new Date();
    const items = await this.prisma.banner.findMany({
      where: this.activeSchedule(now),
      orderBy: [{ priority: 'desc' }, { startsAt: 'desc' }],
      take: 12,
    });
    return { items: items.map((banner) => this.toBanner(banner)) };
  }

  async promotions(): Promise<Record<string, unknown>> {
    const now = new Date();
    const items = await this.prisma.promotion.findMany({
      where: this.activeSchedule(now),
      include: {
        products: {
          include: { product: { select: { id: true, baseName: true, slug: true } } },
          orderBy: { product: { baseName: 'asc' } },
        },
        categories: {
          include: { category: { select: { id: true, name: true, slug: true, path: true } } },
          orderBy: { category: { name: 'asc' } },
        },
      },
      orderBy: [{ priority: 'desc' }, { startsAt: 'desc' }],
      take: 100,
    });
    return {
      items: items.map((promotion) => ({
        id: promotion.id,
        title: promotion.title,
        body: promotion.body,
        imageUrl: promotion.imageUrl,
        imageAlt: promotion.imageAlt,
        linkUrl: promotion.linkUrl,
        startsAt: promotion.startsAt?.toISOString() ?? null,
        endsAt: promotion.endsAt?.toISOString() ?? null,
        priority: promotion.priority,
        badgeColor: promotion.badgeColor,
        textColor: promotion.textColor,
        discountPercent: promotion.discountPercent?.toString() ?? null,
        products: promotion.products.map(({ product }) => ({
          id: product.id,
          name: product.baseName,
          slug: product.slug,
        })),
        categories: promotion.categories.map(({ category }) => ({
          id: category.id,
          name: category.name,
          slug: category.slug,
          path: category.path,
        })),
      })),
    };
  }

  async pages(): Promise<Record<string, unknown>> {
    const items = await this.prisma.contentPage.findMany({
      where: { published: true, publishedAt: { lte: new Date() } },
      select: { slug: true, title: true, seoTitle: true, seoDescription: true, updatedAt: true },
      orderBy: [{ publishedAt: 'desc' }, { title: 'asc' }],
      take: 200,
    });
    return {
      items: items.map((page) => ({
        slug: page.slug,
        title: page.title,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        updatedAt: page.updatedAt.toISOString(),
      })),
    };
  }

  async page(slug: string): Promise<Record<string, unknown>> {
    if (!PUBLIC_PAGE_SLUG.test(slug)) this.notFound();
    const page = await this.prisma.contentPage.findFirst({
      where: { slug, published: true, publishedAt: { lte: new Date() } },
      select: {
        slug: true,
        title: true,
        body: true,
        seoTitle: true,
        seoDescription: true,
        publishedAt: true,
        updatedAt: true,
      },
    });
    if (!page) this.notFound();
    return {
      slug: page.slug,
      title: page.title,
      body: page.body,
      seoTitle: page.seoTitle,
      seoDescription: page.seoDescription,
      publishedAt: page.publishedAt?.toISOString() ?? null,
      updatedAt: page.updatedAt.toISOString(),
    };
  }

  private activeSchedule(now: Date): ActiveScheduleWhere {
    return {
      active: true,
      AND: [
        { OR: [{ startsAt: null }, { startsAt: { lte: now } }] },
        { OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      ],
    };
  }

  private toBanner(banner: {
    id: string;
    title: string;
    body: string | null;
    imageUrl: string | null;
    imageAlt: string | null;
    linkUrl: string | null;
    priority: number;
  }): Record<string, unknown> {
    return {
      id: banner.id,
      title: banner.title,
      body: banner.body,
      imageUrl: banner.imageUrl,
      imageAlt: banner.imageAlt,
      linkUrl: banner.linkUrl,
      priority: banner.priority,
    };
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'CONTENT_PAGE_NOT_FOUND',
      message: 'Страница не найдена.',
    });
  }
}
