'use client';

import { UserRound } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

export function AccountEntry({ mobile = false }: { mobile?: boolean }) {
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    let controller: AbortController | null = null;
    const check = () => {
      controller?.abort();
      controller = new AbortController();
      void fetch('/api/v1/auth/session', {
        credentials: 'include',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      })
        .then((response) => setAuthenticated(response.ok))
        .catch(() => undefined);
    };
    check();
    window.addEventListener('pro-dessert:auth-changed', check);
    return () => {
      controller?.abort();
      window.removeEventListener('pro-dessert:auth-changed', check);
    };
  }, []);

  const label = authenticated ? 'Личный кабинет' : mobile ? 'Войти в профиль' : 'Войти';
  return (
    <Link
      className={mobile ? undefined : 'button button--quiet desktop-account'}
      href={authenticated ? '/account' : '/login?next=/account'}
    >
      {!mobile ? <UserRound aria-hidden="true" size={18} /> : null}
      {label}
    </Link>
  );
}
