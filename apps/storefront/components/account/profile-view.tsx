'use client';

import type { AccountProfile } from '@pro-dessert/contracts';
import { Check, Mail } from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import {
  changeAccountPassword,
  confirmAccountEmailChange,
  getAccountErrorMessage,
  getAccountProfile,
  requestAccountEmailChange,
  updateAccountProfile,
} from '@/lib/account-api';

import { AccountError, AccountLoading } from './account-state';
import styles from './account.module.css';

export function AccountProfileView({ initialEmailToken = '' }: { initialEmailToken?: string }) {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailToken, setEmailToken] = useState(initialEmailToken);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [loadingError, setLoadingError] = useState<unknown>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void getAccountProfile()
      .then((value) => {
        if (!cancelled) {
          setProfile(value);
          setFirstName(value.firstName ?? '');
          setLastName(value.lastName ?? '');
          setPhone(value.phone ?? '');
          setLoadingError(null);
        }
      })
      .catch((requestError: unknown) => {
        if (!cancelled) setLoadingError(requestError);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile) return;
    setSaving(true);
    setStatus(null);
    try {
      const updated = await updateAccountProfile({
        expectedVersion: profile.version,
        firstName: firstName.trim() || null,
        lastName: lastName.trim() || null,
        phone: phone.trim() || null,
      });
      setProfile(updated);
      setStatus({ tone: 'success', text: 'Профиль сохранён.' });
    } catch (requestError: unknown) {
      setStatus({ tone: 'error', text: getAccountErrorMessage(requestError) });
    } finally {
      setSaving(false);
    }
  };

  const requestEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (!profile || !newEmail.trim()) return;
    setSaving(true);
    setStatus(null);
    try {
      const response = await requestAccountEmailChange({
        newEmail: newEmail.trim(),
        expectedVersion: profile.version,
      });
      setStatus({ tone: 'success', text: response.message });
      setNewEmail('');
    } catch (requestError: unknown) {
      setStatus({ tone: 'error', text: getAccountErrorMessage(requestError) });
    } finally {
      setSaving(false);
    }
  };

  const confirmEmail = async (event: FormEvent) => {
    event.preventDefault();
    if (!emailToken.trim()) return;
    setSaving(true);
    setStatus(null);
    try {
      const updated = await confirmAccountEmailChange({ token: emailToken.trim() });
      setProfile(updated);
      setEmailToken('');
      setStatus({ tone: 'success', text: 'Новый email подтверждён.' });
    } catch (requestError: unknown) {
      setStatus({ tone: 'error', text: getAccountErrorMessage(requestError) });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentPassword || !newPassword || !profile) return;
    if (newPassword !== passwordConfirmation) {
      setStatus({ tone: 'error', text: 'Новые пароли не совпадают.' });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const response = await changeAccountPassword({
        currentPassword,
        newPassword,
        expectedVersion: profile.version,
      });
      const updated = await getAccountProfile();
      setProfile(updated);
      setCurrentPassword('');
      setNewPassword('');
      setPasswordConfirmation('');
      setStatus({ tone: 'success', text: response.message });
    } catch (requestError: unknown) {
      setStatus({ tone: 'error', text: getAccountErrorMessage(requestError) });
    } finally {
      setSaving(false);
    }
  };

  if (loadingError) {
    return (
      <AccountError
        error={loadingError}
        onRetry={() => {
          setProfile(null);
          setLoadingError(null);
          setAttempt((value) => value + 1);
        }}
      />
    );
  }
  if (!profile) return <AccountLoading label="Загружаем профиль…" />;

  return (
    <div className={styles.stack}>
      <header className={styles.sectionHeader}>
        <div>
          <h1>Профиль</h1>
          <p>Контактные данные подставляются при следующих оформлениях.</p>
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

      <section className={styles.card} aria-labelledby="personal-data-title">
        <h2 id="personal-data-title">Контактные данные</h2>
        <form className={styles.form} onSubmit={saveProfile}>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span>Имя</span>
              <input
                autoComplete="given-name"
                maxLength={120}
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Фамилия</span>
              <input
                autoComplete="family-name"
                maxLength={120}
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Телефон</span>
              <input
                autoComplete="tel"
                inputMode="tel"
                maxLength={32}
                placeholder="+7 900 000-00-00"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Email</span>
              <input disabled type="email" value={profile.email} />
              <small>{profile.emailVerified ? 'Подтверждён' : 'Ожидает подтверждения'}</small>
            </label>
          </div>
          <div className={styles.formActions}>
            <button className="button button--primary" disabled={saving} type="submit">
              <Check aria-hidden="true" size={17} /> {saving ? 'Сохраняем…' : 'Сохранить'}
            </button>
          </div>
        </form>
      </section>

      <section className={styles.card} aria-labelledby="email-change-title">
        <h2 id="email-change-title">Изменить email</h2>
        <p className={styles.muted}>
          Новый адрес станет активным только после одноразового подтверждения. Активные сессии на
          других устройствах будут завершены.
        </p>
        <form className={styles.form} onSubmit={requestEmail}>
          <label className={styles.field}>
            <span>Новый email</span>
            <input
              autoComplete="email"
              required
              type="email"
              value={newEmail}
              onChange={(event) => setNewEmail(event.target.value)}
            />
          </label>
          <div className={styles.formActions}>
            <button className="button button--secondary" disabled={saving} type="submit">
              <Mail aria-hidden="true" size={17} /> Отправить подтверждение
            </button>
          </div>
        </form>
        <form className={styles.form} onSubmit={confirmEmail}>
          <label className={styles.field}>
            <span>Одноразовый токен из письма</span>
            <input
              autoComplete="one-time-code"
              required
              value={emailToken}
              onChange={(event) => setEmailToken(event.target.value)}
            />
          </label>
          <div className={styles.formActions}>
            <button className="button button--secondary" disabled={saving} type="submit">
              <Check aria-hidden="true" size={17} /> Подтвердить новый email
            </button>
          </div>
        </form>
      </section>

      <section className={styles.card} aria-labelledby="password-change-title">
        <h2 id="password-change-title">Изменить пароль</h2>
        <p className={styles.muted}>
          После изменения пароля все другие активные сессии будут завершены.
        </p>
        <form className={styles.form} onSubmit={changePassword}>
          <div className={styles.fieldGrid}>
            <label className={styles.field}>
              <span>Текущий пароль</span>
              <input
                autoComplete="current-password"
                maxLength={1024}
                required
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </label>
            <label className={styles.field}>
              <span>Новый пароль</span>
              <input
                autoComplete="new-password"
                maxLength={1024}
                minLength={10}
                required
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
              <small>Не менее 10 символов. Спецсимволы не обязательны.</small>
            </label>
            <label className={styles.field}>
              <span>Повторите новый пароль</span>
              <input
                autoComplete="new-password"
                maxLength={1024}
                minLength={10}
                required
                type="password"
                value={passwordConfirmation}
                onChange={(event) => setPasswordConfirmation(event.target.value)}
              />
            </label>
          </div>
          <div className={styles.formActions}>
            <button className="button button--secondary" disabled={saving} type="submit">
              <Check aria-hidden="true" size={17} /> Изменить пароль
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
