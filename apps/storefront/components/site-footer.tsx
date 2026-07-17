import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="shell footer-grid">
        <div>
          <Link className="brand brand--footer" href="/">
            <span className="brand__mark" aria-hidden="true">
              PD
            </span>
            <span className="brand__text">
              <strong>Pro Dessert</strong>
            </span>
          </Link>
          <p className="footer-copy">
            Профессиональные ингредиенты, упаковка и инвентарь для кондитеров.
          </p>
        </div>
        <div>
          <h2 className="footer-title">Покупателям</h2>
          <ul className="footer-links">
            <li>
              <Link href="/catalog">Каталог</Link>
            </li>
            <li>
              <Link href="/#how-it-works">Как оформить заказ</Link>
            </li>
            <li>
              <Link href="/#pickup">Самовывоз</Link>
            </li>
            <li>
              <Link href="/login">Вход</Link>
            </li>
            <li>
              <Link href="/register">Регистрация</Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="footer-title">Магазин</h2>
          <address className="footer-address">
            Россия, Оренбург
            <br />
            Липовая улица, 20
          </address>
          <p className="footer-note">Забрать заказ можно после уведомления о готовности.</p>
        </div>
      </div>
      <div className="shell footer-bottom">
        <span>© {new Date().getFullYear()} Pro Dessert</span>
        <span>Информация о графике и контактах публикуется после подтверждения владельцем.</span>
      </div>
    </footer>
  );
}
