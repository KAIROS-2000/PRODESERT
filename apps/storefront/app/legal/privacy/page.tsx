import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Шаблон политики обработки персональных данных',
  alternates: { canonical: '/legal/privacy' },
  robots: { index: false, follow: true },
};

export default function PrivacyTemplatePage() {
  return (
    <article
      className="shell information-page information-page--article"
      aria-labelledby="privacy-title"
    >
      <header className="information-page__header">
        <p className="eyebrow">Юридический шаблон</p>
        <h1 id="privacy-title">Политика обработки персональных данных</h1>
      </header>
      <div className="information-page__notice" role="status">
        Это не готовый юридический документ и не публичная политика. Перед публикацией требуется
        проверка юристом, бухгалтером, специалистом по ККТ и владельцем магазина.
      </div>
      <div className="information-page__article">
        <h2>Структура для согласования</h2>
        <p>
          В утверждённой версии должны быть указаны оператор данных, цели и правовые основания
          обработки, состав данных, сроки хранения, получатели, меры защиты, права субъекта и
          контакт для обращений.
        </p>
        <p>
          До согласования используются только данные, необходимые для оформления заказа и
          самовывоза; фактические правила обработки определяются утверждённым документом владельца.
        </p>
      </div>
    </article>
  );
}
