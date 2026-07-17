import { PackageX } from 'lucide-react';
import Link from 'next/link';

export default function ProductNotFound() {
  return (
    <div className="state-page">
      <div className="state-card">
        <PackageX aria-hidden="true" size={42} />
        <span className="eyebrow">404</span>
        <h1>Товар не найден</h1>
        <p>Возможно, позиция больше не активна или адрес изменился.</p>
        <Link className="button button--primary" href="/catalog">
          Перейти в каталог
        </Link>
      </div>
    </div>
  );
}
