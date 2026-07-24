import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { type BankDetailsSnapshot } from './payment.types';

@Injectable()
export class BankDetailsService {
  constructor(private readonly config: ConfigService) {}

  snapshot(publicNumber: string): BankDetailsSnapshot {
    const isDemo = this.boolean('DEMO_BANK_DETAILS_ENABLED');
    if (this.string('NODE_ENV') === 'production' && isDemo) {
      throw this.unavailable('Демонстрационные банковские реквизиты запрещены в production.');
    }

    const recipientName = this.required('BANK_RECIPIENT');
    const recipientInn = this.requiredDigits('BANK_INN', [10, 12]);
    const recipientKpp = this.optionalDigits('BANK_KPP', 9);
    const settlementAccount = this.requiredDigits('BANK_ACCOUNT', [20]);
    const correspondentAccount = this.requiredDigits('BANK_CORRESPONDENT_ACCOUNT', [20]);
    const bik = this.requiredDigits('BANK_BIC', [9]);
    const bankName = this.required('BANK_NAME');
    const detailsVersion = this.required('BANK_DETAILS_VERSION');
    const template =
      this.string('BANK_PAYMENT_PURPOSE_TEMPLATE') ??
      'Оплата заказа {orderNumber}. НДС включён в стоимость товаров.';
    const paymentPurpose = template.replaceAll('{orderNumber}', publicNumber).trim();
    if (!paymentPurpose.includes(publicNumber)) {
      throw this.unavailable(
        'BANK_PAYMENT_PURPOSE_TEMPLATE должен содержать номер заказа через {orderNumber}.',
      );
    }
    return {
      recipientName,
      recipientInn,
      recipientKpp,
      settlementAccount,
      correspondentAccount,
      bik,
      bankName,
      paymentPurpose,
      detailsVersion,
      isDemo,
    };
  }

  private required(key: string): string {
    const value = this.string(key);
    if (!value) {
      throw this.unavailable(`Не настроен обязательный параметр ${key}.`);
    }
    return value;
  }

  private requiredDigits(key: string, lengths: readonly number[]): string {
    const value = this.required(key);
    if (!/^\d+$/.test(value) || !lengths.includes(value.length)) {
      throw this.unavailable(`Параметр ${key} имеет некорректный формат.`);
    }
    return value;
  }

  private optionalDigits(key: string, length: number): string | null {
    const value = this.string(key);
    if (!value) return null;
    if (!/^\d+$/.test(value) || value.length !== length) {
      throw this.unavailable(`Параметр ${key} имеет некорректный формат.`);
    }
    return value;
  }

  private boolean(key: string): boolean {
    const value = this.config.get<unknown>(key);
    return value === true || value === 'true';
  }

  private string(key: string): string | undefined {
    const value = this.config.get<unknown>(key);
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  }

  private unavailable(message: string): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'BANK_DETAILS_NOT_CONFIGURED',
      message,
    });
  }
}
