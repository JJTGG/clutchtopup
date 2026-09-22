import type {
  PaymentInitialization,
  PaymentRequest,
  PaymentVerification,
  PaymentWebhook,
} from "@/lib/payments/types";

export interface PaymentProvider {
  readonly name: string;

  initialize(
    request: PaymentRequest,
  ): Promise<PaymentInitialization>;

  verify(
    providerReference: string,
  ): Promise<PaymentVerification>;

  parseWebhook(
    payload: unknown,
    signature?: string,
    rawBody?: string,
  ): Promise<PaymentWebhook>;
}