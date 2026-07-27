'use client';

import type { AccountOrganization } from '@pro-dessert/contracts';
import { Building2, Check, Pencil, Plus, Trash2, X } from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useState } from 'react';

import {
  createAccountOrganization,
  deleteAccountOrganization,
  getAccountErrorMessage,
  getAccountOrganizations,
  updateAccountOrganization,
} from '@/lib/account-api';

import { AccountError, AccountLoading } from './account-state';
import styles from './account.module.css';

type OrganizationDraft = { name: string; inn: string; kpp: string };
const emptyDraft: OrganizationDraft = { name: '', inn: '', kpp: '' };

export function AccountOrganizationsView() {
  const [organizations, setOrganizations] = useState<AccountOrganization[] | null>(null);
  const [draft, setDraft] = useState<OrganizationDraft>(emptyDraft);
  const [editId, setEditId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<OrganizationDraft>(emptyDraft);
  const [error, setError] = useState<unknown>(null);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void getAccountOrganizations()
      .then((items) => {
        if (!cancelled) {
          setOrganizations(items);
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

  const create = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const created = await createAccountOrganization({
        name: draft.name.trim(),
        inn: draft.inn.trim(),
        kpp: draft.kpp.trim() || null,
      });
      setOrganizations((current) => [...(current ?? []), created]);
      setDraft(emptyDraft);
      setStatus({ tone: 'success', text: 'Организация добавлена.' });
    } catch (requestError: unknown) {
      setStatus({ tone: 'error', text: getAccountErrorMessage(requestError) });
    } finally {
      setSaving(false);
    }
  };

  const beginEdit = (organization: AccountOrganization) => {
    setEditId(organization.id);
    setEditDraft({
      name: organization.name,
      inn: organization.inn,
      kpp: organization.kpp ?? '',
    });
    setStatus(null);
  };

  const update = async (event: FormEvent, organization: AccountOrganization) => {
    event.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const updated = await updateAccountOrganization(organization.id, {
        expectedVersion: organization.version,
        name: editDraft.name.trim(),
        inn: editDraft.inn.trim(),
        kpp: editDraft.kpp.trim() || null,
      });
      setOrganizations(
        (current) => current?.map((item) => (item.id === updated.id ? updated : item)) ?? [],
      );
      setEditId(null);
      setStatus({ tone: 'success', text: 'Реквизиты обновлены.' });
    } catch (requestError: unknown) {
      setStatus({ tone: 'error', text: getAccountErrorMessage(requestError) });
    } finally {
      setSaving(false);
    }
  };

  const remove = async (organization: AccountOrganization) => {
    if (!window.confirm(`Удалить организацию «${organization.name}» из профиля?`)) return;
    setSaving(true);
    setStatus(null);
    try {
      await deleteAccountOrganization(organization.id, organization.version);
      setOrganizations((current) => current?.filter((item) => item.id !== organization.id) ?? []);
      setStatus({ tone: 'success', text: 'Организация удалена из профиля.' });
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
          setOrganizations(null);
          setError(null);
          setAttempt((value) => value + 1);
        }}
      />
    );
  }
  if (!organizations) return <AccountLoading label="Загружаем реквизиты организаций…" />;

  return (
    <div className={styles.stack}>
      <header className={styles.sectionHeader}>
        <div>
          <h1>Данные организации</h1>
          <p>Сохранённые реквизиты можно использовать при оформлении счёта.</p>
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

      {organizations.length > 0 ? (
        <ul className={styles.list}>
          {organizations.map((organization) => (
            <li className={styles.card} key={organization.id}>
              {editId === organization.id ? (
                <form
                  className={styles.form}
                  onSubmit={(event) => void update(event, organization)}
                >
                  <OrganizationFields draft={editDraft} onChange={setEditDraft} prefix="edit" />
                  <div className={styles.formActions}>
                    <button className="button button--primary" disabled={saving} type="submit">
                      <Check aria-hidden="true" size={17} /> Сохранить
                    </button>
                    <button
                      className="button button--secondary"
                      type="button"
                      onClick={() => setEditId(null)}
                    >
                      <X aria-hidden="true" size={17} /> Отмена
                    </button>
                  </div>
                </form>
              ) : (
                <div className={styles.listItem}>
                  <div>
                    <span className={styles.badge}>
                      <Building2 aria-hidden="true" size={14} /> Организация
                    </span>
                    <h3>{organization.name}</h3>
                    <p>
                      ИНН {organization.inn}
                      {organization.kpp ? ` · КПП ${organization.kpp}` : ''}
                    </p>
                  </div>
                  <div className={styles.inlineActions}>
                    <button
                      className="button button--secondary"
                      disabled={saving}
                      type="button"
                      onClick={() => beginEdit(organization)}
                    >
                      <Pencil aria-hidden="true" size={16} /> Изменить
                    </button>
                    <button
                      className="button button--quiet"
                      disabled={saving}
                      type="button"
                      onClick={() => void remove(organization)}
                    >
                      <Trash2 aria-hidden="true" size={16} /> Удалить
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <div className={`${styles.card} ${styles.empty}`}>
          <Building2 aria-hidden="true" size={34} />
          <p>Сохранённых организаций пока нет.</p>
        </div>
      )}

      <section className={styles.card} aria-labelledby="new-organization-title">
        <h2 id="new-organization-title">Добавить организацию</h2>
        <form className={styles.form} onSubmit={create}>
          <OrganizationFields draft={draft} onChange={setDraft} prefix="new" />
          <div className={styles.formActions}>
            <button className="button button--primary" disabled={saving} type="submit">
              <Plus aria-hidden="true" size={17} /> Добавить
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}

function OrganizationFields({
  draft,
  onChange,
  prefix,
}: {
  draft: OrganizationDraft;
  onChange: (value: OrganizationDraft) => void;
  prefix: string;
}) {
  return (
    <div className={styles.fieldGrid}>
      <label className={styles.field} htmlFor={`${prefix}-organization-name`}>
        <span>Название</span>
        <input
          id={`${prefix}-organization-name`}
          maxLength={240}
          required
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
        />
      </label>
      <label className={styles.field} htmlFor={`${prefix}-organization-inn`}>
        <span>ИНН</span>
        <input
          id={`${prefix}-organization-inn`}
          inputMode="numeric"
          maxLength={12}
          minLength={10}
          pattern="\d{10}|\d{12}"
          required
          value={draft.inn}
          onChange={(event) => onChange({ ...draft, inn: event.target.value })}
        />
      </label>
      <label className={styles.field} htmlFor={`${prefix}-organization-kpp`}>
        <span>КПП (если есть)</span>
        <input
          id={`${prefix}-organization-kpp`}
          inputMode="numeric"
          maxLength={9}
          pattern="\d{9}"
          value={draft.kpp}
          onChange={(event) => onChange({ ...draft, kpp: event.target.value })}
        />
      </label>
    </div>
  );
}
