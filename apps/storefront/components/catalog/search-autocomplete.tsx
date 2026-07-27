'use client';

import { Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type FormEvent, type KeyboardEvent, useEffect, useId, useRef, useState } from 'react';
import type { CatalogSearchSuggestion } from '@pro-dessert/contracts';

import type { SearchSuggestion } from '@/lib/catalog-types';
import { trackAnalyticsEvent } from '@/lib/analytics';

function normalizeSuggestion(
  suggestion: CatalogSearchSuggestion & { readonly categoryPath?: string },
): SearchSuggestion {
  const slug =
    suggestion.productSlug ?? (suggestion.type === 'CATEGORY' ? suggestion.value : undefined);
  return {
    type:
      suggestion.type === 'PRODUCT' || suggestion.type === 'SKU'
        ? 'product'
        : suggestion.type === 'CATEGORY'
          ? 'category'
          : 'query',
    label: suggestion.label,
    ...(slug ? { slug } : {}),
    ...(suggestion.categoryPath ? { categoryPath: suggestion.categoryPath } : {}),
  };
}

function suggestionHref(suggestion: SearchSuggestion): string {
  if (suggestion.type === 'product' && suggestion.slug) return `/product/${suggestion.slug}`;
  if (suggestion.type === 'category' && suggestion.categoryPath) {
    return `/catalog${suggestion.categoryPath.startsWith('/') ? '' : '/'}${suggestion.categoryPath}`;
  }
  if (suggestion.type === 'category' && suggestion.slug) return `/catalog/${suggestion.slug}`;
  return `/search?q=${encodeURIComponent(suggestion.label)}`;
}

export function SearchAutocomplete({
  compact = false,
  initialQuery = '',
}: {
  compact?: boolean | undefined;
  initialQuery?: string | undefined;
}) {
  const router = useRouter();
  const listboxId = useId();
  const controllerRef = useRef<AbortController | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    controllerRef.current?.abort();
    const normalized = query.trim();
    if (normalized.length < 2) {
      return;
    }

    const controller = new AbortController();
    controllerRef.current = controller;
    const timer = window.setTimeout(() => {
      setIsLoading(true);
      setIsOpen(true);
      void fetch(
        `/api/v1/catalog/search/suggestions?${new URLSearchParams({ q: normalized, limit: '7' })}`,
        { headers: { Accept: 'application/json' }, signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok) return [];
          const payload = (await response.json()) as CatalogSearchSuggestion[];
          return payload.map(normalizeSuggestion);
        })
        .then((items) => {
          setSuggestions(items);
          setActiveIndex(-1);
          setIsOpen(items.length > 0);
        })
        .catch(() => {
          if (!controller.signal.aborted) {
            setSuggestions([]);
            setIsOpen(false);
          }
        })
        .finally(() => {
          if (!controller.signal.aborted) setIsLoading(false);
        });
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = query.trim();
    if (!normalized) return;
    trackAnalyticsEvent('search', { source: compact ? 'header' : 'catalog' });
    setIsOpen(false);
    router.push(`/search?q=${encodeURIComponent(normalized)}`);
  };

  const openSuggestion = (suggestion: SearchSuggestion) => {
    setQuery(suggestion.label);
    setIsOpen(false);
    router.push(suggestionHref(suggestion));
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % suggestions.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => (index <= 0 ? suggestions.length - 1 : index - 1));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      const selected = suggestions[activeIndex];
      if (selected) openSuggestion(selected);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className={`search-autocomplete${compact ? ' search-autocomplete--compact' : ''}`}>
      <form role="search" onSubmit={submit}>
        <Search aria-hidden="true" size={18} />
        <label className="sr-only" htmlFor={`${listboxId}-input`}>
          Поиск по каталогу
        </label>
        <input
          id={`${listboxId}-input`}
          type="search"
          value={query}
          placeholder="Поиск товаров"
          autoComplete="off"
          role="combobox"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-expanded={isOpen}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            if (nextQuery.trim().length < 2) {
              setSuggestions([]);
              setIsOpen(false);
              setIsLoading(false);
            }
          }}
          onFocus={() => suggestions.length > 0 && setIsOpen(true)}
          onBlur={() => window.setTimeout(() => setIsOpen(false), 100)}
          onKeyDown={handleKeyDown}
        />
        {query ? (
          <button
            type="button"
            aria-label="Очистить поиск"
            onClick={() => {
              setQuery('');
              setSuggestions([]);
              setIsOpen(false);
              setIsLoading(false);
              controllerRef.current?.abort();
            }}
          >
            <X aria-hidden="true" size={17} />
          </button>
        ) : null}
      </form>

      {isOpen ? (
        <div className="search-suggestions" role="listbox" id={listboxId}>
          {isLoading ? <span className="search-suggestions__state">Ищем…</span> : null}
          {!isLoading && suggestions.length === 0 ? (
            <span className="search-suggestions__state">Совпадений пока нет</span>
          ) : null}
          {suggestions.map((suggestion, index) => (
            <button
              id={`${listboxId}-${index}`}
              type="button"
              role="option"
              aria-selected={activeIndex === index}
              key={`${suggestion.type}-${suggestion.id ?? suggestion.slug ?? suggestion.label}`}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => openSuggestion(suggestion)}
            >
              <span>{suggestion.label}</span>
              <small>
                {suggestion.type === 'product'
                  ? 'Товар'
                  : suggestion.type === 'category'
                    ? 'Категория'
                    : 'Поиск'}
              </small>
            </button>
          ))}
          {!isLoading ? (
            <button
              className="search-suggestions__all"
              type="button"
              onClick={() => {
                const normalized = query.trim();
                if (normalized) router.push(`/search?q=${encodeURIComponent(normalized)}`);
                setIsOpen(false);
              }}
            >
              Показать все результаты
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
