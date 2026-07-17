import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/auth-shell';
import { RegisterForm } from '@/components/auth/register-form';

export const metadata: Metadata = { title: 'Регистрация' };

export default function RegisterPage() {
  return (
    <AuthShell
      eyebrow="Новый профиль"
      title="Создать профиль"
      description="Регистрация не нужна для гостевого заказа, но сохраняет историю и упрощает повторные закупки."
      footer={
        <p>
          Уже зарегистрированы? <Link href="/login">Войти</Link>
        </p>
      }
    >
      <RegisterForm />
    </AuthShell>
  );
}
