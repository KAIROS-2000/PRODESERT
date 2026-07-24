import {
  AlertTriangle,
  Banknote,
  Clock3,
  FileCheck2,
  PackageCheck,
  ReceiptText,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import styles from '@/components/checkout/order-flow.module.css';

export const metadata: Metadata = {
  title: 'Оплата заказа банковским переводом',
  description:
    'Как проходит оплата заказа Pro Dessert банковским переводом после подтверждения наличия и резерва.',
};

export default function PaymentPage() {
  return (
    <div className={`${styles.page} shell`}>
      <header className={styles.pickupHero}>
        <p className={styles.eyebrow}>
          <Banknote aria-hidden="true" size={16} /> Оплата на расчётный счёт
        </p>
        <h1>Банковский перевод после подтверждения наличия</h1>
        <p>
          Реквизиты появляются только в защищённой карточке заказа после проверки остатков, создания
          резерва и публикации менеджером.
        </p>
      </header>

      <div className={styles.pickupLayout}>
        <section className={styles.pickupCard} aria-labelledby="payment-process-title">
          <div className={styles.sectionHeading}>
            <ReceiptText aria-hidden="true" size={22} />
            <div>
              <h2 id="payment-process-title">Как проходит оплата</h2>
              <p>Последовательность защищает от перевода за отсутствующий товар</p>
            </div>
          </div>
          <ol className={styles.rulesList}>
            <li>
              <PackageCheck aria-hidden="true" size={21} />
              <div>
                <strong>Магазин подтверждает наличие в 1С</strong>
                <span>До этого этапа реквизиты не показываются.</span>
              </div>
            </li>
            <li>
              <Clock3 aria-hidden="true" size={21} />
              <div>
                <strong>Товары резервируются на ограниченный срок</strong>
                <span>Точный дедлайн указан рядом с реквизитами на странице заказа.</span>
              </div>
            </li>
            <li>
              <Banknote aria-hidden="true" size={21} />
              <div>
                <strong>Клиент переводит точную сумму на расчётный счёт</strong>
                <span>В назначении платежа обязательно указывается номер заказа.</span>
              </div>
            </li>
            <li>
              <FileCheck2 aria-hidden="true" size={21} />
              <div>
                <strong>Менеджер сверяет поступление</strong>
                <span>Заказ считается оплаченным только после отдельного подтверждения.</span>
              </div>
            </li>
          </ol>
        </section>

        <aside className={styles.pickupStack}>
          <section className={styles.pickupCard}>
            <div className={styles.warningBox}>
              <AlertTriangle aria-hidden="true" size={20} />
              <span>
                Приложенный чек или номер операции не подтверждают оплату автоматически. Дождитесь
                статуса «Оплата подтверждена».
              </span>
            </div>
          </section>
          <section className={styles.pickupCard}>
            <h2>Счёт для организации</h2>
            <p>
              Если при оформлении указаны название, ИНН и при необходимости КПП, после публикации
              реквизитов станет доступен PDF-счёт.
            </p>
          </section>
          <section className={styles.pickupCard}>
            <h2>Готовы оформить заказ?</h2>
            <p>Выберите товары, затем укажите данные для самовывоза.</p>
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
