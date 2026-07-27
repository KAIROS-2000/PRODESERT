'use client';

import type { AccountNotificationPreferences } from '@pro-dessert/contracts';
import { Check } from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import {
  getAccountErrorMessage,
  getAccountNotificationPreferences,
  updateAccountNotificationPreferences,
} from '@/lib/account-api';

import { AccountError, AccountLoading } from './account-state';
import styles from './account.module.css';

const fields = [
  {
    key: 'orderUpdates',
    title: 'Статусы заказа',
    description: 'Проверка наличия, сборка и готовность к самовывозу.',
  },
  {
    key: 'paymentUpdates',
    title: 'Оплата',
    description: 'Публикация реквизитов и результат проверки поступления.',
  },
  {
    key: 'reservationReminders',
    title: 'Срок резерва',
    description: 'Напоминание до возврата товара в свободный остаток.',
  },
  {
    key: 'marketingEmails',
    title: 'Новости и предложения',
    description: 'Необязательные письма об ассортименте и акциях.',
  },
] as const;

export function AccountNotificationsView() {
  const [preferences, setPreferences] = useState<AccountNotificationPreferences | null>(null);
  const [draft, setDraft] = useState<Omit<
    AccountNotificationPreferences,
    'version' | 'updatedAt'
  > | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getAccountNotificationPreferences()
      .then((value) => {
        if (!cancelled) {
          setPreferences(value);
          setDraft({
            orderUpdates: value.orderUpdates,
            paymentUpdates: value.paymentUpdates,
            reservationReminders: value.reservationReminders,
            marketingEmails: value.marketingEmails,
          });
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

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!preferences || !draft) return;
    setSaving(true);
    setStatus(null);
    try {
      const updated = await updateAccountNotificationPreferences({
        expectedVersion: preferences.version,
        ...draft,
      });
      setPreferences(updated);
      setStatus({ tone: 'success', text: 'Настройки уведомлений сохранены.' });
    } catch (requestError: unknown) {
      setStatus({ tone: 'error', text: getAccountErrorMessage(requestError) });
    } finally {
      setSaving(false);
    }
  };

  if (error) {
    return (
      <AccountError
        error={error}
        onRetry={() => {
          setPreferences(null);
          setDraft(null);
          setError(null);
          setAttempt((value) => value + 1);
        }}
      />
    );
  }
  if (!preferences || !draft) return <AccountLoading label="Загружаем настройки уведомлений…" />;

  return (
    <section className={styles.stack} aria-labelledby="notification-settings-title">
      <header className={styles.sectionHeader}>
        <div>
          <h1 id="notification-settings-title">Настройки уведомлений</h1>
          <p>Управляйте письмами, связанными с заказами и новостями магазина.</p>
        </div>
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

      <form className={`${styles.card} ${styles.form}`} onSubmit={save}>
        {fields.map((field) => (
          <label className={styles.checkField} key={field.key}>
            <span>
              <input
                checked={draft[field.key]}
                type="checkbox"
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, [field.key]: event.target.checked } : current,
                  )
                }
              />
              <strong>{field.title}</strong>
            </span>
            <small>{field.description}</small>
          </label>
        ))}
        <p className={styles.muted}>
          Сервисные сообщения, необходимые для безопасности профиля, могут отправляться независимо
          от этих настроек.
        </p>
        <div className={styles.formActions}>
          <button className="button button--primary" disabled={saving} type="submit">
            <Check aria-hidden="true" size={17} /> {saving ? 'Сохраняем…' : 'Сохранить'}
          </button>
        </div>
      </form>
    </section>
  );
}
