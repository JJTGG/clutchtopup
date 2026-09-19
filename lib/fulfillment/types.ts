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

export type FulfillmentRequest = {
  productId: string;
  gameSlug: string;
  region?: string;
  playerIdentifiers: PlayerIdentifier[];
  quantity: number;
  idempotencyKey: string;
};

export type ProviderProduct = {
  providerProductId: string;
  name: string;
  gameSlug: string;
  region?: string;
  currency: string;
  cost: number;
  available: boolean;
};

export type FulfillmentSubmission = {
  providerReference: string;
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