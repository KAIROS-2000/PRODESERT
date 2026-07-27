import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/auth-shell';
import { LoginForm } from '@/components/auth/login-form';

export const metadata: Metadata = { title: 'Вход' };

function safeNextPath(value: string | string[] | undefined): string {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (!candidate?.startsWith('/') || candidate.startsWith('//')) return '/';
  return candidate;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string | string[] }>;
}) {
  const redirectTo = safeNextPath((await searchParams).next);
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
      <LoginForm redirectTo={redirectTo} />
    </AuthShell>
  );
}
