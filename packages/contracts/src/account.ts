export interface AccountProfile {
  readonly id: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly firstName: string | null;
  readonly lastName: string | null;
  readonly phone: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface UpdateAccountProfileInput {
  readonly expectedVersion: number;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly phone?: string | null;
}

export interface RequestEmailChangeInput {
  readonly newEmail: string;
  readonly expectedVersion: number;
}

export interface ConfirmEmailChangeInput {
  readonly token: string;
}

export interface ChangePasswordInput {
  readonly currentPassword: string;
  readonly newPassword: string;
  readonly expectedVersion: number;
}

export interface AccountOrganization {
  readonly id: string;
  readonly name: string;
  readonly inn: string;
  readonly kpp: string | null;
  readonly version: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface CreateOrganizationInput {
  readonly name: string;
  readonly inn: string;
  readonly kpp?: string | null;
}

export interface UpdateOrganizationInput {
  readonly expectedVersion: number;
  readonly name?: string;
  readonly inn?: string;
  readonly kpp?: string | null;
}

export interface AccountNotificationPreferences {
  readonly orderUpdates: boolean;
  readonly paymentUpdates: boolean;
  readonly reservationReminders: boolean;
  readonly marketingEmails: boolean;
  readonly version: number;
  readonly updatedAt: string | null;
}

export interface UpdateNotificationPreferencesInput {
  readonly expectedVersion: number;
  readonly orderUpdates?: boolean;
  readonly paymentUpdates?: boolean;
  readonly reservationReminders?: boolean;
  readonly marketingEmails?: boolean;
}

export interface AccountSession {
  readonly id: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly lastSeenAt: string;
  readonly deviceLabel: string;
  readonly current: boolean;
}

export interface SessionRevocationResult {
  readonly revoked: boolean;
  readonly currentSessionRevoked: boolean;
}

export interface BulkSessionRevocationResult {
  readonly revokedCount: number;
}
