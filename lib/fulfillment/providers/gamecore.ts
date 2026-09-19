import type {
  FulfillmentRequest,
  FulfillmentStatus,
  FulfillmentStatusResult,
  FulfillmentSubmission,
  FulfillmentWebhook,
  ProviderFulfillmentField,
  ProviderProduct,
} from "@/lib/fulfillment/types";
import type { FulfillmentProvider } from "@/lib/fulfillment/provider";

const GAMECORE_BASE_URL =
  process.env.GAMECORE_BASE_URL ?? "https://api.gamecore-api.tech";

const GAMECORE_API_KEY = process.env.GAMECORE_API_KEY;

type GameCoreDeliveryField = {
  id: string;
  type: string;
  label: string;
  required: boolean;
  placeholder?: string;
  options?: string[];
};

type GameCoreProduct = {
  id: number;
  name: string;
  slug: string;
  wholesalePrice: number;
  currency: string;
  deliveryType: string | null;
  region?: string | null;
  deliveryDataSchema?: GameCoreDeliveryField[];
  inStock?: boolean;
};

type GameCoreCreateOrder = {
  code: string;
  gameId?: string;
  gameName?: string;
  total?: number;
  itemCount?: number;
};

type GameCoreCreateResponse = {
  success: boolean;
  data?: {
    paymentCode: string;
    totalAmount: number;
    orders: GameCoreCreateOrder[];
  };
  error?: string;
};

type GameCoreOrderResponse = {
  success: boolean;
  data?: {
    code: string;
    externalOrderId?: string;
    status: string;
    totalAmount?: number;
    items?: Array<{
      id?: number;
      productName?: string;
      amount?: number;
      price?: number;
      status?: string;
      cdKeys?: Array<{ code: string }>;
      errorCode?: string | null;
      errorMessage?: string | null;
      completedAt?: string | null;
    }>;
    completedAt?: string | null;
  };
  error?: string;
};

type GameCoreWebhookPayload = {
  event_id?: string;
  event_type?: string;
  occurred_at?: string;
  data?: {
    orderCode?: string;
    externalOrderId?: string;
    totalAmount?: number;
    status?: string;
    error?: string;
    reason?: string | null;
    completedAt?: string | null;
    items?: unknown[];
  };
};

function requireApiKey() {
  if (!GAMECORE_API_KEY) {
    throw new Error("GameCore API key is not configured.");
  }

  return GAMECORE_API_KEY;
}

function mapStatus(status: string): FulfillmentStatus {
  switch (status) {
    case "completed":
      return "successful";

    case "failed":
      return "failed";

    case "processing":
    case "pending":
    default:
      return "processing";
  }
}

function mapFieldType(
  type: string,
): ProviderFulfillmentField["type"] {
  switch (type) {
    case "number":
      return "number";

    case "select":
      return "select";

    case "text":
    default:
      return "text";
  }
}

function mapFields(
  schema: GameCoreProduct["deliveryDataSchema"],
): ProviderFulfillmentField[] {
  return (schema ?? []).map((field) => ({
    key: field.id,
    label: field.label,
    type: mapFieldType(field.type),
    required: field.required,
    placeholder: field.placeholder,
    ...(field.options?.length
      ? { options: field.options }
      : {}),
  }));
}

function toProviderProduct(
  product: GameCoreProduct,
  gameSlug: string,
): ProviderProduct {
  return {
    provider: "gamecore",
    providerProductId: String(product.id),
    gameSlug,
    name: product.name,
    region: product.region ?? undefined,
    currency: product.currency,
    cost: product.wholesalePrice,
    available:
      product.inStock !== false &&
      product.wholesalePrice > 0,
    fulfillmentFields: mapFields(
      product.deliveryDataSchema,
    ),
    metadata: {
      slug: product.slug,
      deliveryType: product.deliveryType,
    },
  };
}

async function gameCoreFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(
    `${GAMECORE_BASE_URL}${path}`,
    {
      ...init,
      headers: {
        "X-Api-Key": requireApiKey(),
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    },
  );

  const text = await response.text();

  let body: unknown;

  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    throw new Error(
      `GameCore returned invalid JSON (${response.status}).`,
    );
  }

  if (!response.ok) {
    const error =
      typeof body === "object" &&
      body !== null &&
      "error" in body &&
      typeof body.error === "string"
        ? body.error
        : `GameCore request failed with HTTP ${response.status}.`;

    throw new Error(error);
  }

  return body as T;
}

