'use client';

import {
  Boxes,
  ClipboardList,
  FileText,
  History,
  LayoutDashboard,
  Megaphone,
  ReceiptText,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ComponentType } from 'react';
import type { StaffRole } from '@/lib/session';

type NavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ size?: number; 'aria-hidden'?: boolean }>;
  roles: readonly StaffRole[];
};

const items: readonly NavItem[] = [
  { href: '/', label: 'Обзор', icon: LayoutDashboard, roles: ['MANAGER', 'ADMIN'] },
  { href: '/orders', label: 'Заказы', icon: ClipboardList, roles: ['MANAGER', 'ADMIN'] },
  { href: '/payments', label: 'Оплаты', icon: ReceiptText, roles: ['MANAGER', 'ADMIN'] },
  { href: '/reservations', label: 'Резервы', icon: Boxes, roles: ['MANAGER', 'ADMIN'] },
  { href: '/catalog', label: 'Каталог', icon: FileText, roles: ['CONTENT_MANAGER', 'ADMIN'] },
  { href: '/promotions', label: 'Акции', icon: Megaphone, roles: ['CONTENT_MANAGER', 'ADMIN'] },
  { href: '/content', label: 'Контент', icon: FileText, roles: ['CONTENT_MANAGER', 'ADMIN'] },
  { href: '/integration', label: 'Интеграция', icon: RefreshCw, roles: ['ADMIN'] },
  { href: '/audit', label: 'Аудит', icon: History, roles: ['ADMIN'] },
];

export function AdminNavigation({ roles }: { roles: readonly string[] }) {
  const pathname = usePathname();
  const allowed = items.filter((item) => item.roles.some((role) => roles.includes(role)));
  return (
    <nav aria-label="Разделы панели">
      {allowed.map((item) => {
        const Icon = item.icon;
        const active =
          item.href === '/'
            ? pathname === '/admin' || pathname === '/admin/'
            : pathname.startsWith(`/admin${item.href}`);
        return (
          <Link
            className={`nav-link${active ? ' nav-link--active' : ''}`}
            href={item.href}
            key={item.href}
          >
            <Icon aria-hidden size={19} />
            {item.label}
          </Link>
        );
      })}
      {roles.includes('ADMIN') ? (
        <span className="nav-security">
          <ShieldCheck aria-hidden size={15} /> Доступы проверяются сервером
        </span>
      ) : null}
    </nav>
  );
}
