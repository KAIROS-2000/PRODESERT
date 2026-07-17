import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { type Environment } from '../common/config/environment';
import { JsonLogger } from '../common/logging/json-logger.service';
import { type AuthNotificationPort } from './auth-notification.port';

@Injectable()
export class SmtpAuthNotificationService implements AuthNotificationPort {
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
        ...(user && password ? { auth: { user, pass: password } } : {}),
      });
    }
  }

  async sendEmailVerification(email: string, token: string): Promise<void> {
    const link = this.buildLink('/verify-email', token);
    await this.send(
      email,
      'Подтвердите email — Pro Dessert',
      `Подтвердите email, открыв ссылку: ${link}\n\nЕсли вы не создавали аккаунт, проигнорируйте письмо.`,
    );
  }

  async sendPasswordReset(email: string, token: string): Promise<void> {
    const link = this.buildLink('/reset-password', token);
    await this.send(
      email,
      'Восстановление пароля — Pro Dessert',
      `Установите новый пароль по ссылке: ${link}\n\nЕсли вы не запрашивали восстановление, проигнорируйте письмо.`,
    );
  }

  private buildLink(path: string, token: string): string {
    const url = new URL(path, this.config.get('PUBLIC_APP_URL', { infer: true }));
    url.searchParams.set('token', token);
    return url.toString();
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    if (!this.transporter) {
      this.logger.warn('auth_email_not_sent_smtp_not_configured', {
        recipientDomain: to.split('@')[1],
      });
      return;
    }
    await this.transporter.sendMail({
      from: this.config.get('SMTP_FROM', { infer: true }),
      to,
      subject,
      text,
    });
  }
}
