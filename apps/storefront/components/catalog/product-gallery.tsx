'use client';

import { useState } from 'react';

import type { CatalogImage } from '@/lib/catalog-types';

import { ProductImage } from './product-image';

export function ProductGallery({
  images,
  productName,
}: {
  images: CatalogImage[];
  productName: string;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const activeImage = images[activeIndex] ?? images[0];

  return (
    <div className="product-gallery">
      <ProductImage
        className="product-gallery__main"
        image={activeImage}
        productName={productName}
        eager
      />
      {images.length > 1 ? (
        <div className="product-gallery__thumbs" role="group" aria-label="Изображения товара">
          {images.map((image, index) => (
            <button
              type="button"
              key={image.id ?? `${image.url}-${index}`}
              aria-label={`Показать изображение ${index + 1}`}
              aria-pressed={index === activeIndex}
              onClick={() => setActiveIndex(index)}
            >
              <ProductImage image={image} productName={productName} />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
