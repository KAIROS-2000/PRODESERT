import { type AuthenticatedPrincipal } from '../auth/auth.types';
import { AccountService } from './account.service';

const now = new Date('2026-07-25T08:00:00.000Z');
const principal: AuthenticatedPrincipal = {
  userId: '11111111-1111-4111-8111-111111111111',
  sessionId: '22222222-2222-4222-8222-222222222222',
  email: 'buyer@example.test',
  role: 'CUSTOMER',
  expiresAt: new Date('2026-08-01T08:00:00.000Z'),
};

const profile = {
  id: principal.userId,
  email: principal.email,
  emailVerifiedAt: now,
  firstName: 'Анна',
  lastName: null,
  phone: '+7 900 000-00-00',
  version: 2,
  createdAt: new Date('2026-07-01T08:00:00.000Z'),
  updatedAt: now,
};

function harness(): {
  service: AccountService;
  prisma: Record<string, unknown>;
  tx: {
    user: {
      findUnique: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    emailChangeToken: {
      findUnique: jest.Mock;
      updateMany: jest.Mock;
      create: jest.Mock;
    };
    emailVerificationToken: { updateMany: jest.Mock };
    passwordResetToken: { updateMany: jest.Mock };
    accountOrganization: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
      deleteMany: jest.Mock;
    };
    notificationPreference: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    session: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      updateMany: jest.Mock;
    };
    order: { updateMany: jest.Mock };
    auditLog: { create: jest.Mock };
  };
  emails: { sendEmailChangeVerification: jest.Mock };
  tokens: { generate: jest.Mock; hash: jest.Mock };
  passwords: {
    assertPolicy: jest.Mock;
    verifyOrDummy: jest.Mock;
    hashPassword: jest.Mock;
  };
} {
  const tx = {
    user: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    emailChangeToken: {
      findUnique: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      create: jest.fn().mockResolvedValue({}),
    },
    emailVerificationToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    passwordResetToken: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    accountOrganization: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
      deleteMany: jest.fn(),
    },
    notificationPreference: {
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      updateMany: jest.fn(),
    },
    session: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    order: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    auditLog: { create: jest.fn().mockResolvedValue({}) },
  };
  const prisma = {
    ...tx,
    $transaction: jest.fn((callback: (transaction: typeof tx) => unknown) => callback(tx)),
  };
  const tokens = {
    generate: jest.fn().mockReturnValue({ raw: 'raw-token', hash: 'hashed-token' }),
    hash: jest.fn().mockReturnValue('hashed-token'),
  };
  const emails = { sendEmailChangeVerification: jest.fn().mockResolvedValue(undefined) };
  const passwords = {
    assertPolicy: jest.fn(),
    verifyOrDummy: jest.fn().mockResolvedValue(true),
    hashPassword: jest.fn().mockResolvedValue('new-password-hash'),
  };
  const logger = { error: jest.fn(), warn: jest.fn() };
  const config = {
    get: jest.fn((key: string) => (key === 'EMAIL_VERIFICATION_TTL_MINUTES' ? 1_440 : undefined)),
  };

  return {
    service: new AccountService(
      prisma as never,
      tokens as never,
      emails as never,
      logger as never,
      config as never,
      passwords as never,
    ),
    prisma,
    tx,
    emails,
    tokens,
    passwords,
  };
}

