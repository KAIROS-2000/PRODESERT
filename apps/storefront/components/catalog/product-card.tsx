import Link from 'next/link';

import { ProductCardCartControls } from '@/components/cart/product-card-cart-controls';
import type { Availability, ProductSummary } from '@/lib/catalog-types';

import { ProductImage } from './product-image';

const availabilityLabels: Record<Availability, string> = {
  IN_STOCK: 'В наличии',
  LOW_STOCK: 'Мало',
  BACKORDER: 'Под заказ',
  OUT_OF_STOCK: 'Нет в наличии',
};

const money = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 2,
});

export function ProductCard({
  product,
  priority = false,
}: {
  product: ProductSummary;
  priority?: boolean;
}) {
  return (
    <article className="product-card">
      <Link className="product-card__media" href={`/product/${product.slug}`}>
        <ProductImage image={product.primaryImage} productName={product.name} eager={priority} />
        <span className="product-badges" aria-label="Метки товара">
          {product.isNew ? <span className="product-badge product-badge--new">Новинка</span> : null}
          {product.isHit ? <span className="product-badge product-badge--hit">Хит</span> : null}
          {product.isSale ? <span className="product-badge product-badge--sale">Акция</span> : null}
          {product.discountPercent ? (
            <span className="product-badge product-badge--discount">
              −{product.discountPercent}%
            </span>
          ) : null}
        </span>
      </Link>

      <div className="product-card__body">
        {product.brand ? <span className="product-card__brand">{product.brand.name}</span> : null}
        <h3 className="product-card__title">
          <Link href={`/product/${product.slug}`}>{product.name}</Link>
        </h3>
        <p className="product-card__pack">{product.packagingLabel ?? product.unit ?? 'Упаковка'}</p>
        <span className={`stock stock--${product.availability.toLowerCase()}`}>
          <span aria-hidden="true" /> {availabilityLabels[product.availability]}
        </span>

        <div className="product-card__price">
          <strong>
            {product.price === null ? 'Цена уточняется' : money.format(product.price)}
          </strong>
          {product.price !== null && product.oldPrice && product.oldPrice > product.price ? (
            <del>{money.format(product.oldPrice)}</del>
          ) : null}
        </div>

        <ProductCardCartControls
          productName={product.name}
          productSlug={product.slug}
          price={product.price}
          defaultVariant={product.defaultVariant}
        />
      </div>
    </article>
  );
}
