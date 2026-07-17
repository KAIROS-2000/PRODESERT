import 'server-only';

import { cookies } from 'next/headers';

export const STAFF_ROLES = ['MANAGER', 'CONTENT_MANAGER', 'ADMIN'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export type AdminUser = {
  id: string;
  email: string;
  roles: readonly string[];
};

export type SessionCheck =
  | { status: 'authenticated'; user: AdminUser }
  | { status: 'unauthenticated' }
  | { status: 'unavailable' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeUser(payload: unknown): AdminUser | null {
  if (!isRecord(payload)) return null;
  const candidate = isRecord(payload.user) ? payload.user : payload;
  if (typeof candidate.id !== 'string' || typeof candidate.email !== 'string') return null;
  const rawRoles = Array.isArray(candidate.roles)
    ? candidate.roles
    : typeof candidate.role === 'string'
      ? [candidate.role]
      : [];
  const roles = rawRoles.filter((role): role is string => typeof role === 'string');
  return { id: candidate.id, email: candidate.email, roles };
}

export function hasStaffRole(user: AdminUser): boolean {
  return user.roles.some((role) => (STAFF_ROLES as readonly string[]).includes(role));
}

export async function getAdminSession(): Promise<SessionCheck> {
  const cookieStore = await cookies();
  try {
    const response = await fetch(
      `${process.env.API_INTERNAL_URL ?? 'http://localhost:4000'}/api/v1/auth/session`,
      {
        method: 'GET',
        cache: 'no-store',
        headers: { Accept: 'application/json', Cookie: cookieStore.toString() },
      },
    );
    if (response.status === 401 || response.status === 403) return { status: 'unauthenticated' };
    if (!response.ok) return { status: 'unavailable' };
    const user = normalizeUser(await response.json());
    return user ? { status: 'authenticated', user } : { status: 'unauthenticated' };
  } catch {
    return { status: 'unavailable' };
  }
}
