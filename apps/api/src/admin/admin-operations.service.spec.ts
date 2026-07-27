import { adminAllowedActions } from './admin-operations.service';

describe('admin order actions', () => {
  it('shows payment verification actions only for a verifiable bank payment', () => {
    expect(adminAllowedActions('PAYMENT_VERIFICATION', 'PROOF_UPLOADED')).toMatchObject({
      confirmPayment: true,
      rejectPayment: true,
      extendReservation: true,
      startAssembly: false,
    });
    expect(adminAllowedActions('PAYMENT_VERIFICATION', 'CONFIRMED')).toMatchObject({
      confirmPayment: false,
      rejectPayment: false,
    });
  });

  it('keeps 1C stock confirmation separate from manager status changes', () => {
    expect(adminAllowedActions('AWAITING_STOCK_CONFIRMATION', null)).toMatchObject({
      confirmStock: true,
      sendPaymentDetails: false,
      cancel: true,
    });
  });

  it('exposes only transitions allowed by the authoritative state machine', () => {
    expect(adminAllowedActions('PAID', 'CONFIRMED')).toMatchObject({ startAssembly: true });
    expect(adminAllowedActions('ASSEMBLING', 'CONFIRMED')).toMatchObject({ markReady: true });
    expect(adminAllowedActions('READY_FOR_PICKUP', 'CONFIRMED')).toMatchObject({ complete: true });
    expect(adminAllowedActions('COMPLETED', 'CONFIRMED')).toMatchObject({
      startAssembly: false,
      markReady: false,
      complete: false,
      cancel: false,
    });
  });
});
