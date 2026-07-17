import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/auth-shell';
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form';

export const metadata: Metadata = { title: 'Восстановление пароля' };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      eyebrow="Восстановление доступа"
      title="Забыли пароль?"
      description="Укажите email. Если профиль существует, мы отправим одноразовую ссылку с ограниченным сроком действия."
      footer={
        <p>
          Вспомнили пароль? <Link href="/login">Вернуться ко входу</Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
