import type { Metadata } from 'next';

import { CatalogPageView } from '@/components/catalog/catalog-page-view';
import { parseCatalogQuery, type RawSearchParams } from '@/lib/catalog-query';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Поиск по каталогу',
  description: 'Поиск профессиональных ингредиентов, упаковки и инвентаря в Pro Dessert.',
  alternates: { canonical: '/search' },
  robots: { index: false, follow: true },
};

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const query = parseCatalogQuery(await searchParams);
  const title = query.q ? `Результаты поиска: «${query.q}»` : 'Поиск по каталогу';
  return (
    <CatalogPageView
      title={title}
      description="Найдите товар по названию, бренду, назначению или характеристике."
      query={query}
      isSearch
    />
  );
}
