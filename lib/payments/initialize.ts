import { createClient } from "@/lib/supabase/server";
import { getPaymentProvider } from "@/lib/payments/providers";
import type { PaymentInitialization } from "@/lib/payments/types";

export async function initializePayment(
  orderId: string,
  providerName: string,
  idempotencyKey: string,
): Promise<PaymentInitialization> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new Error("Authentication required.");
  }

  if (!orderId) {
    throw new Error("Order is required.");
  }

  if (!providerName) {
    throw new Error("Payment provider is required.");
  }

  if (!idempotencyKey) {
    throw new Error("Idempotency key is required.");
  }

  const { data: payment, error } = await supabase.rpc(
    "initialize_payment_atomic",
    {
      p_order_id: orderId,
      p_provider: providerName,
      p_idempotency_key: idempotencyKey,
    },
  );

  if (error || !payment?.[0]) {
    throw new Error(
      error?.message ?? "Unable to initialize payment.",
    );
  }

  const internalPayment = payment[0];

  // If this payment was already initialized with the provider,
  // return the existing result instead of creating another one.
  if (
    internalPayment.provider_reference &&
    internalPayment.checkout_url
  ) {
    return {
      providerReference: internalPayment.provider_reference,
      checkoutUrl: internalPayment.checkout_url,
      status: internalPayment.payment_status,
    };
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id, order_number")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();

  if (orderError || !order) {
    throw new Error("Order not found.");
  }

  const provider = getPaymentProvider(providerName);

  let providerResult;

  try {
    providerResult = await provider.initialize({
      orderId: internalPayment.payment_id
        ? order.id
        : orderId,
      orderNumber: order.order_number,
      amount: Number(internalPayment.amount),
      currency: internalPayment.currency,
      idempotencyKey,
    });
  } catch {
    // The internal payment intentionally remains pending.
    // A provider timeout/error is recoverable and must not
    // be treated as a confirmed payment failure.
    throw new Error(
      "Payment provider is temporarily unavailable.",
    );
  }

  if (
    !providerResult.providerReference ||
    !providerResult.checkoutUrl
  ) {
    throw new Error(
      "Payment provider returned an invalid initialization response.",
    );
  }

  if (
    providerResult.status !== "pending"
  ) {
    throw new Error(
      "Payment provider returned an invalid initialization status.",
    );
  }

  const { data: finalized, error: finalizeError } =
    await supabase.rpc(
      "finalize_payment_initialization",
      {
        p_payment_id: internalPayment.payment_id,
        p_provider_reference:
          providerResult.providerReference,
        p_checkout_url: providerResult.checkoutUrl,
      },
    );

  if (finalizeError || !finalized?.[0]) {
    throw new Error(
      "Unable to save payment initialization.",
    );
  }

  return {
    providerReference: finalized[0].provider_reference,
    checkoutUrl: finalized[0].checkout_url,
    status: finalized[0].payment_status,
    rawResponse: providerResult.rawResponse,
  };
}