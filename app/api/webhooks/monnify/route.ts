import { NextResponse } from "next/server";

import { submitFulfillment } from "@/lib/fulfillment/submit";
import { getPaymentProvider } from "@/lib/payments/providers";
import { createAdminClient } from "@/lib/supabase/admin";

const PROVIDER = "monnify";
const FULFILLMENT_PROVIDER = "gamecore";

export async function POST(
  request: Request,
) {
  const rawBody =
    await request.text();

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid webhook payload.",
      },
      { status: 400 },
    );
  }

  const signature =
    request.headers.get(
      "monnify-signature",
    );

  let webhook;

  try {
    const provider =
      getPaymentProvider(
        PROVIDER,
      );

    webhook =
      await provider.parseWebhook(
        payload,
        signature ?? undefined,
        rawBody,
      );
  } catch (error) {
    console.error(
      "Monnify webhook validation failed:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Invalid webhook.",
      },
      { status: 401 },
    );
  }

  /*
   * Only successful payments can reach
   * payment confirmation.
   */
  if (
    webhook.status !==
    "confirmed"
  ) {
    return NextResponse.json({
      received: true,
      ignored: true,
    });
  }

  if (
    webhook.amount ===
      undefined ||
    !webhook.currency
  ) {
    return NextResponse.json(
      {
        error:
          "Incomplete payment notification.",
      },
      { status: 400 },
    );
  }

  const supabase =
    createAdminClient();

  /*
   * Find the internal payment using the
   * provider transaction reference.
   */
  const {
    data: payment,
    error: paymentError,
  } = await supabase
    .from("payments")
    .select(
      `
        id,
        order_id,
        provider,
        provider_reference,
        amount,
        currency,
        status
      `,
    )
    .eq(
      "provider",
      PROVIDER,
    )
    .eq(
      "provider_reference",
      webhook.providerReference,
    )
    .maybeSingle();

  if (paymentError) {
    console.error(
      "Unable to load Monnify payment:",
      paymentError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to process payment.",
      },
      { status: 500 },
    );
  }

  /*
   * A webhook can arrive before our initialization
   * transaction has been persisted. Returning 500
   * lets Monnify retry rather than losing the event.
   */
  if (!payment) {
    return NextResponse.json(
      {
        error:
          "Payment has not been initialized.",
      },
      { status: 500 },
    );
  }

  if (
    payment.provider !== PROVIDER
  ) {
    return NextResponse.json(
      {
        error:
          "Payment provider mismatch.",
      },
      { status: 400 },
    );
  }

  /*
   * Verify the transaction directly against
   * Monnify before delivering value.
   *
   * The webhook is the trigger.
   * Monnify's API is the authoritative
   * transaction verification.
   */
  let verifiedPayment;

  try {
    const provider =
      getPaymentProvider(
        PROVIDER,
      );

    verifiedPayment =
      await provider.verify(
        webhook.providerReference,
      );
  } catch (error) {
    console.error(
      "Monnify transaction verification failed:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Unable to verify payment.",
      },
      { status: 500 },
    );
  }

  if (
    verifiedPayment.status !==
    "confirmed"
  ) {
    return NextResponse.json(
      {
        error:
          "Monnify transaction is not confirmed.",
      },
      { status: 409 },
    );
  }

  if (
    verifiedPayment.providerReference !==
    payment.provider_reference
  ) {
    return NextResponse.json(
      {
        error:
          "Provider reference mismatch.",
      },
      { status: 400 },
    );
  }

  if (
    verifiedPayment.amount !==
    Number(payment.amount)
  ) {
    return NextResponse.json(
      {
        error:
          "Payment amount does not match.",
      },
      { status: 400 },
    );
  }

  if (
    verifiedPayment.currency.toUpperCase() !==
    payment.currency.toUpperCase()
  ) {
    return NextResponse.json(
      {
        error:
          "Payment currency does not match.",
      },
      { status: 400 },
    );
  }

  /*
   * Atomic financial transition:
   *
   * pending payment
   *      ↓
   * confirmed payment
   *      ↓
   * paid order
   */
  const {
    data: confirmation,
    error: confirmationError,
  } = await supabase.rpc(
    "confirm_payment_atomic",
    {
      p_payment_id:
        payment.id,
      p_provider_reference:
        webhook.providerReference,
      p_amount:
        verifiedPayment.amount,
      p_currency:
        verifiedPayment.currency,
    },
  );

  if (
    confirmationError ||
    !confirmation?.[0]
  ) {
    console.error(
      "Atomic payment confirmation failed:",
      confirmationError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to confirm payment.",
      },
      { status: 500 },
    );
  }

  /*
   * Payment is now confirmed and the order
   * is paid. Fulfillment has its own deterministic
   * idempotency protection.
   */
  try {
    await submitFulfillment(
      payment.order_id,
      FULFILLMENT_PROVIDER,
    );
  } catch (error) {
    /*
     * Do not undo the payment.
     *
     * The payment is already financially confirmed.
     * A 500 causes Monnify to retry the webhook,
     * while submitFulfillment() safely recovers
     * through its own idempotency model.
     */
    console.error(
      "Fulfillment submission after payment failed:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Payment confirmed but fulfillment is pending.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    received: true,
    paymentStatus:
      confirmation[0]
        .payment_status,
    orderStatus:
      confirmation[0]
        .order_status,
  });
}