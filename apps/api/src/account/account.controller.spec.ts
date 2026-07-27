import { AccountController } from './account.controller';

describe('AccountController', () => {
  it('clears the session cookie after revoking the current session', async () => {
    const account = {
      revokeSession: jest.fn().mockResolvedValue({
        revoked: true,
        currentSessionRevoked: true,
      }),
    };
    const fingerprints = { fromRequest: jest.fn().mockReturnValue({}) };
    const cookies = { clear: jest.fn() };
    const controller = new AccountController(
      account as never,
      fingerprints as never,
      cookies as never,
    );
    const principal = {
      userId: '11111111-1111-4111-8111-111111111111',
      sessionId: '22222222-2222-4222-8222-222222222222',
      email: 'buyer@example.test',
      role: 'CUSTOMER' as const,
      expiresAt: new Date('2026-08-01T08:00:00.000Z'),
    };
    const response = {};

    await controller.revokeSession(principal.sessionId, principal, {} as never, response as never);

    expect(cookies.clear).toHaveBeenCalledWith(response);
  });
});
