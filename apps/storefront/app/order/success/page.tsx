import type { Metadata } from 'next';

import { OrderSuccessView } from '@/components/checkout/order-success-view';

export const metadata: Metadata = {
  title: 'Заказ принят',
  robots: { index: false, follow: false },
};

export default function OrderSuccessPage() {
  return <OrderSuccessView />;
}
