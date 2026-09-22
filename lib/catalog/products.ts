import "server-only";

import { createClient } from "@/lib/supabase/server";
import { parseFulfillmentConfig } from "@/lib/fulfillment/config";

function normalizeSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function validateProductInput(input: {
  name: string;
  slug: string;
  description: string;
  price: number;
  currency: string;
  fulfillmentConfig: unknown;
}) {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Product name is required.");
  }

  if (name.length > 200) {
    throw new Error("Product name is too long.");
  }

  const slug = normalizeSlug(input.slug || input.name);

  if (!slug) {
    throw new Error("Product slug is required.");
  }

  if (slug.length > 100) {
    throw new Error("Product slug is too long.");
  }

  if (!Number.isFinite(input.price) || input.price <= 0) {
    throw new Error("Product price must be greater than zero.");
  }

  if (input.price > 1_000_000_000) {
    throw new Error("Product price is too high.");
  }

  const currency = input.currency.trim().toUpperCase();

  if (!/^[A-Z]{3,10}$/.test(currency)) {
    throw new Error("Currency must contain 3-10 letters.");
  }

  const fulfillmentConfig = parseFulfillmentConfig(
    input.fulfillmentConfig,
  );

  const keys = new Set<string>();

  for (const field of fulfillmentConfig.fields) {
    const key = field.key.trim();

    if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(key)) {
      throw new Error(
        `Invalid fulfillment field key: ${field.key}`,
      );
    }

    if (keys.has(key)) {
      throw new Error(
        `Duplicate fulfillment field: ${key}`,
      );
    }

    keys.add(key);

    if (field.type === "select") {
      if (!field.options?.length) {
        throw new Error(
          `${field.label} requires at least one option.`,
        );
      }
    }
  }

  return {
    name,
    slug,
    description: input.description.trim() || null,
    price: input.price,
    currency,
    fulfillmentConfig,
  };
}

export async function createProduct(input: {
  gameId: string;
  name: string;
  slug: string;
  description: string;
  price: number;
  currency: string;
  fulfillmentConfig: unknown;
}) {
  const supabase = await createClient();

  if (!input.gameId) {
    throw new Error("Game is required.");
  }

  const validated = validateProductInput(input);

  const { data: game, error: gameError } = await supabase
    .from("games")
    .select("id, is_active")
    .eq("id", input.gameId)
    .single();

  if (gameError || !game) {
    throw new Error("Game not found.");
  }

  if (!game.is_active) {
    throw new Error(
      "Products can only be created for active games.",
    );
  }

  const { data, error } = await supabase
    .from("products")
    .insert({
      game_id: input.gameId,
      name: validated.name,
      slug: validated.slug,
      description: validated.description,
      price: validated.price,
      currency: validated.currency,
      is_active: true,
      fulfillment_config: validated.fulfillmentConfig,
    })
    .select("id, name, slug")
    .single();

  if (error || !data) {
    if (error?.code === "23505") {
      throw new Error(
        "A product with this slug already exists.",
      );
    }

    console.error("createProduct failed:", error);
    throw new Error("Unable to create product.");
  }

  return data;
}

export async function setProductActive(
  productId: string,
  isActive: boolean,
) {
  if (!productId) {
    throw new Error("Product is required.");
  }

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("products")
    .update({
      is_active: isActive,
      updated_at: new Date().toISOString(),
    })
    .eq("id", productId)
    .select("id, name, is_active")
    .single();

  if (error || !data) {
    console.error("setProductActive failed:", error);
    throw new Error("Unable to update product.");
  }

  return data;
}

export async function getAdminProducts() {
  const supabase = await createClient();

  const { data: products, error } = await supabase
    .from("products")
    .select(`
      id,
      name,
      slug,
      description,
      price,
      currency,
      is_active,
      fulfillment_config,
      games (
        id,
        name,
        slug
      )
    `)
    .order("created_at", {
      ascending: false,
    });

  if (error) {
    console.error("getAdminProducts failed:", error);
    throw new Error("Unable to load products.");
  }

  const normalizedProducts = products.map((product) => {
    const rawGame = product.games;
    const game = Array.isArray(rawGame)
      ? rawGame[0] ?? null
      : rawGame;

    return {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      price: product.price,
      currency: product.currency,
      is_active: product.is_active,
      fulfillment_config: product.fulfillment_config,
      game,
    };
  });

  const productIds = normalizedProducts.map(
    (product) => product.id,
  );

  if (!productIds.length) {
    return normalizedProducts.map((product) => ({
      ...product,
      mappings: [],
      availableMappingCount: 0,
    }));
  }

  const { data: mappings, error: mappingError } =
    await supabase
      .from("product_provider_mappings")
      .select(`
        id,
        product_id,
        available,
        provider_product_id,
        catalog_providers (
          name,
          slug
        )
      `)
      .in("product_id", productIds);

  if (mappingError) {
    console.error(
      "getAdminProducts mappings failed:",
      mappingError,
    );
    throw new Error("Unable to load product mappings.");
  }

  return normalizedProducts.map((product) => {
    const productMappings = mappings
      .filter(
        (mapping) =>
          mapping.product_id === product.id,
      )
      .map((mapping) => {
        const rawProvider =
          mapping.catalog_providers;

        const provider = Array.isArray(rawProvider)
          ? rawProvider[0] ?? null
          : rawProvider;

        return {
          id: mapping.id,
          product_id: mapping.product_id,
          available: mapping.available,
          provider_product_id:
            mapping.provider_product_id,
          catalog_providers: provider,
        };
      });

    return {
      ...product,
      mappings: productMappings,
      availableMappingCount:
        productMappings.filter(
          (mapping) => mapping.available,
        ).length,
    };
  });
}