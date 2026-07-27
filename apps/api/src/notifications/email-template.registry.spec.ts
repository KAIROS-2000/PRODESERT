import { preferenceForTemplate } from './email-template.registry';

describe('preferenceForTemplate', () => {
  it('routes payment and reservation messages to their explicit preferences', () => {
    expect(preferenceForTemplate('PAYMENT_INSTRUCTIONS')).toBe('paymentUpdates');
    expect(preferenceForTemplate('PAYMENT_CONFIRMED')).toBe('paymentUpdates');
    expect(preferenceForTemplate('RESERVATION_EXPIRY_REMINDER')).toBe('reservationReminders');
  });

  it('keeps security emails mandatory and groups order statuses', () => {
    expect(preferenceForTemplate('EMAIL_VERIFICATION')).toBeUndefined();
    expect(preferenceForTemplate('PASSWORD_RESET')).toBeUndefined();
    expect(preferenceForTemplate('READY_FOR_PICKUP')).toBe('orderUpdates');
  });
});
