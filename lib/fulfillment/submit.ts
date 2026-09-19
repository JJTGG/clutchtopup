import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/fulfillment/providers";
import type {
  FulfillmentRequest,
  FulfillmentStatus,
  ProviderFulfillmentField,
} from "@/lib/fulfillment/types";

type FulfillmentOrderItem = {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
};

type FulfillmentOrder = {
  id: string;
  order_number: string;
  status: string;
  currency: string;
};

type FulfillmentDataRow = {
  data: Record<string, unknown>;
};

type ProviderMapping = {
  id: string;
  provider_product_id: string;
  region: string | null;
  currency: string;
  fulfillment_fields: unknown;
  metadata: Record<string, unknown>;
  available: boolean;
  catalog_providers: {
    id: string;
    slug: string;
    is_active: boolean;
  };
  products: {
    id: string;
    game_id: string;
    games: {
      slug: string;
      is_active: boolean;
    };
  };
};

type FulfillmentRequestRow = {
  id: string;
  order_id: string;
  order_item_id: string;
  provider: string;
  provider_reference: string | null;
  idempotency_key: string;
  status: FulfillmentStatus;
  request_data: Record<string, unknown>;
  response_data: Record<string, unknown>;
  attempt: number;
};

type SubmitFulfillmentResult = {
  fulfillmentRequestId: string;
  status: FulfillmentStatus;
  providerReferences: string[];
};

function isFulfillmentStatus(
  value: unknown,
): value is FulfillmentStatus {
  return (
    value === "queued" ||
    value === "processing" ||
    value === "successful" ||
    value === "pending" ||
    value === "failed"
  );
}

function toStringRecord(
  value: Record<string, unknown>,
): Record<string, string> {
  const result: Record<string, string> = {};

  for (const [key, item] of Object.entries(value)) {
    if (
      typeof item === "string" ||
      typeof item === "number" ||
      typeof item === "boolean"
    ) {
      result[key] = String(item);
    }
  }

  return result;
}

function parseProviderFields(
  value: unknown,
): ProviderFulfillmentField[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter(
    (field): field is ProviderFulfillmentField =>
      typeof field === "object" &&
      field !== null &&
      typeof (field as Record<string, unknown>).key ===
        "string" &&
      typeof (field as Record<string, unknown>).label ===
        "string" &&
      typeof (field as Record<string, unknown>).type ===
        "string" &&
      typeof (field as Record<string, unknown>).required ===
        "boolean",
  );
}

function validateProviderFulfillmentData(
  fields: ProviderFulfillmentField[],
  data: Record<string, string>,
) {
  for (const field of fields) {
    const value = data[field.key];

    if (
      field.required &&
      (!value || value.trim().length === 0)
    ) {
      throw new Error(
        `${field.label} is required for fulfillment.`,
      );
    }

    if (
      value &&
      field.type === "number" &&
      !Number.isFinite(Number(value))
    ) {
      throw new Error(
        `${field.label} must be a valid number.`,
      );
    }

    if (
      value &&
      field.type === "select" &&
      field.options?.length &&
      !field.options.includes(value)
    ) {
      throw new Error(
        `${field.label} has an invalid selection.`,
      );
    }
  }
}

async function getOrderContext(
  orderId: string,
  orderItemId: string,
) {
  const supabase = createAdminClient();

  const { data: order, error: orderError } =
    await supabase
      .from("orders")
      .select(
        "id, order_number, status, currency",
      )
      .eq("id", orderId)
      .single();

  if (orderError || !order) {
    throw new Error("Order not found.");
  }

  const { data: item, error: itemError } =
    await supabase
      .from("order_items")
      .select(
        "id, order_id, product_id, product_name, quantity",
      )
      .eq("id", orderItemId)
      .eq("order_id", orderId)
      .single();

  if (itemError || !item) {
    throw new Error("Order item not found.");
  }

  const {
    data: fulfillmentData,
    error: dataError,
  } = await supabase
    .from("order_fulfillment_data")
    .select("data")
    .eq("order_id", orderId)
    .single();

  if (dataError || !fulfillmentData) {
    throw new Error(
      "Order fulfillment data is unavailable.",
    );
  }

  return {
    order: order as FulfillmentOrder,
    item: item as FulfillmentOrderItem,
    fulfillmentData:
      fulfillmentData as FulfillmentDataRow,
  };
}

