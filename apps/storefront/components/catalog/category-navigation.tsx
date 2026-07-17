import { ChevronRight } from 'lucide-react';
import Link from 'next/link';

import type { CatalogCategory } from '@/lib/catalog-types';

function categoryHref(category: CatalogCategory, parentPath = ''): string {
  if (category.path) return `/catalog${category.path.startsWith('/') ? '' : '/'}${category.path}`;
  return `/catalog/${[parentPath, category.slug].filter(Boolean).join('/')}`;
}

export function CategoryNavigation({
  categories,
  basePath = '',
}: {
  categories: CatalogCategory[];
  basePath?: string | undefined;
}) {
  if (categories.length === 0) return null;

  return (
    <section className="category-navigation" aria-labelledby="category-navigation-title">
      <div className="catalog-section-heading">
        <div>
          <span className="eyebrow">Направления</span>
          <h2 id="category-navigation-title">Категории товаров</h2>
        </div>
        <Link className="text-link text-link--dark" href="/catalog">
          Все товары <span aria-hidden="true">→</span>
        </Link>
      </div>
      <ul className="category-grid">
        {categories.map((category) => (
          <li key={category.id}>
            <Link href={categoryHref(category, basePath)}>
              <span>
                <strong>{category.name}</strong>
                {category.productCount !== undefined ? (
                  <small>{category.productCount} товаров</small>
                ) : (
                  <small>Смотреть ассортимент</small>
                )}
              </span>
              <ChevronRight aria-hidden="true" size={19} />
            </Link>
            {category.children.length > 0 ? (
              <ul>
                {category.children.slice(0, 4).map((child) => (
                  <li key={child.id}>
                    <Link
                      href={categoryHref(
                        child,
                        [basePath, category.slug].filter(Boolean).join('/'),
                      )}
                    >
                      {child.name}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
