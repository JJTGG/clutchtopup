import type { ProviderProduct } from "@/lib/fulfillment/types";

export type ProviderCatalog = {
  complete: boolean;
  products: ProviderProduct[];
};

export type CatalogProductSnapshot = {
  productId: string;
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

export type CatalogProductMatch = {
  providerProductId: string;
  productId: string;
};

export type CatalogSyncDecision =
  | {
      type: "create";
      product: ProviderProduct;
      productId: string;
    }
  | {
      type: "update";
      product: ProviderProduct;
      previous: CatalogProductSnapshot;
      productId: string;
    }
  | {
      type: "review";
      product: ProviderProduct;
      previous?: CatalogProductSnapshot;
      productId?: string;
      reasons: string[];
    }
  | {
      type: "deactivate";
      previous: CatalogProductSnapshot;
    }
  | {
      type: "unchanged";
      product: ProviderProduct;
      productId: string;
    };

export type CatalogSyncResult = {
  aborted: boolean;
  decisions: CatalogSyncDecision[];
  rejected: Array<{
    providerProductId?: string;
    reason: string;
  }>;
};