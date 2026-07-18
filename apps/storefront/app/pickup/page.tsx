import { BellRing, Clock3, MapPin, PackageCheck, Phone, Route, Store } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import styles from '@/components/checkout/order-flow.module.css';

export const metadata: Metadata = {
  title: 'Самовывоз из Pro Dessert',
  description: 'Адрес и правила самовывоза заказов Pro Dessert: Оренбург, Липовая улица, 20.',
};

const routeUrl =
  'https://yandex.ru/maps/?text=%D0%9E%D1%80%D0%B5%D0%BD%D0%B1%D1%83%D1%80%D0%B3%2C%20%D0%9B%D0%B8%D0%BF%D0%BE%D0%B2%D0%B0%D1%8F%20%D1%83%D0%BB%D0%B8%D1%86%D0%B0%2C%2020';
const mapEmbedUrl =
  'https://www.openstreetmap.org/export/embed.html?bbox=55.1510%2C51.8220%2C55.1670%2C51.8310&layer=mapnik&marker=51.826626%2C55.159075';

export default function PickupPage() {
  return (
    <div className={`${styles.page} shell`}>
      <header className={styles.pickupHero}>
        <p className={styles.eyebrow}>
          <Store aria-hidden="true" size={16} /> Единственный способ получения
        </p>
        <h1>Самовывоз из Pro Dessert</h1>
        <p>Забрать заказ можно только после отдельного уведомления «Заказ готов к самовывозу».</p>
      </header>

      <div className={styles.pickupLayout}>
        <div className={styles.pickupStack}>
          <section className={styles.pickupCard} aria-labelledby="pickup-address-title">
            <div className={styles.sectionHeading}>
              <MapPin aria-hidden="true" size={22} />
              <div>
                <h2 id="pickup-address-title">Адрес магазина</h2>
                <p>Точка получения заказов Pro Dessert</p>
              </div>
            </div>
            <div className={styles.addressBlock}>
              <Store aria-hidden="true" size={24} />
              <div>
                <strong>Магазин Pro Dessert</strong>
                <span>Россия, Оренбург, Липовая улица, 20</span>
              </div>
            </div>
            <div className={styles.mapFrame}>
              <iframe
                title="Карта самовывоза Pro Dessert, Оренбург, Липовая улица, 20"
                src={mapEmbedUrl}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            </div>
            <div className={styles.actions}>
              <a
                className="button button--primary"
                href={routeUrl}
                target="_blank"
                rel="noreferrer"
              >
                <Route aria-hidden="true" size={18} /> Построить маршрут
              </a>
            </div>
          </section>

          <section className={styles.pickupCard} aria-labelledby="pickup-rules-title">
            <div className={styles.sectionHeading}>
              <PackageCheck aria-hidden="true" size={22} />
              <div>
                <h2 id="pickup-rules-title">Как получить заказ</h2>
                <p>Короткие правила выдачи в магазине</p>
              </div>
            </div>
            <ol className={styles.rulesList}>
              <li>
                <BellRing aria-hidden="true" size={21} />
                <div>
                  <strong>Дождитесь уведомления о готовности</strong>
                  <span>Создание или оплата заказа ещё не означают, что он собран.</span>
                </div>
              </li>
              <li>
                <PackageCheck aria-hidden="true" size={21} />
                <div>
                  <strong>Назовите имя и номер заказа</strong>
                  <span>Номер указан на странице статуса и в сообщениях по заказу.</span>
                </div>
              </li>
              <li>
                <Clock3 aria-hidden="true" size={21} />
                <div>
                  <strong>Учитывайте срок хранения</strong>
                  <span>Точный срок хранения готового заказа сообщим в уведомлении.</span>
                </div>
              </li>
            </ol>
          </section>
        </div>

        <aside className={styles.pickupStack} aria-label="Информация для самовывоза">
          <section className={styles.pickupCard}>
            <h2>Контакты и время работы</h2>
            <dl className={styles.unknownList}>
              <div>
                <dt>
                  <Clock3 aria-hidden="true" size={14} /> Режим работы
                </dt>
                <dd>Пока не опубликован</dd>
              </div>
              <div>
                <dt>
                  <Phone aria-hidden="true" size={14} /> Телефон магазина
                </dt>
                <dd>Пока не опубликован</dd>
              </div>
              <div>
                <dt>Статус готовности</dt>
                <dd>Проверяйте на странице своего заказа</dd>
              </div>
            </dl>
          </section>

          <section className={styles.pickupCard}>
            <h2>Ещё не оформили заказ?</h2>
            <p>Выберите профессиональные ингредиенты, инструменты и упаковку в каталоге.</p>
            <div className={styles.actions}>
              <Link className="button button--secondary" href="/catalog">
                Перейти в каталог
              </Link>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
