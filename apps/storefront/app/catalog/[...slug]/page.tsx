import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CatalogPageView } from '@/components/catalog/catalog-page-view';
import { breadcrumbJsonLd, StructuredData } from '@/components/structured-data';
import { getCategories } from '@/lib/catalog-api';
import { resolveCategory } from '@/lib/catalog-categories';
import {
  hasIndexBlockingFilters,
  paginatedCanonical,
  parseCatalogQuery,
  type RawSearchParams,
} from '@/lib/catalog-query';

export const dynamic = 'force-dynamic';

interface CategoryPageProps {
  params: Promise<{ slug: string[] }>;
  searchParams: Promise<RawSearchParams>;
}

async function categoryFromParams(params: Promise<{ slug: string[] }>) {
  const { slug: path } = await params;
  const slug = path.at(-1);
  if (!slug) return null;
  const categories = await getCategories();
  return resolveCategory(categories, slug);
}

export async function generateMetadata({
  params,
  searchParams,
}: CategoryPageProps): Promise<Metadata> {
  const [resolved, filters] = await Promise.all([categoryFromParams(params), searchParams]);
  if (!resolved) return { title: 'Категория не найдена' };
  const canonical = `/catalog/${resolved.path.join('/')}`;
  return {
    title: resolved.category.seoTitle ?? resolved.category.name,
    description:
      resolved.category.seoDescription ??
      resolved.category.description ??
      `${resolved.category.name}: профессиональные товары для кондитеров в каталоге Pro Dessert.`,
    alternates: { canonical: paginatedCanonical(canonical, filters) },
    openGraph: resolved.category.image
      ? { images: [{ url: resolved.category.image.url, alt: resolved.category.image.alt }] }
      : undefined,
    robots: hasIndexBlockingFilters(filters) ? { index: false, follow: true } : undefined,
  };
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const [resolved, rawSearchParams, requestedParams] = await Promise.all([
    categoryFromParams(params),
    searchParams,
    params,
  ]);
  if (!resolved) notFound();
  if (resolved.path.join('/') !== requestedParams.slug.join('/')) notFound();
  const query = parseCatalogQuery(rawSearchParams, { category: resolved.category.slug });
  const categoryPath = `/catalog/${resolved.path.join('/')}`;
  const breadcrumbItems = [
    { name: 'Главная', path: '/' },
    { name: 'Каталог', path: '/catalog' },
    ...resolved.breadcrumbs.map((item) => ({
      name: item.name,
      path: `/catalog/${item.path ?? item.slug}`,
    })),
    { name: resolved.category.name, path: categoryPath },
  ];

  return (
    <>
      <StructuredData data={breadcrumbJsonLd(breadcrumbItems)} />
      <CatalogPageView
        title={resolved.category.name}
        description={
          resolved.category.description ??
          'Профессиональные товары с понятными характеристиками и актуальным статусом наличия.'
        }
        query={query}
        breadcrumbs={resolved.breadcrumbs}
        showCategories={resolved.category.children.length > 0}
      />
    </>
  );
}
