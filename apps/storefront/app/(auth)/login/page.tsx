import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = { title: 'Вход' };

export default function LoginPage() {
  return (
    <AuthShell
      eyebrow="Личный профиль"
      title="Войти в Pro Dessert"
      description="Введите email и пароль, указанные при регистрации."
      footer={
        <p>
          Нет профиля? <Link href="/register">Создать</Link> ·{' '}
          <Link href="/forgot-password">Забыли пароль?</Link>
        </p>
      }
    >
      <LoginForm />
    </AuthShell>
  );
}
