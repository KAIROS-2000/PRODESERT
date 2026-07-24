import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createTransport, type Transporter } from 'nodemailer';
import { type Environment } from '../common/config/environment';
import { JsonLogger } from '../common/logging/json-logger.service';

@Injectable()
export class EmailTransportService {
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

  async send(input: {
    to: string;
    subject: string;
    text: string;
  }): Promise<{ messageId?: string }> {
    if (!this.transporter) {
      this.logger.warn('order_email_suppressed_smtp_not_configured');
      throw this.unavailable();
    }
    try {
      const result = await this.transporter.sendMail({
        from: this.config.get('SMTP_FROM', { infer: true }),
        to: input.to,
        subject: input.subject,
        text: input.text,
      });
      return { ...(result.messageId ? { messageId: String(result.messageId) } : {}) };
    } catch {
      throw this.unavailable();
    }
  }

  private unavailable(): ServiceUnavailableException {
    return new ServiceUnavailableException({
      code: 'EMAIL_TRANSPORT_UNAVAILABLE',
      message: 'Почтовый сервис временно недоступен.',
    });
  }
}
