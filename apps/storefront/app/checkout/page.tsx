import type { Metadata } from 'next';

import { CheckoutForm } from '@/components/checkout/checkout-form';

export const metadata: Metadata = {
  title: 'Оформление заказа',
  description: 'Оформление заказа Pro Dessert с самовывозом из магазина в Оренбурге.',
  robots: { index: false, follow: false },
};

export default function CheckoutPage() {
  return <CheckoutForm />;
}
