import type { Metadata } from 'next';

import { AccountOverviewView } from '@/components/account/overview-view';

export const metadata: Metadata = { title: 'Обзор' };

export default function AccountPage() {
  return <AccountOverviewView />;
}
