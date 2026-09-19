import type {
  FulfillmentRequest,
  FulfillmentStatusResult,
  FulfillmentSubmission,
  FulfillmentWebhook,
  ProviderProduct,
} from "@/lib/fulfillment/types";

export interface FulfillmentProvider {
  readonly name: string;

  getProducts(): Promise<ProviderProduct[]>;

  submit(request: FulfillmentRequest): Promise<FulfillmentSubmission>;

  getStatus(providerReference: string): Promise<FulfillmentStatusResult>;

  parseWebhook(
    payload: unknown,
    signature?: string,
  ): Promise<FulfillmentWebhook>;
}