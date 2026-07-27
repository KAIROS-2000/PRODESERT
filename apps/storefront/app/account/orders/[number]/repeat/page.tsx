import type { Metadata } from 'next';

import { RepeatOrderView } from '@/components/account/repeat-order-view';

export const metadata: Metadata = { title: 'Повтор заказа' };

export default async function RepeatOrderPage({ params }: { params: Promise<{ number: string }> }) {
  const { number } = await params;
  return <RepeatOrderView publicNumber={number} />;
}
