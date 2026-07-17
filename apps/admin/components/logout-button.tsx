'use client';

import { LogOut } from 'lucide-react';
import { useState } from 'react';
import { csrfFetch } from '@/lib/csrf-client';

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  async function logout() {
    setPending(true);
    try {
      await csrfFetch('/api/v1/auth/logout', {
        method: 'POST',
        cache: 'no-store',
      });
    } finally {
      window.location.assign('/admin/login');
    }
  }
  return (
    <button className="sidebar-action" type="button" onClick={logout} disabled={pending}>
      <LogOut aria-hidden="true" size={18} />
      {pending ? 'Выходим…' : 'Выйти'}
    </button>
  );
}
