'use client';

import { useEffect } from 'react';

import { CatalogErrorState } from '@/components/catalog/catalog-states';

export default function CatalogRouteError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error('Catalog route failed', error);
  }, [error]);

  return (
    <div className="catalog-page">
      <div className="shell">
        <CatalogErrorState />
      </div>
    </div>
  );
}
