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

function isTerminal(
  status: FulfillmentStatus,
): boolean {
  return (
    status === "successful" ||
    status === "failed"
  );
}

function deriveParentStatus(
  statuses: FulfillmentStatus[],
): FulfillmentStatus {
  if (statuses.length === 0) {
    return "pending";
  }

  const hasProcessing = statuses.some(
    (status) => status === "processing",
  );

  const hasPending = statuses.some(
    (status) => status === "pending",
  );

  if (hasProcessing) {
    return "processing";
  }

  if (hasPending) {
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
      updated_at: new Date().toISOString(),
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

  const { data: existing } = await supabase
    .from("fulfillment_results")
    .select("id")
    .eq("fulfillment_request_id", requestId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("fulfillment_results")
      .update({
        status,
        provider_reference: providerReference,
        result_data: resultData,
        completed_at: new Date().toISOString(),
      })
      .eq("id", existing.id);

    if (error) {
      throw new Error(
        "Unable to update fulfillment result.",
      );
    }

    return;
  }

  const { error } = await supabase
    .from("fulfillment_results")
    .insert({
      fulfillment_request_id: requestId,
      status,
      provider_reference: providerReference,
      result_data: resultData,
      completed_at: new Date().toISOString(),
    });

  if (error && error.code !== "23505") {
    throw new Error(
      "Unable to save fulfillment result.",
    );
  }
}

async function updateOrderFromFulfillmentState(
  orderId: string,
) {
  const supabase = createAdminClient();

  const { data: items, error: itemsError } =
    await supabase
      .from("order_items")
      .select("id")
      .eq("order_id", orderId);

  if (itemsError || !items?.length) {
    return;
  }

  const { data: requests, error: requestsError } =
    await supabase
      .from("fulfillment_requests")
      .select("order_item_id, status")
      .eq("order_id", orderId);

  if (requestsError || !requests?.length) {
    return;
  }

  /*
   * Never mark an order completed until every order item
   * has its own fulfillment request.
   */
  if (requests.length < items.length) {
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

  const hasProcessing = statuses.some(
    (status) => status === "processing",
  );

  const hasPending = statuses.some(
    (status) => status === "pending",
  );

  if (
    statuses.every(
      (status) => status === "successful",
    )
  ) {
    orderStatus = "completed";
  } else if (
    hasProcessing ||
    hasPending
  ) {
    /*
     * A mixed state is still open.
     *
     * Example:
     *   item A = failed
     *   item B = pending
     *
     * The order must remain processing until item B
     * reaches a terminal state.
     */
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

  /*
   * Only transition states that fulfillment owns.
   * Never move a cancelled/completed/failed order backwards.
   */
  const { error } = await supabase
    .from("orders")
    .update({
      status: orderStatus,
      updated_at: new Date().toISOString(),
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

  const { data: request, error: requestError } =
    await supabase
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

  if (requestError || !request) {
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
    const { data: existingOrders } =
      await supabase
        .from("fulfillment_provider_orders")
        .select("provider_reference")
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
    .from("fulfillment_provider_orders")
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

  if (!providerOrders?.length) {
    /*
     * No provider reference means the external submission
     * has not been persisted. Reconciliation must not invent
     * a result or mark the request successful.
     */
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

  for (const row of providerOrders) {
    const providerOrder =
      row as ProviderOrder;

    /*
     * Poll every child provider order independently.
     *
     * One internal fulfillment request may produce
     * multiple GameCore order codes.
     */
    let statusResult;

    try {
      statusResult =
        await provider.getStatus(
          providerOrder.provider_reference,
        );
    } catch {
      /*
       * A provider lookup failure is not equivalent to
       * fulfillment failure. Keep terminal states terminal
       * and keep non-terminal states alive for the next sweep.
       */
      refreshedStatuses.push(
        isTerminal(providerOrder.status)
          ? providerOrder.status
          : "pending",
      );

      continue;
    }

    await updateProviderOrder(
      providerOrder,
      statusResult.status,
      statusResult.rawResponse,
    );

    refreshedStatuses.push(
      statusResult.status,
    );
  }

  const parentStatus =
    deriveParentStatus(
      refreshedStatuses,
    );

  const primaryReference =
    providerOrders[0]?.provider_reference ??
    fulfillmentRequest.provider_reference;

  const responseData = {
    provider:
      fulfillmentRequest.provider,
    providerReferences:
      providerOrders.map(
        (order) =>
          order.provider_reference,
      ),
    statuses: refreshedStatuses,
  };

  if (isTerminal(parentStatus)) {
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
      response_data: responseData,
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