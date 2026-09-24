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

const NEXUS_BASE_URL =
  process.env.NEXUS_BASE_URL;

const NEXUS_SHOP_TOKEN =
  process.env.NEXUS_SHOP_TOKEN;

type NexusGame = {
  id: string;
  name: string;
  icon: string;
  tags: string[];
};

type NexusCategory = {
  id: string;
  name: string;
};

type NexusProduct = {
  id: string;
  name: string;
  icon: string;
  price: number;
  deliveryData: NexusFormField[];
  type:
    | "topup"
    | "cdkey"
    | "gift_card"
    | "subscription";
  platform: unknown | null;
  haveInstruction: boolean;
  amountType: unknown;
  description?: string;
  metadata?: Record<string, unknown> | null;
};

type NexusFormField =
  | {
      type: "text";
      id: string;
      label: string;
      required: boolean;
      regex?: string;
    }
  | {
      type: "number";
      id: string;
      label: string;
      required: boolean;
      step?: number;
      min?: number;
      max?: number;
    }
  | {
      type: "select";
      id: string;
      label: string;
      required: boolean;
      options: Array<{
        id: string;
        label: string;
      }>;
    }
  | {
      type: "secret";
      id: string;
      label: string;
      required: boolean;
      regex?: string;
    };

type NexusOrder = {
  id: number;
  product: string;
  externalId: string | null;
  amount: number;
  requestedQuantity: number | null;
  deliveredQuantity: number | null;
  totalPrice: number;
  status:
    | "pending"
    | "completed"
    | "failed"
    | "partially_completed";
  deliveryData: Record<string, string | number>;
  cdKeys: Array<{
    code: string;
  }> | null;
  errorCode?: string;
  createdAt: string;
  updatedAt: string;
};

class NexusApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(
    message: string,
    status: number,
    body: unknown,
  ) {
    super(message);
    this.name = "NexusApiError";
    this.status = status;
    this.body = body;
  }
}

function requireConfig() {
  if (!NEXUS_BASE_URL) {
    throw new Error(
      "NEXUS_BASE_URL is not configured.",
    );
  }

  if (!NEXUS_SHOP_TOKEN) {
    throw new Error(
      "NEXUS_SHOP_TOKEN is not configured.",
    );
  }

  return {
    baseUrl: NEXUS_BASE_URL.replace(/\/+$/, ""),
    token: NEXUS_SHOP_TOKEN,
  };
}

function unwrapArray<T>(
  body: unknown,
  key: string,
): T[] {
  if (Array.isArray(body)) {
    return body as T[];
  }

  if (
    body &&
    typeof body === "object"
  ) {
    const object =
      body as Record<string, unknown>;

    if (Array.isArray(object[key])) {
      return object[key] as T[];
    }

    if (
      object.data &&
      typeof object.data === "object" &&
      Array.isArray(
        (object.data as Record<string, unknown>)[
          key
        ],
      )
    ) {
      return (
        (object.data as Record<string, unknown>)[
          key
        ] as T[]
      );
    }

    if (Array.isArray(object.data)) {
      return object.data as T[];
    }
  }

  return [];
}

