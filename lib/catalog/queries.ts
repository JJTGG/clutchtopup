import { createClient } from "@/lib/supabase/server";

export async function getActiveGames() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("games")
    .select(
      "id, name, slug, description, image_url",
    )
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("getActiveGames failed:", error);
    throw new Error("Unable to load games.");
  }

  return data;
}

export async function getGameBySlug(
  slug: string,
) {
  const supabase = await createClient();

  const { data: game, error: gameError } =
    await supabase
      .from("games")
      .select(
        "id, name, slug, description, image_url",
      )
      .eq("slug", slug)
      .eq("is_active", true)
      .single();

  if (gameError || !game) {
    return null;
  }

  const { data: products, error: productsError } =
    await supabase
      .from("products")
      .select(`
        id,
        name,
        slug,
        description,
        price,
        currency,
        fulfillment_config
      `)
      .eq("game_id", game.id)
      .eq("is_active", true)
      .order("name");

  if (productsError) {
    console.error(
      "getGameBySlug products failed:",
      productsError,
    );
    return null;
  }

  if (!products.length) {
    return {
      ...game,
      products: [],
    };
  }

  const productIds = products.map(
    (product) => product.id,
  );

  const { data: mappings, error: mappingError } =
    await supabase
      .from("product_provider_mappings")
      .select("product_id")
      .in("product_id", productIds)
      .eq("available", true);

  if (mappingError) {
    console.error(
      "getGameBySlug mappings failed:",
      mappingError,
    );
    return null;
  }

  const mappedProductIds = new Set(
    mappings.map(
      (mapping) => mapping.product_id,
    ),
  );

  return {
    ...game,
    products: products.filter(
      (product) =>
        mappedProductIds.has(product.id),
    ),
  };
}

export async function getProductById(
  productId: string,
) {
  const supabase = await createClient();

  const { data: product, error } =
    await supabase
      .from("products")
      .select(`
        id,
        name,
        slug,
        description,
        price,
        currency,
        fulfillment_config,
        games!inner (
          id,
          name,
          slug,
          is_active
        )
      `)
      .eq("id", productId)
      .eq("is_active", true)
      .eq("games.is_active", true)
      .single();

  if (error || !product) {
    return null;
  }

  const { data: mapping, error: mappingError } =
    await supabase
      .from("product_provider_mappings")
      .select("id")
      .eq("product_id", productId)
      .eq("available", true)
      .limit(1)
      .maybeSingle();

  if (mappingError || !mapping) {
    return null;
  }

  return product;
}