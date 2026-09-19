export type PaymentStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "abandoned"
  | "reversed"
  | "refunded";

export type PaymentRequest = {
  orderId: string;
  orderNumber: string;
  amount: number;
  currency: string;
  idempotencyKey: string;
  customerEmail?: string;
};

export type PaymentInitialization = {
  providerReference: string;
  checkoutUrl: string;
  status: PaymentStatus;
  rawResponse?: unknown;
};

export type PaymentVerification = {
  providerReference: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  rawResponse?: unknown;
};

export type PaymentWebhook = {
  providerReference: string;
  status: PaymentStatus;
  amount?: number;
  currency?: string;
  rawPayload: unknown;
};