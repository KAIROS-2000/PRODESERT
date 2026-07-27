import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { CartProvider } from '@/components/cart/cart-provider';
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { organizationAndLocalBusinessJsonLd, StructuredData } from '@/components/structured-data';
import { AnalyticsProvider } from '@/components/analytics/analytics-provider';

import './globals.css';
import './catalog.css';
import './cart.css';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  title: {
    default: 'Pro Dessert — товары для кондитеров в Оренбурге',
    template: '%s · Pro Dessert',
  },
  description:
    'Профессиональные ингредиенты, упаковка и инвентарь для домашних кондитеров, студий и небольших производств в Оренбурге.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: '/',
    siteName: 'Pro Dessert',
    title: 'Pro Dessert — товары для кондитеров в Оренбурге',
    description:
      'Профессиональные ингредиенты, упаковка и инвентарь для кондитеров с самовывозом в Оренбурге.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Pro Dessert — товары для кондитеров в Оренбурге',
    description: 'Ингредиенты, кондитерский инвентарь и упаковка с самовывозом.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
};

export const viewport: Viewport = {
  colorScheme: 'light',
  themeColor: '#fffaf6',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <StructuredData data={organizationAndLocalBusinessJsonLd()} />
        <AnalyticsProvider>
          <CartProvider>
            <a className="skip-link" href="#main-content">
              Перейти к содержимому
            </a>
            <SiteHeader />
            <main id="main-content">{children}</main>
            <SiteFooter />
          </CartProvider>
        </AnalyticsProvider>
      </body>
    </html>
  );
}
