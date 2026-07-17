import { MapPin, Menu, UserRound } from 'lucide-react';
import Link from 'next/link';

import { SearchAutocomplete } from '@/components/catalog/search-autocomplete';

const navigation = [
  { href: '/catalog', label: 'Каталог' },
  { href: '/#about', label: 'О магазине' },
  { href: '/#pickup', label: 'Самовывоз' },
] as const;

export function SiteHeader() {
  return (
    <header className="site-header">
      <div className="pickup-strip">
        <div className="shell pickup-strip__content">
          <MapPin aria-hidden="true" size={16} strokeWidth={2} />
          <span>Самовывоз: Оренбург, Липовая улица, 20</span>
        </div>
      </div>
      <div className="shell header-row">
        <Link className="brand" href="/" aria-label="Pro Dessert — на главную">
          <span className="brand__mark" aria-hidden="true">
            PD
          </span>
          <span className="brand__text">
            <strong>Pro Dessert</strong>
            <small>товары для кондитеров</small>
          </span>
        </Link>

        <SearchAutocomplete compact />

        <nav className="desktop-nav" aria-label="Основная навигация">
          {navigation.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="header-actions">
          <Link className="button button--quiet desktop-account" href="/login">
            <UserRound aria-hidden="true" size={18} />
            Войти
          </Link>
          <details className="mobile-menu">
            <summary aria-label="Открыть меню">
              <Menu aria-hidden="true" size={22} />
              <span>Меню</span>
            </summary>
            <nav aria-label="Мобильная навигация">
              {navigation.map((item) => (
                <Link key={item.href} href={item.href}>
                  {item.label}
                </Link>
              ))}
              <Link href="/login">Войти в профиль</Link>
              <Link href="/register">Создать профиль</Link>
            </nav>
          </details>
        </div>
      </div>
    </header>
  );
}
