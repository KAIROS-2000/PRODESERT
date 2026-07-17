import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Управление', template: '%s · Pro Dessert Admin' },
  robots: { index: false, follow: false },
};

export default function AdminRootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="ru">
      <body>
        <a className="skip-link" href="#admin-content">
          Перейти к содержимому
        </a>
        {children}
      </body>
    </html>
  );
}
