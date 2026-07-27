import type { MetadataRoute } from 'next';

import { getCategories, getProducts } from '@/lib/catalog-api';
import { getPublishedContentPages } from '@/lib/content-api';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
const sitemapPageSize = 60;

function absolute(path: string): string {
  return new URL(path, siteUrl).toString();
}

function categoryPath(path?: string): string {
  if (!path) return '/catalog';
  return `/catalog${path.startsWith('/') ? path : `/${path}`}`;
}

async function getAllProductsForSitemap(): Promise<
  Awaited<ReturnType<typeof getProducts>>['items']
> {
  const firstPage = await getProducts({ limit: sitemapPageSize });
  const items = [...firstPage.items];

  for (let page = 2; page <= firstPage.totalPages; page += 1) {
    const nextPage = await getProducts({ page, limit: sitemapPageSize });
    items.push(...nextPage.items);
  }

  return items;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [categoriesResult, productsResult, pagesResult] = await Promise.allSettled([
    getCategories(),
    getAllProductsForSitemap(),
    getPublishedContentPages(),
  ]);

  const entries: MetadataRoute.Sitemap = [
    { url: absolute('/'), changeFrequency: 'weekly', priority: 1 },
    { url: absolute('/catalog'), changeFrequency: 'daily', priority: 0.9 },
    { url: absolute('/promotions'), changeFrequency: 'daily', priority: 0.7 },
    { url: absolute('/about'), changeFrequency: 'monthly', priority: 0.5 },
    { url: absolute('/payment'), changeFrequency: 'monthly', priority: 0.5 },
    { url: absolute('/pickup'), changeFrequency: 'monthly', priority: 0.6 },
    { url: absolute('/contacts'), changeFrequency: 'monthly', priority: 0.5 },
  ];

  if (categoriesResult.status === 'fulfilled') {
    const visit = (items: Awaited<ReturnType<typeof getCategories>>) => {
      for (const category of items) {
        entries.push({
          url: absolute(categoryPath(category.path)),
          changeFrequency: 'daily',
          priority: 0.7,
        });
        visit(category.children);
      }
    };
    visit(categoriesResult.value);
  }

  if (productsResult.status === 'fulfilled') {
    for (const product of productsResult.value) {
      entries.push({
        url: absolute(`/product/${product.slug}`),
        changeFrequency: 'daily',
        priority: 0.8,
      });
    }
  }

  if (pagesResult.status === 'fulfilled') {
    for (const page of pagesResult.value) {
      entries.push({
        url: absolute(`/content/${page.slug}`),
        lastModified: new Date(page.updatedAt),
        changeFrequency: 'monthly',
        priority: 0.5,
      });
    }
  }

  return entries;
}
