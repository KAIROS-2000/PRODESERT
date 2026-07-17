import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Демонстрационная декларация товара',
  description: 'Пример представления документа о товаре в каталоге Pro Dessert.',
  robots: { index: false, follow: false },
};

export default function DemoDeclarationPage() {
  return (
    <div className="document-page">
      <article className="shell document-sheet">
        <nav aria-label="Хлебные крошки" className="document-breadcrumbs">
          <Link href="/catalog">Каталог</Link>
          <span aria-hidden="true">/</span>
          <span>Документ о товаре</span>
        </nav>

        <span className="document-label">Демонстрационный документ</span>
        <h1>Пример декларации соответствия</h1>
        <p className="document-lead">
          Эта страница показывает, как в карточке товара будут открываться сертификаты, декларации и
          спецификации. Она не является юридически значимым документом.
        </p>

        <dl className="document-details">
          <div>
            <dt>Статус</dt>
            <dd>Демонстрационный образец</dd>
          </div>
          <div>
            <dt>Область применения</dt>
            <dd>Тестовые данные каталога Pro Dessert</dd>
          </div>
          <div>
            <dt>Проверка оригинала</dt>
            <dd>Для реального товара — по номеру и реестру, указанным производителем</dd>
          </div>
        </dl>

        <aside className="document-notice">
          Перед покупкой и применением реального товара сверяйте маркировку, состав, срок годности и
          документы производителя. Актуальный файл будет привязан к конкретной партии после
          настройки обмена с 1С и хранилища документов.
        </aside>

        <Link className="button button--secondary" href="/catalog">
          Вернуться в каталог
        </Link>
      </article>
    </div>
  );
}
