import { FolderSearch2 } from 'lucide-react';
import Link from 'next/link';

export default function CategoryNotFound() {
  return (
    <div className="state-page">
      <div className="state-card">
        <FolderSearch2 aria-hidden="true" size={42} />
        <span className="eyebrow">404</span>
        <h1>Категория не найдена</h1>
        <p>Возможно, раздел был переименован. Актуальный ассортимент собран в каталоге.</p>
        <Link className="button button--primary" href="/catalog">
          Открыть каталог
        </Link>
      </div>
    </div>
  );
}