export const gameCoreProvider: FulfillmentProvider = {
  name: "gamecore",

  async getProducts(
    gameSlug: string,
  ): Promise<ProviderProduct[]> {
    if (!gameSlug.trim()) {
      throw new Error(
        "GameCore game slug is required for catalog lookup.",
      );
    }

    const response =
      await gameCoreFetch<{
        success: boolean;
        data?: GameCoreProduct[];
        error?: string;
      }>(
        `/b2b/catalog/games/${encodeURIComponent(
          gameSlug,
        )}/products`,
      );

    if (!response.success || !response.data) {
      throw new Error(
        response.error ??
          "GameCore catalog request failed.",
      );
    }

    return response.data.map((product) =>
      toProviderProduct(product, gameSlug),
    );
  },

  async submit(
    request: FulfillmentRequest,
  ): Promise<FulfillmentSubmission> {
    const numericProductId = Number(
      request.providerProductId,
    );

    if (
      !Number.isInteger(numericProductId) ||
      numericProductId <= 0
    ) {
      throw new Error(
        "GameCore provider product ID must be a positive integer.",
      );
    }

    const deliveryData: Record<string, string> = {};

    for (const identifier of request.playerIdentifiers) {
      deliveryData[identifier.key] = String(
        identifier.value,
      );
    }

    const response =
      await gameCoreFetch<GameCoreCreateResponse>(
        "/b2b/orders",
        {
          method: "POST",
          headers: {
            "X-Idempotency-Key":
              request.idempotencyKey,
          },
          body: JSON.stringify({
            items: [
              {
                productId: numericProductId,
                quantity: request.quantity,
                deliveryData,
              },
            ],
            externalOrderId:
              request.externalOrderId,
            ...(request.callbackUrl
              ? {
                  callbackUrl:
                    request.callbackUrl,
                }
              : {}),
          }),
        },
      );

    if (!response.success || !response.data) {
      throw new Error(
        response.error ??
          "GameCore order creation failed.",
      );
    }

    const references =
      response.data.orders
        .map((order) => order.code)
        .filter(
          (code): code is string =>
            typeof code === "string" &&
            code.length > 0,
        );

    if (references.length === 0) {
      throw new Error(
        "GameCore accepted the request but returned no order references.",
      );
    }

    /*
     * IMPORTANT:
     *
     * paymentCode identifies the overall B2B payment/request.
     * It is NOT the value expected by GET /b2b/orders/:code.
     *
     * providerReference therefore uses an actual order code.
     */
    return {
      providerReference: references[0],
      providerReferences: references,
      status: "processing",
      rawResponse: response,
    };
  },

  async getStatus(
    providerReference: string,
  ): Promise<FulfillmentStatusResult> {
    if (!providerReference.trim()) {
      throw new Error(
        "GameCore order reference is required.",
      );
    }

    const response =
      await gameCoreFetch<GameCoreOrderResponse>(
        `/b2b/orders/${encodeURIComponent(
          providerReference,
        )}`,
        {
          method: "GET",
        },
      );

    if (!response.success || !response.data) {
      throw new Error(
        response.error ??
          "GameCore order lookup failed.",
      );
    }

    return {
      providerReference:
        response.data.code,
      status: mapStatus(
        response.data.status,
      ),
      rawResponse: response,
    };
  },

  async parseWebhook(
    payload: unknown,
    _signature?: string,
  ): Promise<FulfillmentWebhook> {
    if (
      typeof payload !== "object" ||
      payload === null
    ) {
      throw new Error(
        "Invalid GameCore webhook payload.",
      );
    }

    const body =
      payload as GameCoreWebhookPayload;

    /*
     * GameCore documents exactly two order events.
     * The body event_type is authoritative.
     */
    if (
      body.event_type !==
        "order.completed" &&
      body.event_type !==
        "order.failed"
    ) {
      throw new Error(
        "Unsupported GameCore webhook event.",
      );
    }

    const providerReference =
      body.data?.orderCode;

    if (!providerReference) {
      throw new Error(
        "GameCore webhook is missing data.orderCode.",
      );
    }

    const expectedStatus =
      body.event_type ===
      "order.completed"
        ? "successful"
        : "failed";

    return {
      providerReference,
      status: expectedStatus,
      rawPayload: payload,
    };
  },
};