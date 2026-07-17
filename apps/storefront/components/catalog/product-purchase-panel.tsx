'use client';

import { Info, MapPin } from 'lucide-react';

import type { Availability, ProductDetail, ProductVariant } from '@/lib/catalog-types';

const money = new Intl.NumberFormat('ru-RU', {
  style: 'currency',
  currency: 'RUB',
  maximumFractionDigits: 2,
});

const availabilityLabels: Record<Availability, string> = {
  IN_STOCK: 'В наличии',
  LOW_STOCK: 'Осталось мало',
  BACKORDER: 'Возможен заказ после уточнения наличия',
  OUT_OF_STOCK: 'Сейчас нет в наличии',
};

export function ProductPurchasePanel({
  product,
  selectedVariant,
  onVariantChange,
}: {
  product: ProductDetail;
  selectedVariant: ProductVariant | undefined;
  onVariantChange: (variantId: string) => void;
}) {
  const price = selectedVariant ? selectedVariant.price : product.price;
  const oldPrice = selectedVariant ? selectedVariant.oldPrice : product.oldPrice;
  const availability = selectedVariant?.availability ?? product.availability;
  const vatLabel = selectedVariant?.vatRate
    ? `${Number(selectedVariant.vatRate).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`
    : null;

  return (
    <aside className="purchase-panel" aria-label="Выбор варианта и наличие">
      <div className="purchase-panel__price">
        <strong>{price === null ? 'Цена уточняется' : money.format(price)}</strong>
        {price !== null && oldPrice && oldPrice > price ? (
          <del>{money.format(oldPrice)}</del>
        ) : null}
      </div>
      <span className={`stock stock--${availability.toLowerCase()}`}>
        <span aria-hidden="true" /> {availabilityLabels[availability]}
      </span>

      {product.variants.length > 1 ? (
        <fieldset className="variant-selector">
          <legend>Вариант</legend>
          <div>
            {product.variants.map((variant) => (
              <label key={variant.id}>
                <input
                  type="radio"
                  name="variant"
                  value={variant.id}
                  checked={variant.id === selectedVariant?.id}
                  onChange={() => onVariantChange(variant.id)}
                />
                <span>
                  <strong>{variant.name}</strong>
                  <small>
                    {variant.packagingLabel ??
                      (variant.price === null ? 'Цена уточняется' : money.format(variant.price))}
                  </small>
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : selectedVariant?.packagingLabel || product.packagingLabel ? (
        <p className="purchase-panel__pack">
          Фасовка: <strong>{selectedVariant?.packagingLabel ?? product.packagingLabel}</strong>
        </p>
      ) : null}

      {selectedVariant && (vatLabel || selectedVariant.shelfLifeDays !== null) ? (
        <dl className="purchase-panel__variant-meta">
          {vatLabel ? (
            <div>
              <dt>НДС</dt>
              <dd>{vatLabel}</dd>
            </div>
          ) : null}
          {selectedVariant.shelfLifeDays !== null ? (
            <div>
              <dt>Срок хранения</dt>
              <dd>{selectedVariant.shelfLifeDays} дн.</dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      <div className="purchase-panel__notice">
        <Info aria-hidden="true" size={19} />
        <div>
          <strong>Наличие подтверждает магазин</strong>
          <span>Позиции резервируются после проверки остатков.</span>
        </div>
      </div>
      <div className="purchase-panel__pickup">
        <MapPin aria-hidden="true" size={18} />
        <span>Получение: Оренбург, Липовая улица, 20</span>
      </div>
    </aside>
  );
}
