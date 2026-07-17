import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/auth-shell';
import { ResetPasswordForm } from '@/components/auth/reset-password-form';

export const metadata: Metadata = { title: 'Новый пароль' };

type ResetPasswordPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const tokenValue = Array.isArray(params.token) ? params.token[0] : params.token;
  const token = tokenValue?.trim() || null;

  return (
    <AuthShell
      eyebrow="Восстановление доступа"
      title="Установить новый пароль"
      description="Ссылка одноразовая. После сохранения используйте новый пароль для входа."
      footer={
        <p>
          <Link href="/login">Вернуться ко входу</Link>
        </p>
      }
    >
      <ResetPasswordForm token={token} />
    </AuthShell>
  );
}
