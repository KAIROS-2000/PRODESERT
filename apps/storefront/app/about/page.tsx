import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'О магазине',
  description:
    'Pro Dessert — магазин профессиональных ингредиентов, упаковки и инвентаря для кондитеров в Оренбурге.',
  alternates: { canonical: '/about' },
};

export default function AboutPage() {
  return (
    <article
      className="shell information-page information-page--article"
      aria-labelledby="about-title"
    >
      <header className="information-page__header">
        <p className="eyebrow">О Pro Dessert</p>
        <h1 id="about-title">Магазин для задач кондитера</h1>
        <p>
          Pro Dessert собирает ингредиенты, кондитерский инвентарь и упаковку для домашних
          кондитеров, студий и небольших производств в Оренбурге.
        </p>
      </header>
      <div className="information-page__article">
        <h2>Как устроен сервис</h2>
        <p>
          Каталог помогает подобрать товар по назначению, характеристикам и фасовке. Актуальность
          цены и остатка подтверждается при оформлении заказа.
        </p>
        <h2>Получение заказа</h2>
        <p>
          В первой версии доступен только самовывоз. После проверки наличия и подготовки заказа
          покупатель получает уведомление о готовности.
        </p>
      </div>
      <Link className="button button--primary" href="/catalog">
        Открыть каталог
      </Link>
    </article>
  );
}