describe('AccountService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(now);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('updates a profile through an optimistic version gate and writes an audit event', async () => {
    const { service, tx } = harness();
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    tx.user.findUnique.mockResolvedValue({ ...profile, firstName: 'Мария', version: 3 });

    const result = await service.updateProfile(
      principal,
      { expectedVersion: 2, firstName: '  Мария  ' },
      { correlationId: 'correlation-1', ipHash: 'a'.repeat(64) },
    );

    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: principal.userId, version: 2 },
      data: { firstName: 'Мария', version: { increment: 1 } },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ACCOUNT_PROFILE_UPDATED',
        entityId: principal.userId,
        metadata: { changedFields: ['firstName'] },
      }),
    });
    expect(result).toMatchObject({ firstName: 'Мария', version: 3 });
  });

  it('returns a version conflict instead of overwriting a newer profile', async () => {
    const { service, tx } = harness();
    tx.user.updateMany.mockResolvedValue({ count: 0 });
    tx.user.findUnique.mockResolvedValue({ version: 5 });

    await expect(
      service.updateProfile(principal, { expectedVersion: 2, lastName: 'Петрова' }, {}),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'PROFILE_VERSION_CONFLICT',
        details: { expectedVersion: 2, actualVersion: 5 },
      }),
    });
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('changes the password atomically and revokes every other active session', async () => {
    const { service, tx, passwords } = harness();
    tx.user.findUnique.mockResolvedValue({
      passwordHash: 'current-password-hash',
      version: 2,
      isActive: true,
    });
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    tx.session.updateMany.mockResolvedValue({ count: 3 });

    await expect(
      service.changePassword(
        principal,
        {
          currentPassword: 'correct-current-password',
          newPassword: 'new-long-passphrase',
          expectedVersion: 2,
        },
        { correlationId: 'correlation-password' },
      ),
    ).resolves.toEqual({ message: 'Пароль изменён.' });

    expect(passwords.assertPolicy).toHaveBeenCalledWith('new-long-passphrase');
    expect(passwords.verifyOrDummy).toHaveBeenCalledWith(
      'correct-current-password',
      'current-password-hash',
    );
    expect(passwords.hashPassword).toHaveBeenCalledWith('new-long-passphrase');
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: {
        id: principal.userId,
        version: 2,
        passwordHash: 'current-password-hash',
        isActive: true,
      },
      data: {
        passwordHash: 'new-password-hash',
        passwordChangedAt: now,
        failedLoginAttempts: 0,
        loginLockedUntil: null,
        version: { increment: 1 },
      },
    });
    expect(tx.session.updateMany).toHaveBeenCalledWith({
      where: {
        userId: principal.userId,
        id: { not: principal.sessionId },
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ACCOUNT_PASSWORD_CHANGED',
        metadata: { otherSessionsRevoked: 3 },
      }),
    });
  });

  it('returns one generic error and never hashes a new password when current password is invalid', async () => {
    const { service, tx, passwords } = harness();
    tx.user.findUnique.mockResolvedValue({
      passwordHash: 'current-password-hash',
      version: 2,
      isActive: true,
    });
    passwords.verifyOrDummy.mockResolvedValue(false);

    await expect(
      service.changePassword(
        principal,
        {
          currentPassword: 'wrong-current-password',
          newPassword: 'new-long-passphrase',
          expectedVersion: 2,
        },
        {},
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'CURRENT_PASSWORD_INVALID',
        message: 'Не удалось подтвердить текущий пароль.',
      },
    });
    expect(passwords.hashPassword).not.toHaveBeenCalled();
    expect(tx.user.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('keeps the email-change response generic when the requested address is occupied', async () => {
    const { service, tx, emails } = harness();
    tx.user.findUnique
      .mockResolvedValueOnce({
        id: principal.userId,
        emailNormalized: principal.email,
        version: 2,
      })
      .mockResolvedValueOnce({ id: 'another-user' });

    const result = await service.requestEmailChange(
      principal,
      { newEmail: 'occupied@example.test', expectedVersion: 2 },
      {},
    );

    expect(result.message).toContain('Если адрес доступен');
    expect(tx.emailChangeToken.create).not.toHaveBeenCalled();
    expect(emails.sendEmailChangeVerification).not.toHaveBeenCalled();
  });

  it('changes email only with a live token, revokes other sessions and links exact guest orders', async () => {
    const { service, tx } = harness();
    tx.emailChangeToken.findUnique.mockResolvedValue({
      id: 'token-1',
      userId: principal.userId,
      tokenHash: 'hashed-token',
      currentEmailNormalized: principal.email,
      newEmail: 'new@example.test',
      newEmailNormalized: 'new@example.test',
      expiresAt: new Date('2026-07-26T08:00:00.000Z'),
      usedAt: null,
      user: {
        ...profile,
        emailNormalized: principal.email,
        isActive: true,
      },
    });
    tx.user.findFirst.mockResolvedValue(null);
    tx.user.updateMany.mockResolvedValue({ count: 1 });
    tx.session.updateMany.mockResolvedValue({ count: 3 });
    tx.order.updateMany.mockResolvedValue({ count: 2 });
    tx.user.findUnique.mockResolvedValue({
      ...profile,
      email: 'new@example.test',
      version: 3,
      updatedAt: now,
    });

    const result = await service.confirmEmailChange(principal, 'raw-token', {});

    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: principal.userId, emailNormalized: principal.email },
      data: {
        email: 'new@example.test',
        emailNormalized: 'new@example.test',
        emailVerifiedAt: now,
        version: { increment: 1 },
      },
    });
    expect(tx.session.updateMany).toHaveBeenCalledWith({
      where: {
        userId: principal.userId,
        id: { not: principal.sessionId },
        revokedAt: null,
      },
      data: { revokedAt: now },
    });
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { customerId: null, guestEmail: 'new@example.test' },
      data: { customerId: principal.userId },
    });
    expect(tx.emailVerificationToken.updateMany).toHaveBeenCalled();
    expect(tx.passwordResetToken.updateMany).toHaveBeenCalled();
    expect(result).toMatchObject({ email: 'new@example.test', version: 3 });
  });

  it('links only guest orders matching the verified normalized account email', async () => {
    const { service, tx } = harness();
    tx.user.findUnique.mockResolvedValue({
      id: principal.userId,
      emailNormalized: principal.email,
      emailVerifiedAt: now,
      role: 'CUSTOMER',
    });
    tx.order.updateMany.mockResolvedValue({ count: 4 });

    await expect(service.linkGuestOrders(principal.userId, principal.email)).resolves.toBe(4);
    expect(tx.order.updateMany).toHaveBeenCalledWith({
      where: { customerId: null, guestEmail: principal.email },
      data: { customerId: principal.userId },
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ACCOUNT_GUEST_ORDERS_LINKED',
        source: 'SYSTEM',
        metadata: { linkedCount: 4 },
      }),
    });
  });

  it('does not link orders for an unverified or differently normalized identity', async () => {
    const { service, tx } = harness();
    tx.user.findUnique.mockResolvedValue({
      id: principal.userId,
      emailNormalized: principal.email,
      emailVerifiedAt: null,
      role: 'CUSTOMER',
    });

    await expect(service.linkGuestOrders(principal.userId, principal.email)).resolves.toBe(0);
    expect(tx.order.updateMany).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it('rejects an organization whose INN checksum is invalid', async () => {
    const { service, tx } = harness();

    await expect(
      service.createOrganization(
        principal,
        { name: 'ООО Тест', inn: '7707083894', kpp: '773601001' },
        {},
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({ code: 'INN_INVALID' }),
    });
    expect(tx.accountOrganization.create).not.toHaveBeenCalled();
  });

  it('returns non-persisted safe defaults for notification preferences', async () => {
    const { service, tx } = harness();
    tx.notificationPreference.findUnique.mockResolvedValue(null);

    await expect(service.getNotificationPreferences(principal.userId)).resolves.toEqual({
      orderUpdates: true,
      paymentUpdates: true,
      reservationReminders: true,
      marketingEmails: false,
      version: 0,
      updatedAt: null,
    });
    expect(tx.notificationPreference.create).not.toHaveBeenCalled();
  });

  it('lists active sessions with a safe device label and marks the current session', async () => {
    const { service, tx } = harness();
    tx.session.findMany.mockResolvedValue([
      {
        id: principal.sessionId,
        createdAt: new Date('2026-07-20T08:00:00.000Z'),
        expiresAt: principal.expiresAt,
        lastSeenAt: now,
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit Chrome/126.0 Safari/537.36',
      },
    ]);

    const sessions = await service.listSessions(principal);

    expect(sessions).toEqual([
      expect.objectContaining({
        id: principal.sessionId,
        current: true,
        deviceLabel: 'Chrome · Windows',
      }),
    ]);
    expect(tx.session.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: principal.userId,
          revokedAt: null,
          expiresAt: { gt: now },
        }),
      }),
    );
  });

  it('revokes the current session conditionally and records the security mutation', async () => {
    const { service, tx } = harness();
    tx.session.findFirst.mockResolvedValue({ id: principal.sessionId, revokedAt: null });
    tx.session.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.revokeSession(principal, principal.sessionId, {})).resolves.toEqual({
      revoked: true,
      currentSessionRevoked: true,
    });
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: 'ACCOUNT_SESSION_REVOKED',
        entityId: principal.sessionId,
        metadata: { currentSessionRevoked: true },
      }),
    });
  });
});
