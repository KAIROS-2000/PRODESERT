import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, type User } from '@prisma/client';
import { type Environment } from '../common/config/environment';
import { JsonLogger } from '../common/logging/json-logger.service';
import { type ClientMetadata } from '../common/security/client-fingerprint.service';
import { OpaqueTokenService } from '../common/security/opaque-token.service';
import { PasswordService } from '../common/security/password.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthNotificationPort } from './auth-notification.port';
import {
  type AuthenticatedPrincipal,
  type PublicSession,
  type SessionCreationResult,
} from './auth.types';
import {
  type EmailOnlyDto,
  type LoginDto,
  type RegisterDto,
  type ResetPasswordDto,
  type VerifyEmailDto,
} from './dto/auth.dto';

const GENERIC_EMAIL_RESPONSE = {
  message: 'If the address is eligible, an email will be sent shortly.',
} as const;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly tokens: OpaqueTokenService,
    private readonly notifications: AuthNotificationPort,
    private readonly config: ConfigService<Environment, true>,
    private readonly logger: JsonLogger,
  ) {}

  async register(
    dto: RegisterDto,
    context: ClientMetadata,
  ): Promise<typeof GENERIC_EMAIL_RESPONSE> {
    this.passwords.assertPolicy(dto.password);
    const passwordHash = await this.passwords.hashPassword(dto.password);
    const emailNormalized = this.normalizeEmail(dto.email);
    const existing = await this.prisma.user.findUnique({ where: { emailNormalized } });

    if (existing) {
      if (!existing.emailVerifiedAt && existing.isActive) {
        await this.issueVerification(existing, context);
      }
      return GENERIC_EMAIL_RESPONSE;
    }

    const token = this.tokens.generate();
    const expiresAt = this.addMinutes(
      this.config.get('EMAIL_VERIFICATION_TTL_MINUTES', { infer: true }),
    );
    try {
      const user = await this.prisma.$transaction(async (tx) => {
        const created = await tx.user.create({
          data: { email: dto.email.trim(), emailNormalized, passwordHash },
        });
        await tx.emailVerificationToken.create({
          data: { userId: created.id, tokenHash: token.hash, expiresAt },
        });
        await this.writeAudit(tx, 'AUTH_REGISTERED', created, context);
        return created;
      });
      await this.deliver(() => this.notifications.sendEmailVerification(user.email, token.raw));
    } catch (error: unknown) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
        throw error;
      }
    }
    return GENERIC_EMAIL_RESPONSE;
  }

  async verifyEmail(dto: VerifyEmailDto, context: ClientMetadata): Promise<{ message: string }> {
    const tokenHash = this.tokens.hash(dto.token);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const token = await tx.emailVerificationToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!token || token.usedAt || token.expiresAt <= now) {
        throw this.invalidToken();
      }
      const consumed = await tx.emailVerificationToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) {
        throw this.invalidToken();
      }
      const user = await tx.user.update({
        where: { id: token.userId },
        data: { emailVerifiedAt: token.user.emailVerifiedAt ?? now },
      });
      await this.writeAudit(tx, 'AUTH_EMAIL_VERIFIED', user, context);
    });
    return { message: 'Email verified.' };
  }

  async resendVerification(
    dto: EmailOnlyDto,
    context: ClientMetadata,
  ): Promise<typeof GENERIC_EMAIL_RESPONSE> {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: this.normalizeEmail(dto.email) },
    });
    if (user && user.isActive && !user.emailVerifiedAt) {
      await this.issueVerification(user, context);
    }
    return GENERIC_EMAIL_RESPONSE;
  }

  async login(dto: LoginDto, context: ClientMetadata): Promise<SessionCreationResult> {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: this.normalizeEmail(dto.email) },
    });
    const passwordValid = await this.passwords.verifyOrDummy(dto.password, user?.passwordHash);
    const now = new Date();
    const locked = Boolean(user?.loginLockedUntil && user.loginLockedUntil > now);

    if (!user || !passwordValid || !user.isActive || locked) {
      if (user && !locked) {
        await this.recordFailedLogin(user, context);
      }
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid email or password.',
      });
    }
    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        code: 'EMAIL_VERIFICATION_REQUIRED',
        message: 'Email verification is required.',
      });
    }

    const token = this.tokens.generate();
    const expiresAt = new Date(
      now.getTime() + this.config.get('SESSION_TTL_SECONDS', { infer: true }) * 1_000,
    );
    const session = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: 0, loginLockedUntil: null, lastLoginAt: now },
      });
      const created = await tx.session.create({
        data: {
          userId: user.id,
          sessionTokenHash: token.hash,
          expiresAt,
          ...(context.ipHash ? { ipHash: context.ipHash } : {}),
          ...(context.userAgent ? { userAgent: context.userAgent } : {}),
        },
      });
      await this.writeAudit(tx, 'AUTH_LOGIN_SUCCEEDED', user, context);
      return created;
    });

    return {
      rawToken: token.raw,
      principal: {
        userId: user.id,
        sessionId: session.id,
        email: user.email,
        role: user.role,
        expiresAt,
      },
    };
  }

  async authenticateSession(rawToken: string | undefined): Promise<AuthenticatedPrincipal> {
    if (!rawToken) {
      throw this.unauthorizedSession();
    }
    const session = await this.prisma.session.findUnique({
      where: { sessionTokenHash: this.tokens.hash(rawToken) },
      include: { user: true },
    });
    const now = new Date();
    if (!session || session.revokedAt || session.expiresAt <= now || !session.user.isActive) {
      throw this.unauthorizedSession();
    }
    if (now.getTime() - session.lastSeenAt.getTime() > 300_000) {
      await this.prisma.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { lastSeenAt: now },
      });
    }
    return {
      userId: session.user.id,
      sessionId: session.id,
      email: session.user.email,
      role: session.user.role,
      expiresAt: session.expiresAt,
    };
  }

  async logout(rawToken: string | undefined, context: ClientMetadata): Promise<void> {
    if (!rawToken) return;
    const session = await this.prisma.session.findUnique({
      where: { sessionTokenHash: this.tokens.hash(rawToken) },
      include: { user: true },
    });
    if (!session || session.revokedAt) return;
    await this.prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.writeAudit(tx, 'AUTH_LOGOUT', session.user, context);
    });
  }

  async logoutAll(principal: AuthenticatedPrincipal, context: ClientMetadata): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: principal.userId } });
    await this.prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { userId: user.id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await this.writeAudit(tx, 'AUTH_LOGOUT_ALL', user, context);
    });
  }

  async forgotPassword(
    dto: EmailOnlyDto,
    context: ClientMetadata,
  ): Promise<typeof GENERIC_EMAIL_RESPONSE> {
    const user = await this.prisma.user.findUnique({
      where: { emailNormalized: this.normalizeEmail(dto.email) },
    });
    if (user?.isActive && user.emailVerifiedAt) {
      const token = this.tokens.generate();
      const expiresAt = this.addMinutes(
        this.config.get('PASSWORD_RESET_TTL_MINUTES', { infer: true }),
      );
      await this.prisma.$transaction(async (tx) => {
        await tx.passwordResetToken.updateMany({
          where: { userId: user.id, usedAt: null },
          data: { usedAt: new Date() },
        });
        await tx.passwordResetToken.create({
          data: { userId: user.id, tokenHash: token.hash, expiresAt },
        });
        await this.writeAudit(tx, 'AUTH_PASSWORD_RESET_REQUESTED', user, context);
      });
      await this.deliver(() => this.notifications.sendPasswordReset(user.email, token.raw));
    }
    return GENERIC_EMAIL_RESPONSE;
  }

  async resetPassword(
    dto: ResetPasswordDto,
    context: ClientMetadata,
  ): Promise<{ message: string }> {
    this.passwords.assertPolicy(dto.newPassword);
    const newHash = await this.passwords.hashPassword(dto.newPassword);
    const tokenHash = this.tokens.hash(dto.token);
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const token = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        include: { user: true },
      });
      if (!token || token.usedAt || token.expiresAt <= now || !token.user.isActive)
        throw this.invalidToken();
      const consumed = await tx.passwordResetToken.updateMany({
        where: { id: token.id, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      if (consumed.count !== 1) throw this.invalidToken();
      await tx.user.update({
        where: { id: token.userId },
        data: {
          passwordHash: newHash,
          passwordChangedAt: now,
          failedLoginAttempts: 0,
          loginLockedUntil: null,
        },
      });
      await tx.session.updateMany({
        where: { userId: token.userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await this.writeAudit(tx, 'AUTH_PASSWORD_RESET_COMPLETED', token.user, context);
    });
    return { message: 'Password updated. Sign in again.' };
  }

  toPublicSession(principal: AuthenticatedPrincipal): PublicSession {
    return {
      user: { id: principal.userId, email: principal.email, role: principal.role },
      session: { id: principal.sessionId, expiresAt: principal.expiresAt.toISOString() },
    };
  }

  private async issueVerification(user: User, context: ClientMetadata): Promise<void> {
    const token = this.tokens.generate();
    const expiresAt = this.addMinutes(
      this.config.get('EMAIL_VERIFICATION_TTL_MINUTES', { infer: true }),
    );
    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      await tx.emailVerificationToken.create({
        data: { userId: user.id, tokenHash: token.hash, expiresAt },
      });
      await this.writeAudit(tx, 'AUTH_VERIFICATION_RESENT', user, context);
    });
    await this.deliver(() => this.notifications.sendEmailVerification(user.email, token.raw));
  }

  private async recordFailedLogin(user: User, context: ClientMetadata): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: user.id },
        data: { failedLoginAttempts: { increment: 1 } },
      });
      if (updated.failedLoginAttempts >= 10) {
        await tx.user.update({
          where: { id: user.id },
          data: { loginLockedUntil: new Date(Date.now() + 15 * 60_000) },
        });
      }
      await this.writeAudit(tx, 'AUTH_LOGIN_FAILED', user, context);
    });
  }

  private async writeAudit(
    tx: Prisma.TransactionClient,
    action: string,
    user: Pick<User, 'id' | 'role'>,
    context: ClientMetadata,
  ): Promise<void> {
    await tx.auditLog.create({
      data: {
        action,
        entityType: 'User',
        entityId: user.id,
        actorUserId: user.id,
        actorRole: user.role,
        source: 'STOREFRONT',
        ...(context.correlationId ? { correlationId: context.correlationId } : {}),
        ...(context.ipHash ? { ipHash: context.ipHash } : {}),
      },
    });
  }

  private async deliver(operation: () => Promise<void>): Promise<void> {
    try {
      await operation();
    } catch (error: unknown) {
      this.logger.error('auth_email_delivery_failed', error);
    }
  }

  private normalizeEmail(email: string): string {
    return email.trim().normalize('NFKC').toLowerCase();
  }

  private addMinutes(minutes: number): Date {
    return new Date(Date.now() + minutes * 60_000);
  }

  private invalidToken(): BadRequestException {
    return new BadRequestException({
      code: 'TOKEN_INVALID_OR_EXPIRED',
      message: 'Token is invalid or expired.',
    });
  }

  private unauthorizedSession(): UnauthorizedException {
    return new UnauthorizedException({
      code: 'SESSION_REQUIRED',
      message: 'A valid session is required.',
    });
  }
}
