import type { Metadata } from 'next';

import { AccountOrganizationsView } from '@/components/account/organizations-view';

export const metadata: Metadata = { title: 'Организации' };

export default function AccountOrganizationsPage() {
  return <AccountOrganizationsView />;
}
