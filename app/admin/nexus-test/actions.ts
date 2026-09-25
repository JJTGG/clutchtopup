"use server";

import { requireAdmin } from "@/lib/admin/auth";
import { submitFulfillment } from "@/lib/fulfillment/submit";
import { createAdminClient } from "@/lib/supabase/admin";

export type NexusTestState = {
  status: "idle" | "running" | "success" | "error" | "cleaned";
  message: string;
  testRunId?: string;
  orderId?: string;
  orderNumber?: string;
  fulfillmentRequestId?: string;
  providerReference?: string;
  fulfillmentStatus?: string;
};

const INITIAL_STATE: NexusTestState = {
  status: "idle",
  message: "",
};

export async function runNexusSandboxTest(
  _previousState: NexusTestState,
  _formData: FormData,
): Promise<NexusTestState> {
  try {
    const user = await requireAdmin();
    const supabase = createAdminClient();

    const testRunId = crypto.randomUUID();
    const productSlug = `nexus-sandbox-test-${testRunId}`;

    const { data: existingProvider, error: providerLookupError } =
      await supabase
        .from("catalog_providers")
        .select("id, slug, name, is_active, metadata")
        .eq("slug", "nexus")
        .maybeSingle();

    if (providerLookupError) {
      throw new Error(
        `Unable to inspect Nexus provider: ${providerLookupError.message}`,
      );
    }

    let providerId: string;
    let createdProvider = false;

    if (existingProvider) {
      if (!existingProvider.is_active) {
        throw new Error(
          "A Nexus provider already exists but is inactive. The test will not change its state.",
        );
      }

      providerId = existingProvider.id;
    } else {
      const { data: provider, error: providerError } = await supabase
        .from("catalog_providers")
        .insert({
          slug: "nexus",
          name: "Nexus",
          is_active: true,
          metadata: {
            createdBy: "nexus-sandbox-test",
            testRunId,
          },
        })
        .select("id")
        .single();

      if (providerError || !provider) {
        throw new Error(
          `Unable to create Nexus provider: ${
            providerError?.message ?? "unknown error"
          }`,
        );
      }

      providerId = provider.id;
      createdProvider = true;
    }

    const { data: game, error: gameError } = await supabase
      .from("games")
      .select("id, name, slug")
      .eq("is_active", true)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (gameError) {
      throw new Error(
        `Unable to select a test game: ${gameError.message}`,
      );
    }

    if (!game) {
      throw new Error("No active game exists for the Nexus sandbox test.");
    }

    const { data: product, error: productError } = await supabase
      .from("products")
      .insert({
        game_id: game.id,
        name: "Nexus Sandbox Test Product",
        slug: productSlug,
        description: "Temporary internal Nexus sandbox test product.",
        price: 1000,
        currency: "NGN",
        is_active: true,
        fulfillment_config: {
          temporaryTest: true,
          testRunId,
        },
      })
      .select("id, name, price, currency")
      .single();

    if (productError || !product) {
      throw new Error(
        `Unable to create test product: ${
          productError?.message ?? "unknown error"
        }`,
      );
    }

    const fulfillmentFields = [
      {
        key: "outcome",
        label: "Sandbox outcome",
        type: "select",
        required: true,
        options: [
          "success",
          "fail",
          "pending_success",
          "pending_fail",
        ],
      },
      {
        key: "account",
        label: "Sandbox account",
        type: "text",
        required: false,
      },
    ];

    const { error: mappingError } = await supabase
      .from("product_provider_mappings")
      .insert({
        product_id: product.id,
        provider_id: providerId,
        provider_product_id: "test-1:p1",
        region: null,
        currency: "USD",
        provider_cost: 0.515,
        available: true,
        fulfillment_fields: fulfillmentFields,
        metadata: {
          temporaryTest: true,
          testRunId,
        },
      });

    if (mappingError) {
      throw new Error(
        `Unable to create provider mapping: ${mappingError.message}`,
      );
    }

    const orderNumber =
      `NEXUS-TEST-${testRunId.slice(0, 8).toUpperCase()}`;

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .insert({
        order_number: orderNumber,
        user_id: user.id,
        idempotency_key: `nexus-sandbox-test:${testRunId}`,
        status: "paid",
        currency: "NGN",
        subtotal: 1000,
        discount: 0,
        total: 1000,
      })
      .select("id, order_number")
      .single();

    if (orderError || !order) {
      throw new Error(
        `Unable to create test order: ${
          orderError?.message ?? "unknown error"
        }`,
      );
    }

    const { data: orderItem, error: orderItemError } = await supabase
      .from("order_items")
      .insert({
        order_id: order.id,
        product_id: product.id,
        product_name: product.name,
        unit_price: product.price,
        quantity: 1,
        subtotal: 1000,
        product_snapshot: {
          id: product.id,
          name: product.name,
          price: product.price,
          currency: product.currency,
          temporaryTest: true,
          testRunId,
        },
      })
      .select("id")
      .single();

    if (orderItemError || !orderItem) {
      throw new Error(
        `Unable to create test order item: ${
          orderItemError?.message ?? "unknown error"
        }`,
      );
    }

    const { error: fulfillmentDataError } = await supabase
      .from("order_fulfillment_data")
      .insert({
        order_id: order.id,
        data: {
          outcome: "success",
          account: "clutchtopup-sandbox",
          temporaryTest: true,
          testRunId,
        },
      });

    if (fulfillmentDataError) {
      throw new Error(
        `Unable to create fulfillment data: ${fulfillmentDataError.message}`,
      );
    }

    let fulfillmentResult;

    try {
      fulfillmentResult = await submitFulfillment(order.id, "nexus");
    } catch (error) {
      return {
        status: "error",
        message:
          error instanceof Error
            ? error.message
            : "Nexus fulfillment submission failed.",
        testRunId,
        orderId: order.id,
        orderNumber: order.order_number,
      };
    }

    return {
      status: "success",
      message: createdProvider
        ? "Nexus sandbox fulfillment submitted successfully. A temporary Nexus provider was created for this test."
        : "Nexus sandbox fulfillment submitted successfully.",
      testRunId,
      orderId: order.id,
      orderNumber: order.order_number,
      fulfillmentRequestId: fulfillmentResult.fulfillmentRequestId,
      providerReference: fulfillmentResult.providerReference ?? undefined,
      fulfillmentStatus: fulfillmentResult.status,
    };
  } catch (error) {
    return {
      ...INITIAL_STATE,
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Nexus sandbox test failed.",
    };
  }
}

