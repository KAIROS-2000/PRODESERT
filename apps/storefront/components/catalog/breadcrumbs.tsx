import { ChevronRight, Home } from 'lucide-react';
import Link from 'next/link';

import type { CatalogBreadcrumb } from '@/lib/catalog-types';

export function Breadcrumbs({
  items,
  current,
}: {
  items?: CatalogBreadcrumb[] | undefined;
  current: string;
}) {
  return (
    <nav className="breadcrumbs" aria-label="Хлебные крошки">
      <ol>
        <li>
          <Link href="/" aria-label="Главная">
            <Home aria-hidden="true" size={15} />
          </Link>
        </li>
        <li>
          <ChevronRight aria-hidden="true" size={14} />
          <Link href="/catalog">Каталог</Link>
        </li>
        {items?.map((item) => (
          <li key={item.slug}>
            <ChevronRight aria-hidden="true" size={14} />
            <Link
              href={
                item.path
                  ? `/catalog${item.path.startsWith('/') ? '' : '/'}${item.path}`
                  : `/catalog/${item.slug}`
              }
            >
              {item.name}
            </Link>
          </li>
        ))}
        <li aria-current="page">
          <ChevronRight aria-hidden="true" size={14} />
          <span>{current}</span>
        </li>
      </ol>
    </nav>
  );
}
