'use client';

import { Check, ChevronLeft, ChevronRight, SlidersHorizontal, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { type Ref, useEffect, useMemo, useRef, useTransition } from 'react';

import type {
  CatalogFacets,
  CatalogProductsResponse,
  CatalogQuery,
  FacetOption,
  SearchSuggestion,
} from '@/lib/catalog-types';

import { CatalogEmptyState } from './catalog-states';
import { ProductCard } from './product-card';

interface CatalogShellProps {
  result: CatalogProductsResponse;
  query: CatalogQuery;
  suggestions?: SearchSuggestion[];
}

const availabilityLabels: Record<string, string> = {
  IN_STOCK: 'В наличии',
  LOW_STOCK: 'Осталось мало',
  BACKORDER: 'Под заказ',
  OUT_OF_STOCK: 'Нет в наличии',
};

function countLabel(count: number): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return `${count} товар`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} товара`;
  return `${count} товаров`;
}

function FilterOptions({
  name,
  options,
  selected,
}: {
  name: string;
  options: FacetOption[];
  selected: readonly string[];
}) {
  return options
    .filter((option) => option.count > 0 || selected.includes(option.value))
    .map((option) => (
      <label className="filter-option" key={`${name}-${option.value}`}>
        <input
          type="checkbox"
          name={name}
          value={option.value}
          defaultChecked={selected.includes(option.value)}
        />
        <span className="filter-checkbox" aria-hidden="true">
          <Check size={13} />
        </span>
        <span>{option.label}</span>
        <small>{option.count}</small>
      </label>
    ));
}

function FilterPanel({
  facets,
  query,
  onApply,
  onReset,
  autoApply,
  formRef,
}: {
  facets: CatalogFacets;
  query: CatalogQuery;
  onApply?: ((form: HTMLFormElement) => void) | undefined;
  onReset: () => void;
  autoApply: boolean;
  formRef?: Ref<HTMLFormElement> | undefined;
}) {
  return (
    <form
      ref={formRef}
      className="filter-panel"
      onChange={(event) => {
        const target = event.target;
        if (autoApply && target instanceof HTMLInputElement && target.type === 'checkbox') {
          onApply?.(event.currentTarget);
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        if (autoApply) onApply?.(event.currentTarget);
      }}
    >
      <div className="filter-panel__heading">
        <strong>Фильтры</strong>
        <button className="filter-reset" type="button" onClick={onReset}>
          Сбросить
        </button>
      </div>

      {facets.brands.length > 0 ? (
        <fieldset className="filter-group">
          <legend>Бренд</legend>
          <FilterOptions name="brand" options={facets.brands} selected={query.brand ?? []} />
        </fieldset>
      ) : null}

      {facets.availability.some(
        (item) => item.count > 0 || query.availability?.some((selected) => selected === item.value),
      ) ? (
        <fieldset className="filter-group">
          <legend>Наличие</legend>
          <FilterOptions
            name="availability"
            options={facets.availability.map((item) => ({
              ...item,
              label: availabilityLabels[item.value] ?? item.label,
            }))}
            selected={query.availability ?? []}
          />
        </fieldset>
      ) : null}

      {facets.collections.length > 0 ? (
        <fieldset className="filter-group">
          <legend>Подборки</legend>
          {facets.collections.map((option) => {
            const selected =
              option.value === 'sale'
                ? query.sale
                : option.value === 'isNew'
                  ? query.isNew
                  : query.isHit;
            return (
              <FilterOptions
                key={option.value}
                name={option.value}
                options={[{ ...option, value: 'true' }]}
                selected={selected ? ['true'] : []}
              />
            );
          })}
        </fieldset>
      ) : null}

      {facets.price || query.priceMin || query.priceMax ? (
        <fieldset className="filter-group">
          <legend>Цена, ₽</legend>
          <div className="price-range">
            <label>
              <span className="sr-only">Цена от</span>
              <input
                type="number"
                name="priceMin"
                min="0"
                inputMode="numeric"
                defaultValue={query.priceMin ?? ''}
                placeholder={facets.price ? `от ${Math.floor(facets.price.min)}` : 'от'}
              />
            </label>
            <span aria-hidden="true">—</span>
            <label>
              <span className="sr-only">Цена до</span>
              <input
                type="number"
                name="priceMax"
                min="0"
                inputMode="numeric"
                defaultValue={query.priceMax ?? ''}
                placeholder={facets.price ? `до ${Math.ceil(facets.price.max)}` : 'до'}
              />
            </label>
          </div>
          {autoApply ? (
            <button
              className="button button--secondary button--wide filter-price-apply"
              type="submit"
            >
              Применить цену
            </button>
          ) : null}
        </fieldset>
      ) : null}

      {Object.entries(facets.attributes)
        .filter(([key, attribute]) =>
          attribute.options.some(
            (option) => option.count > 0 || query.attributes?.[key]?.includes(option.value),
          ),
        )
        .map(([key, attribute]) => (
          <fieldset className="filter-group" key={key}>
            <legend>{attribute.label}</legend>
            <FilterOptions
              name={`attributes[${key}]`}
              options={attribute.options}
              selected={query.attributes?.[key] ?? []}
            />
          </fieldset>
        ))}
    </form>
  );
}

function Pagination({ page, totalPages }: { page: number; totalPages: number }) {
  const searchParams = useSearchParams();

  if (totalPages <= 1) return null;

  const hrefFor = (target: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (target <= 1) params.delete('page');
    else params.set('page', String(target));
    const queryString = params.toString();
    return queryString ? `?${queryString}` : '?';
  };
  const visible = Array.from({ length: totalPages }, (_, index) => index + 1).filter(
    (item) => item === 1 || item === totalPages || Math.abs(item - page) <= 1,
  );

  return (
    <nav className="pagination" aria-label="Страницы каталога">
      {page > 1 ? (
        <Link href={hrefFor(page - 1)} aria-label="Предыдущая страница" scroll>
          <ChevronLeft aria-hidden="true" size={18} />
        </Link>
      ) : (
        <span aria-hidden="true">
          <ChevronLeft size={18} />
        </span>
      )}
      {visible.map((item, index) => {
        const previous = visible[index - 1];
        return (
          <span className="pagination__unit" key={item}>
            {previous !== undefined && item - previous > 1 ? <span>…</span> : null}
            <Link href={hrefFor(item)} aria-current={item === page ? 'page' : undefined}>
              {item}
            </Link>
          </span>
        );
      })}
      {page < totalPages ? (
        <Link href={hrefFor(page + 1)} aria-label="Следующая страница" scroll>
          <ChevronRight aria-hidden="true" size={18} />
        </Link>
      ) : (
        <span aria-hidden="true">
          <ChevronRight size={18} />
        </span>
      )}
    </nav>
  );
}

export function CatalogShell({ result, query, suggestions = [] }: CatalogShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filterStateKey = searchParams.toString();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const mobileFormRef = useRef<HTMLFormElement>(null);
  const desktopApplyTimerRef = useRef<number | null>(null);
  const [isPending, startTransition] = useTransition();
  const activeCount = useMemo(
    () =>
      (query.brand?.length ?? 0) +
      (query.availability?.length ?? 0) +
      Object.values(query.attributes ?? {}).reduce((sum, values) => sum + values.length, 0) +
      Number(Boolean(query.priceMin)) +
      Number(Boolean(query.priceMax)) +
      Number(Boolean(query.sale)) +
      Number(Boolean(query.isNew)) +
      Number(Boolean(query.isHit)),
    [query],
  );

  const cancelDesktopApply = () => {
    if (desktopApplyTimerRef.current !== null) {
      window.clearTimeout(desktopApplyTimerRef.current);
      desktopApplyTimerRef.current = null;
    }
  };

  useEffect(
    () => () => {
      if (desktopApplyTimerRef.current !== null) {
        window.clearTimeout(desktopApplyTimerRef.current);
      }
    },
    [filterStateKey],
  );

  const navigate = (params: URLSearchParams) => {
    params.delete('page');
    const queryString = params.toString();
    startTransition(() =>
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false }),
    );
  };

  const applyForm = (form: HTMLFormElement) => {
    const params = new URLSearchParams(searchParams.toString());
    [...params.keys()].forEach((key) => {
      if (
        ['brand', 'availability', 'priceMin', 'priceMax', 'sale', 'isNew', 'isHit'].includes(key) ||
        key.startsWith('attributes[')
      ) {
        params.delete(key);
      }
    });
    const data = new FormData(form);
    data.forEach((rawValue, key) => {
      const value = String(rawValue).trim();
      if (value) params.append(key, value);
    });
    navigate(params);
  };

  const scheduleDesktopApply = (form: HTMLFormElement) => {
    cancelDesktopApply();
    desktopApplyTimerRef.current = window.setTimeout(() => {
      desktopApplyTimerRef.current = null;
      applyForm(form);
    }, 300);
  };

  const submitMobileDraft = () => {
    const form = mobileFormRef.current;
    if (!form) return;
    cancelDesktopApply();
    applyForm(form);
    dialogRef.current?.close();
  };

  const reset = () => {
    cancelDesktopApply();
    const params = new URLSearchParams();
    if (query.q) params.set('q', query.q);
    navigate(params);
    dialogRef.current?.close();
  };

  const setSort = (sort: string) => {
    cancelDesktopApply();
    const params = new URLSearchParams(searchParams.toString());
    params.set('sort', sort);
    navigate(params);
  };

  const emptyAction =
    activeCount > 0
      ? {
          href: query.q ? `${pathname}?q=${encodeURIComponent(query.q)}` : pathname,
          label: 'Сбросить фильтры',
        }
      : query.q
        ? { href: '/catalog', label: 'Очистить поиск' }
        : { href: '/', label: 'На главную' };

  return (
    <div className="catalog-layout" aria-busy={isPending}>
      <aside className="catalog-sidebar" aria-label="Фильтры каталога">
        <FilterPanel
          key={`desktop-${filterStateKey}`}
          facets={result.facets}
          query={query}
          onApply={scheduleDesktopApply}
          onReset={reset}
          autoApply
        />
      </aside>

      <div className="catalog-results">
        <div className="catalog-toolbar">
          <div className="catalog-toolbar__count" aria-live="polite">
            <strong>{countLabel(result.total)}</strong>
            {activeCount > 0 ? <span> · фильтров: {activeCount}</span> : null}
          </div>
          <button
            className="button button--secondary mobile-filter-button"
            type="button"
            onClick={() => dialogRef.current?.showModal()}
          >
            <SlidersHorizontal aria-hidden="true" size={18} />
            Фильтры {activeCount > 0 ? `(${activeCount})` : ''}
          </button>
          <label className="catalog-sort">
            <span>Сортировка</span>
            <select
              value={query.sort ?? (query.q ? 'relevance' : 'popular')}
              onChange={(event) => setSort(event.target.value)}
            >
              {query.q ? <option value="relevance">По релевантности</option> : null}
              <option value="popular">Сначала популярные</option>
              <option value="newest">Сначала новинки</option>
              <option value="price_asc">Сначала дешевле</option>
              <option value="price_desc">Сначала дороже</option>
              <option value="discount_desc">Сначала с большей скидкой</option>
              <option value="availability">Сначала в наличии</option>
              <option value="name_asc">По названию</option>
            </select>
          </label>
        </div>

        {isPending ? <div className="catalog-progress" aria-label="Обновляем каталог" /> : null}

        {result.items.length > 0 ? (
          <>
            <div className="product-grid">
              {result.items.map((product, index) => (
                <ProductCard key={product.id} product={product} priority={index < 4} />
              ))}
            </div>
            <Pagination page={result.page} totalPages={result.totalPages} />
          </>
        ) : (
          <CatalogEmptyState
            query={query.q}
            suggestions={suggestions}
            resetHref={emptyAction.href}
            resetLabel={emptyAction.label}
          />
        )}
      </div>

      <dialog
        className="filter-dialog"
        ref={dialogRef}
        aria-labelledby="mobile-filter-title"
        onClose={() => mobileFormRef.current?.reset()}
      >
        <div className="filter-dialog__header">
          <strong id="mobile-filter-title">Фильтры каталога</strong>
          <button
            type="button"
            aria-label="Закрыть фильтры"
            onClick={() => {
              mobileFormRef.current?.reset();
              dialogRef.current?.close();
            }}
          >
            <X aria-hidden="true" size={22} />
          </button>
        </div>
        <FilterPanel
          key={`mobile-${filterStateKey}`}
          facets={result.facets}
          query={query}
          onReset={reset}
          autoApply={false}
          formRef={mobileFormRef}
        />
        <div className="filter-dialog__footer">
          <button className="button button--secondary" type="button" onClick={reset}>
            Сбросить
          </button>
          <button className="button button--primary" type="button" onClick={submitMobileDraft}>
            Показать товары
          </button>
        </div>
      </dialog>
    </div>
  );
}
