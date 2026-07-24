import type {
  PaymentActionResult as ContractPaymentActionResult,
  PaymentInstructionsView,
  PaymentProofResult as ContractPaymentProofResult,
} from '@pro-dessert/contracts';

export interface BankDetailsSnapshot {
  recipientName: string;
  recipientInn: string;
  recipientKpp: string | null;
  settlementAccount: string;
  correspondentAccount: string;
  bik: string;
  bankName: string;
  paymentPurpose: string;
  detailsVersion: string;
  isDemo: boolean;
}

export type PublicPaymentView = PaymentInstructionsView;
export type PaymentActionResult = ContractPaymentActionResult;

export type PaymentProofResult = ContractPaymentProofResult;

export interface InvoiceDownload {
  filename: string;
  mimeType: 'application/pdf';
  bytes: Buffer;
}

export interface UploadedPaymentProof {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}
