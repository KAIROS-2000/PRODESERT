import { LayoutDashboard, MapPin } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { LogoutButton } from '@/components/logout-button';
import { getAdminSession, hasStaffRole } from '@/lib/session';

export default async function ProtectedLayout({ children }: { children: ReactNode }) {
  const session = await getAdminSession();
  if (session.status === 'unauthenticated') redirect('/login');
  if (session.status === 'unavailable')
    return (
      <main id="admin-content" className="state-page">
        <section className="state-card">
          <h1>Сервис временно недоступен</h1>
          <p>Не удалось безопасно проверить сессию.</p>
        </section>
      </main>
    );
  if (!hasStaffRole(session.user)) redirect('/unauthorized');
  return (
    <div className="admin-layout">
      <aside className="sidebar">
        <Link className="admin-brand admin-brand--light" href="/">
          <span>PD</span>
          <div>
            <strong>Pro Dessert</strong>
            <small>Управление</small>
          </div>
        </Link>
        <nav aria-label="Разделы панели">
          <Link className="nav-link nav-link--active" href="/">
            <LayoutDashboard aria-hidden="true" size={19} />
            Обзор
          </Link>
        </nav>
        <div className="sidebar-meta">
          <div>
            <MapPin aria-hidden="true" size={17} />
            <span>
              Самовывоз
              <br />
              Липовая улица, 20
            </span>
          </div>
          <small>{session.user.email}</small>
          <LogoutButton />
        </div>
      </aside>
      <main id="admin-content" className="admin-main">
        {children}
      </main>
    </div>
  );
}
