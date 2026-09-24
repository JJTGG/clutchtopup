"use server";

import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import { createOrder } from "@/lib/orders/create";

export type SubmitOrderState = {
  error?: string;
} | null;

export async function submitOrder(
  _previousState: SubmitOrderState,
  formData: FormData,
): Promise<SubmitOrderState> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const { error } =
      await supabase.auth.signInAnonymously();

    if (error) {
      return {
        error:
          "Unable to start checkout. Please try again.",
      };
    }
  }

  const productId = String(
    formData.get("productId") ?? "",
  );

  const quantity = Number(
    formData.get("quantity") ?? 1,
  );

  const idempotencyKey = String(
    formData.get("idempotencyKey") ?? "",
  );

  const fulfillmentData: Record<string, unknown> = {};

  for (const [key, value] of formData.entries()) {
    if (
      key !== "productId" &&
      key !== "quantity" &&
      key !== "idempotencyKey"
    ) {
      fulfillmentData[key] = String(value);
    }
  }

  let result;

  try {
    result = await createOrder({
      productId,
      quantity,
      fulfillmentData,
      idempotencyKey,
    });
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to create order.",
    };
  }

  redirect(`/orders/${result.orderNumber}`);
}