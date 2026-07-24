export const emailTemplateCodes = [
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
  'PAYMENT_PROOF_REJECTED',
] as const;

export type EmailTemplateCode = (typeof emailTemplateCodes)[number];

const eventTemplateMap: Readonly<Record<string, EmailTemplateCode>> = {
  'order.created': 'ORDER_CREATED',
  'order.awaiting_stock_confirmation': 'AWAITING_STOCK_CONFIRMATION',
  'order.stock_confirmed': 'STOCK_CONFIRMED',
  'payment.details_published': 'PAYMENT_INSTRUCTIONS',
  'payment.proof_submitted': 'PAYMENT_VERIFYING',
  'payment.proof_uploaded': 'PAYMENT_VERIFYING',
  'payment.confirmed': 'PAYMENT_CONFIRMED',
  'payment.rejected': 'PAYMENT_PROOF_REJECTED',
  'order.assembling': 'ORDER_ASSEMBLING',
  'order.ready_for_pickup': 'READY_FOR_PICKUP',
  'order.completed': 'ORDER_COMPLETED',
  'order.cancelled': 'ORDER_CANCELLED',
  'order.reservation_expiry_reminder': 'RESERVATION_EXPIRY_REMINDER',
  'order.reservation_expired': 'RESERVATION_EXPIRED',
  'order.return_requested': 'RETURN_REQUESTED',
  'order.returned': 'RETURN_COMPLETED',
};

export function templateForEvent(eventType: string): EmailTemplateCode | undefined {
  return eventTemplateMap[eventType];
}