export async function cleanupNexusSandboxTest(
  _previousState: NexusTestState,
  formData: FormData,
): Promise<NexusTestState> {
  try {
    await requireAdmin();

    const testRunId = String(formData.get("testRunId") ?? "").trim();

    if (!testRunId) {
      return {
        status: "error",
        message: "Missing test run ID.",
      };
    }

    const supabase = createAdminClient();
    const productSlug = `nexus-sandbox-test-${testRunId}`;

    const { data: product } = await supabase
      .from("products")
      .select("id")
      .eq("slug", productSlug)
      .maybeSingle();

    const { data: fulfillmentData } = await supabase
      .from("order_fulfillment_data")
      .select("order_id")
      .contains("data", { testRunId })
      .maybeSingle();

    const orderId = fulfillmentData?.order_id ?? null;

    if (orderId) {
      const { data: requests } = await supabase
        .from("fulfillment_requests")
        .select("id")
        .eq("order_id", orderId);

      const requestIds = (requests ?? []).map((request) => request.id);

      if (requestIds.length > 0) {
        const { data: providerOrders } = await supabase
          .from("fulfillment_provider_orders")
          .select("provider_reference")
          .in("fulfillment_request_id", requestIds);

        const providerReferences = (providerOrders ?? [])
          .map((row) => row.provider_reference)
          .filter(
            (reference): reference is string =>
              typeof reference === "string" && reference.length > 0,
          );

        if (providerReferences.length > 0) {
          await supabase
            .from("fulfillment_webhook_events")
            .delete()
            .eq("provider", "nexus")
            .in("provider_reference", providerReferences);
        }

        await supabase
          .from("fulfillment_results")
          .delete()
          .in("fulfillment_request_id", requestIds);

        await supabase
          .from("fulfillment_provider_orders")
          .delete()
          .in("fulfillment_request_id", requestIds);

        await supabase
          .from("fulfillment_requests")
          .delete()
          .in("id", requestIds);
      }

      await supabase
        .from("order_fulfillment_data")
        .delete()
        .eq("order_id", orderId);

      await supabase
        .from("order_items")
        .delete()
        .eq("order_id", orderId);

      await supabase
        .from("orders")
        .delete()
        .eq("id", orderId);
    }

    await supabase
      .from("fulfillment_webhook_events")
      .delete()
      .eq("provider", "nexus")
      .contains("payload", { testRunId });

    if (product?.id) {
      await supabase
        .from("product_provider_mappings")
        .delete()
        .eq("product_id", product.id);

      await supabase
        .from("products")
        .delete()
        .eq("id", product.id);
    }

    const { data: testProvider } = await supabase
      .from("catalog_providers")
      .select("id, metadata")
      .eq("slug", "nexus")
      .maybeSingle();

    const metadata =
      testProvider?.metadata &&
      typeof testProvider.metadata === "object"
        ? (testProvider.metadata as Record<string, unknown>)
        : null;

    if (
      testProvider &&
      metadata?.createdBy === "nexus-sandbox-test" &&
      metadata?.testRunId === testRunId
    ) {
      const { count } = await supabase
        .from("product_provider_mappings")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("provider_id", testProvider.id);

      if ((count ?? 0) === 0) {
        await supabase
          .from("catalog_providers")
          .delete()
          .eq("id", testProvider.id);
      }
    }

    return {
      status: "cleaned",
      message: "Nexus sandbox test data has been cleaned up.",
      testRunId,
    };
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error
          ? error.message
          : "Nexus sandbox cleanup failed.",
    };
  }
}