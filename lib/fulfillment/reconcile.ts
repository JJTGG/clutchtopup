import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getProvider } from "@/lib/fulfillment/providers";
import type { FulfillmentStatus } from "@/lib/fulfillment/types";

type ProviderOrder = {
  id: string;
  fulfillment_request_id: string;
  provider: string;
  provider_reference: string;
  status: FulfillmentStatus;
  response_data: Record<string, unknown>;
};

type FulfillmentRequest = {
  id: string;
  order_id: string;
  provider: string;
  status: FulfillmentStatus;
  provider_reference: string | null;
};

type ReconcileResult = {
  fulfillmentRequestId: string;
  status: FulfillmentStatus;
  providerReferences: string[];
};

type ProviderItem = {
  status?: unknown;
};

function isTerminal(
  status: FulfillmentStatus,
): status is "successful" | "failed" {
  return (
    status === "successful" ||
    status === "failed"
  );
}

function normalizeItemStatus(
  value: unknown,
): "successful" | "failed" | "pending" {
  if (value === "completed") {
    return "successful";
  }

  if (value === "failed") {
    return "failed";
  }

  /*
   * GameCore has additional non-terminal item states such as
   * pending, queued, awaiting_code and awaiting_screenshot.
   *
   * Unknown future states are deliberately treated as pending.
   */
  return "pending";
}

function deriveProviderOrderStatus(
  rawResponse: unknown,
  fallbackStatus: FulfillmentStatus,
): FulfillmentStatus {
  if (
    !rawResponse ||
    typeof rawResponse !== "object"
  ) {
    return fallbackStatus;
  }

  const response =
    rawResponse as Record<string, unknown>;

  const items = Array.isArray(response.items)
    ? response.items as ProviderItem[]
    : null;

  /*
   * Some GameCore failure responses do not contain an items
   * array at all. In that case the documented order-level
   * terminal status remains authoritative.
   */
  if (!items || items.length === 0) {
    const orderStatus = response.status;

    if (orderStatus === "completed") {
      return "successful";
    }

    if (orderStatus === "failed") {
      return "failed";
    }

    return fallbackStatus === "successful" ||
      fallbackStatus === "failed"
      ? fallbackStatus
      : "pending";
  }

  const itemStatuses =
    items.map((item) =>
      normalizeItemStatus(item.status),
    );

  /*
   * Every item completed.
   */
  if (
    itemStatuses.every(
      (status) => status === "successful",
    )
  ) {
    return "successful";
  }

  /*
   * Any item is still unresolved.
   *
   * This deliberately wins over failed items because the
   * provider order is not fully resolved yet.
   */
  if (
    itemStatuses.some(
      (status) => status === "pending",
    )
  ) {
    return "pending";
  }

  /*
   * All items are terminal and at least one failed.
   *
   * GameCore calls this a failed order even when some items
   * were successfully delivered. We preserve the complete
   * raw response in response_data so the partial outcome is
   * not lost.
   */
  if (
    itemStatuses.some(
      (status) => status === "failed",
    )
  ) {
    return "failed";
  }

  return "pending";
}

function deriveParentStatus(
  statuses: FulfillmentStatus[],
): FulfillmentStatus {
  if (statuses.length === 0) {
    return "pending";
  }

  if (
    statuses.some(
      (status) => status === "processing",
    )
  ) {
    return "processing";
  }

  if (
    statuses.some(
      (status) => status === "pending",
    )
  ) {
    return "pending";
  }

  if (
    statuses.every(
      (status) => status === "successful",
    )
  ) {
    return "successful";
  }

  if (
    statuses.some(
      (status) => status === "failed",
    )
  ) {
    return "failed";
  }

  return "pending";
}

