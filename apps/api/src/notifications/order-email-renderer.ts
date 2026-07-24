import { Injectable } from '@nestjs/common';
import { type EmailTemplateCode } from './email-template.registry';

export interface OrderEmailContext {
  readonly publicNumber: string;
  readonly status: string;
  readonly orderUrl: string;
  readonly pickupAddress: string;
  readonly pickupPhone?: string;
  readonly reservationExpiresAt?: Date;
}

export interface RenderedOrderEmail {
  readonly subject: string;
  readonly text: string;
}

const copy: Readonly<
  Record<EmailTemplateCode, { subject: string; status: string; nextAction: string }>
> = {
  EMAIL_VERIFICATION: {
    subject: 'Подтвердите email',
    status: 'Регистрация',
    nextAction: 'Откройте ссылку подтверждения email.',
  },
  PASSWORD_RESET: {
    subject: 'Восстановление пароля',
    status: 'Безопасность аккаунта',
    nextAction: 'Откройте ссылку и установите новый пароль.',
  },
  ORDER_CREATED: {
    subject: 'Заказ создан',
    status: 'Ожидает подтверждения наличия',
    nextAction: 'Дождитесь подтверждения наличия и резерва. Пока не переводите деньги.',
  },
  AWAITING_STOCK_CONFIRMATION: {
    subject: 'Проверяем наличие',
    status: 'Ожидает подтверждения наличия',
    nextAction: 'Менеджер сверяет фактические остатки. Пока не переводите деньги.',
  },
  STOCK_CONFIRMED: {
    subject: 'Наличие подтверждено',
    status: 'Товары зарезервированы',
    nextAction: 'Дождитесь публикации реквизитов менеджером.',
  },
  PAYMENT_INSTRUCTIONS: {
    subject: 'Доступны инструкции по оплате',
    status: 'Ожидает банковского перевода',
    nextAction:
      'Откройте защищённую страницу заказа, проверьте сумму и используйте опубликованные реквизиты.',
  },
  RESERVATION_EXPIRY_REMINDER: {
    subject: 'Срок резерва скоро истечёт',
    status: 'Ожидает оплаты',
    nextAction: 'Завершите перевод до окончания резерва или свяжитесь с магазином.',
  },
  PAYMENT_VERIFYING: {
    subject: 'Проверяем оплату',
    status: 'Подтверждение получено',
    nextAction:
      'Менеджер проверит поступление на расчётный счёт. Чек сам по себе не означает оплату.',
  },
  PAYMENT_CONFIRMED: {
    subject: 'Оплата подтверждена',
    status: 'Оплачен',
    nextAction: 'Заказ будет передан в сборку.',
  },
  ORDER_ASSEMBLING: {
    subject: 'Заказ собирается',
    status: 'Сборка',
    nextAction: 'Дождитесь отдельного уведомления о готовности к самовывозу.',
  },
  READY_FOR_PICKUP: {
    subject: 'Заказ готов к самовывозу',
    status: 'Готов к самовывозу',
    nextAction: 'Получите заказ по адресу самовывоза.',
  },
  ORDER_COMPLETED: {
    subject: 'Заказ выполнен',
    status: 'Получен',
    nextAction: 'Спасибо за заказ в Pro Dessert.',
  },
  ORDER_CANCELLED: {
    subject: 'Заказ отменён',
    status: 'Отменён',
    nextAction: 'Если остались вопросы, свяжитесь с магазином.',
  },
  RESERVATION_EXPIRED: {
    subject: 'Срок резерва истёк',
    status: 'Резерв истёк',
    nextAction: 'Не выполняйте перевод. Для нового резерва свяжитесь с магазином.',
  },
  RETURN_REQUESTED: {
    subject: 'Запрос на возврат принят',
    status: 'Возврат запрошен',
    nextAction: 'Менеджер свяжется с вами после проверки запроса.',
  },
  RETURN_COMPLETED: {
    subject: 'Возврат завершён',
    status: 'Возврат выполнен',
    nextAction: 'Подробности доступны на странице заказа.',
  },
  PAYMENT_PROOF_REJECTED: {
    subject: 'Подтверждение оплаты отклонено',
    status: 'Ожидает оплаты',
    nextAction:
      'Откройте заказ, проверьте данные перевода и при необходимости отправьте новый файл.',
  },
};

@Injectable()
export class OrderEmailRenderer {
  render(template: EmailTemplateCode, context: OrderEmailContext): RenderedOrderEmail {
    const templateCopy = copy[template];
    const deadline = context.reservationExpiresAt
      ? `\nРезерв действует до: ${new Intl.DateTimeFormat('ru-RU', {
          dateStyle: 'long',
          timeStyle: 'short',
          timeZone: 'Asia/Yekaterinburg',
        }).format(context.reservationExpiresAt)}.`
      : '';
    const pickup =
      template === 'READY_FOR_PICKUP' || template === 'ORDER_ASSEMBLING'
        ? `\nАдрес самовывоза: ${context.pickupAddress}.`
        : '';
    const contact = context.pickupPhone
      ? `\nКонтакт магазина: ${context.pickupPhone}.`
      : '\nКонтакты магазина доступны на странице заказа.';
    return {
      subject: `${templateCopy.subject} — ${context.publicNumber} — Pro Dessert`,
      text: [
        'Pro Dessert',
        `Заказ: ${context.publicNumber}`,
        `Статус: ${templateCopy.status}`,
        '',
        templateCopy.nextAction,
        deadline,
        pickup,
        contact,
        '',
        `Защищённая ссылка на заказ: ${context.orderUrl}`,
      ]
        .filter((line) => line !== '')
        .join('\n'),
    };
  }
}
