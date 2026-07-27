import type { Metadata } from 'next';
import Link from 'next/link';

import { getPublishedContentPage } from '@/lib/content-api';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Возврат и обмен',
  description:
    'Информация Pro Dessert о возврате и обмене требует подтверждения владельцем магазина.',
  alternates: { canonical: '/returns' },
  robots: { index: false, follow: true },
};

const fallbackBody =
  'Условия возврата и обмена зависят от категории товара, документов и подтверждённой политики магазина. До юридической проверки эта страница не содержит окончательных условий. Свяжитесь с магазином, указав номер заказа и описание ситуации.';

export default async function ReturnsPage() {
  const content = await getPublishedContentPage('returns').catch(() => null);
  const title = content?.title ?? 'Возврат и обмен';
  const body = content?.body ?? fallbackBody;

  return (
    <article
      className="shell information-page information-page--article"
      aria-labelledby="returns-title"
    >
      <header className="information-page__header">
        <p className="eyebrow">Информация для покупателей</p>
        <h1 id="returns-title">{title}</h1>
      </header>
      <div className="information-page__notice" role="status">
        Это редактируемая заготовка. Перед публикацией окончательных условий текст должен проверить
        юрист, бухгалтер, специалист по ККТ и владелец магазина.
      </div>
      <div className="information-page__article">
        {body.split(/\n{2,}/).map((paragraph, index) => (
          <p key={`${index}-${paragraph.slice(0, 24)}`}>{paragraph}</p>
        ))}
      </div>
      <Link className="button button--secondary" href="/contacts">
        Связаться с магазином
      </Link>
    </article>
  );
}
