import type { Metadata } from 'next';
import Link from 'next/link';

import { AuthShell } from '@/components/auth/auth-shell';
import { VerifyEmailForm } from '@/components/auth/verify-email-form';

export const metadata: Metadata = { title: 'Подтверждение email' };

type VerifyEmailPageProps = {
  searchParams: Promise<{ token?: string | string[] }>;
};

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const params = await searchParams;
  const tokenValue = Array.isArray(params.token) ? params.token[0] : params.token;
  const token = tokenValue?.trim() || null;

  return (
    <AuthShell
      eyebrow="Подтверждение адреса"
      title="Подтвердите email"
      description={
        token ? 'Проверяем одноразовую ссылку.' : 'Откройте ссылку из письма или запросите новую.'
      }
      footer={
        <p>
          <Link href="/login">Вернуться ко входу</Link>
        </p>
      }
    >
      <VerifyEmailForm token={token} />
    </AuthShell>
  );
}