async function updateProviderOrder(
  providerOrder: ProviderOrder,
  status: FulfillmentStatus,
  rawResponse: unknown,
) {
  const supabase = createAdminClient();

  const responseData =
    rawResponse &&
    typeof rawResponse === "object"
      ? (rawResponse as Record<string, unknown>)
      : { rawResponse };

  const { error } = await supabase
    .from("fulfillment_provider_orders")
    .update({
      status,
      response_data: responseData,
      updated_at:
        new Date().toISOString(),
    })
    .eq("id", providerOrder.id);

  if (error) {
    throw new Error(
      `Unable to update provider order ${providerOrder.provider_reference}.`,
    );
  }
}

async function saveTerminalResult(
  requestId: string,
  status: "successful" | "failed",
  providerReference: string | null,
  resultData: Record<string, unknown>,
) {
  const supabase = createAdminClient();

  const { data: existing } =
    await supabase
      .from("fulfillment_results")
      .select("id")
      .eq(
        "fulfillment_request_id",
        requestId,
      )
      .maybeSingle();

  if (existing) {
    const { error } =
      await supabase
        .from("fulfillment_results")
        .update({
          status,
          provider_reference:
            providerReference,
          result_data: resultData,
          completed_at:
            new Date().toISOString(),
        })
        .eq("id", existing.id);

    if (error) {
      throw new Error(
        "Unable to update fulfillment result.",
      );
    }

    return;
  }

  const { error } =
    await supabase
      .from("fulfillment_results")
      .insert({
        fulfillment_request_id:
          requestId,
        status,
        provider_reference:
          providerReference,
        result_data: resultData,
        completed_at:
          new Date().toISOString(),
      });

  if (
    error &&
    error.code !== "23505"
  ) {
    throw new Error(
      "Unable to save fulfillment result.",
    );
  }
}

async function updateOrderFromFulfillmentState(
  orderId: string,
) {
  const supabase = createAdminClient();

  const {
    data: items,
    error: itemsError,
  } = await supabase
    .from("order_items")
    .select("id")
    .eq("order_id", orderId);

  if (
    itemsError ||
    !items?.length
  ) {
    return;
  }

  const {
    data: requests,
    error: requestsError,
  } = await supabase
    .from("fulfillment_requests")
    .select(
      "order_item_id, status",
    )
    .eq("order_id", orderId);

  if (
    requestsError ||
    !requests?.length
  ) {
    return;
  }

  /*
   * Every order item must have a fulfillment request before
   * fulfillment can own the order's final state.
   */
  const requestItemIds =
    new Set(
      requests.map(
        (request) =>
          request.order_item_id,
      ),
    );

  if (
    items.some(
      (item) =>
        !requestItemIds.has(item.id),
    )
  ) {
    return;
  }

  const statuses =
    requests.map(
      (request) =>
        request.status as FulfillmentStatus,
    );

  let orderStatus:
    | "processing"
    | "completed"
    | "failed";

  if (
    statuses.every(
      (status) => status === "successful",
    )
  ) {
    orderStatus = "completed";
  } else if (
    statuses.some(
      (status) =>
        status === "processing" ||
        status === "pending",
    )
  ) {
    orderStatus = "processing";
  } else if (
    statuses.some(
      (status) => status === "failed",
    )
  ) {
    orderStatus = "failed";
  } else {
    orderStatus = "processing";
  }

  const { error } = await supabase
    .from("orders")
    .update({
      status: orderStatus,
      updated_at:
        new Date().toISOString(),
    })
    .eq("id", orderId)
    .in("status", [
      "paid",
      "processing",
    ]);

  if (error) {
    throw new Error(
      "Unable to update order fulfillment status.",
    );
  }
}

