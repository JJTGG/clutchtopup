import type { ProviderProduct } from "@/lib/fulfillment/types";

export type CatalogProductSnapshot = {
  provider: string;
  providerProductId: string;
  gameSlug: string;
  name: string;
  region?: string;
  currency: string;
  cost: number;
  available: boolean;
  fulfillmentFields: ProviderProduct["fulfillmentFields"];
};

export type CatalogSyncDecision =
  | {
      type: "create";
      product: ProviderProduct;
    }
  | {
      type: "update";
      product: ProviderProduct;
      previous: CatalogProductSnapshot;
    }
  | {
      type: "deactivate";
      previous: CatalogProductSnapshot;
    }
  | {
      type: "unchanged";
      product: ProviderProduct;
    };

export type CatalogSyncResult = {
  decisions: CatalogSyncDecision[];
  rejected: Array<{
    providerProductId?: string;
    reason: string;
  }>;
};