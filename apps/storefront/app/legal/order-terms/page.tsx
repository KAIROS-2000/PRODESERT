import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Шаблон условий заказа',
  alternates: { canonical: '/legal/order-terms' },
  robots: { index: false, follow: true },
};

export default function OrderTermsTemplatePage() {
  return (
    <article
      className="shell information-page information-page--article"
      aria-labelledby="terms-title"
    >
      <header className="information-page__header">
        <p className="eyebrow">Юридический шаблон</p>
        <h1 id="terms-title">Условия оформления и получения заказа</h1>
      </header>
      <div className="information-page__notice" role="status">
        Это не готовая оферта и не окончательные условия продажи. Перед публикацией текст должны
        подтвердить юрист, бухгалтер, специалист по ККТ и владелец магазина.
      </div>
      <div className="information-page__article">
        <h2>Структура для согласования</h2>
        <p>
          Финальная версия должна описывать заказ, подтверждение наличия, банковский перевод,
          самовывоз, уведомление о готовности, возвраты, кассовые документы и порядок обращений.
        </p>
        <p>
          До утверждения сервис сообщает только проверяемые факты: доставка не предлагается,
          реквизиты появляются после резерва, а чек сам по себе не подтверждает поступление оплаты.
        </p>
      </div>
    </article>
  );
}
