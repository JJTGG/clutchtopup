"use server";

import { redirect } from "next/navigation";

import { requireAdmin } from "@/lib/admin/auth";
import {
  createProduct,
  setProductActive,
} from "@/lib/catalog/products";

function parseFulfillmentJson(value: string) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(
      "Fulfillment configuration must be valid JSON.",
    );
  }
}

export async function createProductAction(
  formData: FormData,
) {
  await requireAdmin();

  const gameId = String(
    formData.get("gameId") ?? "",
  );

  const name = String(
    formData.get("name") ?? "",
  );

  const slug = String(
    formData.get("slug") ?? "",
  );

  const description = String(
    formData.get("description") ?? "",
  );

  const price = Number(
    formData.get("price") ?? "",
  );

  const currency = String(
    formData.get("currency") ?? "",
  );

  const fulfillmentJson = String(
    formData.get("fulfillmentConfig") ?? "",
  );

  try {
    const fulfillmentConfig =
      parseFulfillmentJson(
        fulfillmentJson,
      );

    await createProduct({
      gameId,
      name,
      slug,
      description,
      price,
      currency,
      fulfillmentConfig,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to create product.";

    redirect(
      `/admin/products?error=${encodeURIComponent(message)}`,
    );
  }

  redirect("/admin/products?created=1");
}

export async function toggleProductAction(
  formData: FormData,
) {
  await requireAdmin();

  const productId = String(
    formData.get("productId") ?? "",
  );

  const isActive =
    String(formData.get("isActive") ?? "") ===
    "true";

  try {
    await setProductActive(
      productId,
      !isActive,
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to update product.";

    redirect(
      `/admin/products?error=${encodeURIComponent(message)}`,
    );
  }

  redirect("/admin/products?updated=1");
}