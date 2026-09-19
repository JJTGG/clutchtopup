export type FulfillmentStatus =
  | "queued"
  | "processing"
  | "successful"
  | "pending"
  | "failed";

export type PlayerIdentifier = {
  key: string;
  value: string;
};

export type FulfillmentFieldType = "text" | "number" | "select";

export type ProviderFulfillmentField = {
  key: string;
  label: string;
  type: FulfillmentFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
};

export type FulfillmentRequest = {
  providerProductId: string;
  gameSlug: string;
  region?: string;
  playerIdentifiers: PlayerIdentifier[];
  quantity: number;
  idempotencyKey: string;
  externalOrderId: string;
  callbackUrl?: string;
};

export type ProviderProduct = {
  provider: string;
  providerProductId: string;
  gameSlug: string;
  name: string;
  region?: string;
  currency: string;
  cost: number;
  available: boolean;
  fulfillmentFields: ProviderFulfillmentField[];
  metadata?: Record<string, unknown>;
};

export type FulfillmentSubmission = {
  /**
   * Primary provider order reference used for status polling.
   *
   * For providers that can create multiple child orders from one
   * request, this is the first actual order reference.
   */
  providerReference: string;

  /**
   * All provider order references created by the submission.
   */
  providerReferences: string[];

  status: FulfillmentStatus;
  rawResponse?: unknown;
};

export type FulfillmentStatusResult = {
  providerReference: string;
  status: FulfillmentStatus;
  rawResponse?: unknown;
};

export type FulfillmentWebhook = {
  providerReference: string;
  status: FulfillmentStatus;
  rawPayload: unknown;
};