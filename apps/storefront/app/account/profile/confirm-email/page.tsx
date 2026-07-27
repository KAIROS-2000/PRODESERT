import type { Metadata } from 'next';

import { AccountProfileView } from '@/components/account/profile-view';

export const metadata: Metadata = { title: 'Подтверждение нового email' };

export default async function ConfirmAccountEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const tokenValue = (await searchParams).token;
  const token = Array.isArray(tokenValue) ? tokenValue[0] : tokenValue;
  return <AccountProfileView initialEmailToken={token ?? ''} />;
}
