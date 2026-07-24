import { dirname, join } from 'node:path';
import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { PaymentDocumentKind, Prisma } from '@prisma/client';
import PDFDocument from 'pdfkit';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentDocumentService } from './payment-document.service';

export interface InvoiceFile {
  readonly documentId: string;
  readonly filename: string;
  readonly mimeType: 'application/pdf';
  readonly bytes: Buffer;
}

const invoicePaymentInclude = {
  order: { include: { items: { orderBy: { createdAt: 'asc' as const } } } },
} satisfies Prisma.PaymentInclude;

type InvoicePaymentRecord = Prisma.PaymentGetPayload<{ include: typeof invoicePaymentInclude }>;

@Injectable()
export class InvoiceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly documents: PaymentDocumentService,
  ) {}

  async getOrCreateForPayment(paymentId: string): Promise<InvoiceFile> {
    const existing = await this.prisma.paymentDocument.findFirst({
      where: {
        paymentId,
        kind: PaymentDocumentKind.INVOICE,
        storageStatus: 'AVAILABLE',
        scanStatus: 'NOT_REQUIRED',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) {
      const stored = await this.documents.getPrivate(existing.id);
      return {
        documentId: existing.id,
        filename: stored.filename,
        mimeType: 'application/pdf',
        bytes: stored.bytes,
      };
    }

    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: invoicePaymentInclude,
    });
    const organization = this.organization(payment?.order.organizationData);
    if (!payment || !organization) {
      throw new UnprocessableEntityException({
        code: 'INVOICE_REQUIRES_ORGANIZATION',
        message: 'PDF-счёт доступен только для заказа юридического лица.',
      });
    }

    const bytes = await this.render(payment, organization);
    const record = await this.documents.storeInvoice(payment.id, payment.order.publicNumber, bytes);
    return {
      documentId: record.id,
      filename: record.originalFilename,
      mimeType: 'application/pdf',
      bytes,
    };
  }

  private render(
    payment: InvoicePaymentRecord,
    organization: { name: string; inn: string; kpp?: string },
  ): Promise<Buffer> {
    return new Promise((resolveBuffer, reject) => {
      const document = new PDFDocument({
        size: 'A4',
        margin: 44,
        info: {
          Title: `Счёт на оплату ${payment.order.publicNumber}`,
          Author: 'Pro Dessert',
          Subject: 'Банковский перевод за заказ с самовывозом',
        },
      });
      const chunks: Buffer[] = [];
      document.on('data', (chunk: Buffer) => chunks.push(chunk));
      document.on('error', reject);
      document.on('end', () => resolveBuffer(Buffer.concat(chunks)));

      const fontRoot = dirname(require.resolve('dejavu-fonts-ttf/package.json'));
      const regular = join(fontRoot, 'ttf', 'DejaVuSans.ttf');
      const bold = join(fontRoot, 'ttf', 'DejaVuSans-Bold.ttf');
      document.registerFont('Roboto', regular);
      document.registerFont('RobotoBold', bold);

      document.font('RobotoBold').fontSize(9).fillColor('#7d1839').text('PRO DESSERT');
      document.fontSize(18).fillColor('#241b1f').text('Счёт на оплату', { align: 'right' });
      document
        .font('Roboto')
        .fontSize(9)
        .fillColor('#5e5257')
        .text(`Заказ ${payment.order.publicNumber} от ${this.date(payment.order.createdAt)}`, {
          align: 'right',
        });
      document.moveDown(1.4);

      if (payment.isDemo) {
        document.save();
        document
          .rotate(-22, { origin: [297, 180] })
          .font('RobotoBold')
          .fontSize(24)
          .fillColor('#d7a6b8')
          .opacity(0.36)
          .text('ДЕМОНСТРАЦИОННЫЕ ДАННЫЕ - НЕ ДЛЯ ОПЛАТЫ', 45, 165, {
            width: 510,
            align: 'center',
          });
        document.restore().opacity(1);
      }

      this.row(document, 'Получатель', payment.recipientName);
      this.row(
        document,
        'ИНН / КПП',
        `${payment.recipientInn}${payment.recipientKpp ? ` / ${payment.recipientKpp}` : ''}`,
      );
      this.row(document, 'Банк', payment.bankName);
      this.row(document, 'БИК', payment.bik);
      this.row(document, 'Расчётный счёт', payment.settlementAccount);
      this.row(document, 'Корреспондентский счёт', payment.correspondentAccount);
      document.moveDown(0.8);
      this.row(document, 'Покупатель', organization.name);
      this.row(
        document,
        'ИНН / КПП покупателя',
        `${organization.inn}${organization.kpp ? ` / ${organization.kpp}` : ''}`,
      );
      document.y += 20;

      const left = document.page.margins.left;
      const contentWidth = 507;
      const widths = [235, 52, 45, 85, 90];
      const headers = ['Наименование', 'Кол-во', 'Ед.', 'Цена', 'Сумма'];
      const headerY = document.y;
      let x = left;
      headers.forEach((header, index) => {
        document.rect(x, headerY, widths[index] ?? 0, 24).fill('#7d1839');
        document
          .font('RobotoBold')
          .fontSize(8)
          .fillColor('#ffffff')
          .text(header, x + 5, headerY + 7, {
            width: (widths[index] ?? 0) - 10,
            height: 12,
            align: index > 2 ? 'right' : 'left',
            lineBreak: false,
          });
        x += widths[index] ?? 0;
      });
      document.y = headerY + 24;

      payment.order.items.forEach((item, index) => {
        const y = document.y;
        const background = index % 2 === 0 ? '#f8f1f4' : '#ffffff';
        x = left;
        widths.forEach((width) => {
          document.rect(x, y, width, 32).fill(background);
          x += width;
        });
        const values = [
          `${item.productName} - ${item.offerName}`,
          this.quantity(item.quantity.toFixed(3)),
          item.unit,
          `${item.unitPrice.toFixed(2)} ₽`,
          `${item.lineTotal.toFixed(2)} ₽`,
        ];
        x = left;
        document.font('Roboto').fontSize(8).fillColor('#241b1f');
        values.forEach((value, valueIndex) => {
          document.text(value, x + 5, y + 7, {
            width: (widths[valueIndex] ?? 0) - 10,
            height: 22,
            ellipsis: true,
            align: valueIndex > 2 ? 'right' : 'left',
          });
          x += widths[valueIndex] ?? 0;
        });
        document.y = y + 32;
      });

      document.moveDown(0.9);
      const totalY = document.y;
      document
        .font('RobotoBold')
        .fontSize(12)
        .text(`Итого: ${payment.amount.toFixed(2)} ₽`, left, totalY, {
          width: contentWidth,
          align: 'right',
          lineBreak: false,
        });
      const vatLines = payment.order.items.map(
        (item) => `${item.vatRate.toFixed(2)}%${item.vatIncluded ? ' включён' : ''}`,
      );
      document
        .font('Roboto')
        .fontSize(8)
        .fillColor('#5e5257')
        .text(`НДС: ${[...new Set(vatLines)].join(', ')}`, left, totalY + 18, {
          width: contentWidth,
          align: 'right',
          lineBreak: false,
        });
      document.y = totalY + 34;
      document.moveDown(1.2);
      this.row(document, 'Назначение платежа', payment.paymentPurpose);
      this.row(
        document,
        'Резерв действует до',
        payment.order.reservationExpiresAt
          ? this.dateTime(payment.order.reservationExpiresAt)
          : 'не указан',
      );
      this.row(document, 'Получение', `Самовывоз: ${payment.order.pickupLocationAddress}`);
      document.moveDown(1.1);
      document
        .font('RobotoBold')
        .fontSize(9)
        .fillColor('#7d1839')
        .text('Обработка заказа начинается только после подтверждения поступления денег.');
      document
        .font('Roboto')
        .fontSize(8)
        .fillColor('#5e5257')
        .text(
          'Приложенное подтверждение перевода не означает автоматическую оплату. Дождитесь статуса «Оплата подтверждена».',
        );

      document
        .font('Roboto')
        .fontSize(7)
        .fillColor('#746970')
        .text(`Pro Dessert • ${payment.order.publicNumber}`, 44, 780, {
          width: 507,
          align: 'center',
          lineBreak: false,
        });
      document.end();
    });
  }

  private row(document: PDFKit.PDFDocument, label: string, value: string): void {
    const y = document.y;
    document.font('RobotoBold').fontSize(8).fillColor('#5e5257').text(label, 44, y, { width: 138 });
    document.font('Roboto').fontSize(9).fillColor('#241b1f').text(value, 182, y, { width: 369 });
    document.y = Math.max(document.y, y + 16);
  }

  private organization(value: unknown): { name: string; inn: string; kpp?: string } | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (typeof record.name !== 'string' || typeof record.inn !== 'string') return null;
    return {
      name: record.name,
      inn: record.inn,
      ...(typeof record.kpp === 'string' ? { kpp: record.kpp } : {}),
    };
  }

  private date(value: Date): string {
    return new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Yekaterinburg' }).format(value);
  }

  private dateTime(value: Date): string {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Yekaterinburg',
    }).format(value);
  }

  private quantity(value: string): string {
    return value.replace(/(?:\.0+|(?:(\.\d*?)0+))$/, '$1');
  }
}
