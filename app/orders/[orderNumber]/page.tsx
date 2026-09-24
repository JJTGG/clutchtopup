import Link from "next/link";
import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/storefront/SiteFooter";
import { SiteHeader } from "@/components/storefront/SiteHeader";
import { createClient } from "@/lib/supabase/server";

import PayButton from "./pay-button";

type PaymentStatus =
  | "pending"
  | "confirmed"
  | "failed"
  | "abandoned"
  | "reversed"
  | "refunded";

type FulfillmentStatus =
  | "queued"
  | "processing"
  | "successful"
  | "pending"
  | "failed";

function paymentLabel(status: PaymentStatus | null) {
  switch (status) {
    case "confirmed":
      return "Payment confirmed";
    case "failed":
      return "Payment failed";
    case "abandoned":
      return "Payment abandoned";
    case "reversed":
      return "Payment reversed";
    case "refunded":
      return "Payment refunded";
    case "pending":
    default:
      return "Awaiting payment";
  }
}

function fulfillmentLabel(
  status: FulfillmentStatus | null,
  paymentConfirmed: boolean,
) {
  if (!paymentConfirmed) {
    return "Waiting for payment";
  }

  switch (status) {
    case "successful":
      return "Top-up delivered";
    case "processing":
      return "Top-up is being delivered";
    case "pending":
      return "Top-up is still processing";
    case "failed":
      return "Top-up delivery failed";
    case "queued":
      return "Top-up queued for delivery";
    default:
      return "Waiting to start";
  }
}

function paymentTone(status: PaymentStatus | null) {
  switch (status) {
    case "confirmed":
      return "complete";
    case "failed":
    case "abandoned":
    case "reversed":
    case "refunded":
      return "failed";
    default:
      return "active";
  }
}

function fulfillmentTone(
  status: FulfillmentStatus | null,
  paymentConfirmed: boolean,
) {
  if (!paymentConfirmed) {
    return "waiting";
  }

  switch (status) {
    case "successful":
      return "complete";
    case "failed":
      return "failed";
    case "processing":
    case "pending":
    case "queued":
      return "active";
    default:
      return "waiting";
  }
}