async function getProviderMapping(
  productId: string,
  providerName: string,
): Promise<ProviderMapping> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("product_provider_mappings")
    .select(`
      id,
      provider_product_id,
      region,
      currency,
      fulfillment_fields,
      metadata,
      available,
      catalog_providers!inner (
        id,
        slug,
        is_active
      ),
      products!inner (
        id,
        game_id,
        games!inner (
          slug,
          is_active
        )
      )
    `)
    .eq("product_id", productId)
    .eq("available", true)
    .eq(
      "catalog_providers.slug",
      providerName,
    )
    .eq(
      "catalog_providers.is_active",
      true,
    )
    .eq(
      "products.games.is_active",
      true,
    )
    .maybeSingle();

  if (error || !data) {
    throw new Error(
      `No active ${providerName} mapping exists for this product.`,
    );
  }

  return data as unknown as ProviderMapping;
}

async function getOrCreateFulfillmentRequest(
  order: FulfillmentOrder,
  item: FulfillmentOrderItem,
  providerName: string,
  requestData: Record<string, unknown>,
): Promise<FulfillmentRequestRow> {
  const supabase = createAdminClient();

  const idempotencyKey =
    `fulfillment:${item.id}:${providerName}`;

  const selectFields = `
    id,
    order_id,
    order_item_id,
    provider,
    provider_reference,
    idempotency_key,
    status,
    request_data,
    response_data,
    attempt
  `;

  const { data: existing } = await supabase
    .from("fulfillment_requests")
    .select(selectFields)
    .eq("order_item_id", item.id)
    .eq("provider", providerName)
    .maybeSingle();

  if (existing) {
    return existing as FulfillmentRequestRow;
  }

  const { data, error } = await supabase
    .from("fulfillment_requests")
    .insert({
      order_id: order.id,
      order_item_id: item.id,
      provider: providerName,
      idempotency_key: idempotencyKey,
      status: "queued",
      request_data: requestData,
      response_data: {},
      attempt: 0,
    })
    .select(selectFields)
    .single();

  if (error) {
    if (error.code === "23505") {
      const { data: raced } = await supabase
        .from("fulfillment_requests")
        .select(selectFields)
        .eq("order_item_id", item.id)
        .eq("provider", providerName)
        .single();

      if (raced) {
        return raced as FulfillmentRequestRow;
      }
    }

    throw new Error(
      "Unable to create fulfillment request.",
    );
  }

  if (!data) {
    throw new Error(
      "Unable to create fulfillment request.",
    );
  }

  return data as FulfillmentRequestRow;
}

async function claimFulfillmentRequest(
  fulfillmentRequestId: string,
  currentAttempt: number,
): Promise<boolean> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("fulfillment_requests")
    .update({
      status: "processing",
      attempt: currentAttempt + 1,
      updated_at: new Date().toISOString(),
    })
    .eq("id", fulfillmentRequestId)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(
      "Unable to claim fulfillment request.",
    );
  }

  return Boolean(data);
}

async function recoverStaleProcessingRequest(
  fulfillmentRequest: FulfillmentRequestRow,
): Promise<{
  shouldSubmit: boolean;
  providerReferences: string[];
}> {
  const supabase = createAdminClient();

  const {
    data: children,
    error,
  } = await supabase
    .from("fulfillment_provider_orders")
    .select("provider_reference")
    .eq(
      "fulfillment_request_id",
      fulfillmentRequest.id,
    );

  if (error) {
    throw new Error(
      "Unable to inspect existing provider orders.",
    );
  }

  const providerReferences =
    children?.map(
      (child) => child.provider_reference,
    ) ?? [];

  /*
   * If a provider reference exists, the external order
   * definitely exists. Do not submit again.
   */
  if (providerReferences.length > 0) {
    return {
      shouldSubmit: false,
      providerReferences,
    };
  }

  /*
   * No provider reference means the previous worker either
   * crashed before the external call or lost the response.
   *
   * The same deterministic idempotency key makes retrying
   * safe even if GameCore accepted the original request.
   */
  return {
    shouldSubmit: true,
    providerReferences: [],
  };
}

