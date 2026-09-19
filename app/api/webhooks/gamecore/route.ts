import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { reconcileFulfillment } from "@/lib/fulfillment/reconcile";

const PROVIDER = "gamecore";
const MAX_WEBHOOK_AGE_SECONDS = 300;

type GameCoreWebhook = {
  event_id: string;
  event_type: "order.completed" | "order.failed";
  occurred_at: string;
  data: {
    orderCode: string;
    status: "completed" | "failed";
    [key: string]: unknown;
  };
};

function verifySignature(
  rawBody: string,
  timestampHeader: string | null,
  signatureHeader: string | null,
  secret: string,
): boolean {
  if (!timestampHeader || !signatureHeader) {
    return false;
  }

  const timestamp = Number(timestampHeader);

  if (!Number.isInteger(timestamp)) {
    return false;
  }

  const age =
    Math.abs(
      Math.floor(Date.now() / 1000) - timestamp,
    );

  if (age > MAX_WEBHOOK_AGE_SECONDS) {
    return false;
  }

  const expected =
    "sha256=" +
    crypto
      .createHmac("sha256", secret)
      .update(`${timestamp}.${rawBody}`)
      .digest("hex");

  const received = Buffer.from(
    signatureHeader,
    "utf8",
  );

  const expectedBuffer = Buffer.from(
    expected,
    "utf8",
  );

  return (
    received.length ===
      expectedBuffer.length &&
    crypto.timingSafeEqual(
      received,
      expectedBuffer,
    )
  );
}

function isValidWebhook(
  value: unknown,
): value is GameCoreWebhook {
  if (
    !value ||
    typeof value !== "object"
  ) {
    return false;
  }

  const payload =
    value as Record<string, unknown>;

  const data =
    payload.data;

  return (
    typeof payload.event_id === "string" &&
    payload.event_id.length > 0 &&
    (
      payload.event_type ===
        "order.completed" ||
      payload.event_type ===
        "order.failed"
    ) &&
    typeof payload.occurred_at === "string" &&
    typeof data === "object" &&
    data !== null &&
    typeof (data as Record<string, unknown>)
      .orderCode === "string" &&
    typeof (data as Record<string, unknown>)
      .status === "string"
  );
}

export async function POST(
  request: Request,
) {
  const secret =
    process.env.GAMECORE_WEBHOOK_SECRET;

  if (!secret) {
    console.error(
      "GAMECORE_WEBHOOK_SECRET is not configured.",
    );

    return NextResponse.json(
      { error: "Webhook unavailable." },
      { status: 500 },
    );
  }

  const rawBody =
    await request.text();

  const validSignature =
    verifySignature(
      rawBody,
      request.headers.get(
        "x-webhook-timestamp",
      ),
      request.headers.get(
        "x-webhook-signature",
      ),
      secret,
    );

  if (!validSignature) {
    return NextResponse.json(
      { error: "Invalid webhook signature." },
      { status: 401 },
    );
  }

  let payload: unknown;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      { error: "Invalid webhook payload." },
      { status: 400 },
    );
  }

  if (!isValidWebhook(payload)) {
    return NextResponse.json(
      { error: "Invalid webhook payload." },
      { status: 400 },
    );
  }

  const event = payload;
  const providerReference =
    event.data.orderCode;

  const supabase =
    createAdminClient();

  /*
   * Store the event before doing any external
   * reconciliation work.
   */
  const { data: insertedEvent, error: insertError } =
    await supabase
      .from("fulfillment_webhook_events")
      .insert({
        provider: PROVIDER,
        event_id: event.event_id,
        event_type: event.event_type,
        provider_reference: providerReference,
        payload: event,
        status: "received",
      })
      .select("id, status")
      .single();

  if (insertError) {
    /*
     * Duplicate event delivery.
     */
    if (insertError.code === "23505") {
      const { data: existing } =
        await supabase
          .from("fulfillment_webhook_events")
          .select("status")
          .eq("provider", PROVIDER)
          .eq("event_id", event.event_id)
          .maybeSingle();

      if (
        existing?.status === "processed" ||
        existing?.status === "processing"
      ) {
        return NextResponse.json({
          received: true,
        });
      }

      /*
       * A previously failed event can be retried.
       * Fall through and claim it below.
       */
    } else {
      console.error(
        "Unable to store GameCore webhook:",
        insertError,
      );

      return NextResponse.json(
        { error: "Unable to store webhook." },
        { status: 500 },
      );
    }
  }

  let eventId =
    insertedEvent?.id ?? null;

  if (!eventId) {
    const { data: existing } =
      await supabase
        .from("fulfillment_webhook_events")
        .select("id, status")
        .eq("provider", PROVIDER)
        .eq("event_id", event.event_id)
        .single();

    if (!existing) {
      return NextResponse.json(
        { error: "Webhook event not found." },
        { status: 500 },
      );
    }

    if (
      existing.status === "processed" ||
      existing.status === "processing"
    ) {
      return NextResponse.json({
        received: true,
      });
    }

    eventId = existing.id;
  }

  /*
   * Claim the event.
   *
   * Only one worker gets to process a received/failed
   * event. Concurrent duplicate deliveries are harmless.
   */
  const { data: claimed } =
    await supabase
      .from("fulfillment_webhook_events")
      .update({
        status: "processing",
        error_message: null,
      })
      .eq("id", eventId)
      .in("status", [
        "received",
        "failed",
      ])
      .select("id")
      .maybeSingle();

  if (!claimed) {
    return NextResponse.json({
      received: true,
    });
  }

  /*
   * Find the internal provider-order record.
   *
   * A webhook can theoretically arrive before the original
   * POST response has finished persisting its provider code.
   * Returning 500 makes GameCore retry rather than losing it.
   */
  const { data: providerOrder } =
    await supabase
      .from("fulfillment_provider_orders")
      .select("fulfillment_request_id")
      .eq("provider", PROVIDER)
      .eq(
        "provider_reference",
        providerReference,
      )
      .maybeSingle();

  if (!providerOrder) {
    await supabase
      .from("fulfillment_webhook_events")
      .update({
        status: "failed",
        error_message:
          "Provider order has not been persisted yet.",
      })
      .eq("id", eventId);

    return NextResponse.json(
      { error: "Provider order not found yet." },
      { status: 500 },
    );
  }

  try {
    await reconcileFulfillment(
      providerOrder.fulfillment_request_id,
    );

    await supabase
      .from("fulfillment_webhook_events")
      .update({
        status: "processed",
        processed_at:
          new Date().toISOString(),
        error_message: null,
      })
      .eq("id", eventId);

    return NextResponse.json({
      received: true,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Webhook reconciliation failed.";

    await supabase
      .from("fulfillment_webhook_events")
      .update({
        status: "failed",
        error_message: message,
      })
      .eq("id", eventId);

    console.error(
      "GameCore webhook reconciliation failed:",
      error,
    );

    return NextResponse.json(
      { error: "Webhook processing failed." },
      { status: 500 },
    );
  }
}