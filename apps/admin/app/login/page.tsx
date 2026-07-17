import { LockKeyhole } from 'lucide-react';
import { redirect } from 'next/navigation';
import { LoginForm } from '@/components/login-form';
import { getAdminSession, hasStaffRole } from '@/lib/session';

export default async function LoginPage() {
  const session = await getAdminSession();
  if (session.status === 'authenticated')
    redirect(hasStaffRole(session.user) ? '/' : '/unauthorized');
  return (
    <main id="admin-content" className="login-page">
      <section className="login-card" aria-labelledby="login-title">
        <div className="admin-brand">
          <span>PD</span>
          <div>
            <strong>Pro Dessert</strong>
            <small>Панель управления</small>
          </div>
        </div>
        <div className="login-heading">
          <span className="icon-box">
            <LockKeyhole aria-hidden="true" size={22} />
          </span>
          <h1 id="login-title">Вход для сотрудников</h1>
          <p>Используйте рабочий аккаунт. Действия записываются в аудит.</p>
        </div>
        {session.status === 'unavailable' ? (
          <div className="notice notice--error" role="alert">
            API временно недоступен.
          </div>
        ) : null}
        <LoginForm />
      </section>
    </main>
  );
}
