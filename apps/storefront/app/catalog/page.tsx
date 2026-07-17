import type { Metadata } from 'next';

import { CatalogPageView } from '@/components/catalog/catalog-page-view';
import {
  hasIndexBlockingFilters,
  paginatedCanonical,
  parseCatalogQuery,
  type RawSearchParams,
} from '@/lib/catalog-query';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}): Promise<Metadata> {
  const params = await searchParams;
  return {
    title: 'Каталог товаров для кондитеров',
    description:
      'Ингредиенты, упаковка, формы и профессиональный инвентарь для кондитеров в Pro Dessert, Оренбург.',
    alternates: { canonical: paginatedCanonical('/catalog', params) },
    robots: hasIndexBlockingFilters(params) ? { index: false, follow: true } : undefined,
  };
}

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const query = parseCatalogQuery(await searchParams);
  return (
    <CatalogPageView
      title="Каталог"
      description="Проверенные ингредиенты, упаковка и инвентарь для стабильного результата в кондитерской работе."
      query={query}
      showCategories
    />
  );
}
