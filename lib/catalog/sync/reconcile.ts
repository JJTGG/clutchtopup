import type { ProviderProduct } from "@/lib/fulfillment/types";
import type {
  CatalogProductSnapshot,
  CatalogSyncResult,
  ProviderCatalog,
} from "@/lib/catalog/sync/types";

function productKey(
  provider: string,
  providerProductId: string,
) {
  return `${provider}:${providerProductId}`;
}

function isValidProduct(product: ProviderProduct) {
  return (
    typeof product.provider === "string" &&
    product.provider.trim().length > 0 &&
    typeof product.providerProductId === "string" &&
    product.providerProductId.trim().length > 0 &&
    typeof product.gameSlug === "string" &&
    product.gameSlug.trim().length > 0 &&
    typeof product.name === "string" &&
    product.name.trim().length > 0 &&
    typeof product.currency === "string" &&
    product.currency.trim().length > 0 &&
    Number.isFinite(product.cost) &&
    product.cost >= 0 &&
    typeof product.available === "boolean" &&
    Array.isArray(product.fulfillmentFields)
  );
}

function hasIdentityChange(
  product: ProviderProduct,
  previous: CatalogProductSnapshot,
) {
  const reasons: string[] = [];

  if (previous.gameSlug !== product.gameSlug) {
    reasons.push("Game mapping changed.");
  }

  if (previous.region !== product.region) {
    reasons.push("Region changed.");
  }

  if (previous.currency !== product.currency) {
    reasons.push("Currency changed.");
  }

  if (
    JSON.stringify(previous.fulfillmentFields) !==
    JSON.stringify(product.fulfillmentFields)
  ) {
    reasons.push("Fulfillment requirements changed.");
  }

  return reasons;
}

function hasSafeChange(
  product: ProviderProduct,
  previous: CatalogProductSnapshot,
) {
  return (
    previous.name !== product.name ||
    previous.cost !== product.cost ||
    previous.available !== product.available
  );
}

export function reconcileCatalog(
  catalog: ProviderCatalog,
  existing: CatalogProductSnapshot[],
): CatalogSyncResult {
  if (!catalog.complete) {
    return {
      aborted: true,
      decisions: [],
      rejected: [
        {
          reason:
            "Provider catalog response is incomplete.",
        },
      ],
    };
  }

  const incoming = catalog.products;

  if (incoming.length === 0) {
    return {
      aborted: true,
      decisions: [],
      rejected: [
        {
          reason:
            "Provider catalog response is empty.",
        },
      ],
    };
  }

  const decisions: CatalogSyncResult["decisions"] = [];
  const rejected: CatalogSyncResult["rejected"] = [];

  const existingMap = new Map(
    existing.map((product) => [
      productKey(
        product.provider,
        product.providerProductId,
      ),
      product,
    ]),
  );

  const seen = new Set<string>();

  for (const product of incoming) {
    if (!isValidProduct(product)) {
      rejected.push({
        providerProductId:
          typeof product?.providerProductId === "string"
            ? product.providerProductId
            : undefined,
        reason: "Invalid provider product.",
      });

      continue;
    }

    const key = productKey(
      product.provider,
      product.providerProductId,
    );

    if (seen.has(key)) {
      rejected.push({
        providerProductId: product.providerProductId,
        reason: "Duplicate provider product.",
      });

      continue;
    }

    seen.add(key);

    const previous = existingMap.get(key);

    if (!previous) {
      decisions.push({
        type: "create",
        product,
      });

      continue;
    }

    const identityChangeReasons = hasIdentityChange(
      product,
      previous,
    );

    if (identityChangeReasons.length > 0) {
      decisions.push({
        type: "review",
        product,
        previous,
        reasons: identityChangeReasons,
      });

      continue;
    }

    if (hasSafeChange(product, previous)) {
      decisions.push({
        type: "update",
        product,
        previous,
      });

      continue;
    }

    decisions.push({
      type: "unchanged",
      product,
    });
  }

  if (rejected.length > 0) {
    return {
      aborted: true,
      decisions: [],
      rejected,
    };
  }

  for (const previous of existing) {
    const key = productKey(
      previous.provider,
      previous.providerProductId,
    );

    if (!seen.has(key)) {
      decisions.push({
        type: "deactivate",
        previous,
      });
    }
  }

  return {
    aborted: false,
    decisions,
    rejected,
  };
}