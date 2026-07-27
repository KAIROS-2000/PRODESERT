import type { Metadata } from 'next';

import { AccountOrderDetailView } from '@/components/account/order-detail-view';

export const metadata: Metadata = { title: 'Карточка заказа' };

export default async function AccountOrderPage({
  params,
}: {
  params: Promise<{ number: string }>;
}) {
  const { number } = await params;
  return <AccountOrderDetailView publicNumber={number} />;
}
