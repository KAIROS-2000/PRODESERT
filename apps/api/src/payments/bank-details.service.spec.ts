import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BankDetailsService } from './bank-details.service';

function service(overrides: Record<string, unknown> = {}): BankDetailsService {
  const values: Record<string, unknown> = {
    NODE_ENV: 'test',
    BANK_RECIPIENT: 'ООО «Про Десерт»',
    BANK_INN: '5610000000',
    BANK_KPP: '561001001',
    BANK_ACCOUNT: '40702810000000000001',
    BANK_CORRESPONDENT_ACCOUNT: '30101810000000000001',
    BANK_BIC: '045354001',
    BANK_NAME: 'Тестовый банк',
    BANK_DETAILS_VERSION: '2026-01',
    DEMO_BANK_DETAILS_ENABLED: true,
    ...overrides,
  };
  return new BankDetailsService({
    get: jest.fn((key: string) => values[key]),
  } as unknown as ConfigService);
}

describe('BankDetailsService', () => {
  it('creates an immutable order-specific bank snapshot', () => {
    expect(service().snapshot('PD-20260725-AABBCCDD')).toEqual(
      expect.objectContaining({
        recipientInn: '5610000000',
        paymentPurpose: expect.stringContaining('PD-20260725-AABBCCDD'),
        detailsVersion: '2026-01',
        isDemo: true,
      }),
    );
  });

  it('fails closed when a required account field is missing', () => {
    expect(() => service({ BANK_BIC: undefined }).snapshot('PD-20260725-AABBCCDD')).toThrow(
      ServiceUnavailableException,
    );
  });

  it('forbids demo details in production', () => {
    expect(() =>
      service({ NODE_ENV: 'production', DEMO_BANK_DETAILS_ENABLED: true }).snapshot(
        'PD-20260725-AABBCCDD',
      ),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'BANK_DETAILS_NOT_CONFIGURED',
        }),
      }),
    );
  });
});
