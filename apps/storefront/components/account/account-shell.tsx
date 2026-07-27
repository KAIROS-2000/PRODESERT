'use client';

import {
  Bell,
  Building2,
  CircleUserRound,
  ClipboardList,
  LayoutDashboard,
  LogOut,
  MonitorSmartphone,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import type { ReactNode } from 'react';
import { useState } from 'react';

import { getAuthErrorMessage, notifyAuthChanged, postAuth } from '@/lib/auth-api';

import styles from './account.module.css';

const navigation = [
  { href: '/account', label: 'Обзор', icon: LayoutDashboard },
  { href: '/account/profile', label: 'Профиль', icon: CircleUserRound },
  { href: '/account/orders', label: 'Заказы', icon: ClipboardList },
  { href: '/account/organizations', label: 'Организации', icon: Building2 },
  { href: '/account/sessions', label: 'Сессии', icon: MonitorSmartphone },
  { href: '/account/notifications', label: 'Уведомления', icon: Bell },
] as const;

export function AccountShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const logout = async () => {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      await postAuth('/auth/logout', {});
      notifyAuthChanged();
      router.replace('/login');
      router.refresh();
    } catch (error) {
      setLogoutError(getAuthErrorMessage(error));
      setLoggingOut(false);
    }
  };

  return (
    <div className={`${styles.accountPage} shell`}>
      <header className={styles.accountHero}>
        <p className={styles.eyebrow}>Профиль покупателя</p>
        <h1>Личный кабинет</h1>
        <p>Заказы, реквизиты и настройки собраны в одном защищённом разделе.</p>
      </header>
      <div className={styles.accountLayout}>
        <aside className={styles.sidebar}>
          <nav aria-label="Разделы личного кабинета">
            {navigation.map(({ href, label, icon: Icon }) => {
              const current =
                href === '/account'
                  ? pathname === href
                  : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link key={href} aria-current={current ? 'page' : undefined} href={href}>
                  <Icon aria-hidden="true" size={18} />
                  {label}
                </Link>
              );
            })}
          </nav>
          <button disabled={loggingOut} type="button" onClick={() => void logout()}>
            <LogOut aria-hidden="true" size={18} />
            {loggingOut ? 'Выходим…' : 'Выйти'}
          </button>
          {logoutError ? (
            <p className={styles.sidebarError} role="alert">
              {logoutError}
            </p>
          ) : null}
        </aside>
        <div className={styles.accountContent}>{children}</div>
      </div>
    </div>
  );
}
