import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Контакты и самовывоз',
  description: 'Точка самовывоза Pro Dessert: Оренбург, Липовая улица, 20.',
  alternates: { canonical: '/contacts' },
};

export default function ContactsPage() {
  return (
    <article
      className="shell information-page information-page--article"
      aria-labelledby="contacts-title"
    >
      <header className="information-page__header">
        <p className="eyebrow">Контакты</p>
        <h1 id="contacts-title">Точка самовывоза Pro Dessert</h1>
        <p>Россия, Оренбург, Липовая улица, 20.</p>
      </header>
      <div className="information-page__article">
        <p>
          Режим работы и телефон публикуются только после подтверждения владельцем магазина. Не
          приезжайте за заказом до уведомления «Заказ готов к самовывозу».
        </p>
      </div>
      <Link className="button button--primary" href="/pickup">
        О правилах самовывоза
      </Link>
    </article>
  );
}
