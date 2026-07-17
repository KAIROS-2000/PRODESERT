import { ShieldCheck } from 'lucide-react';
import type { ReactNode } from 'react';

type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  footer: ReactNode;
};

export function AuthShell({ eyebrow, title, description, children, footer }: AuthShellProps) {
  return (
    <section className="auth-section" aria-labelledby="auth-title">
      <div className="shell auth-grid">
        <aside className="auth-aside" aria-label="О сервисе Pro Dessert">
          <span className="eyebrow eyebrow--light">
            <ShieldCheck aria-hidden="true" size={16} /> Защищённый профиль
          </span>
          <h2>Заказы и статусы всегда под рукой</h2>
          <p>
            Профиль помогает следить за подготовкой заказа, сохранять данные и быстрее повторять
            закупки.
          </p>
          <div className="auth-aside__pickup">
            <strong>Самовывоз</strong>
            <span>Оренбург, Липовая улица, 20</span>
          </div>
        </aside>

        <div className="auth-card">
          <div className="auth-heading">
            <span className="eyebrow">{eyebrow}</span>
            <h1 id="auth-title">{title}</h1>
            <p>{description}</p>
          </div>
          {children}
          <div className="auth-footer">{footer}</div>
        </div>
      </div>
    </section>
  );
}
