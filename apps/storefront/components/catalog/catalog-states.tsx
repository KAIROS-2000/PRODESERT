import { PackageOpen, RefreshCw, SearchX } from 'lucide-react';
import Link from 'next/link';

import type { SearchSuggestion } from '@/lib/catalog-types';

export function CatalogErrorState({ message }: { message?: string | undefined }) {
  return (
    <section className="catalog-state" role="alert">
      <RefreshCw aria-hidden="true" size={34} />
      <h2>Не удалось показать товары</h2>
      <p>{message ?? 'Каталог временно недоступен. Обновите страницу через несколько минут.'}</p>
      <Link className="button button--secondary" href="/catalog">
        Вернуться в каталог
      </Link>
    </section>
  );
}

export function CatalogEmptyState({
  query,
  suggestions = [],
  resetHref,
  resetLabel = 'Сбросить фильтры',
}: {
  query?: string | undefined;
  suggestions?: SearchSuggestion[] | undefined;
  resetHref: string;
  resetLabel?: string | undefined;
}) {
  const correction = suggestions[0];

  return (
    <section className="catalog-state">
      {query ? (
        <SearchX aria-hidden="true" size={38} />
      ) : (
        <PackageOpen aria-hidden="true" size={38} />
      )}
      <h2>{query ? `По запросу «${query}» ничего не найдено` : 'Товары не найдены'}</h2>
      <p>
        {correction
          ? 'Проверьте написание или попробуйте подходящий вариант.'
          : 'Измените фильтры или сбросьте их, чтобы увидеть больше товаров.'}
      </p>
      {correction ? (
        <Link
          className="catalog-correction"
          href={
            correction.type === 'product' && correction.slug
              ? `/product/${correction.slug}`
              : `/search?q=${encodeURIComponent(correction.label)}`
          }
        >
          Возможно, вы искали: <strong>{correction.label}</strong>
        </Link>
      ) : null}
      <Link className="button button--secondary" href={resetHref}>
        {resetLabel}
      </Link>
    </section>
  );
}