export async function reconcileFulfillment(
  fulfillmentRequestId: string,
): Promise<ReconcileResult> {
  if (!fulfillmentRequestId) {
    throw new Error(
      "Fulfillment request is required.",
    );
  }

  const supabase = createAdminClient();

  const {
    data: request,
    error: requestError,
  } = await supabase
    .from("fulfillment_requests")
    .select(`
      id,
      order_id,
      provider,
      status,
      provider_reference
    `)
    .eq("id", fulfillmentRequestId)
    .single();

  if (
    requestError ||
    !request
  ) {
    throw new Error(
      "Fulfillment request not found.",
    );
  }

  const fulfillmentRequest =
    request as FulfillmentRequest;

  if (
    fulfillmentRequest.status ===
    "successful"
  ) {
    const {
      data: existingOrders,
    } = await supabase
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

    return {
      fulfillmentRequestId,
      status: "successful",
      providerReferences:
        existingOrders?.map(
          (item) =>
            item.provider_reference,
        ) ?? [],
    };
  }

  const {
    data: providerOrders,
    error: ordersError,
  } = await supabase
    .from(
      "fulfillment_provider_orders",
    )
    .select(`
      id,
      fulfillment_request_id,
      provider,
      provider_reference,
      status,
      response_data
    `)
    .eq(
      "fulfillment_request_id",
      fulfillmentRequest.id,
    )
    .order("created_at");

  if (ordersError) {
    throw new Error(
      "Unable to load provider orders.",
    );
  }

  if (
    !providerOrders?.length
  ) {
    return {
      fulfillmentRequestId,
      status:
        fulfillmentRequest.status ===
        "pending"
          ? "pending"
          : "processing",
      providerReferences: [],
    };
  }

  const provider =
    getProvider(
      fulfillmentRequest.provider,
    );

  const refreshedStatuses:
    FulfillmentStatus[] = [];

  const refreshedResponses:
    Record<string, unknown>[] = [];

  for (
    const row of providerOrders
  ) {
    const providerOrder =
      row as ProviderOrder;

    let statusResult;

    try {
      statusResult =
        await provider.getStatus(
          providerOrder.provider_reference,
        );
    } catch {
      /*
       * Provider lookup failure is uncertainty,
       * not fulfillment failure.
       */
      const preservedStatus =
        isTerminal(
          providerOrder.status,
        )
          ? providerOrder.status
          : "pending";

      refreshedStatuses.push(
        preservedStatus,
      );

      refreshedResponses.push(
        providerOrder.response_data,
      );

      continue;
    }

    const derivedStatus =
      deriveProviderOrderStatus(
        statusResult.rawResponse,
        statusResult.status,
      );

    await updateProviderOrder(
      providerOrder,
      derivedStatus,
      statusResult.rawResponse,
    );

    refreshedStatuses.push(
      derivedStatus,
    );

    refreshedResponses.push(
      statusResult.rawResponse &&
      typeof statusResult.rawResponse ===
        "object"
        ? (
            statusResult.rawResponse as Record<
              string,
              unknown
            >
          )
        : {
            rawResponse:
              statusResult.rawResponse,
          },
    );
  }

  const parentStatus =
    deriveParentStatus(
      refreshedStatuses,
    );

  const primaryReference =
    providerOrders[0]
      ?.provider_reference ??
    fulfillmentRequest.provider_reference;

  const responseData = {
    provider:
      fulfillmentRequest.provider,
    providerReferences:
      providerOrders.map(
        (order) =>
          order.provider_reference,
      ),
    statuses:
      refreshedStatuses,
    providerResponses:
      refreshedResponses,
  };

  if (
    isTerminal(parentStatus)
  ) {
    await saveTerminalResult(
      fulfillmentRequest.id,
      parentStatus,
      primaryReference,
      responseData,
    );
  }

  const {
    error: requestUpdateError,
  } = await supabase
    .from("fulfillment_requests")
    .update({
      status: parentStatus,
      provider_reference:
        primaryReference ?? null,
      response_data:
        responseData,
      updated_at:
        new Date().toISOString(),
    })
    .eq(
      "id",
      fulfillmentRequest.id,
    );

  if (requestUpdateError) {
    throw new Error(
      "Unable to update fulfillment request.",
    );
  }

  await updateOrderFromFulfillmentState(
    fulfillmentRequest.order_id,
  );

  return {
    fulfillmentRequestId,
    status: parentStatus,
    providerReferences:
      providerOrders.map(
        (order) =>
          order.provider_reference,
      ),
  };
}