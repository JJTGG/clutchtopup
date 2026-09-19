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

  const data = payload.data;

  if (
    typeof payload.event_id !== "string" ||
    payload.event_id.length === 0
  ) {
    return false;
  }

  if (
    payload.event_type !==
      "order.completed" &&
    payload.event_type !==
      "order.failed"
  ) {
    return false;
  }

  if (
    typeof payload.occurred_at !==
    "string"
  ) {
    return false;
  }

  if (
    typeof data !== "object" ||
    data === null
  ) {
    return false;
  }

  const webhookData =
    data as Record<string, unknown>;

  if (
    typeof webhookData.orderCode !==
    "string" ||
    webhookData.orderCode.length === 0
  ) {
    return false;
  }

  const expectedStatus =
    payload.event_type ===
    "order.completed"
      ? "completed"
      : "failed";

  return (
    webhookData.status ===
    expectedStatus
  );
}

async function processWebhookEvent(
  eventId: string,
  providerReference: string,
) {
  const supabase =
    createAdminClient();

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
    throw new Error(
      "Provider order has not been persisted yet.",
    );
  }

  await reconcileFulfillment(
    providerOrder.fulfillment_request_id,
  );

  const { error } =
    await supabase
      .from("fulfillment_webhook_events")
      .update({
        status: "processed",
        processed_at:
          new Date().toISOString(),
        error_message: null,
      })
      .eq("id", eventId);

  if (error) {
    throw new Error(
      "Unable to mark webhook event as processed.",
    );
  }
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
      {
        error:
          "Invalid webhook signature.",
      },
      { status: 401 },
    );
  }

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

  if (!isValidWebhook(payload)) {
    return NextResponse.json(
      {
        error:
          "Invalid webhook payload.",
      },
      { status: 400 },
    );
  }

  const event = payload;

  const headerEvent =
    request.headers.get(
      "x-webhook-event",
    );

  /*
   * The body event_type is authoritative.
   * If GameCore also supplies the event header,
   * reject a disagreement rather than processing
   * an ambiguous event.
   */
  if (
    headerEvent &&
    headerEvent !== event.event_type
  ) {
    return NextResponse.json(
      {
        error:
          "Webhook event type mismatch.",
      },
      { status: 400 },
    );
  }

  /*
   * GameCore documents X-Idempotency-Key as the
   * stable event ID across retries. We store the
   * payload event_id as the event identity too,
   * but use the documented payload event_id as
   * our database deduplication key because the
   * current table schema is built around event_id.
   */
  const providerReference =
    event.data.orderCode;

  const supabase =
    createAdminClient();

  const {
    data: insertedEvent,
    error: insertError,
  } = await supabase
    .from(
      "fulfillment_webhook_events",
    )
    .insert({
      provider: PROVIDER,
      event_id: event.event_id,
      event_type: event.event_type,
      provider_reference:
        providerReference,
      payload: event,
      status: "received",
    })
    .select("id, status")
    .single();

  let eventId =
    insertedEvent?.id ?? null;

  if (insertError) {
    if (insertError.code !== "23505") {
      console.error(
        "Unable to store GameCore webhook:",
        insertError,
      );

      return NextResponse.json(
        {
          error:
            "Unable to store webhook.",
        },
        { status: 500 },
      );
    }

    /*
     * Existing event delivery.
     */
    const {
      data: existing,
      error: existingError,
    } = await supabase
      .from(
        "fulfillment_webhook_events",
      )
      .select("id, status")
      .eq("provider", PROVIDER)
      .eq(
        "event_id",
        event.event_id,
      )
      .maybeSingle();

    if (existingError) {
      console.error(
        "Unable to load existing webhook event:",
        existingError,
      );

      return NextResponse.json(
        {
          error:
            "Unable to load webhook event.",
        },
        { status: 500 },
      );
    }

    if (!existing) {
      return NextResponse.json(
        {
          error:
            "Webhook event not found.",
        },
        { status: 500 },
      );
    }

    if (
      existing.status ===
      "processed"
    ) {
      return NextResponse.json({
        received: true,
      });
    }

    /*
     * IMPORTANT:
     *
     * A previous worker may have crashed after
     * changing this event to "processing".
     *
     * Do not blindly acknowledge it. We attempt
     * reconciliation again. The reconciliation
     * path is designed to be idempotent, so a
     * concurrent worker doing the same work is safe.
     */
    eventId = existing.id;
  }

  /*
   * Claim received/failed events.
   *
   * Processing events are intentionally allowed
   * to continue below so a crashed worker cannot
   * permanently strand the event.
   */
  const {
    data: currentEvent,
    error: currentEventError,
  } = await supabase
    .from(
      "fulfillment_webhook_events",
    )
    .select("status")
    .eq("id", eventId)
    .single();

  if (currentEventError) {
    console.error(
      "Unable to read webhook event state:",
      currentEventError,
    );

    return NextResponse.json(
      {
        error:
          "Unable to read webhook event.",
      },
      { status: 500 },
    );
  }

  if (
    currentEvent.status ===
    "processed"
  ) {
    return NextResponse.json({
      received: true,
    });
  }

  if (
    currentEvent.status ===
      "received" ||
    currentEvent.status ===
      "failed"
  ) {
    const {
      data: claimed,
      error: claimError,
    } = await supabase
      .from(
        "fulfillment_webhook_events",
      )
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

    if (claimError) {
      console.error(
        "Unable to claim webhook event:",
        claimError,
      );

      return NextResponse.json(
        {
          error:
            "Unable to process webhook.",
        },
        { status: 500 },
      );
    }

    /*
     * Another worker claimed it between our
     * state read and update. It is safe to
     * acknowledge because that worker owns it.
     */
    if (!claimed) {
      return NextResponse.json({
        received: true,
      });
    }
  }

  /*
   * If the event was already processing, we still
   * reconcile it. This specifically recovers from
   * a crashed handler that left the row stranded.
   */
  try {
    await processWebhookEvent(
      eventId,
      providerReference,
    );

    return NextResponse.json({
      received: true,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Webhook processing failed.";

    await supabase
      .from(
        "fulfillment_webhook_events",
      )
      .update({
        status: "failed",
        error_message: message,
      })
      .eq("id", eventId);

    console.error(
      "GameCore webhook reconciliation failed:",
      error,
    );

    /*
     * 5xx tells GameCore to retry the event.
     * This is important when the provider order has
     * not reached our database yet or reconciliation
     * encounters a transient failure.
     */
    return NextResponse.json(
      {
        error:
          "Webhook processing failed.",
      },
      { status: 500 },
    );
  }
}