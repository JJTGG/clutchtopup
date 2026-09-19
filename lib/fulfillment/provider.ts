import type {
  FulfillmentRequest,
  FulfillmentStatusResult,
  FulfillmentSubmission,
  FulfillmentWebhook,
  ProviderProduct,
} from "@/lib/fulfillment/types";

export interface FulfillmentProvider {
  readonly name: string;

  /**
   * GameCore and similar providers may expose their catalog
   * through game-scoped endpoints rather than one global endpoint.
   */
  getProducts(gameSlug: string): Promise<ProviderProduct[]>;

  submit(request: FulfillmentRequest): Promise<FulfillmentSubmission>;

  getStatus(providerReference: string): Promise<FulfillmentStatusResult>;

  parseWebhook(
    payload: unknown,
    signature?: string,
  ): Promise<FulfillmentWebhook>;
}