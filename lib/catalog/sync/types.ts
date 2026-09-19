import type { ProviderProduct } from "@/lib/fulfillment/types";

export type ProviderCatalog = {
  complete: boolean;
  products: ProviderProduct[];
};

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
      type: "review";
      product: ProviderProduct;
      previous: CatalogProductSnapshot;
      reasons: string[];
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
  aborted: boolean;
  decisions: CatalogSyncDecision[];
  rejected: Array<{
    providerProductId?: string;
    reason: string;
  }>;
};