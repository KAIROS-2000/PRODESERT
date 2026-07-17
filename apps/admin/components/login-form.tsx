'use client';

import { LoaderCircle, LogIn } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { csrfFetch } from '@/lib/csrf-client';

function safeMessage(status: number) {
  if (status === 401) return 'Проверьте email и пароль.';
  if (status === 403) return 'У аккаунта нет доступа к панели управления.';
  if (status === 429) return 'Слишком много попыток. Повторите позже.';
  return status >= 500 ? 'Сервис временно недоступен.' : 'Не удалось войти.';
}

export function LoginForm() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);
    setSuccess(false);
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    if (!email || !password) {
      setPending(false);
      setMessage('Заполните email и пароль.');
      return;
    }
    try {
      const response = await csrfFetch('/api/v1/auth/login', {
        method: 'POST',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) {
        setMessage(safeMessage(response.status));
        return;
      }
      setSuccess(true);
      setMessage('Вход выполнен. Проверяем права…');
      router.replace('/');
      router.refresh();
    } catch {
      setMessage('Не удалось связаться с сервисом. Проверьте соединение.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit} aria-busy={pending}>
      <div className="field">
        <label htmlFor="admin-email">Email сотрудника</label>
        <input id="admin-email" name="email" type="email" autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="admin-password">Пароль</label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {message ? (
        <div
          className={`notice notice--${success ? 'success' : 'error'}`}
          role={success ? 'status' : 'alert'}
        >
          {message}
        </div>
      ) : null}
      <button className="primary-button" type="submit" disabled={pending}>
        {pending ? (
          <LoaderCircle className="spin" aria-hidden="true" size={19} />
        ) : (
          <LogIn aria-hidden="true" size={19} />
        )}
        {pending ? 'Входим…' : 'Войти'}
      </button>
    </form>
  );
}