async function nexusFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const {
    baseUrl,
    token,
  } = requireConfig();

  const response = await fetch(
    `${baseUrl}${path}`,
    {
      ...init,
      headers: {
        Authorization: `Shop ${token}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      cache: "no-store",
    },
  );

  const text =
    await response.text();

  let body: unknown = null;

  try {
    body = text
      ? JSON.parse(text)
      : null;
  } catch {
    throw new NexusApiError(
      `Nexus returned invalid JSON (${response.status}).`,
      response.status,
      text,
    );
  }

  if (!response.ok) {
    const code =
      body &&
      typeof body === "object" &&
      "errorCode" in body &&
      typeof (
        body as Record<string, unknown>
      ).errorCode === "string"
        ? String(
            (
              body as Record<string, unknown>
            ).errorCode,
          )
        : undefined;

    throw new NexusApiError(
      code
        ? `Nexus request failed: ${code}.`
        : `Nexus request failed with HTTP ${response.status}.`,
      response.status,
      body,
    );
  }

  return body as T;
}

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function mapStatus(
  status: NexusOrder["status"],
): FulfillmentStatus {
  switch (status) {
    case "completed":
      return "successful";

    case "failed":
      return "failed";

    case "pending":
      return "pending";

    case "partially_completed":
      /*
       * Bundles are not being sold by ClutchTopUp yet.
       * Preserve a partial Nexus result as unresolved rather
       * than falsely telling the customer the entire order
       * completed.
       */
      return "pending";

    default:
      return "pending";
  }
}

function mapField(
  field: NexusFormField,
): ProviderFulfillmentField {
  switch (field.type) {
    case "number":
      return {
        key: field.id,
        label: field.label,
        type: "number",
        required: field.required,
      };

    case "select":
      /*
       * The current ClutchTopUp fulfillment schema stores
       * select values as strings. Use Nexus option IDs as the
       * submitted values because those are what Nexus expects.
       *
       * The human labels are preserved in provider metadata.
       */
      return {
        key: field.id,
        label: field.label,
        type: "select",
        required: field.required,
        options: field.options.map(
          (option) => option.id,
        ),
      };

    case "secret":
      /*
       * The current checkout persistence layer cannot safely
       * handle Nexus secret fields yet.
       *
       * Keep the product unavailable rather than treating a
       * secret as ordinary text.
       */
      return {
        key: field.id,
        label: field.label,
        type: "text",
        required: field.required,
      };

    case "text":
    default:
      return {
        key: field.id,
        label: field.label,
        type: "text",
        required: field.required,
      };
  }
}

function hasSecretField(
  fields: NexusFormField[],
) {
  return fields.some(
    (field) => field.type === "secret",
  );
}

function toProviderProduct(
  product: NexusProduct,
  gameSlug: string,
): ProviderProduct {
  const unsupportedSecretField =
    hasSecretField(
      product.deliveryData ?? [],
    );

  return {
    provider: "nexus",
    providerProductId: product.id,
    gameSlug,
    name: product.name,
    currency: "USD",
    cost: product.price,
    /*
     * Nexus does not expose a separate stock flag in the
     * documented product shape. A positive catalog price
     * represents a usable catalog entry for our purposes.
     *
     * Products requiring secret fields remain unavailable
     * until secure fulfillment storage is implemented.
     */
    available:
      product.price > 0 &&
      !unsupportedSecretField,
    fulfillmentFields:
      (product.deliveryData ?? []).map(
        mapField,
      ),
    metadata: {
      nexusType: product.type,
      nexusAmountType:
        product.amountType,
      nexusPlatform:
        product.platform,
      nexusDescription:
        product.description,
      nexusHaveInstruction:
        product.haveInstruction,
      nexusMetadata:
        product.metadata ?? null,
      unsupportedSecretField,
      selectOptionLabels:
        (product.deliveryData ?? [])
          .filter(
            (
              field,
            ): field is Extract<
              NexusFormField,
              { type: "select" }
            > =>
              field.type === "select",
          )
          .reduce<
            Record<
              string,
              Record<string, string>
            >
          >(
            (
              result,
              field,
            ) => {
              result[field.id] =
                Object.fromEntries(
                  field.options.map(
                    (option) => [
                      option.id,
                      option.label,
                    ],
                  ),
                );

              return result;
            },
            {},
          ),
    },
  };
}

async function resolveGame(
  gameSlug: string,
): Promise<NexusGame> {
  const response =
    await nexusFetch<unknown>(
      "/api/v1/games/",
    );

  const games =
    unwrapArray<NexusGame>(
      response,
      "games",
    );

  const exactId =
    games.find(
      (game) =>
        game.id === gameSlug,
    );

  if (exactId) {
    return exactId;
  }

  const normalizedSlug =
    normalize(gameSlug);

  const normalizedMatch =
    games.find(
      (game) =>
        normalize(game.id) ===
          normalizedSlug ||
        normalize(game.name) ===
          normalizedSlug,
    );

  if (normalizedMatch) {
    return normalizedMatch;
  }

  throw new Error(
    `Nexus game "${gameSlug}" could not be resolved from the provider catalog.`,
  );
}

async function getCategories(
  gameId: string,
) {
  const response =
    await nexusFetch<unknown>(
      `/api/v1/categories?gameId=${encodeURIComponent(
        gameId,
      )}`,
    );

  return unwrapArray<NexusCategory>(
    response,
    "categories",
  );
}

async function getProducts(
  categoryId: string,
) {
  const response =
    await nexusFetch<unknown>(
      `/api/v1/products?categoryId=${encodeURIComponent(
        categoryId,
      )}`,
    );

  return unwrapArray<NexusProduct>(
    response,
    "products",
  );
}

export const nexusProvider: FulfillmentProvider = {
  name: "nexus",

  async getProducts(
    gameSlug: string,
  ): Promise<ProviderProduct[]> {
    if (!gameSlug.trim()) {
      throw new Error(
        "Nexus game slug is required for catalog lookup.",
      );
    }

    const game =
      await resolveGame(
        gameSlug,
      );

    const categories =
      await getCategories(game.id);

    const products: ProviderProduct[] =
      [];

    for (const category of categories) {
      const categoryProducts =
        await getProducts(
          category.id,
        );

      for (
        const product of categoryProducts
      ) {
        products.push(
          toProviderProduct(
            product,
            gameSlug,
          ),
        );
      }
    }

    return products;
  },

  async submit(
    request: FulfillmentRequest,
  ): Promise<FulfillmentSubmission> {
    if (
      !request.providerProductId.trim()
    ) {
      throw new Error(
        "Nexus provider product ID is required.",
      );
    }

    if (
      !Number.isInteger(
        request.quantity,
      ) ||
      request.quantity < 1
    ) {
      throw new Error(
        "Nexus order quantity must be a positive integer.",
      );
    }

    const deliveryData: Record<
      string,
      string
    > = {};

    for (
      const identifier of request.playerIdentifiers
    ) {
      if (
        identifier.key.trim() &&
        identifier.value.trim()
      ) {
        deliveryData[
          identifier.key
        ] = identifier.value;
      }
    }

    try {
      const response =
        await nexusFetch<unknown>(
          "/api/v1/orders",
          {
            method: "POST",
            body: JSON.stringify({
              product:
                request.providerProductId,
              deliveryData,
              externalId:
                request.externalOrderId,
              amount:
                request.quantity,
            }),
          },
        );

      const order =
        response &&
        typeof response === "object" &&
        "id" in response
          ? (response as NexusOrder)
          : response &&
              typeof response ===
                "object" &&
              "order" in response
            ? (
                response as {
                  order: NexusOrder;
                }
              ).order
            : null;

      if (
        !order ||
        typeof order.id !==
          "number"
      ) {
        throw new Error(
          "Nexus accepted the order but returned no order ID.",
        );
      }

      return {
        providerReference:
          String(order.id),
        providerReferences: [
          String(order.id),
        ],
        status: mapStatus(
          order.status,
        ),
        rawResponse:
          response,
      };
    } catch (error) {
      /*
       * Nexus uses 4xx responses for deterministic client/order
       * failures. Those are fulfillment failures, not uncertain
       * external submissions, so do not blindly retry them.
       */
      if (
        error instanceof NexusApiError &&
        error.status >= 400 &&
        error.status < 500
      ) {
        return {
          providerReference: "",
          providerReferences: [],
          status: "failed",
          rawResponse:
            error.body,
        };
      }

      throw error;
    }
  },

  async getStatus(
    providerReference: string,
  ): Promise<FulfillmentStatusResult> {
    if (!providerReference.trim()) {
      throw new Error(
        "Nexus order reference is required.",
      );
    }

    const response =
      await nexusFetch<unknown>(
        `/api/v1/orders/${encodeURIComponent(
          providerReference,
        )}`,
      );

    const order =
      response &&
      typeof response === "object" &&
      "id" in response
        ? (response as NexusOrder)
        : response &&
            typeof response ===
              "object" &&
            "order" in response
          ? (
              response as {
                order: NexusOrder;
              }
            ).order
          : null;

    if (
      !order ||
      typeof order.id !==
        "number"
    ) {
      throw new Error(
        "Nexus order lookup returned no order.",
      );
    }

    return {
      providerReference:
        String(order.id),
      status: mapStatus(
        order.status,
      ),
      rawResponse:
        response,
    };
  },

  async parseWebhook(
    payload: unknown,
    _signature?: string,
  ): Promise<FulfillmentWebhook> {
    if (
      !payload ||
      typeof payload !==
        "object"
    ) {
      throw new Error(
        "Invalid Nexus webhook payload.",
      );
    }

    const body =
      payload as Record<
        string,
        unknown
      >;

    const eventType =
      typeof body.type ===
      "string"
        ? body.type
        : typeof body.eventType ===
            "string"
          ? body.eventType
          : undefined;

    if (
      eventType &&
      eventType !==
        "statusChange"
    ) {
      throw new Error(
        `Unsupported Nexus webhook event: ${eventType}.`,
      );
    }

    const order =
      body.order &&
      typeof body.order ===
        "object"
        ? body.order
        : body.data &&
            typeof body.data ===
              "object"
          ? body.data
          : null;

    if (
      !order ||
      typeof order !==
        "object"
    ) {
      throw new Error(
        "Nexus webhook is missing the order payload.",
      );
    }

    const nexusOrder =
      order as Record<
        string,
        unknown
      >;

    if (
      typeof nexusOrder.id !==
      "number"
    ) {
      throw new Error(
        "Nexus webhook is missing order.id.",
      );
    }

    const status =
      nexusOrder.status;

    if (
      status !== "pending" &&
      status !== "completed" &&
      status !== "failed" &&
      status !==
        "partially_completed"
    ) {
      throw new Error(
        "Nexus webhook contains an invalid order status.",
      );
    }

    return {
      providerReference:
        String(nexusOrder.id),
      status:
        mapStatus(status),
      rawPayload: payload,
    };
  },
};