'use client';

import type { AccountSession } from '@pro-dessert/contracts';
import { Laptop, LogOut, ShieldCheck, Smartphone } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import {
  getAccountErrorMessage,
  getAccountSessions,
  revokeAccountSession,
  revokeOtherAccountSessions,
} from '@/lib/account-api';
import { notifyAuthChanged } from '@/lib/auth-api';

import { accountDate } from './account-format';
import { AccountError, AccountLoading } from './account-state';
import styles from './account.module.css';

export function AccountSessionsView() {
  const router = useRouter();
  const [sessions, setSessions] = useState<AccountSession[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getAccountSessions()
      .then((items) => {
        if (!cancelled) {
          setSessions(items);
          setError(null);
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setError(requestError);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const revoke = async (session: AccountSession) => {
    if (session.current && !window.confirm('Завершить текущую сессию и выйти из профиля?')) return;
    setBusyId(session.id);
    setStatus(null);
    try {
      const result = await revokeAccountSession(session.id);
      if (result.currentSessionRevoked) {
        notifyAuthChanged();
        router.replace('/login');
        router.refresh();
        return;
      }
      setSessions((current) => current?.filter((item) => item.id !== session.id) ?? []);
      setStatus({ tone: 'success', text: 'Сессия завершена.' });
    } catch (requestError: unknown) {
      setStatus({ tone: 'error', text: getAccountErrorMessage(requestError) });
    } finally {
      setBusyId(null);
    }
  };

  const revokeOthers = async () => {
    if (!window.confirm('Завершить все сессии, кроме текущей?')) return;
    setBusyId('others');
    setStatus(null);
    try {
      const result = await revokeOtherAccountSessions();
      setSessions((current) => current?.filter((session) => session.current) ?? []);
      setStatus({
        tone: 'success',
        text:
          result.revokedCount > 0
            ? `Завершено сессий: ${result.revokedCount}.`
            : 'Других активных сессий нет.',
      });
    } catch (requestError: unknown) {
      setStatus({ tone: 'error', text: getAccountErrorMessage(requestError) });
    } finally {
      setBusyId(null);
    }
  };

  if (error) {
    return (
      <AccountError
        error={error}
        onRetry={() => {
          setSessions(null);
          setError(null);
          setAttempt((value) => value + 1);
        }}
      />
    );
  }
  if (!sessions) return <AccountLoading label="Проверяем активные сессии…" />;

  return (
    <section className={styles.stack} aria-labelledby="sessions-title">
      <header className={styles.sectionHeader}>
        <div>
          <h1 id="sessions-title">Активные сессии</h1>
          <p>Завершите доступ на потерянном или незнакомом устройстве.</p>
        </div>
        <button
          className="button button--secondary"
          disabled={busyId !== null || sessions.every((session) => session.current)}
          type="button"
          onClick={() => void revokeOthers()}
        >
          <ShieldCheck aria-hidden="true" size={17} /> Завершить остальные
        </button>
      </header>

      {status ? (
        <p
          className={styles.status}
          data-tone={status.tone}
          role={status.tone === 'error' ? 'alert' : 'status'}
        >
          {status.text}
        </p>
      ) : null}

      <ul className={styles.list}>
        {sessions.map((session) => {
          const mobile = /mobile|android|iphone/i.test(session.deviceLabel);
          return (
            <li className={styles.listItem} key={session.id}>
              <div>
                <span className={styles.badge}>
                  {mobile ? (
                    <Smartphone aria-hidden="true" size={14} />
                  ) : (
                    <Laptop aria-hidden="true" size={14} />
                  )}
                  {session.current ? 'Текущая сессия' : 'Активная сессия'}
                </span>
                <h3>{session.deviceLabel}</h3>
                <p>
                  Активность: {accountDate(session.lastSeenAt)} · вход:{' '}
                  {accountDate(session.createdAt)} · истекает: {accountDate(session.expiresAt)}
                </p>
              </div>
              <button
                className="button button--quiet"
                disabled={busyId !== null}
                type="button"
                onClick={() => void revoke(session)}
              >
                <LogOut aria-hidden="true" size={16} />
                {busyId === session.id ? 'Завершаем…' : session.current ? 'Выйти' : 'Завершить'}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
