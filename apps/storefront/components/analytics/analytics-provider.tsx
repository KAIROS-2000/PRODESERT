'use client';

import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useSyncExternalStore } from 'react';

import {
  analyticsEnabled,
  readAnalyticsConsent,
  saveAnalyticsConsent,
  subscribeToAnalyticsConsent,
  trackAnalyticsEvent,
  type AnalyticsConsent,
} from '@/lib/analytics';

const subscribeToNothing = () => () => undefined;
const getServerConsent = (): AnalyticsConsent => 'denied';
const getServerHydrationState = () => false;
const getClientHydrationState = () => true;

function pageEvent(pathname: string) {
  if (pathname === '/') return 'view_home' as const;
  if (pathname === '/cart') return 'view_cart' as const;
  if (pathname.startsWith('/product/')) return 'view_product' as const;
  if (pathname.startsWith('/catalog')) return 'view_category' as const;
  return null;
}

export function AnalyticsProvider({ children }: Readonly<{ children: ReactNode }>) {
  const pathname = usePathname();
  const consent = useSyncExternalStore(
    subscribeToAnalyticsConsent,
    readAnalyticsConsent,
    getServerConsent,
  );
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    getClientHydrationState,
    getServerHydrationState,
  );

  useEffect(() => {
    const event = pageEvent(pathname);
    if (hydrated && event) trackAnalyticsEvent(event, { surface: 'page' });
  }, [hydrated, pathname]);

  const decide = (nextConsent: Exclude<AnalyticsConsent, 'undecided'>) => {
    saveAnalyticsConsent(nextConsent);
  };

  return (
    <>
      {children}
      {analyticsEnabled() && hydrated && consent === 'undecided' ? (
        <aside className="analytics-consent" aria-label="Настройка аналитики" role="dialog">
          <p>
            Мы можем собирать обезличенные данные о работе каталога, чтобы улучшать поиск и
            оформление заказа. Персональные данные в аналитику не передаются.
          </p>
          <div>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => decide('denied')}
            >
              Не разрешать
            </button>
            <button
              className="button button--primary"
              type="button"
              onClick={() => decide('granted')}
            >
              Разрешить
            </button>
          </div>
        </aside>
      ) : null}
    </>
  );
}