async function persistSubmission(
  fulfillmentRequest: FulfillmentRequestRow,
  providerReferences: string[],
  status: FulfillmentStatus,
  rawResponse: unknown,
) {
  const supabase = createAdminClient();

  const responseData =
    rawResponse &&
    typeof rawResponse === "object"
      ? (rawResponse as Record<string, unknown>)
      : { rawResponse };

  /*
   * Validate all provider references before modifying
   * the fulfillment request.
   */
  if (providerReferences.length > 0) {
    const { data: existingOrders, error } =
      await supabase
        .from("fulfillment_provider_orders")
        .select(
          "provider_reference, fulfillment_request_id",
        )
        .eq(
          "provider",
          fulfillmentRequest.provider,
        )
        .in(
          "provider_reference",
          providerReferences,
        );

    if (error) {
      throw new Error(
        "Unable to validate provider order references.",
      );
    }

    const foreignReference =
      existingOrders?.find(
        (row) =>
          row.fulfillment_request_id !==
          fulfillmentRequest.id,
      );

    if (foreignReference) {
      throw new Error(
        `Provider reference collision detected: ${foreignReference.provider_reference}.`,
      );
    }
  }

  const primaryReference =
    providerReferences[0] ??
    fulfillmentRequest.provider_reference;

  const { error } =
    await supabase
      .from("fulfillment_requests")
      .update({
        provider_reference:
          primaryReference ?? null,
        status,
        response_data: responseData,
        updated_at:
          new Date().toISOString(),
      })
      .eq(
        "id",
        fulfillmentRequest.id,
      );

  if (error) {
    throw new Error(
      "Unable to persist fulfillment submission.",
    );
  }

  if (providerReferences.length === 0) {
    return;
  }

  for (const providerReference of providerReferences) {
    const { error: providerOrderError } =
      await supabase
        .from(
          "fulfillment_provider_orders",
        )
        .insert({
          fulfillment_request_id:
            fulfillmentRequest.id,
          provider:
            fulfillmentRequest.provider,
          provider_reference:
            providerReference,
          status,
          response_data:
            responseData,
        });

    if (
      providerOrderError &&
      providerOrderError.code !== "23505"
    ) {
      throw new Error(
        "Unable to persist provider order references.",
      );
    }
  }
}

