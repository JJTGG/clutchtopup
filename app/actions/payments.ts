"use server";

import { redirect } from "next/navigation";

import { initializePayment } from "@/lib/payments/initialize";

export type InitializePaymentState = {
  error?: string;
} | null;

export async function startPayment(
  _previousState: InitializePaymentState,
  formData: FormData,
): Promise<InitializePaymentState> {
  const orderId = String(
    formData.get("orderId") ?? "",
  );

  const idempotencyKey = String(
    formData.get("idempotencyKey") ?? "",
  );

  if (!orderId) {
    return {
      error: "Order is required.",
    };
  }

  if (!idempotencyKey) {
    return {
      error: "Payment request is invalid.",
    };
  }

  let payment;

  try {
    payment = await initializePayment(
      orderId,
      "monnify",
      idempotencyKey,
    );
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Unable to start payment.",
    };
  }

  if (!payment.checkoutUrl) {
    return {
      error: "Payment checkout is unavailable.",
    };
  }

  redirect(payment.checkoutUrl);
}