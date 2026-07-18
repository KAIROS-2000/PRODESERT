import type { Metadata } from 'next';

import { CartPage } from '@/components/cart/cart-page';

export const metadata: Metadata = {
  title: 'Корзина',
  description: 'Корзина товаров Pro Dessert.',
  robots: { index: false, follow: false },
};

export default function CartRoute() {
  return <CartPage />;
}
