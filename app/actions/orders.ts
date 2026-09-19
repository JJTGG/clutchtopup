"use server";

import { redirect } from "next/navigation";
import { createOrder } from "@/lib/orders/create";

export async function submitOrder(formData: FormData) {
  const productId = String(formData.get("productId") ?? "");
  const quantity = Number(formData.get("quantity") ?? 1);
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

  const result = await createOrder({
    productId,
    quantity,
    fulfillmentData,
    idempotencyKey,
  });

  redirect(`/orders/${result.orderNumber}`);
}