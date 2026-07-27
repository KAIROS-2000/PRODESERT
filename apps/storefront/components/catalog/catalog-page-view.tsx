import { Search } from 'lucide-react';

import {
  CatalogApiError,
  getCategories,
  getProducts,
  getSearchSuggestions,
} from '@/lib/catalog-api';
import { resolveCategory } from '@/lib/catalog-categories';
import type { CatalogBreadcrumb, CatalogQuery } from '@/lib/catalog-types';

import { Breadcrumbs } from './breadcrumbs';
import { AnalyticsEvent } from '@/components/analytics/analytics-event';
import { CatalogErrorState } from './catalog-states';
import { CatalogShell } from './catalog-shell';
import { CategoryNavigation } from './category-navigation';
import { SearchAutocomplete } from './search-autocomplete';

interface CatalogPageViewProps {
  title: string;
  description: string;
  query: CatalogQuery;
  breadcrumbs?: CatalogBreadcrumb[] | undefined;
  showCategories?: boolean | undefined;
  isSearch?: boolean | undefined;
}

export async function CatalogPageView({
  title,
  description,
  query,
  breadcrumbs,
  showCategories = false,
  isSearch = false,
}: CatalogPageViewProps) {
  let catalogData:
    | Awaited<
        ReturnType<
          typeof Promise.all<[ReturnType<typeof getCategories>, ReturnType<typeof getProducts>]>
        >
      >
    | undefined;
  let loadError: unknown;

  try {
    catalogData = await Promise.all([getCategories(), getProducts(query)]);
  } catch (error) {
    loadError = error;
  }

  if (!catalogData) {
    const message = loadError instanceof CatalogApiError ? loadError.message : undefined;
    return (
      <div className="catalog-page">
        <div className="shell">
          <Breadcrumbs items={breadcrumbs} current={title} />
          <header className="catalog-hero">
            <div>
              <span className="eyebrow">Профессиональный ассортимент</span>
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
          </header>
          <CatalogErrorState message={message} />
        </div>
      </div>
    );
  }

  const [categories, result] = catalogData;
  const suggestions =
    result.total === 0 && query.q && query.q.length >= 2
      ? await getSearchSuggestions(query.q, 4).catch(() => [])
      : [];
  const currentCategory = query.category ? resolveCategory(categories, query.category) : null;
  const navigationCategories = currentCategory?.category.children ?? categories;
  const navigationBasePath = currentCategory?.path.join('/') ?? '';

  return (
    <div className="catalog-page">
      {isSearch ? (
        <AnalyticsEvent
          event={result.total === 0 ? 'search_no_results' : 'search'}
          context={{ resultCount: result.total, source: 'results' }}
        />
      ) : null}
      <div className="shell">
        <Breadcrumbs items={breadcrumbs} current={title} />
        <header className="catalog-hero">
          <div>
            <span className="eyebrow">Профессиональный ассортимент</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          {isSearch ? (
            <div className="catalog-hero__search">
              <Search aria-hidden="true" size={22} />
              <SearchAutocomplete initialQuery={query.q} />
            </div>
          ) : null}
        </header>
        {showCategories ? (
          <CategoryNavigation categories={navigationCategories} basePath={navigationBasePath} />
        ) : null}
        <CatalogShell result={result} query={query} suggestions={suggestions} />
      </div>
    </div>
  );
}
