import { Activity, BadgeCheck, KeyRound, MapPinned } from 'lucide-react';
import { getAdminSession } from '@/lib/session';

const cards = [
  {
    icon: BadgeCheck,
    title: 'Доступ подтверждён',
    text: 'Серверная сессия и роль сотрудника проверены.',
  },
  {
    icon: MapPinned,
    title: 'Только самовывоз',
    text: 'Рабочая точка: Оренбург, Липовая улица, 20.',
  },
  {
    icon: Activity,
    title: 'Фундамент готов',
    text: 'Рабочие модули подключаются по этапам проекта.',
  },
] as const;

export default async function DashboardPage() {
  const session = await getAdminSession();
  const roles = session.status === 'authenticated' ? session.user.roles.join(', ') : '—';
  return (
    <>
      <header className="content-header">
        <div>
          <span className="section-label">Этап 1 · Фундамент</span>
          <h1>Панель управления</h1>
          <p>Защищённая рабочая область сотрудников Pro Dessert.</p>
        </div>
        <span className="role-badge">
          <KeyRound aria-hidden="true" size={16} />
          {roles}
        </span>
      </header>
      <section className="dashboard-grid" aria-label="Состояние фундамента">
        {cards.map(({ icon: Icon, title, text }) => (
          <article className="dashboard-card" key={title}>
            <span className="icon-box">
              <Icon aria-hidden="true" size={22} />
            </span>
            <h2>{title}</h2>
            <p>{text}</p>
          </article>
        ))}
      </section>
      <section className="foundation-note">
        <h2>Что доступно сейчас</h2>
        <p>Вход, проверка сессии и ролей, защищённый dashboard и безопасный выход.</p>
      </section>
    </>
  );
}
