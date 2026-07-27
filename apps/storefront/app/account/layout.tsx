import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AccountShell } from '@/components/account/account-shell';

export const metadata: Metadata = {
  title: {
    default: 'Личный кабинет',
    template: '%s · Личный кабинет Pro Dessert',
  },
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <AccountShell>{children}</AccountShell>;
}
