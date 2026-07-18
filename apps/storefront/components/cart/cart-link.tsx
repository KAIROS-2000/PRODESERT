'use client';

import { ShoppingBasket } from 'lucide-react';
import Link from 'next/link';

import { useCart } from './cart-provider';

export function CartLink({ mobile = false }: { mobile?: boolean }) {
  const { cart, isLoading } = useCart();
  const count = cart?.itemCount ?? 0;
  const countLabel = count > 99 ? '99+' : String(count);

  return (
    <Link
      className={mobile ? 'cart-link cart-link--mobile' : 'button button--quiet cart-link'}
      href="/cart"
      aria-label={
        isLoading ? 'Корзина загружается' : `Корзина, товаров: ${count.toLocaleString('ru-RU')}`
      }
    >
      <span className="cart-link__icon">
        <ShoppingBasket aria-hidden="true" size={mobile ? 20 : 18} />
        {count > 0 ? (
          <span className="cart-link__badge" key={count} aria-hidden="true">
            {countLabel}
          </span>
        ) : null}
      </span>
      <span>{mobile ? 'Корзина' : 'Корзина'}</span>
    </Link>
  );
}
