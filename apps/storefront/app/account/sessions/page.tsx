import type { Metadata } from 'next';

import { AccountSessionsView } from '@/components/account/sessions-view';

export const metadata: Metadata = { title: 'Активные сессии' };

export default function AccountSessionsPage() {
  return <AccountSessionsView />;
}
