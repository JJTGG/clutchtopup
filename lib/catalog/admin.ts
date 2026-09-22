import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  getProvider,
  listProviders,
} from "@/lib/fulfillment/providers";
import { applyCatalogSync } from "@/lib/catalog/sync/apply";
import { reconcileCatalog } from "@/lib/catalog/sync/reconcile";
import type {
  CatalogProductMatch,
  CatalogProductSnapshot,
  CatalogSyncResult,
  ProviderCatalog,
} from "@/lib/catalog/sync/types";
import { requireAdmin } from "@/lib/admin/auth";

export async function getAdminCatalogOptions() {
  await requireAdmin();

  const supabase = createAdminClient();

  const [
    { data: games, error: gamesError },
    {
      data: providers,
      error: providersError,
    },
  ] = await Promise.all([
    supabase
      .from("games")
      .select("id, name, slug, description")
      .eq("is_active", true)
      .order("name"),

    supabase
      .from("catalog_providers")
      .select("id, slug, name, is_active")
      .eq("is_active", true)
      .order("name"),
  ]);

  if (gamesError) {
    throw new Error("Unable to load games.");
  }

  if (providersError) {
    throw new Error(
      "Unable to load catalog providers.",
    );
  }

  return {
    games: games ?? [],
    providers: providers ?? [],
    registeredProviders: listProviders().map(
      (provider) => ({
        name: provider.name,
      }),
    ),
  };
}

async function getExistingSnapshots(
  providerName: string,
  gameSlug: string,
): Promise<CatalogProductSnapshot[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("product_provider_mappings")
    .select(`
      product_id,
      provider_product_id,
      region,
      currency,
      provider_cost,
      available,
      fulfillment_fields,
      catalog_providers!inner (
        slug
      ),
      products!inner (
        name,
        games!inner (
          slug
        )
      )
    `)
    .eq(
      "catalog_providers.slug",
      providerName,
    )
    .eq(
      "products.games.slug",
      gameSlug,
    );

  if (error) {
    console.error(
      "getExistingSnapshots failed:",
      error,
    );

    throw new Error(
      "Unable to load existing catalog mappings.",
    );
  }

  return (data ?? []).map((row) => {
    const provider = Array.isArray(
      row.catalog_providers,
    )
      ? row.catalog_providers[0]
      : row.catalog_providers;

    const product = Array.isArray(row.products)
      ? row.products[0]
      : row.products;

    const game = product?.games
      ? Array.isArray(product.games)
        ? product.games[0]
        : product.games
      : null;

    return {
      productId: row.product_id,
      provider:
        provider?.slug ?? providerName,
      providerProductId:
        row.provider_product_id,
      gameSlug:
        game?.slug ?? gameSlug,
      name:
        product?.name ??
        "Unknown product",
      region:
        row.region ?? undefined,
      currency: row.currency,
      cost: Number(
        row.provider_cost,
      ),
      available:
        row.available,
      fulfillmentFields:
        Array.isArray(
          row.fulfillment_fields,
        )
          ? row.fulfillment_fields
          : [],
    };
  });
}

export async function previewCatalogSync(
  providerName: string,
  gameSlug: string,
  matches: CatalogProductMatch[] = [],
): Promise<{
  catalog: ProviderCatalog;
  result: CatalogSyncResult;
}> {
  await requireAdmin();

  const provider =
    getProvider(providerName);

  const products =
    await provider.getProducts(
      gameSlug,
    );

  const catalog: ProviderCatalog = {
    complete: true,
    products,
  };

  const existing =
    await getExistingSnapshots(
      providerName,
      gameSlug,
    );

  const result =
    reconcileCatalog(
      catalog,
      existing,
      matches,
    );

  return {
    catalog,
    result,
  };
}

export async function getProductsForGame(
  gameSlug: string,
) {
  await requireAdmin();

  const supabase =
    createAdminClient();

  const { data, error } =
    await supabase
      .from("products")
      .select(`
        id,
        name,
        slug,
        price,
        currency,
        games!inner (
          slug
        )
      `)
      .eq(
        "is_active",
        true,
      )
      .eq(
        "games.slug",
        gameSlug,
      )
      .order("name");

  if (error) {
    console.error(
      "getProductsForGame failed:",
      error,
    );

    throw new Error(
      "Unable to load ClutchTopUp products.",
    );
  }

  return (data ?? []).map(
    (product) => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      price: product.price,
      currency: product.currency,
    }),
  );
}

export async function applyAdminCatalogSync(
  providerName: string,
  gameSlug: string,
  matches: CatalogProductMatch[],
) {
  await requireAdmin();

  /*
   * Re-fetch the provider catalog and existing
   * mappings here.
   *
   * Never trust a decision object sent by the browser.
   */
  const { result } =
    await previewCatalogSync(
      providerName,
      gameSlug,
      matches,
    );

  if (result.aborted) {
    throw new Error(
      result.rejected[0]?.reason ??
        "Catalog synchronization was aborted.",
    );
  }

  const reviewCount =
    result.decisions.filter(
      (decision) =>
        decision.type === "review",
    ).length;

  if (reviewCount > 0) {
    throw new Error(
      `${reviewCount} catalog item(s) still require review.`,
    );
  }

  return applyCatalogSync(
    result.decisions,
  );
}