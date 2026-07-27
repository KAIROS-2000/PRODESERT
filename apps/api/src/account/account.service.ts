import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Prisma,
  type AccountOrganization as OrganizationRecord,
  type NotificationPreference,
  type Role,
  type User,
} from '@prisma/client';
import type {
  AccountNotificationPreferences,
  AccountOrganization,
  AccountProfile,
  AccountSession,
  BulkSessionRevocationResult,
  SessionRevocationResult,
} from '@pro-dessert/contracts';
import { type AuthenticatedPrincipal } from '../auth/auth.types';
import { type Environment } from '../common/config/environment';
import { type ClientMetadata } from '../common/security/client-fingerprint.service';
import { JsonLogger } from '../common/logging/json-logger.service';
import { OpaqueTokenService } from '../common/security/opaque-token.service';
import { PasswordService } from '../common/security/password.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountEmailService } from './account-email.service';
import {
  type CreateOrganizationDto,
  type ChangePasswordDto,
  type RequestEmailChangeDto,
  type UpdateAccountProfileDto,
  type UpdateNotificationPreferencesDto,
  type UpdateOrganizationDto,
} from './dto/account.dto';
import { isValidInn } from './inn-validator';

const EMAIL_CHANGE_ACCEPTED = {
  message: 'Если адрес доступен, мы отправили на него ссылку для подтверждения.',
} as const;

const DEFAULT_NOTIFICATION_PREFERENCES: Omit<
  AccountNotificationPreferences,
  'version' | 'updatedAt'
> = {
  orderUpdates: true,
  paymentUpdates: true,
  reservationReminders: true,
  marketingEmails: false,
};

type ProfileRecord = Pick<
  User,
  | 'id'
  | 'email'
  | 'emailVerifiedAt'
  | 'firstName'
  | 'lastName'
  | 'phone'
  | 'version'
  | 'createdAt'
  | 'updatedAt'
>;

interface AuditActor {
  userId: string;
  role: Role;
}

