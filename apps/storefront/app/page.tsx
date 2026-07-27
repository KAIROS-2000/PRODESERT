import {
  CheckCircle2,
  Clock3,
  MapPinned,
  PackageCheck,
  SearchCheck,
  Sparkles,
  Warehouse,
} from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { getBanners } from '@/lib/content-api';

const benefits = [
  {
    icon: SearchCheck,
    title: 'Профессиональный ассортимент',
    text: 'Ингредиенты, формы, инструменты и расходные материалы в одном магазине.',
  },
  {
    icon: Warehouse,
    title: 'Проверка наличия',
    text: 'Перед оплатой магазин подтверждает позиции и фиксирует резерв.',
  },
  {
    icon: PackageCheck,
    title: 'Понятный самовывоз',
    text: 'Получение в магазине только после уведомления о готовности заказа.',
  },
] as const;

const steps = [
  'Подберите нужные позиции и оформите заказ онлайн.',
  'Дождитесь подтверждения наличия от магазина.',
  'Получите реквизиты и выполните банковский перевод.',
  'Заберите собранный заказ после уведомления о готовности.',
] as const;

const featuredCategories = [
  {
    href: '/catalog/ingredients',
    title: 'Ингредиенты',
    text: 'Желирующие агенты, пасты, сиропы и профессиональные смеси.',
    image: '/images/catalog/pro-ingredients.webp',
  },
  {
    href: '/catalog/chocolate-cocoa',
    title: 'Шоколад и какао',
    text: 'Кувертюр, какао-продукты и точные фасовки для производства.',
    image: '/images/catalog/chocolate-couverture.webp',
  },
  {
    href: '/catalog/molds',
    title: 'Формы и молды',
    text: 'Силиконовые формы, кольца и инвентарь для стабильного результата.',
    image: '/images/catalog/molds-tools.webp',
  },
  {
    href: '/catalog/packaging',
    title: 'Упаковка',
    text: 'Коробки, подложки и расходные материалы для аккуратной выдачи.',
    image: '/images/catalog/pastry-packaging.webp',
  },
] as const;

export default async function HomePage() {
  const banners = await getBanners().catch(() => []);
  return (
    <>
      {banners.length > 0 ? (
        <section className="shell home-banner-list" aria-label="Актуальные объявления">
          {banners.slice(0, 2).map((banner) => (
            <Link className="home-banner" href={banner.linkUrl ?? '/catalog'} key={banner.id}>
              {banner.imageUrl ? (
                <Image
                  alt={banner.imageAlt ?? banner.title}
                  fill
                  sizes="(max-width: 760px) 100vw, 1180px"
                  src={banner.imageUrl}
                  unoptimized={/^https?:\/\//.test(banner.imageUrl)}
                />
              ) : null}
              <span className="home-banner__content">
                <strong>{banner.title}</strong>
                {banner.body ? <span>{banner.body}</span> : null}
              </span>
            </Link>
          ))}
        </section>
      ) : null}
      <section className="hero" aria-labelledby="hero-title">
        <div className="shell hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">
              <Sparkles aria-hidden="true" size={16} /> Магазин для кондитеров
            </span>
            <h1 id="hero-title">Ингредиенты, упаковка и инвентарь для кондитеров</h1>
            <p className="hero-lead">
              Профессиональные товары для домашних кондитеров, студий и небольших производств в
              Оренбурге.
            </p>
            <p className="hero-pickup">
              <MapPinned aria-hidden="true" size={20} />
              Оформите заказ онлайн и заберите его в магазине на Липовой улице, 20.
            </p>
            <div className="hero-actions">
              <Link className="button button--primary" href="/catalog">
                Открыть каталог
              </Link>
              <Link className="button button--secondary" href="/search">
                Найти товар
              </Link>
            </div>
          </div>

          <figure className="hero-visual">
            <Image
              alt="Ингредиенты, упаковка и профессиональный инвентарь для кондитеров"
              fill
              priority
              sizes="(max-width: 900px) 100vw, 44vw"
              src="/images/catalog/pro-dessert-hero.webp"
            />
            <figcaption>
              <strong>Всё для точного результата</strong>
              <span>Профессиональный ассортимент · Оренбург</span>
            </figcaption>
          </figure>
        </div>
      </section>

      <section className="category-preview" aria-labelledby="category-preview-title">
        <div className="shell">
          <div className="section-heading section-heading--split">
            <div>
              <span className="eyebrow">Быстрый вход в ассортимент</span>
              <h2 id="category-preview-title">Категории для профессиональной работы</h2>
            </div>
            <Link className="text-link" href="/catalog">
              Все категории <span aria-hidden="true">→</span>
            </Link>
          </div>
          <div className="category-preview__grid">
            {featuredCategories.map((category) => (
              <Link className="category-preview__card" href={category.href} key={category.href}>
                <span className="category-preview__image">
                  <Image
                    alt=""
                    fill
                    sizes="(max-width: 600px) 100vw, (max-width: 1000px) 50vw, 25vw"
                    src={category.image}
                  />
                </span>
                <span className="category-preview__copy">
                  <strong>{category.title}</strong>
                  <span>{category.text}</span>
                </span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="benefits" aria-labelledby="benefits-title">
        <div className="shell">
          <div className="section-heading">
            <span className="eyebrow">Без лишних шагов</span>
            <h2 id="benefits-title">Снабжение для работы и творчества</h2>
          </div>
          <div className="benefit-grid">
            {benefits.map(({ icon: Icon, title, text }) => (
              <article className="benefit-card" key={title}>
                <span className="icon-tile">
                  <Icon aria-hidden="true" size={24} />
                </span>
                <h3>{title}</h3>
                <p>{text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="process-section" id="how-it-works" aria-labelledby="process-title">
        <div className="shell process-grid">
          <div className="section-heading section-heading--left">
            <span className="eyebrow">Контролируемый процесс</span>
            <h2 id="process-title">От заявки до готового заказа</h2>
            <p>
              Наличие подтверждается до оплаты. Так заказ остаётся понятным и для покупателя, и для
              сотрудников магазина.
            </p>
            <Link className="text-link" href="/login">
              Войти в профиль <span aria-hidden="true">→</span>
            </Link>
          </div>
          <ol className="step-list">
            {steps.map((step, index) => (
              <li key={step}>
                <span className="step-number">{String(index + 1).padStart(2, '0')}</span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="about-section" id="about" aria-labelledby="about-title">
        <div className="shell about-grid">
          <div className="about-panel">
            <span className="icon-tile icon-tile--large">
              <CheckCircle2 aria-hidden="true" size={30} />
            </span>
            <div>
              <span className="eyebrow">Pro Dessert</span>
              <h2 id="about-title">Не витрина готовых десертов, а магазин снабжения</h2>
              <p>
                Мы проектируем сервис вокруг задач домашних и профессиональных кондитеров: точного
                поиска, понятных характеристик и повторных закупок.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="pickup-section" id="pickup" aria-labelledby="pickup-title">
        <div className="shell pickup-card">
          <div>
            <span className="eyebrow">
              <MapPinned aria-hidden="true" size={16} /> Точка получения
            </span>
            <h2 id="pickup-title">Самовывоз из магазина Pro Dessert</h2>
            <p className="pickup-address">Оренбург, Липовая улица, 20</p>
            <p>Приезжайте после уведомления «Заказ готов к самовывозу» и назовите номер заказа.</p>
          </div>
          <div className="pickup-notice">
            <Clock3 aria-hidden="true" size={24} />
            <div>
              <strong>Важно</strong>
              <span>Оформление или оплата ещё не означают, что заказ собран.</span>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
