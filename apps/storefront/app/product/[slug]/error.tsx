'use client';

import { useEffect } from 'react';

import { CatalogErrorState } from '@/components/catalog/catalog-states';

export default function ProductError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    console.error('Product page failed', error);
  }, [error]);

  return (
    <div className="product-page">
      <div className="shell">
        <CatalogErrorState message="Карточка товара временно недоступна. Попробуйте открыть каталог." />
      </div>
    </div>
  );
}
