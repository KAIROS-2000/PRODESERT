import type { Metadata } from 'next';

import { AccountNotificationsView } from '@/components/account/notifications-view';

export const metadata: Metadata = { title: 'Уведомления' };

export default function AccountNotificationsPage() {
  return <AccountNotificationsView />;
}