export async function submitFulfillment(
  orderId: string,
  providerName: string,
): Promise<SubmitFulfillmentResult> {
  if (!orderId) {
    throw new Error("Order is required.");
  }

  if (!providerName) {
    throw new Error(
      "Fulfillment provider is required.",
    );
  }

  const supabase = createAdminClient();

  const {
    data: items,
    error: itemsError,
  } = await supabase
    .from("order_items")
    .select("id")
    .eq("order_id", orderId)
    .order("created_at");

  if (itemsError || !items?.length) {
    throw new Error(
      "Order contains no fulfillment items.",
    );
  }

  const results: SubmitFulfillmentResult[] = [];

  for (const itemRow of items) {
    const {
      order,
      item,
      fulfillmentData,
    } = await getOrderContext(
      orderId,
      itemRow.id,
    );

    if (
      order.status !== "paid" &&
      order.status !== "processing"
    ) {
      throw new Error(
        `Order ${order.order_number} is not ready for fulfillment.`,
      );
    }

    const mapping =
      await getProviderMapping(
        item.product_id,
        providerName,
      );

    const gameSlug =
      mapping.products.games.slug;

    const rawFulfillmentData =
      fulfillmentData.data ?? {};

    const stringFulfillmentData =
      toStringRecord(
        rawFulfillmentData,
      );

    const providerFields =
      parseProviderFields(
        mapping.fulfillment_fields,
      );

    validateProviderFulfillmentData(
      providerFields,
      stringFulfillmentData,
    );

    const playerIdentifiers =
      Object.entries(
        stringFulfillmentData,
      )
        .filter(
          ([key, value]) =>
            key.trim().length > 0 &&
            value.trim().length > 0,
        )
        .map(
          ([key, value]) => ({
            key,
            value,
          }),
        );

    const idempotencyKey =
      `fulfillment:${item.id}:${providerName}`;

    const request: FulfillmentRequest = {
      providerProductId:
        mapping.provider_product_id,
      gameSlug,
      region:
        mapping.region ??
        (typeof rawFulfillmentData.region ===
        "string"
          ? rawFulfillmentData.region
          : undefined),
      playerIdentifiers,
      quantity: item.quantity,
      idempotencyKey,
      externalOrderId:
        `${order.order_number}:${item.id}`,
      ...(process.env.GAMECORE_WEBHOOK_URL
        ? {
            callbackUrl:
              process.env.GAMECORE_WEBHOOK_URL,
          }
        : {}),
    };

    const fulfillmentRequest =
      await getOrCreateFulfillmentRequest(
        order,
        item,
        providerName,
        request as unknown as Record<
          string,
          unknown
        >,
      );

    if (
      fulfillmentRequest.status ===
      "successful"
    ) {
      const { data: children } =
        await supabase
          .from(
            "fulfillment_provider_orders",
          )
          .select(
            "provider_reference",
          )
          .eq(
            "fulfillment_request_id",
            fulfillmentRequest.id,
          );

      results.push({
        fulfillmentRequestId:
          fulfillmentRequest.id,
        status: "successful",
        providerReferences:
          children?.map(
            (child) =>
              child.provider_reference,
          ) ?? [],
      });

      continue;
    }

    if (
      fulfillmentRequest.status ===
      "processing"
    ) {
      const recovery =
        await recoverStaleProcessingRequest(
          fulfillmentRequest,
        );

      if (
        !recovery.shouldSubmit
      ) {
        results.push({
          fulfillmentRequestId:
            fulfillmentRequest.id,
          status: "processing",
          providerReferences:
            recovery.providerReferences,
        });

        continue;
      }

      /*
       * There is no provider reference, so the request
       * may have died before or during the provider call.
       *
       * Move it back to queued. The deterministic external
       * idempotency key makes the next provider call safe.
       */
      const { data: requeued, error } =
        await supabase
          .from("fulfillment_requests")
          .update({
            status: "queued",
            updated_at:
              new Date().toISOString(),
          })
          .eq(
            "id",
            fulfillmentRequest.id,
          )
          .eq("status", "processing")
          .is(
            "provider_reference",
            null,
          )
          .select("id")
          .maybeSingle();

      if (error) {
        throw new Error(
          "Unable to recover fulfillment request.",
        );
      }

      if (!requeued) {
        results.push({
          fulfillmentRequestId:
            fulfillmentRequest.id,
          status: "processing",
          providerReferences: [],
        });

        continue;
      }
    }

    const claimableRequest =
      await getOrCreateFulfillmentRequest(
        order,
        item,
        providerName,
        request as unknown as Record<
          string,
          unknown
        >,
      );

    const claimed =
      await claimFulfillmentRequest(
        claimableRequest.id,
        claimableRequest.attempt,
      );

    if (!claimed) {
      const { data: current } =
        await supabase
          .from(
            "fulfillment_requests",
          )
          .select(
            "status, provider_reference",
          )
          .eq(
            "id",
            claimableRequest.id,
          )
          .single();

      const currentStatus =
        current &&
        isFulfillmentStatus(
          current.status,
        )
          ? current.status
          : "processing";

      results.push({
        fulfillmentRequestId:
          claimableRequest.id,
        status: currentStatus,
        providerReferences:
          current?.provider_reference
            ? [current.provider_reference]
            : [],
      });

      continue;
    }

    const provider =
      getProvider(providerName);

    let submission;

    try {
      submission =
        await provider.submit(
          request,
        );
    } catch (error) {
      /*
       * Never mark an uncertain external submission as failed.
       *
       * The provider may have accepted the request and the
       * response may simply have been lost. Requeueing lets the
       * deterministic idempotency key safely recover it.
       */
      await supabase
        .from(
          "fulfillment_requests",
        )
        .update({
          status: "queued",
          response_data: {
            error:
              error instanceof Error
                ? error.message
                : "Provider submission failed.",
          },
          updated_at:
            new Date().toISOString(),
        })
        .eq(
          "id",
          claimableRequest.id,
        )
        .eq("status", "processing");

      throw error;
    }

    await persistSubmission(
      claimableRequest,
      submission.providerReferences,
      submission.status,
      submission.rawResponse,
    );

    results.push({
      fulfillmentRequestId:
        claimableRequest.id,
      status: submission.status,
      providerReferences:
        submission.providerReferences,
    });
  }

  const hasFailure =
    results.some(
      (result) =>
        result.status === "failed",
    );

  const hasProcessing =
    results.some(
      (result) =>
        result.status ===
          "processing" ||
        result.status === "pending",
  );

  return {
    fulfillmentRequestId:
      results[0]
        ?.fulfillmentRequestId ?? "",
    status: hasFailure
      ? "failed"
      : hasProcessing
        ? "processing"
        : "successful",
    providerReferences:
      results.flatMap(
        (result) =>
          result.providerReferences,
      ),
  };
}