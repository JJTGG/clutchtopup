"use client";

import { useState } from "react";
import { useActionState } from "react";

import { submitOrder } from "@/app/actions/orders";
import type { FulfillmentConfig } from "@/lib/fulfillment/config";

export function CheckoutForm({
  productId,
  config,
  price,
  currency,
}: {
  productId: string;
  config: FulfillmentConfig;
  price: number;
  currency: string;
}) {
  const [state, formAction, pending] = useActionState(
    submitOrder,
    null,
  );

  const [idempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  const [quantity, setQuantity] = useState(1);

  const total = price * quantity;

  return (
    <form action={formAction} className="checkout-form">
      <input
        type="hidden"
        name="productId"
        value={productId}
      />

      <input
        type="hidden"
        name="idempotencyKey"
        value={idempotencyKey}
      />

      <section className="checkout-section">
        <div className="checkout-section-heading">
          <div>
            <p className="eyebrow">02 / PLAYER INFORMATION</p>
            <h2>Where should we send it?</h2>
          </div>
        </div>

        <div className="checkout-fields">
          {config.fields.map((field) => (
            <label
              key={field.key}
              className="checkout-field"
            >
              <span>
                {field.label}
                {field.required && (
                  <span className="required-mark"> *</span>
                )}
              </span>

              {field.type === "select" ? (
                <select
                  name={field.key}
                  defaultValue=""
                  required={field.required}
                >
                  <option value="" disabled>
                    {field.placeholder ?? "Select an option"}
                  </option>

                  {(field.options ?? []).map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  name={field.key}
                  type={field.type}
                  placeholder={field.placeholder}
                  required={field.required}
                  inputMode={
                    field.type === "number"
                      ? "numeric"
                      : "text"
                  }
                />
              )}
            </label>
          ))}

          {config.regionRequired && (
            <label className="checkout-field">
              <span>
                Region
                <span className="required-mark"> *</span>
              </span>

              <input
                name="region"
                type="text"
                placeholder="Enter the required region"
                required
              />
            </label>
          )}
        </div>

        <p className="checkout-helper">
          Double-check your Player ID and other details before
          continuing. Incorrect player information can prevent
          successful delivery.
        </p>
      </section>

      <section className="checkout-section">
        <div className="checkout-section-heading">
          <div>
            <p className="eyebrow">03 / QUANTITY</p>
            <h2>How many?</h2>
          </div>
        </div>

        <label className="checkout-field checkout-quantity">
          <span>Quantity</span>

          <input
            name="quantity"
            type="number"
            min="1"
            step="1"
            value={quantity}
            onChange={(event) => {
              const next = Number(event.target.value);

              if (Number.isInteger(next) && next >= 1) {
                setQuantity(next);
              }
            }}
            required
          />
        </label>
      </section>

      {state?.error && (
        <p className="checkout-error" role="alert">
          {state.error}
        </p>
      )}

      <div className="checkout-submit">
        <div>
          <span className="eyebrow">TOTAL</span>

          <strong>
            {currency} {total.toLocaleString()}
          </strong>
        </div>

        <button type="submit" disabled={pending}>
          {pending
            ? "Creating order..."
            : "Continue to payment →"}
        </button>
      </div>
    </form>
  );
}