import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/fulfillment/providers";
import { reconcileFulfillment } from "@/lib/fulfillment/reconcile";

const PROVIDER = "nexus";

function verifySignature(
  rawBody: string,
  signature: string | null,
  token: string,
): boolean {
  if (!signature) {
    return false;
  }

  const expected =
    crypto
      .createHmac(
        "sha256",
        token,
      )
      .update(rawBody)
      .digest("hex");

  const received =
    Buffer.from(
      signature.trim(),
      "utf8",
    );

  const expectedBuffer =
    Buffer.from(
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

function eventIdForRawBody(
  rawBody: string,
) {
  return crypto
    .createHash("sha256")
    .update(rawBody)
    .digest("hex");
}

async function processWebhookEvent(
  eventId: string,
  providerReference: string,
) {
  const supabase =
    createAdminClient();

  const {
    data: providerOrder,
    error: providerOrderError,
  } = await supabase
    .from(
      "fulfillment_provider_orders",
    )
    .select(
      "fulfillment_request_id",
    )
    .eq(
      "provider",
      PROVIDER,
    )
    .eq(
      "provider_reference",
      providerReference,
    )
    .maybeSingle();

  if (providerOrderError) {
    throw new Error(
      "Unable to load Nexus provider order.",
    );
  }

  if (!providerOrder) {
    /*
     * The provider may deliver the webhook before the
     * submission response has been persisted locally.
     *
     * Returning an error causes Nexus to retry.
     */
    throw new Error(
      "Nexus provider order has not been persisted yet.",
    );
  }

  await reconcileFulfillment(
    providerOrder.fulfillment_request_id,
  );

  const {
    error: updateError,
  } = await supabase
    .from(
      "fulfillment_webhook_events",
    )
    .update({
      status: "processed",
      processed_at:
        new Date().toISOString(),
      error_message: null,
    })
    .eq(
      "id",
      eventId,
    );

  if (updateError) {
    throw new Error(
      "Unable to mark Nexus webhook event as processed.",
    );
  }
}

export async function POST(
  request: Request,
) {
  const token =
    process.env.NEXUS_SHOP_TOKEN;

  if (!token) {
    console.error(
      "NEXUS_SHOP_TOKEN is not configured.",
    );

    return NextResponse.json(
      {
        error:
          "Webhook unavailable.",
      },
      { status: 500 },
    );
  }

  /*
   * IMPORTANT:
   *
   * Nexus signs the exact raw request body.
   * Do not call request.json() before this.
   */
  const rawBody =
    await request.text();

  const signature =
    request.headers.get(
      "Sign",
    );

  if (
    !verifySignature(
      rawBody,
      signature,
      token,
    )
  ) {
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
    payload =
      JSON.parse(rawBody);
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid webhook payload.",
      },
      { status: 400 },
    );
  }

  const provider =
    getProvider(PROVIDER);

  let webhook;

  try {
    webhook =
      await provider.parseWebhook(
        payload,
        signature ?? undefined,
      );
  } catch (error) {
    console.error(
      "Invalid Nexus webhook:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Invalid webhook payload.",
      },
      { status: 400 },
    );
  }

  /*
   * Nexus does not require us to invent an event ID.
   *
   * Hashing the exact signed body gives us a deterministic
   * deduplication key for repeated delivery of the same event.
   */
  const eventId =
    eventIdForRawBody(
      rawBody,
    );

  const eventType =
    "statusChange";

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
      event_id: eventId,
      event_type: eventType,
      provider_reference:
        webhook.providerReference,
      payload,
      status: "received",
    })
    .select(
      "id, status",
    )
    .single();

  let eventRowId =
    insertedEvent?.id ??
    null;

  if (insertError) {
    if (
      insertError.code !==
      "23505"
    ) {
      console.error(
        "Unable to store Nexus webhook:",
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

    const {
      data: existing,
      error: existingError,
    } = await supabase
      .from(
        "fulfillment_webhook_events",
      )
      .select(
        "id, status",
      )
      .eq(
        "provider",
        PROVIDER,
      )
      .eq(
        "event_id",
        eventId,
      )
      .maybeSingle();

    if (existingError) {
      console.error(
        "Unable to load existing Nexus webhook:",
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

    eventRowId =
      existing.id;
  }

  if (!eventRowId) {
    return NextResponse.json(
      {
        error:
          "Webhook event could not be identified.",
      },
      { status: 500 },
    );
  }

  /*
   * Claim the event.
   *
   * Only received/failed events are claimable.
   * If another invocation is already processing it,
   * acknowledge the duplicate rather than processing
   * the same event concurrently.
   */
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
    .eq(
      "id",
      eventRowId,
    )
    .in(
      "status",
      [
        "received",
        "failed",
      ],
    )
    .select("id")
    .maybeSingle();

  if (claimError) {
    console.error(
      "Unable to claim Nexus webhook event:",
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

  if (!claimed) {
    const {
      data: current,
      error: currentError,
    } = await supabase
      .from(
        "fulfillment_webhook_events",
      )
      .select("status")
      .eq(
        "id",
        eventRowId,
      )
      .single();

    if (currentError) {
      return NextResponse.json(
        {
          error:
            "Unable to read webhook state.",
        },
        { status: 500 },
      );
    }

    if (
      current.status ===
      "processed"
    ) {
      return NextResponse.json({
        received: true,
      });
    }

    /*
     * Another invocation currently owns the event.
     */
    if (
      current.status ===
      "processing"
    ) {
      return NextResponse.json({
        received: true,
      });
    }

    return NextResponse.json(
      {
        error:
          "Unable to claim webhook event.",
      },
      { status: 500 },
    );
  }

  try {
    await processWebhookEvent(
      eventRowId,
      webhook.providerReference,
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
        error_message:
          message,
      })
      .eq(
        "id",
        eventRowId,
      );

    console.error(
      "Nexus webhook reconciliation failed:",
      error,
    );

    /*
     * 5xx tells Nexus to retry.
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