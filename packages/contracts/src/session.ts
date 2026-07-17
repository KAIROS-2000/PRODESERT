import type { Role } from './access.js';

export interface SessionUser {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
}

export interface PublicSession {
  readonly user: SessionUser;
  readonly session: {
    readonly id: string;
    readonly expiresAt: string;
  };
}

export interface AnonymousSession {
  readonly user: null;
  readonly session: null;
}

export type Session = PublicSession | AnonymousSession;

export interface SessionListItem {
  readonly id: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly lastSeenAt: string;
  readonly deviceLabel: string;
  readonly current: boolean;
}
