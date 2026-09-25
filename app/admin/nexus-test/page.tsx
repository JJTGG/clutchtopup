"use client";

import { useActionState } from "react";
import {
  cleanupNexusSandboxTest,
  runNexusSandboxTest,
  type NexusTestState,
} from "./actions";

const initialState: NexusTestState = {
  status: "idle",
  message: "",
};

export default function NexusSandboxTestPage() {
  const [testState, runTestAction, testPending] = useActionState(
    runNexusSandboxTest,
    initialState,
  );

  const [cleanupState, cleanupAction, cleanupPending] = useActionState(
    cleanupNexusSandboxTest,
    initialState,
  );

  const state =
    cleanupState.status !== "idle"
      ? cleanupState
      : testState;

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Internal diagnostic</p>
          <h1>Nexus Sandbox Test</h1>
          <p className="lead">
            Creates a temporary paid order and submits it directly through the
            Nexus fulfillment provider.
          </p>
        </div>
      </header>

      <section className="admin-section">
        <h2>Run fulfillment test</h2>

        <p>
          This uses Nexus&apos;s deterministic sandbox product
          <code>test-1:p1</code>. No real money or real game delivery is
          involved.
        </p>

        <form action={runTestAction}>
          <button
            type="submit"
            disabled={testPending || cleanupPending}
          >
            {testPending ? "Running Nexus test..." : "Run Nexus sandbox test"}
          </button>
        </form>
      </section>

      {state.message && (
        <section className="admin-section">
          <h2>Result</h2>

          <div className="notice">
            <p>{state.message}</p>

            {state.orderNumber && (
              <p>
                <strong>Order:</strong> {state.orderNumber}
              </p>
            )}

            {state.fulfillmentRequestId && (
              <p>
                <strong>Fulfillment request:</strong>{" "}
                {state.fulfillmentRequestId}
              </p>
            )}

            {state.providerReference && (
              <p>
                <strong>Nexus order:</strong>{" "}
                {state.providerReference}
              </p>
            )}

            {state.fulfillmentStatus && (
              <p>
                <strong>Status:</strong> {state.fulfillmentStatus}
              </p>
            )}

            {state.testRunId && (
              <p>
                <strong>Test run:</strong> {state.testRunId}
              </p>
            )}
          </div>
        </section>
      )}

      {state.testRunId && state.status !== "cleaned" && (
        <section className="admin-section">
          <h2>Cleanup</h2>

          <p>
            Remove the temporary product, order, fulfillment records and
            sandbox webhook records created by this test.
          </p>

          <form action={cleanupAction}>
            <input
              type="hidden"
              name="testRunId"
              value={state.testRunId}
            />

            <button
              type="submit"
              disabled={testPending || cleanupPending}
            >
              {cleanupPending
                ? "Cleaning up..."
                : "Clean up test data"}
            </button>
          </form>
        </section>
      )}
    </main>
  );
}