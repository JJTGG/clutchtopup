import { createClient } from "@/lib/supabase/server";

import {
  parseFulfillmentConfig,
} from "@/lib/fulfillment/config";

import {
  validateFulfillmentData,
} from "@/lib/fulfillment/validate";

import type {
  CreateOrderInput,
  CreateOrderResult,
} from "@/lib/orders/types";

export async function createOrder(
  input: CreateOrderInput,
): Promise<CreateOrderResult> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Authentication required.");
  }

  if (!input.productId) {
    throw new Error("Product is required.");
  }

  if (
    !Number.isInteger(input.quantity) ||
    input.quantity < 1
  ) {
    throw new Error("Invalid quantity.");
  }

  if (!input.idempotencyKey) {
    throw new Error(
      "Idempotency key is required.",
    );
  }

  const { data: product, error: productError } =
    await supabase
      .from("products")
      .select(`
        id,
        is_active,
        fulfillment_config,
        games!inner (
          is_active
        )
      `)
      .eq("id", input.productId)
      .eq("is_active", true)
      .eq("games.is_active", true)
      .single();

  if (productError || !product) {
    throw new Error("Product is unavailable.");
  }

  const { data: mapping, error: mappingError } =
    await supabase
      .from("product_provider_mappings")
      .select("id")
      .eq("product_id", input.productId)
      .eq("available", true)
      .limit(1)
      .maybeSingle();

  if (mappingError || !mapping) {
    throw new Error(
      "Product fulfillment is currently unavailable.",
    );
  }

  const config = parseFulfillmentConfig(
    product.fulfillment_config,
  );

  validateFulfillmentData(
    config,
    input.fulfillmentData,
  );

  const { data, error } =
    await supabase.rpc(
      "create_order_atomic",
      {
        p_product_id: input.productId,
        p_quantity: input.quantity,
        p_fulfillment_data:
          input.fulfillmentData,
        p_idempotency_key:
          input.idempotencyKey,
      },
    );

  if (error || !data?.[0]) {
    throw new Error(
      error?.message ??
        "Unable to create order.",
    );
  }

  return {
    orderId: data[0].order_id,
    orderNumber: data[0].order_number,
    status: data[0].order_status,
    total: Number(data[0].total),
    currency: data[0].currency,
  };
}