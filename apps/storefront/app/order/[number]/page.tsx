import type { Metadata } from 'next';

import { OrderStatusView } from '@/components/checkout/order-status-view';

export const metadata: Metadata = {
  title: 'Статус заказа',
  robots: { index: false, follow: false },
};

export default async function OrderStatusPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;

  return <OrderStatusView publicNumber={number} />;
}
