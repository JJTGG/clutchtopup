import { createClient } from "@/lib/supabase/server";

export async function getActiveGames() {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("games")
    .select("id, name, slug, description, image_url")
    .eq("is_active", true)
    .order("name");

  if (error) {
    console.error("getActiveGames failed:", error);
    throw new Error("Unable to load games.");
  }

  return data;
}

export async function getGameBySlug(slug: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("games")
    .select(`
      id,
      name,
      slug,
      description,
      image_url,
      products (
        id,
        name,
        slug,
        description,
        price,
        currency,
        fulfillment_config
      )
    `)
    .eq("slug", slug)
    .eq("is_active", true)
    .single();

  if (error) {
    return null;
  }

  return data;
}

export async function getProductById(productId: string) {
  const supabase = await createClient();

  const { data, error } = await supabase
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

  if (error) {
    return null;
  }

  return data;
}