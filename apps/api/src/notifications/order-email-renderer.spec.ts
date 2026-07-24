import { emailTemplateCodes } from './email-template.registry';
import { OrderEmailRenderer } from './order-email-renderer';

describe('OrderEmailRenderer', () => {
  const renderer = new OrderEmailRenderer();
  const context = {
    publicNumber: 'PD-20260725-A1B2C3D4',
    status: 'AWAITING_PAYMENT',
    orderUrl: 'https://shop.example/order/PD-20260725-A1B2C3D4#access=secret',
    pickupAddress: 'Оренбург, Липовая улица, 20',
    pickupPhone: '+7 000 000-00-00',
    reservationExpiresAt: new Date('2026-07-26T12:00:00.000Z'),
  };

  it('registers every template required by the master specification', () => {
    expect(emailTemplateCodes).toEqual(
      expect.arrayContaining([
        'EMAIL_VERIFICATION',
        'PASSWORD_RESET',
        'ORDER_CREATED',
        'AWAITING_STOCK_CONFIRMATION',
        'STOCK_CONFIRMED',
        'PAYMENT_INSTRUCTIONS',
        'RESERVATION_EXPIRY_REMINDER',
        'PAYMENT_VERIFYING',
        'PAYMENT_CONFIRMED',
        'ORDER_ASSEMBLING',
        'READY_FOR_PICKUP',
        'ORDER_COMPLETED',
        'ORDER_CANCELLED',
        'RESERVATION_EXPIRED',
        'RETURN_REQUESTED',
        'RETURN_COMPLETED',
      ]),
    );
  });

  it.each(['PAYMENT_INSTRUCTIONS', 'PAYMENT_VERIFYING', 'READY_FOR_PICKUP'] as const)(
    'renders safe pickup-only content for %s',
    (template) => {
      const result = renderer.render(template, context);
      expect(result.subject).toContain('Pro Dessert');
      expect(result.text).toContain(context.publicNumber);
      expect(result.text).toContain(context.orderUrl);
      expect(result.text.toLowerCase()).not.toContain('достав');
    },
  );

  it('warns that a proof does not confirm payment', () => {
    expect(renderer.render('PAYMENT_VERIFYING', context).text).toContain(
      'Чек сам по себе не означает оплату',
    );
  });
});
