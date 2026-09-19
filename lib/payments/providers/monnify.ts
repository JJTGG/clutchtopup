import "server-only";

import type { PaymentProvider } from "@/lib/payments/provider";
import type {
  PaymentInitialization,
  PaymentRequest,
  PaymentVerification,
  PaymentWebhook,
} from "@/lib/payments/types";

const BASE_URL =
  process.env.MONNIFY_BASE_URL ?? "https://sandbox.monnify.com";

const API_KEY = process.env.MONNIFY_API_KEY;
const SECRET_KEY = process.env.MONNIFY_SECRET_KEY;
const CONTRACT_CODE = process.env.MONNIFY_CONTRACT_CODE;
const APP_URL = process.env.APP_URL;

type MonnifyResponse<T> = {
  requestSuccessful: boolean;
  responseMessage?: string;
  responseCode?: string;
  responseBody?: T;
};

type MonnifyTransaction = {
  transactionReference: string;
  paymentReference: string;
  checkoutUrl?: string;
  amount?: number;
  amountPaid?: number;
  totalPayable?: number;
  currencyCode?: string;
  paymentStatus?: string;
};

function requireConfig() {
  if (!API_KEY || !SECRET_KEY || !CONTRACT_CODE) {
    throw new Error("Monnify is not configured.");
  }

  if (!APP_URL) {
    throw new Error("APP_URL is not configured.");
  }
}

async function getAccessToken() {
  requireConfig();

  const credentials = Buffer.from(
    `${API_KEY}:${SECRET_KEY}`,
  ).toString("base64");

  const response = await fetch(
    `${BASE_URL}/api/v1/auth/login`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${credentials}`,
      },
      cache: "no-store",
    },
  );

  const result =
    (await response.json()) as MonnifyResponse<{
      accessToken?: string;
    }>;

  if (
    !response.ok ||
    !result.requestSuccessful ||
    !result.responseBody?.accessToken
  ) {
    throw new Error("Unable to authenticate with Monnify.");
  }

  return result.responseBody.accessToken;
}

async function monnifyFetch<T>(
  path: string,
  init: RequestInit,
) {
  const token = await getAccessToken();

  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const result = (await response.json()) as MonnifyResponse<T>;

  if (!response.ok || !result.requestSuccessful) {
    throw new Error(
      result.responseMessage ??
        "Monnify request failed.",
    );
  }

  return result.responseBody as T;
}

function normalizeStatus(
  status: string | undefined,
): PaymentInitialization["status"] {
  switch (status) {
    case "PAID":
      return "confirmed";

    case "FAILED":
      return "failed";

    case "PENDING":
      return "pending";

    case "OVERPAID":
    case "PARTIALLY_PAID":
      return "pending";

    default:
      return "pending";
  }
}

function createPaymentReference(
  orderNumber: string,
  idempotencyKey: string,
) {
  const suffix = idempotencyKey
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-20);

  return `CT-${orderNumber}-${suffix}`;
}

export const monnifyProvider: PaymentProvider = {
  name: "monnify",

  async initialize(
    request: PaymentRequest,
  ): Promise<PaymentInitialization> {
    if (!request.customerEmail) {
      throw new Error(
        "A customer email is required for Monnify.",
      );
    }

    const paymentReference = createPaymentReference(
      request.orderNumber,
      request.idempotencyKey,
    );

    const transaction = await monnifyFetch<MonnifyTransaction>(
      "/api/v1/merchant/transactions/init-transaction",
      {
        method: "POST",
        body: JSON.stringify({
          amount: request.amount,
          customerEmail: request.customerEmail,
          paymentReference,
          paymentDescription: `ClutchTopUp order ${request.orderNumber}`,
          currencyCode: request.currency,
          contractCode: CONTRACT_CODE,
          redirectUrl: `${APP_URL}/orders/${request.orderNumber}`,
          paymentMethods: [
            "CARD",
            "ACCOUNT_TRANSFER",
            "USSD",
            "PHONE_NUMBER",
          ],
          metadata: {
            orderId: request.orderId,
            orderNumber: request.orderNumber,
          },
        }),
      },
    );

    if (
      !transaction.transactionReference ||
      !transaction.checkoutUrl
    ) {
      throw new Error(
        "Monnify returned an invalid initialization response.",
      );
    }

    return {
      providerReference: transaction.transactionReference,
      checkoutUrl: transaction.checkoutUrl,
      status: "pending",
      rawResponse: transaction,
    };
  },

  async verify(
    providerReference: string,
  ): Promise<PaymentVerification> {
    const transaction =
      await monnifyFetch<MonnifyTransaction>(
        `/api/v2/merchant/transactions/query?transactionReference=${encodeURIComponent(
          providerReference,
        )}`,
        {
          method: "GET",
        },
      );

    return {
      providerReference:
        transaction.transactionReference,
      status: normalizeStatus(
        transaction.paymentStatus,
      ),
      amount: Number(
        transaction.amountPaid ??
          transaction.totalPayable ??
          transaction.amount ??
          0,
      ),
      currency: transaction.currencyCode ?? "NGN",
      rawResponse: transaction,
    };
  },

  async parseWebhook(
    payload: unknown,
    signature?: string,
  ): Promise<PaymentWebhook> {
    if (!signature || !SECRET_KEY) {
      throw new Error(
        "Invalid Monnify webhook signature.",
      );
    }

    const data = payload as {
      eventData?: {
        transactionReference?: string;
        paymentReference?: string;
        amountPaid?: number;
        totalPayable?: number;
        currency?: string;
        paymentStatus?: string;
      };
    };

    const event = data.eventData;

    if (!event?.transactionReference) {
      throw new Error(
        "Invalid Monnify webhook payload.",
      );
    }

    return {
      providerReference:
        event.transactionReference,
      status: normalizeStatus(
        event.paymentStatus,
      ),
      amount:
        event.amountPaid ??
        event.totalPayable,
      currency: event.currency,
      rawPayload: payload,
    };
  },
};