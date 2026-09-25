import Link from "next/link";

import { requireAdmin } from "@/lib/admin/auth";
import { getNexusSandboxStatus } from "@/lib/fulfillment/providers/nexus-sandbox";

type ProbeResult = {
  name: string;
  path: string;
  status: number | null;
  ok: boolean;
  body: string;
};

async function probe(
  name: string,
  path: string,
): Promise<ProbeResult> {
  const baseUrl = process.env.NEXUS_BASE_URL;

  if (!baseUrl) {
    return {
      name,
      path,
      status: null,
      ok: false,
      body: "NEXUS_BASE_URL is not configured.",
    };
  }

  try {
    const response = await fetch(
      `${baseUrl.replace(/\/+$/, "")}${path}`,
      {
        method: "GET",
        headers: {
          Authorization: `Shop ${
            process.env.NEXUS_SHOP_TOKEN ?? ""
          }`,
          Accept: "application/json",
        },
        cache: "no-store",
      },
    );

    const text = await response.text();

    let body = text;

    try {
      const parsed = JSON.parse(text);
      body = JSON.stringify(parsed);
    } catch {
      body = text || "(empty response)";
    }

    return {
      name,
      path,
      status: response.status,
      ok: response.ok,
      body: body.slice(0, 1000),
    };
  } catch (error) {
    return {
      name,
      path,
      status: null,
      ok: false,
      body:
        error instanceof Error
          ? error.message
          : "Request failed.",
    };
  }
}

export default async function NexusAdminPage() {
  await requireAdmin();

  let sandboxStatus:
    | Awaited<
        ReturnType<typeof getNexusSandboxStatus>
      >
    | null = null;

  let sandboxError: string | null = null;

  try {
    sandboxStatus =
      await getNexusSandboxStatus();
  } catch (error) {
    sandboxError =
      error instanceof Error
        ? error.message
        : "Sandbox check failed.";
  }

  const probes = await Promise.all([
    probe(
      "Games",
      "/api/v1/games/",
    ),
    probe(
      "Games (no trailing slash)",
      "/api/v1/games",
    ),
    probe(
      "Catalog",
      "/api/v1/catalog",
    ),
    probe(
      "Test categories",
      "/api/v1/categories?gameId=test-1",
    ),
    probe(
      "Test top-up products",
      "/api/v1/products?categoryId=test-1:det-topup",
    ),
    probe(
      "Test code products",
      "/api/v1/products?categoryId=test-1:det-codes",
    ),
  ]);

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">
            NEXUS DIAGNOSTIC
          </p>

          <h1>Sandbox API probe</h1>
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
              {sandboxError ??
                "Sandbox status unavailable."}
            </p>
          )}
        </article>
      </section>

      <section className="admin-card">
        <p className="eyebrow">
          ENDPOINT PROBES
        </p>

        <h2>What does Nexus actually expose?</h2>

        <p>
          These requests are read-only. No orders are
          created and no sandbox balance is consumed.
        </p>

        <div>
          {probes.map((result) => (
            <article
              key={result.path}
              className="admin-card"
            >
              <div className="admin-stat">
                <span>
                  {result.name}
                </span>

                <strong>
                  {result.status === null
                    ? "ERROR"
                    : `${result.status} ${
                        result.ok
                          ? "OK"
                          : "ERROR"
                      }`}
                </strong>
              </div>

              <p>
                <code>
                  {result.path}
                </code>
              </p>

              <pre
                style={{
                  whiteSpace: "pre-wrap",
                  overflowWrap:
                    "anywhere",
                }}
              >
                {result.body}
              </pre>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-card">
        <p className="eyebrow">
          SAFETY
        </p>

        <h2>No side effects</h2>

        <p>
          This diagnostic only performs GET requests
          against the Nexus sandbox. It does not create
          orders, charge the sandbox balance, modify
          Supabase, or expose the Nexus shop token.
        </p>
      </section>
    </main>
  );
}