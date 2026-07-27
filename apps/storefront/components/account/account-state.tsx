'use client';

import { AlertTriangle, LoaderCircle, RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

import { AccountApiError } from '@/lib/account-api';

import styles from './account.module.css';

export function AccountLoading({ label = 'Загружаем данные…' }: { label?: string }) {
  return (
    <div className={styles.stateCard} role="status">
      <LoaderCircle className={styles.spin} aria-hidden="true" size={24} />
      <span>{label}</span>
    </div>
  );
}

export function AccountError({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const router = useRouter();
  const unauthorized = error instanceof AccountApiError && error.status === 401;

  useEffect(() => {
    if (unauthorized) {
      const next = `${window.location.pathname}${window.location.search}`;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
    }
  }, [router, unauthorized]);

  if (unauthorized) return <AccountLoading label="Переходим к защищённому входу…" />;
  const message = error instanceof Error ? error.message : 'Не удалось загрузить данные.';
  return (
    <div className={styles.stateCard} role="alert">
      <AlertTriangle aria-hidden="true" size={24} />
      <div>
        <strong>Раздел временно недоступен</strong>
        <p>{message}</p>
      </div>
      {onRetry ? (
        <button className="button button--secondary" type="button" onClick={onRetry}>
          <RefreshCw aria-hidden="true" size={17} />
          Повторить
        </button>
      ) : null}
    </div>
  );
}
