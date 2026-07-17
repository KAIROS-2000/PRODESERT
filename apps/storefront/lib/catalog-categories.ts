import type { CatalogBreadcrumb, CatalogCategory } from '@/lib/catalog-types';

export interface ResolvedCategory {
  category: CatalogCategory;
  breadcrumbs: CatalogBreadcrumb[];
  path: string[];
}

export function resolveCategory(
  categories: readonly CatalogCategory[],
  slug: string,
  parents: CatalogBreadcrumb[] = [],
  path: string[] = [],
): ResolvedCategory | null {
  for (const category of categories) {
    const nextParents = [
      ...parents,
      { name: category.name, slug: [...path, category.slug].join('/') },
    ];
    const nextPath = [...path, category.slug];
    if (category.slug === slug) {
      return {
        category,
        breadcrumbs: parents,
        path: nextPath,
      };
    }
    const nested = resolveCategory(category.children ?? [], slug, nextParents, nextPath);
    if (nested) return nested;
  }
  return null;
}
