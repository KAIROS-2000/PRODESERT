'use client';

import { Check, ShoppingBasket } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { useCart } from '@/components/cart/cart-provider';
import type { Availability } from '@/lib/catalog-types';
import { normalizeQuantity } from '@/lib/quantity';

import { QuantityControl } from './quantity-control';

interface DefaultVariant {
  id: string;
  minOrderQuantity: string;
  salesMultiple: string;
  availability: Availability;
}

export function ProductCardCartControls({
  productName,
  productSlug,
  price,
  defaultVariant,
}: {
  productName: string;
  productSlug: string;
  price: number | null;
  defaultVariant: DefaultVariant | null | undefined;
}) {
  const { cart, addItem, updateItem, isLoading, isMutating } = useCart();
  const cartItem = useMemo(
    () => cart?.items.find((item) => item.variantId === defaultVariant?.id),
    [cart?.items, defaultVariant?.id],
  );
  const [quantity, setQuantity] = useState(
    defaultVariant
      ? normalizeQuantity(
          defaultVariant.minOrderQuantity,
          defaultVariant.minOrderQuantity,
          defaultVariant.salesMultiple,
        )
      : '1',
  );
  const [actionError, setActionError] = useState<string | null>(null);

  if (defaultVariant?.availability === 'OUT_OF_STOCK' || price === null || !defaultVariant) {
    return (
      <Link
        className="button button--secondary product-card__more"
        href={`/product/${productSlug}`}
      >
        Подробнее
      </Link>
    );
  }

  const changeQuantity = async (nextQuantity: string) => {
    setActionError(null);
    setQuantity(nextQuantity);
    if (!cartItem) return;

    try {
      await updateItem(cartItem.id, nextQuantity);
    } catch (error) {
      setQuantity(cartItem.quantity);
      setActionError(error instanceof Error ? error.message : 'Не удалось изменить количество.');
      throw error;
    }
  };

  const add = async () => {
    setActionError(null);
    try {
      await addItem(defaultVariant.id, quantity);
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Не удалось добавить товар.');
    }
  };

  return (
    <div className="product-card__cart">
      <QuantityControl
        compact
        value={cartItem?.quantity ?? quantity}
        minimum={defaultVariant.minOrderQuantity}
        multiple={defaultVariant.salesMultiple}
        disabled={isLoading || isMutating}
        label={productName}
        onChange={changeQuantity}
      />
      {cartItem ? (
        <Link className="button button--secondary product-card__cart-button" href="/cart">
          <Check aria-hidden="true" size={16} />В корзине
        </Link>
      ) : (
        <button
          className="button button--primary product-card__cart-button"
          type="button"
          disabled={isLoading || isMutating}
          onClick={() => void add()}
        >
          <ShoppingBasket aria-hidden="true" size={16} />
          {isLoading ? 'Проверяем…' : isMutating ? 'Добавляем…' : 'В корзину'}
        </button>
      )}
      {actionError ? (
        <p className="cart-inline-error" role="alert">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}
