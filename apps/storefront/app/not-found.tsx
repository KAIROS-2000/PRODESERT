import Link from 'next/link';

export default function NotFound() {
  return (
    <section className="shell technical-state" aria-labelledby="not-found-title">
      <p className="eyebrow">404</p>
      <h1 id="not-found-title">Страница не найдена</h1>
      <p>Проверьте адрес или вернитесь в каталог профессиональных товаров для кондитеров.</p>
      <div className="technical-state__actions">
        <Link className="button button--primary" href="/catalog">
          Открыть каталог
        </Link>
        <Link className="button button--secondary" href="/">
          На главную
        </Link>
      </div>
    </section>
  );
}
