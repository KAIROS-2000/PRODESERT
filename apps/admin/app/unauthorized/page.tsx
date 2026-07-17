import { ShieldX } from 'lucide-react';
import Link from 'next/link';

export default function UnauthorizedPage() {
  return (
    <main id="admin-content" className="state-page">
      <section className="state-card">
        <span className="icon-box icon-box--danger">
          <ShieldX aria-hidden="true" size={26} />
        </span>
        <h1>Нет доступа к панели</h1>
        <p>Нужна роль менеджера, контент-менеджера или администратора.</p>
        <Link className="primary-button" href="/login">
          Вернуться ко входу
        </Link>
      </section>
    </main>
  );
}
