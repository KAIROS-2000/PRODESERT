import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { type Environment } from '../common/config/environment';
import { JsonLogger } from '../common/logging/json-logger.service';

@Injectable()
export class AccountEmailService {
  private readonly transporter?: Transporter;

  constructor(
    private readonly config: ConfigService<Environment, true>,
    private readonly logger: JsonLogger,
  ) {
    const host = config.get('SMTP_HOST', { infer: true });
    const user = config.get('SMTP_USER', { infer: true });
    const password = config.get('SMTP_PASSWORD', { infer: true });

    if (host) {
      this.transporter = createTransport({
        host,
        port: config.get('SMTP_PORT', { infer: true }),
        secure: config.get('SMTP_SECURE', { infer: true }),
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
        ...(user && password ? { auth: { user, pass: password } } : {}),
      });
    }
  }

  async sendEmailChangeVerification(email: string, token: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('account_email_change_not_sent_smtp_not_configured', {
        recipientDomain: email.split('@')[1],
      });
      return;
    }

    const link = new URL(
      '/account/profile/confirm-email',
      this.config.get('PUBLIC_APP_URL', { infer: true }),
    );
    link.searchParams.set('token', token);
    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', { infer: true }),
      to: email,
      subject: 'Подтвердите новый email — Pro Dessert',
      text: [
        `Подтвердите новый email, открыв ссылку: ${link.toString()}`,
        '',
        'Если вы не запрашивали изменение email, проигнорируйте письмо и проверьте активные сессии.',
      ].join('\n'),
    });
  }
}
