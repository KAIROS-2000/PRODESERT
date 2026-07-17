'use client';

import { useMemo, useState } from 'react';

import type { CatalogImage, ProductDetail } from '@/lib/catalog-types';

import { ProductDetails } from './product-details';
import { ProductGallery } from './product-gallery';
import { ProductPurchasePanel } from './product-purchase-panel';

export function ProductInteractiveContent({
  product,
  images,
}: {
  product: ProductDetail;
  images: CatalogImage[];
}) {
  const [selectedVariantId, setSelectedVariantId] = useState(product.variants[0]?.id ?? '');
  const selectedVariant = useMemo(
    () =>
      product.variants.find((variant) => variant.id === selectedVariantId) ?? product.variants[0],
    [product.variants, selectedVariantId],
  );

  return (
    <>
      <div className="product-main">
        <ProductGallery images={images} productName={product.name} />
        <div className="product-summary">
          <div className="product-badges product-badges--static" aria-label="Метки товара">
            {product.isNew ? (
              <span className="product-badge product-badge--new">Новинка</span>
            ) : null}
            {product.isHit ? <span className="product-badge product-badge--hit">Хит</span> : null}
            {product.isSale ? (
              <span className="product-badge product-badge--sale">Акция</span>
            ) : null}
          </div>
          {product.brand ? (
            <span className="product-summary__brand">{product.brand.name}</span>
          ) : null}
          <h1>{product.name}</h1>
          {product.shortDescription ? (
            <p className="product-summary__lead">{product.shortDescription}</p>
          ) : null}
          {selectedVariant?.sku || selectedVariant?.packagingLabel ? (
            <dl className="product-summary__meta" aria-live="polite">
              {selectedVariant.sku ? (
                <div>
                  <dt>Артикул</dt>
                  <dd>{selectedVariant.sku}</dd>
                </div>
              ) : null}
              {selectedVariant.packagingLabel ? (
                <div>
                  <dt>Фасовка</dt>
                  <dd>{selectedVariant.packagingLabel}</dd>
                </div>
              ) : null}
            </dl>
          ) : null}
          <ProductPurchasePanel
            product={product}
            selectedVariant={selectedVariant}
            onVariantChange={setSelectedVariantId}
          />
        </div>
      </div>

      <ProductDetails product={product} selectedVariant={selectedVariant} />
    </>
  );
}
