"use client";

import { useActionState, useState } from "react";

import {
  startPayment,
  type InitializePaymentState,
} from "@/app/actions/payments";

export default function PayButton({
  orderId,
}: {
  orderId: string;
}) {
  const [state, formAction, pending] = useActionState<
    InitializePaymentState,
    FormData
  >(startPayment, null);

  const [idempotencyKey] = useState(() =>
    crypto.randomUUID(),
  );

  return (
    <form action={formAction}>
      <input
        type="hidden"
        name="orderId"
        value={orderId}
      />

      <input
        type="hidden"
        name="idempotencyKey"
        value={idempotencyKey}
      />

      <button
        type="submit"
        disabled={pending}
      >
        {pending ? "Preparing payment..." : "Pay now"}
      </button>

      {state?.error && (
        <p role="alert">{state.error}</p>
      )}
    </form>
  );
}