@Injectable()
export class AccountService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: OpaqueTokenService,
    private readonly emails: AccountEmailService,
    private readonly logger: JsonLogger,
    private readonly config: ConfigService<Environment, true>,
    private readonly passwords: PasswordService,
  ) {}

  async getProfile(userId: string): Promise<AccountProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: this.profileSelect(),
    });
    if (!user) throw this.accountNotFound();
    return this.toProfile(user);
  }

  async updateProfile(
    principal: AuthenticatedPrincipal,
    dto: UpdateAccountProfileDto,
    context: ClientMetadata,
  ): Promise<AccountProfile> {
    const data = this.profilePatch(dto);
    const changedFields = Object.keys(data);
    if (changedFields.length === 0) {
      throw new BadRequestException({
        code: 'PROFILE_PATCH_EMPTY',
        message: 'Передайте хотя бы одно поле профиля.',
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.updateMany({
        where: { id: principal.userId, version: dto.expectedVersion },
        data: { ...data, version: { increment: 1 } },
      });
      if (updated.count !== 1) {
        await this.throwProfileVersionConflict(tx, principal.userId, dto.expectedVersion);
      }
      const user = await tx.user.findUnique({
        where: { id: principal.userId },
        select: this.profileSelect(),
      });
      if (!user) throw this.accountNotFound();
      await this.writeAudit(tx, principal, context, {
        action: 'ACCOUNT_PROFILE_UPDATED',
        entityType: 'User',
        entityId: principal.userId,
        metadata: { changedFields },
      });
      return this.toProfile(user);
    });
  }

  async requestEmailChange(
    principal: AuthenticatedPrincipal,
    dto: RequestEmailChangeDto,
    context: ClientMetadata,
  ): Promise<typeof EMAIL_CHANGE_ACCEPTED> {
    const token = this.tokens.generate();
    const newEmailNormalized = this.normalizeEmail(dto.newEmail);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.config.get('EMAIL_VERIFICATION_TTL_MINUTES', { infer: true }) * 60_000,
    );

    let shouldDeliver: boolean;
    try {
      shouldDeliver = await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({
          where: { id: principal.userId },
          select: { id: true, emailNormalized: true, version: true },
        });
        if (!user) throw this.accountNotFound();
        if (user.version !== dto.expectedVersion) {
          throw this.versionConflict('PROFILE_VERSION_CONFLICT', dto.expectedVersion, user.version);
        }

        const collision =
          user.emailNormalized === newEmailNormalized ||
          Boolean(
            await tx.user.findUnique({
              where: { emailNormalized: newEmailNormalized },
              select: { id: true },
            }),
          );
        if (collision) return false;

        await tx.emailChangeToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: now },
        });
        await tx.emailChangeToken.create({
          data: {
            userId: user.id,
            tokenHash: token.hash,
            currentEmailNormalized: user.emailNormalized,
            newEmail: newEmailNormalized,
            newEmailNormalized,
            expiresAt,
          },
        });
        await this.writeAudit(tx, principal, context, {
          action: 'ACCOUNT_EMAIL_CHANGE_REQUESTED',
          entityType: 'User',
          entityId: user.id,
        });
        return true;
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return EMAIL_CHANGE_ACCEPTED;
      }
      throw error;
    }

    if (shouldDeliver) {
      try {
        await this.emails.sendEmailChangeVerification(newEmailNormalized, token.raw);
      } catch (error: unknown) {
        this.logger.error('account_email_change_delivery_failed', error);
      }
    }
    return EMAIL_CHANGE_ACCEPTED;
  }

  async confirmEmailChange(
    principal: AuthenticatedPrincipal,
    rawToken: string,
    context: ClientMetadata,
  ): Promise<AccountProfile> {
    const tokenHash = this.tokens.hash(rawToken);
    const now = new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const token = await tx.emailChangeToken.findUnique({
          where: { tokenHash },
          include: { user: true },
        });
        if (
          !token ||
          token.userId !== principal.userId ||
          token.usedAt ||
          token.expiresAt <= now ||
          token.user.emailNormalized !== token.currentEmailNormalized ||
          !token.user.isActive
        ) {
          throw this.invalidEmailChangeToken();
        }

        const emailAlreadyUsed = await tx.user.findFirst({
          where: {
            emailNormalized: token.newEmailNormalized,
            id: { not: token.userId },
          },
          select: { id: true },
        });
        if (emailAlreadyUsed) throw this.invalidEmailChangeToken();

        const consumed = await tx.emailChangeToken.updateMany({
          where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
          data: { usedAt: now },
        });
        if (consumed.count !== 1) throw this.invalidEmailChangeToken();

        const changed = await tx.user.updateMany({
          where: {
            id: token.userId,
            emailNormalized: token.currentEmailNormalized,
          },
          data: {
            email: token.newEmail,
            emailNormalized: token.newEmailNormalized,
            emailVerifiedAt: now,
            version: { increment: 1 },
          },
        });
        if (changed.count !== 1) throw this.invalidEmailChangeToken();

        await tx.emailChangeToken.updateMany({
          where: { userId: token.userId, usedAt: null },
          data: { usedAt: now },
        });
        await tx.emailVerificationToken.updateMany({
          where: { userId: token.userId, usedAt: null },
          data: { usedAt: now },
        });
        await tx.passwordResetToken.updateMany({
          where: { userId: token.userId, usedAt: null },
          data: { usedAt: now },
        });
        const revokedSessions = await tx.session.updateMany({
          where: {
            userId: token.userId,
            id: { not: principal.sessionId },
            revokedAt: null,
          },
          data: { revokedAt: now },
        });

        const linkedCount = await this.linkGuestOrdersInTransaction(
          tx,
          token.userId,
          token.newEmailNormalized,
        );
        await this.writeAudit(tx, principal, context, {
          action: 'ACCOUNT_EMAIL_CHANGED',
          entityType: 'User',
          entityId: token.userId,
          metadata: {
            otherSessionsRevoked: revokedSessions.count,
            linkedGuestOrders: linkedCount,
          },
        });

        const user = await tx.user.findUnique({
          where: { id: token.userId },
          select: this.profileSelect(),
        });
        if (!user) throw this.accountNotFound();
        return this.toProfile(user);
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw this.invalidEmailChangeToken();
      }
      throw error;
    }
  }

  async changePassword(
    principal: AuthenticatedPrincipal,
    dto: ChangePasswordDto,
    context: ClientMetadata,
  ): Promise<{ message: string }> {
    this.passwords.assertPolicy(dto.newPassword);
    const user = await this.prisma.user.findUnique({
      where: { id: principal.userId },
      select: { passwordHash: true, version: true, isActive: true },
    });
    const currentPasswordValid = await this.passwords.verifyOrDummy(
      dto.currentPassword,
      user?.passwordHash,
    );
    if (!user?.isActive || !currentPasswordValid) {
      throw new BadRequestException({
        code: 'CURRENT_PASSWORD_INVALID',
        message: 'Не удалось подтвердить текущий пароль.',
      });
    }
    if (user.version !== dto.expectedVersion) {
      throw this.versionConflict('PROFILE_VERSION_CONFLICT', dto.expectedVersion, user.version);
    }

    const passwordHash = await this.passwords.hashPassword(dto.newPassword);
    const changedAt = new Date();
    return this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: {
          id: principal.userId,
          version: dto.expectedVersion,
          passwordHash: user.passwordHash,
          isActive: true,
        },
        data: {
          passwordHash,
          passwordChangedAt: changedAt,
          failedLoginAttempts: 0,
          loginLockedUntil: null,
          version: { increment: 1 },
        },
      });
      if (changed.count !== 1) {
        await this.throwProfileVersionConflict(tx, principal.userId, dto.expectedVersion);
      }
      const revoked = await tx.session.updateMany({
        where: {
          userId: principal.userId,
          id: { not: principal.sessionId },
          revokedAt: null,
        },
        data: { revokedAt: changedAt },
      });
      await tx.passwordResetToken.updateMany({
        where: { userId: principal.userId, usedAt: null },
        data: { usedAt: changedAt },
      });
      await this.writeAudit(tx, principal, context, {
        action: 'ACCOUNT_PASSWORD_CHANGED',
        entityType: 'User',
        entityId: principal.userId,
        metadata: { otherSessionsRevoked: revoked.count },
      });
      return { message: 'Пароль изменён.' };
    });
  }

  async linkGuestOrders(
    userId: string,
    emailNormalized: string,
    context: ClientMetadata = {},
  ): Promise<number> {
    const normalized = this.normalizeEmail(emailNormalized);
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { id: true, emailNormalized: true, emailVerifiedAt: true, role: true },
      });
      if (
        !user ||
        !user.emailVerifiedAt ||
        user.emailNormalized !== normalized ||
        emailNormalized !== normalized
      ) {
        return 0;
      }

      const linkedCount = await this.linkGuestOrdersInTransaction(tx, user.id, normalized);
      if (linkedCount > 0) {
        await this.writeAudit(tx, { userId: user.id, role: user.role }, context, {
          action: 'ACCOUNT_GUEST_ORDERS_LINKED',
          entityType: 'User',
          entityId: user.id,
          source: 'SYSTEM',
          metadata: { linkedCount },
        });
      }
      return linkedCount;
    });
  }

  async listOrganizations(userId: string): Promise<AccountOrganization[]> {
    const organizations = await this.prisma.accountOrganization.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return organizations.map((organization) => this.toOrganization(organization));
  }

  async createOrganization(
    principal: AuthenticatedPrincipal,
    dto: CreateOrganizationDto,
    context: ClientMetadata,
  ): Promise<AccountOrganization> {
    const data = this.organizationData(dto);
    this.assertOrganization(data.inn, data.kpp);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const organization = await tx.accountOrganization.create({
          data: { userId: principal.userId, ...data },
        });
        await this.writeAudit(tx, principal, context, {
          action: 'ACCOUNT_ORGANIZATION_CREATED',
          entityType: 'AccountOrganization',
          entityId: organization.id,
        });
        return this.toOrganization(organization);
      });
    } catch (error: unknown) {
      this.rethrowOrganizationConflict(error);
    }
  }

  async updateOrganization(
    principal: AuthenticatedPrincipal,
    organizationId: string,
    dto: UpdateOrganizationDto,
    context: ClientMetadata,
  ): Promise<AccountOrganization> {
    const patch = this.organizationPatch(dto);
    const changedFields = Object.keys(patch);
    if (changedFields.length === 0) {
      throw new BadRequestException({
        code: 'ORGANIZATION_PATCH_EMPTY',
        message: 'Передайте хотя бы одно поле организации.',
      });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.accountOrganization.findFirst({
          where: { id: organizationId, userId: principal.userId },
        });
        if (!current) throw this.organizationNotFound();
        if (current.version !== dto.expectedVersion) {
          throw this.versionConflict(
            'ORGANIZATION_VERSION_CONFLICT',
            dto.expectedVersion,
            current.version,
          );
        }

        const inn = patch.inn ?? current.inn;
        const kpp = Object.prototype.hasOwnProperty.call(patch, 'kpp')
          ? (patch.kpp ?? null)
          : current.kpp;
        this.assertOrganization(inn, kpp);
        const updated = await tx.accountOrganization.updateMany({
          where: {
            id: organizationId,
            userId: principal.userId,
            version: dto.expectedVersion,
          },
          data: { ...patch, version: { increment: 1 } },
        });
        if (updated.count !== 1) {
          const fresh = await tx.accountOrganization.findUnique({ where: { id: organizationId } });
          throw this.versionConflict(
            'ORGANIZATION_VERSION_CONFLICT',
            dto.expectedVersion,
            fresh?.version ?? current.version,
          );
        }
        const organization = await tx.accountOrganization.findUniqueOrThrow({
          where: { id: organizationId },
        });
        await this.writeAudit(tx, principal, context, {
          action: 'ACCOUNT_ORGANIZATION_UPDATED',
          entityType: 'AccountOrganization',
          entityId: organization.id,
          metadata: { changedFields },
        });
        return this.toOrganization(organization);
      });
    } catch (error: unknown) {
      this.rethrowOrganizationConflict(error);
    }
  }

  async deleteOrganization(
    principal: AuthenticatedPrincipal,
    organizationId: string,
    expectedVersion: number,
    context: ClientMetadata,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const current = await tx.accountOrganization.findFirst({
        where: { id: organizationId, userId: principal.userId },
      });
      if (!current) throw this.organizationNotFound();
      if (current.version !== expectedVersion) {
        throw this.versionConflict(
          'ORGANIZATION_VERSION_CONFLICT',
          expectedVersion,
          current.version,
        );
      }
      const removed = await tx.accountOrganization.deleteMany({
        where: { id: organizationId, userId: principal.userId, version: expectedVersion },
      });
      if (removed.count !== 1) {
        throw this.versionConflict(
          'ORGANIZATION_VERSION_CONFLICT',
          expectedVersion,
          current.version + 1,
        );
      }
      await this.writeAudit(tx, principal, context, {
        action: 'ACCOUNT_ORGANIZATION_DELETED',
        entityType: 'AccountOrganization',
        entityId: organizationId,
      });
    });
  }

  async getNotificationPreferences(userId: string): Promise<AccountNotificationPreferences> {
    const preferences = await this.prisma.notificationPreference.findUnique({
      where: { userId },
    });
    return preferences
      ? this.toNotificationPreferences(preferences)
      : { ...DEFAULT_NOTIFICATION_PREFERENCES, version: 0, updatedAt: null };
  }

  async updateNotificationPreferences(
    principal: AuthenticatedPrincipal,
    dto: UpdateNotificationPreferencesDto,
    context: ClientMetadata,
  ): Promise<AccountNotificationPreferences> {
    const patch = this.preferencePatch(dto);
    const changedFields = Object.keys(patch);
    if (changedFields.length === 0) {
      throw new BadRequestException({
        code: 'NOTIFICATION_PREFERENCES_PATCH_EMPTY',
        message: 'Передайте хотя бы одну настройку уведомлений.',
      });
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.notificationPreference.findUnique({
          where: { userId: principal.userId },
        });
        let preferences: NotificationPreference;

        if (!current) {
          if (dto.expectedVersion !== 0) {
            throw this.versionConflict(
              'NOTIFICATION_PREFERENCES_VERSION_CONFLICT',
              dto.expectedVersion,
              0,
            );
          }
          preferences = await tx.notificationPreference.create({
            data: { userId: principal.userId, ...patch },
          });
        } else {
          if (current.version !== dto.expectedVersion) {
            throw this.versionConflict(
              'NOTIFICATION_PREFERENCES_VERSION_CONFLICT',
              dto.expectedVersion,
              current.version,
            );
          }
          const updated = await tx.notificationPreference.updateMany({
            where: { userId: principal.userId, version: dto.expectedVersion },
            data: { ...patch, version: { increment: 1 } },
          });
          if (updated.count !== 1) {
            const fresh = await tx.notificationPreference.findUnique({
              where: { userId: principal.userId },
            });
            throw this.versionConflict(
              'NOTIFICATION_PREFERENCES_VERSION_CONFLICT',
              dto.expectedVersion,
              fresh?.version ?? current.version,
            );
          }
          preferences = await tx.notificationPreference.findUniqueOrThrow({
            where: { userId: principal.userId },
          });
        }

        await this.writeAudit(tx, principal, context, {
          action: 'ACCOUNT_NOTIFICATION_PREFERENCES_UPDATED',
          entityType: 'NotificationPreference',
          entityId: principal.userId,
          metadata: { changedFields },
        });
        return this.toNotificationPreferences(preferences);
      });
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const fresh = await this.prisma.notificationPreference.findUnique({
          where: { userId: principal.userId },
        });
        throw this.versionConflict(
          'NOTIFICATION_PREFERENCES_VERSION_CONFLICT',
          dto.expectedVersion,
          fresh?.version ?? 1,
        );
      }
      throw error;
    }
  }

  async listSessions(principal: AuthenticatedPrincipal): Promise<AccountSession[]> {
    const now = new Date();
    const sessions = await this.prisma.session.findMany({
      where: {
        userId: principal.userId,
        revokedAt: null,
        expiresAt: { gt: now },
      },
      orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
      select: {
        id: true,
        createdAt: true,
        expiresAt: true,
        lastSeenAt: true,
        userAgent: true,
      },
    });
    return sessions.map((session) => ({
      id: session.id,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
      lastSeenAt: session.lastSeenAt.toISOString(),
      deviceLabel: this.deviceLabel(session.userAgent),
      current: session.id === principal.sessionId,
    }));
  }

  async revokeSession(
    principal: AuthenticatedPrincipal,
    sessionId: string,
    context: ClientMetadata,
  ): Promise<SessionRevocationResult> {
    const currentSessionRevoked = sessionId === principal.sessionId;
    return this.prisma.$transaction(async (tx) => {
      const session = await tx.session.findFirst({
        where: { id: sessionId, userId: principal.userId },
        select: { id: true, revokedAt: true },
      });
      if (!session) throw this.sessionNotFound();
      if (session.revokedAt) return { revoked: false, currentSessionRevoked: false };

      const revoked = await tx.session.updateMany({
        where: { id: sessionId, userId: principal.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      if (revoked.count === 1) {
        await this.writeAudit(tx, principal, context, {
          action: 'ACCOUNT_SESSION_REVOKED',
          entityType: 'Session',
          entityId: sessionId,
          metadata: { currentSessionRevoked },
        });
      }
      return {
        revoked: revoked.count === 1,
        currentSessionRevoked: revoked.count === 1 && currentSessionRevoked,
      };
    });
  }

  async revokeOtherSessions(
    principal: AuthenticatedPrincipal,
    context: ClientMetadata,
  ): Promise<BulkSessionRevocationResult> {
    return this.prisma.$transaction(async (tx) => {
      const revoked = await tx.session.updateMany({
        where: {
          userId: principal.userId,
          id: { not: principal.sessionId },
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
      await this.writeAudit(tx, principal, context, {
        action: 'ACCOUNT_OTHER_SESSIONS_REVOKED',
        entityType: 'User',
        entityId: principal.userId,
        metadata: { revokedCount: revoked.count },
      });
      return { revokedCount: revoked.count };
    });
  }

  private profileSelect(): {
    id: true;
    email: true;
    emailVerifiedAt: true;
    firstName: true;
    lastName: true;
    phone: true;
    version: true;
    createdAt: true;
    updatedAt: true;
  } {
    return {
      id: true,
      email: true,
      emailVerifiedAt: true,
      firstName: true,
      lastName: true,
      phone: true,
      version: true,
      createdAt: true,
      updatedAt: true,
    };
  }

  private toProfile(user: ProfileRecord): AccountProfile {
    return {
      id: user.id,
      email: user.email,
      emailVerified: Boolean(user.emailVerifiedAt),
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      version: user.version,
      createdAt: user.createdAt.toISOString(),
      updatedAt: user.updatedAt.toISOString(),
    };
  }

  private toOrganization(organization: OrganizationRecord): AccountOrganization {
    return {
      id: organization.id,
      name: organization.name,
      inn: organization.inn,
      kpp: organization.kpp,
      version: organization.version,
      createdAt: organization.createdAt.toISOString(),
      updatedAt: organization.updatedAt.toISOString(),
    };
  }

  private toNotificationPreferences(
    preferences: NotificationPreference,
  ): AccountNotificationPreferences {
    return {
      orderUpdates: preferences.orderUpdates,
      paymentUpdates: preferences.paymentUpdates,
      reservationReminders: preferences.reservationReminders,
      marketingEmails: preferences.marketingEmails,
      version: preferences.version,
      updatedAt: preferences.updatedAt.toISOString(),
    };
  }

  private profilePatch(
    dto: UpdateAccountProfileDto,
  ): Partial<Pick<User, 'firstName' | 'lastName' | 'phone'>> {
    const patch: Partial<Pick<User, 'firstName' | 'lastName' | 'phone'>> = {};
    if (dto.firstName !== undefined) patch.firstName = this.normalizeOptional(dto.firstName);
    if (dto.lastName !== undefined) patch.lastName = this.normalizeOptional(dto.lastName);
    if (dto.phone !== undefined) patch.phone = this.normalizeOptional(dto.phone);
    return patch;
  }

  private organizationData(dto: CreateOrganizationDto): {
    name: string;
    inn: string;
    kpp: string | null;
  } {
    return {
      name: dto.name.trim().normalize('NFKC'),
      inn: dto.inn.trim(),
      kpp: dto.kpp?.trim() || null,
    };
  }

  private organizationPatch(
    dto: UpdateOrganizationDto,
  ): Partial<Pick<OrganizationRecord, 'name' | 'inn' | 'kpp'>> {
    const patch: Partial<Pick<OrganizationRecord, 'name' | 'inn' | 'kpp'>> = {};
    if (dto.name !== undefined) patch.name = dto.name.trim().normalize('NFKC');
    if (dto.inn !== undefined) patch.inn = dto.inn.trim();
    if (dto.kpp !== undefined) patch.kpp = dto.kpp?.trim() || null;
    return patch;
  }

  private preferencePatch(
    dto: UpdateNotificationPreferencesDto,
  ): Partial<
    Pick<
      NotificationPreference,
      'orderUpdates' | 'paymentUpdates' | 'reservationReminders' | 'marketingEmails'
    >
  > {
    const patch: Partial<
      Pick<
        NotificationPreference,
        'orderUpdates' | 'paymentUpdates' | 'reservationReminders' | 'marketingEmails'
      >
    > = {};
    if (dto.orderUpdates !== undefined) patch.orderUpdates = dto.orderUpdates;
    if (dto.paymentUpdates !== undefined) patch.paymentUpdates = dto.paymentUpdates;
    if (dto.reservationReminders !== undefined)
      patch.reservationReminders = dto.reservationReminders;
    if (dto.marketingEmails !== undefined) patch.marketingEmails = dto.marketingEmails;
    return patch;
  }

  private assertOrganization(inn: string, kpp: string | null): void {
    if (!isValidInn(inn)) {
      throw new BadRequestException({
        code: 'INN_INVALID',
        message: 'ИНН не прошёл проверку контрольного числа.',
      });
    }
    if (inn.length === 10 && !kpp) {
      throw new BadRequestException({
        code: 'KPP_REQUIRED',
        message: 'Для организации с 10-значным ИНН укажите КПП.',
      });
    }
    if (kpp && !/^\d{9}$/.test(kpp)) {
      throw new BadRequestException({
        code: 'KPP_INVALID',
        message: 'КПП должен содержать 9 цифр.',
      });
    }
  }

  private normalizeOptional(value: string | null): string | null {
    if (value === null) return null;
    return value.trim().normalize('NFKC');
  }

  private normalizeEmail(value: string): string {
    return value.trim().normalize('NFKC').toLowerCase();
  }

  private async linkGuestOrdersInTransaction(
    tx: Prisma.TransactionClient,
    userId: string,
    emailNormalized: string,
  ): Promise<number> {
    const linked = await tx.order.updateMany({
      where: { customerId: null, guestEmail: emailNormalized },
      data: { customerId: userId },
    });
    return linked.count;
  }

  private async throwProfileVersionConflict(
    tx: Prisma.TransactionClient,
    userId: string,
    expectedVersion: number,
  ): Promise<never> {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { version: true } });
    if (!user) throw this.accountNotFound();
    throw this.versionConflict('PROFILE_VERSION_CONFLICT', expectedVersion, user.version);
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    actor: AuditActor,
    context: ClientMetadata,
    event: {
      action: string;
      entityType: string;
      entityId: string;
      source?: 'STOREFRONT' | 'SYSTEM';
      metadata?: Prisma.InputJsonObject;
    },
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        actorUserId: actor.userId,
        actorRole: actor.role,
        source: event.source ?? 'STOREFRONT',
        action: event.action,
        entityType: event.entityType,
        entityId: event.entityId,
        ...(event.metadata ? { metadata: event.metadata } : {}),
        ...(context.correlationId ? { correlationId: context.correlationId } : {}),
        ...(context.ipHash ? { ipHash: context.ipHash } : {}),
      },
    });
  }

  private deviceLabel(userAgent: string | null): string {
    if (!userAgent) return 'Неизвестное устройство';

    const browser = userAgent.includes('Edg/')
      ? 'Microsoft Edge'
      : userAgent.includes('Firefox/')
        ? 'Firefox'
        : userAgent.includes('Chrome/')
          ? 'Chrome'
          : userAgent.includes('Safari/')
            ? 'Safari'
            : 'Браузер';
    const platform = /Android/i.test(userAgent)
      ? 'Android'
      : /iPhone|iPad/i.test(userAgent)
        ? 'iOS'
        : /Windows/i.test(userAgent)
          ? 'Windows'
          : /Mac OS X|Macintosh/i.test(userAgent)
            ? 'macOS'
            : /Linux/i.test(userAgent)
              ? 'Linux'
              : 'неизвестная ОС';
    return `${browser} · ${platform}`;
  }

  private rethrowOrganizationConflict(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException({
        code: 'ORGANIZATION_ALREADY_EXISTS',
        message: 'Организация с такими ИНН и КПП уже сохранена.',
      });
    }
    throw error;
  }

  private versionConflict(code: string, expectedVersion: number, actualVersion: number): Error {
    return new ConflictException({
      code,
      message: 'Данные были изменены в другой сессии. Обновите страницу.',
      details: { expectedVersion, actualVersion },
    });
  }

  private accountNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'ACCOUNT_NOT_FOUND',
      message: 'Аккаунт не найден.',
    });
  }

  private organizationNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'ORGANIZATION_NOT_FOUND',
      message: 'Организация не найдена.',
    });
  }

  private sessionNotFound(): NotFoundException {
    return new NotFoundException({
      code: 'SESSION_NOT_FOUND',
      message: 'Сессия не найдена.',
    });
  }

  private invalidEmailChangeToken(): BadRequestException {
    return new BadRequestException({
      code: 'EMAIL_CHANGE_TOKEN_INVALID_OR_EXPIRED',
      message: 'Ссылка недействительна или истекла.',
    });
  }
}
