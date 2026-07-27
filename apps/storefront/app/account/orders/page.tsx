import type { Metadata } from 'next';

import { AccountOrdersView } from '@/components/account/orders-view';

export const metadata: Metadata = { title: 'История заказов' };

export default function AccountOrdersPage() {
  return <AccountOrdersView />;
}
