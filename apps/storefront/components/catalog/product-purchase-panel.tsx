'use client';

import { Check, Info, MapPin, ShoppingBasket } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { useCart } from '@/components/cart/cart-provider';
import { QuantityControl } from '@/components/cart/quantity-control';
import type { Availability, ProductDetail, ProductVariant } from '@/lib/catalog-types';
import { normalizeQuantity } from '@/lib/quantity';

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
  const { cart, addItem, updateItem, isLoading, isMutating } = useCart();
  const cartItem = useMemo(
    () => cart?.items.find((item) => item.variantId === selectedVariant?.id),
    [cart?.items, selectedVariant?.id],
  );
  const [variantQuantities, setVariantQuantities] = useState<Record<string, string>>({});
  const [actionError, setActionError] = useState<{ variantId: string; message: string } | null>(
    null,
  );
  const price = selectedVariant ? selectedVariant.price : product.price;
  const oldPrice = selectedVariant ? selectedVariant.oldPrice : product.oldPrice;
  const availability = selectedVariant?.availability ?? product.availability;
  const vatLabel = selectedVariant?.vatRate
    ? `${Number(selectedVariant.vatRate).toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`
    : null;

  const quantity = selectedVariant
    ? (cartItem?.quantity ??
      variantQuantities[selectedVariant.id] ??
      normalizeQuantity(
        selectedVariant.minOrderQuantity,
        selectedVariant.minOrderQuantity,
        selectedVariant.salesMultiple,
      ))
    : '1';

  const changeQuantity = async (nextQuantity: string) => {
    if (!selectedVariant) return;
    setActionError(null);
    setVariantQuantities((current) => ({ ...current, [selectedVariant.id]: nextQuantity }));
    if (!cartItem) return;

    try {
      await updateItem(cartItem.id, nextQuantity);
    } catch (error) {
      setVariantQuantities((current) => ({ ...current, [selectedVariant.id]: cartItem.quantity }));
      setActionError({
        variantId: selectedVariant.id,
        message: error instanceof Error ? error.message : 'Не удалось изменить количество.',
      });
      throw error;
    }
  };

  const add = async () => {
    if (!selectedVariant) return;
    setActionError(null);
    try {
      await addItem(selectedVariant.id, quantity);
    } catch (error) {
      setActionError({
        variantId: selectedVariant.id,
        message: error instanceof Error ? error.message : 'Не удалось добавить товар.',
      });
    }
  };

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

      {selectedVariant ? (
        <div className="purchase-panel__cart">
          <div className="purchase-panel__quantity-heading">
            <span>Количество</span>
            <small>
              минимум {selectedVariant.minOrderQuantity} {selectedVariant.unit}, шаг{' '}
              {selectedVariant.salesMultiple} {selectedVariant.unit}
            </small>
          </div>
          <div className="purchase-panel__cart-row">
            <QuantityControl
              value={cartItem?.quantity ?? quantity}
              minimum={selectedVariant.minOrderQuantity}
              multiple={selectedVariant.salesMultiple}
              disabled={
                isLoading || isMutating || availability === 'OUT_OF_STOCK' || price === null
              }
              label={`${product.name}, ${selectedVariant.name}`}
              onChange={changeQuantity}
            />
            {cartItem ? (
              <Link className="button button--secondary purchase-panel__cart-button" href="/cart">
                <Check aria-hidden="true" size={18} />В корзине
              </Link>
            ) : (
              <button
                className="button button--primary purchase-panel__cart-button"
                type="button"
                disabled={
                  isLoading || isMutating || availability === 'OUT_OF_STOCK' || price === null
                }
                onClick={() => void add()}
              >
                <ShoppingBasket aria-hidden="true" size={18} />
                {availability === 'OUT_OF_STOCK'
                  ? 'Временно отсутствует'
                  : isLoading
                    ? 'Проверяем…'
                    : isMutating
                      ? 'Добавляем…'
                      : 'В корзину'}
              </button>
            )}
          </div>
          {actionError?.variantId === selectedVariant.id ? (
            <p className="cart-inline-error" role="alert">
              {actionError.message}
            </p>
          ) : null}
        </div>
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
