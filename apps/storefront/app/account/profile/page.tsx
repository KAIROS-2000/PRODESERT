import type { Metadata } from 'next';

import { AccountProfileView } from '@/components/account/profile-view';

export const metadata: Metadata = { title: 'Профиль' };

export default async function AccountProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ emailChangeToken?: string | string[] }>;
}) {
  const tokenValue = (await searchParams).emailChangeToken;
  const token = Array.isArray(tokenValue) ? tokenValue[0] : tokenValue;
  return <AccountProfileView initialEmailToken={token ?? ''} />;
}
