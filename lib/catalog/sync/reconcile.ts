import type { ProviderProduct } from "@/lib/fulfillment/types";
import type {
  CatalogProductSnapshot,
  CatalogSyncResult,
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
    Array.isArray(product.fulfillmentFields)
  );
}

export function reconcileCatalog(
  incoming: ProviderProduct[],
  existing: CatalogProductSnapshot[],
): CatalogSyncResult {
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

    const changed =
      previous.gameSlug !== product.gameSlug ||
      previous.name !== product.name ||
      previous.region !== product.region ||
      previous.currency !== product.currency ||
      previous.cost !== product.cost ||
      previous.available !== product.available ||
      JSON.stringify(previous.fulfillmentFields) !==
        JSON.stringify(product.fulfillmentFields);

    if (!changed) {
      decisions.push({
        type: "unchanged",
        product,
      });

      continue;
    }

    decisions.push({
      type: "update",
      product,
      previous,
    });
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
    decisions,
    rejected,
  };
}