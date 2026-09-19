"use client";

import { useState } from "react";
import { useActionState } from "react";
import type { FulfillmentConfig } from "@/lib/fulfillment/config";
import { submitOrder } from "@/app/actions/orders";

export function CheckoutForm({
  productId,
  config,
}: {
  productId: string;
  config: FulfillmentConfig;
}) {
  const [state, formAction, pending] = useActionState(
    submitOrder,
    null,
  );

  const [idempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

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

      {config.fields.map((field) => (
        <label key={field.key}>
          {field.label}

          <input
            name={field.key}
            type={field.type}
            placeholder={field.placeholder}
            required={field.required}
          />
        </label>
      ))}

      {config.regionRequired && (
        <label>
          Region
          <input name="region" required />
        </label>
      )}

      <label>
        Quantity
        <input
          name="quantity"
          type="number"
          min="1"
          step="1"
          defaultValue="1"
          required
        />
      </label>

      {state?.error && (
        <p role="alert">{state.error}</p>
      )}

      <button type="submit" disabled={pending}>
        {pending ? "Creating order..." : "Continue"}
      </button>
    </form>
  );
}