export default async function OrderPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const { data: order, error: orderError } =
    await supabase
      .from("orders")
      .select(`
        id,
        order_number,
        status,
        currency,
        subtotal,
        discount,
        total,
        created_at,
        order_items (
          id,
          product_name,
          unit_price,
          quantity,
          subtotal
        )
      `)
      .eq("order_number", orderNumber)
      .eq("user_id", user.id)
      .single();

  if (orderError || !order) {
    notFound();
  }

  const [{ data: payment }, { data: fulfillment }] =
    await Promise.all([
      supabase
        .from("payments")
        .select("status, provider_reference")
        .eq("order_id", order.id)
        .order("created_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle(),

      supabase
        .from("fulfillment_requests")
        .select("status, provider_reference")
        .eq("order_id", order.id)
        .order("created_at", {
          ascending: false,
        })
        .limit(1)
        .maybeSingle(),
    ]);

  const paymentStatus =
    (payment?.status as PaymentStatus | null) ?? null;

  const fulfillmentStatus =
    (fulfillment?.status as FulfillmentStatus | null) ?? null;

  const paymentConfirmed =
    paymentStatus === "confirmed" ||
    order.status === "paid" ||
    order.status === "processing" ||
    order.status === "completed";

  const fulfillmentComplete =
    fulfillmentStatus === "successful" ||
    order.status === "completed";

  const canPay =
    !paymentConfirmed &&
    (paymentStatus === null ||
      paymentStatus === "pending");

  const missionComplete =
    order.status === "completed" ||
    fulfillmentComplete;

  const paymentToneValue =
    paymentTone(paymentStatus);

  const fulfillmentToneValue =
    fulfillmentTone(
      fulfillmentStatus,
      paymentConfirmed,
    );

  return (
    <>
      <SiteHeader />

      <main className="storefront-shell order-page">
        <div className="order-heading">
          <Link
            href="/games"
            className="back-link"
          >
            ← Back to games
          </Link>

          <p className="eyebrow">
            ORDER {order.order_number}
          </p>

          <h1>
            {missionComplete
              ? "Mission complete."
              : "Mission status."}
          </h1>

          <p className="lead">
            {missionComplete
              ? "Your top-up has been delivered."
              : paymentConfirmed
                ? "Your payment is confirmed. We’re handling the delivery."
                : "Your order is ready for the next step."}
          </p>
        </div>

        <div className="order-layout">
          <section className="order-main">
            <div className="order-status-card">
              <div className="order-status-card-heading">
                <div>
                  <p className="eyebrow">
                    MISSION STATUS
                  </p>

                  <h2>
                    {missionComplete
                      ? "Complete"
                      : "In progress"}
                  </h2>
                </div>

                <span
                  className={`order-status-indicator ${missionComplete ? "complete" : "active"}`}
                  aria-hidden="true"
                />
              </div>

              <div className="order-timeline">
                <div className="order-step complete">
                  <div className="order-step-marker">
                    ✓
                  </div>

                  <div>
                    <p className="order-step-label">
                      ORDER CREATED
                    </p>

                    <strong>
                      Order received
                    </strong>

                    <span>
                      {order.order_number}
                    </span>
                  </div>
                </div>

                <div
                  className={`order-step ${paymentToneValue}`}
                >
                  <div className="order-step-marker">
                    {paymentStatus === "confirmed"
                      ? "✓"
                      : paymentStatus ===
                          "failed" ||
                        paymentStatus ===
                          "abandoned" ||
                        paymentStatus ===
                          "reversed" ||
                        paymentStatus ===
                          "refunded"
                        ? "!"
                        : "2"}
                  </div>

                  <div>
                    <p className="order-step-label">
                      PAYMENT
                    </p>

                    <strong>
                      {paymentLabel(
                        paymentStatus,
                      )}
                    </strong>

                    <span>
                      {paymentConfirmed
                        ? "Your payment has been verified."
                        : "Payment is required before delivery can begin."}
                    </span>
                  </div>
                </div>

                <div
                  className={`order-step ${fulfillmentToneValue}`}
                >
                  <div className="order-step-marker">
                    {fulfillmentStatus ===
                    "successful"
                      ? "✓"
                      : fulfillmentStatus ===
                        "failed"
                        ? "!"
                        : "3"}
                  </div>

                  <div>
                    <p className="order-step-label">
                      FULFILLMENT
                    </p>

                    <strong>
                      {fulfillmentLabel(
                        fulfillmentStatus,
                        paymentConfirmed,
                      )}
                    </strong>

                    <span>
                      {paymentConfirmed
                        ? "The top-up delivery status is tracked here."
                        : "Delivery begins after payment is confirmed."}
                    </span>
                  </div>
                </div>

                <div
                  className={`order-step ${
                    missionComplete
                      ? "complete"
                      : "waiting"
                  }`}
                >
                  <div className="order-step-marker">
                    {missionComplete
                      ? "✓"
                      : "4"}
                  </div>

                  <div>
                    <p className="order-step-label">
                      COMPLETE
                    </p>

                    <strong>
                      {missionComplete
                        ? "Mission complete"
                        : "Waiting for delivery"}
                    </strong>

                    <span>
                      {missionComplete
                        ? "Your purchase has been fulfilled."
                        : "This step completes automatically after successful delivery."}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {canPay && (
              <div className="order-payment-card">
                <div>
                  <p className="eyebrow">
                    PAYMENT REQUIRED
                  </p>

                  <h2>
                    Complete your payment.
                  </h2>

                  <p>
                    Your order has been created.
                    Continue to Monnify to complete
                    payment.
                  </p>
                </div>

                <PayButton orderId={order.id} />
              </div>
            )}

            {paymentStatus === "failed" && (
              <div className="order-message error">
                <strong>
                  Payment was not completed.
                </strong>

                <span>
                  You can retry payment from this
                  order while it remains available.
                </span>
              </div>
            )}

            {paymentConfirmed &&
              fulfillmentStatus !==
                "successful" &&
              fulfillmentStatus !== "failed" && (
                <div className="order-message">
                  <strong>
                    Payment confirmed.
                  </strong>

                  <span>
                    Your top-up is being handled
                    separately from payment. You do
                    not need to pay again.
                  </span>
                </div>
              )}

            {fulfillmentStatus === "failed" && (
              <div className="order-message error">
                <strong>
                  Top-up delivery needs attention.
                </strong>

                <span>
                  Payment is separate from fulfillment,
                  so this does not mean your payment
                  failed.
                </span>
              </div>
            )}
          </section>

          <aside className="order-summary">
            <p className="eyebrow">
              ORDER SUMMARY
            </p>

            {order.order_items.map((item) => (
              <div
                key={item.id}
                className="order-summary-item"
              >
                <div>
                  <strong>
                    {item.product_name}
                  </strong>

                  <span>
                    Quantity: {item.quantity}
                  </span>
                </div>

                <strong>
                  {order.currency}{" "}
                  {Number(
                    item.subtotal,
                  ).toLocaleString()}
                </strong>
              </div>
            ))}

            <div className="order-summary-total">
              <span>Total</span>

              <strong>
                {order.currency}{" "}
                {Number(
                  order.total,
                ).toLocaleString()}
              </strong>
            </div>

            <div className="order-summary-meta">
              <span>Order number</span>
              <strong>{order.order_number}</strong>
            </div>

            <Link
              href="/games"
              className="order-secondary-action"
            >
              Top up another game →
            </Link>
          </aside>
        </div>
      </main>

      <div className="storefront-shell">
        <SiteFooter />
      </div>
    </>
  );
}