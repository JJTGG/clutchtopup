import Link from "next/link";

import { requireAdmin } from "@/lib/admin/auth";
import { nexusProvider } from "@/lib/fulfillment/providers/nexus";
import { getNexusSandboxStatus } from "@/lib/fulfillment/providers/nexus-sandbox";

export default async function NexusAdminPage() {
  await requireAdmin();

  let sandboxStatus:
    | Awaited<
        ReturnType<typeof getNexusSandboxStatus>
      >
    | null = null;

  let products:
    | Awaited<
        ReturnType<
          typeof nexusProvider.getProducts
        >
      >
    | null = null;

  let error: string | null = null;

  try {
    sandboxStatus =
      await getNexusSandboxStatus();

    if (
      sandboxStatus.mode !== "sandbox" ||
      sandboxStatus.realMoney !== false
    ) {
      error =
        "Nexus did not identify this environment as a non-real-money sandbox. Catalog lookup was blocked.";
    } else {
      products =
        await nexusProvider.getProducts(
          "test-1",
        );
    }
  } catch (err) {
    error =
      err instanceof Error
        ? err.message
        : "Nexus diagnostic failed.";
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">
            NEXUS DIAGNOSTIC
          </p>

          <h1>Sandbox connection</h1>
        </div>

        <Link href="/admin">
          Admin
        </Link>
      </header>

      <section className="admin-grid">
        <article className="admin-card">
          <p className="eyebrow">
            ENVIRONMENT
          </p>

          <h2>Nexus sandbox</h2>

          {sandboxStatus ? (
            <>
              <div className="admin-stat">
                <span>Mode</span>
                <strong>
                  {sandboxStatus.mode}
                </strong>
              </div>

              <div className="admin-stat">
                <span>Real money</span>
                <strong>
                  {sandboxStatus.realMoney
                    ? "YES"
                    : "NO"}
                </strong>
              </div>

              <div className="admin-stat">
                <span>Providers</span>
                <strong>
                  {sandboxStatus.providers.join(
                    ", ",
                  ) || "None"}
                </strong>
              </div>
            </>
          ) : (
            <p>
              Sandbox status could not be
              retrieved.
            </p>
          )}
        </article>

        {error ? (
          <article className="admin-card">
            <p className="eyebrow">
              DIAGNOSTIC ERROR
            </p>

            <h2>Catalog lookup blocked</h2>

            <p>{error}</p>
          </article>
        ) : (
          <article className="admin-card">
            <p className="eyebrow">
              TEST SERVICE
            </p>

            <h2>test-1 catalog</h2>

            <p>
              Deterministic Nexus sandbox
              products returned by the provider
              adapter.
            </p>

            <div>
              <strong>
                {products?.length ?? 0}
              </strong>{" "}
              products returned
            </div>
          </article>
        )}
      </section>

      {products &&
        products.length > 0 && (
          <section className="admin-grid">
            {products.map((product) => (
              <article
                key={product.providerProductId}
                className="admin-card"
              >
                <p className="eyebrow">
                  {product.providerProductId}
                </p>

                <h2>{product.name}</h2>

                <div className="admin-stat">
                  <span>Price</span>
                  <strong>
                    ${product.cost.toFixed(3)}
                  </strong>
                </div>

                <div className="admin-stat">
                  <span>Currency</span>
                  <strong>
                    {product.currency}
                  </strong>
                </div>

                <div className="admin-stat">
                  <span>Available</span>
                  <strong>
                    {product.available
                      ? "YES"
                      : "NO"}
                  </strong>
                </div>

                <div>
                  <strong>
                    Delivery fields
                  </strong>

                  {product.fulfillmentFields
                    .length === 0 ? (
                    <p>None</p>
                  ) : (
                    <ul>
                      {product.fulfillmentFields.map(
                        (field) => (
                          <li
                            key={field.key}
                          >
                            {field.label}{" "}
                            ({field.type})
                            {field.required
                              ? " — required"
                              : " — optional"}
                          </li>
                        ),
                      )}
                    </ul>
                  )}
                </div>
              </article>
            ))}
          </section>
        )}

      <section className="admin-card">
        <p className="eyebrow">
          SAFETY
        </p>

        <h2>No side effects</h2>

        <p>
          This diagnostic only checks the Nexus
          sandbox environment and reads the
          deterministic test catalog. It does not
          create orders, charge the sandbox balance,
          modify Supabase, or expose the Nexus shop
          token.
        </p>
      </section>
    </main>
  );
}