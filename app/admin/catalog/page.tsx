import Link from "next/link";
import { requireAdmin } from "@/lib/admin/auth";
import {
  getAdminCatalogOptions,
  getProductsForGame,
  previewCatalogSync,
} from "@/lib/catalog/admin";
import { applyCatalogAction } from "./actions";

type SearchParams = {
  provider?: string;
  game?: string;
  error?: string;
  applied?: string;
  created?: string;
  updated?: string;
  deactivated?: string;
};

export default async function AdminCatalogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const params = await searchParams;

  const options = await getAdminCatalogOptions();

  const providerName =
    params.provider ?? options.providers[0]?.slug ?? "";

  const gameSlug =
    params.game ?? options.games[0]?.slug ?? "";

  let products: Awaited<
    ReturnType<typeof getProductsForGame>
  > = [];

  let preview:
    | Awaited<ReturnType<typeof previewCatalogSync>>
    | null = null;

  let previewError: string | null = null;

  if (gameSlug) {
    products = await getProductsForGame(gameSlug);
  }

  if (providerName && gameSlug) {
    try {
      preview = await previewCatalogSync(
        providerName,
        gameSlug,
      );
    } catch (error) {
      previewError =
        error instanceof Error
          ? error.message
          : "Unable to load provider catalog.";
    }
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">CATALOG</p>
          <h1>Catalog sync</h1>
          <p className="lead">
            Preview the real provider catalog before anything
            changes in ClutchTopUp.
          </p>
        </div>

        <Link href="/admin">← Admin</Link>
      </header>

      {params.error && (
        <div className="admin-notice error">
          {params.error}
        </div>
      )}

      {params.applied === "1" && (
        <div className="admin-notice success">
          Sync applied — {params.created ?? "0"} created,{" "}
          {params.updated ?? "0"} updated,{" "}
          {params.deactivated ?? "0"} deactivated.
        </div>
      )}

      <form method="get" className="admin-form">
        <label>
          Provider
          <select
            name="provider"
            defaultValue={providerName}
          >
            {options.providers.map((provider) => (
              <option
                key={provider.slug}
                value={provider.slug}
              >
                {provider.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          Game
          <select
            name="game"
            defaultValue={gameSlug}
          >
            {options.games.map((game) => (
              <option
                key={game.slug}
                value={game.slug}
              >
                {game.name}
              </option>
            ))}
          </select>
        </label>

        <button type="submit">
          Preview catalog
        </button>
      </form>

      {!options.games.length && (
        <section className="admin-empty">
          <h2>No games configured</h2>
          <p>
            Add the initial active games before running catalog
            synchronization.
          </p>
        </section>
      )}

      {!options.providers.length && (
        <section className="admin-empty">
          <h2>No catalog provider configured</h2>
          <p>
            Add an active catalog provider before applying
            synchronization.
          </p>
        </section>
      )}

      {previewError && (
        <section className="admin-empty">
          <h2>Provider catalog unavailable</h2>
          <p>{previewError}</p>
        </section>
      )}

      {preview && (
        <section className="admin-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">PROVIDER RESPONSE</p>
              <h2>
                {preview.catalog.products.length} product
                {preview.catalog.products.length === 1
                  ? ""
                  : "s"}
              </h2>
            </div>
          </div>

          {preview.result.aborted ? (
            <div className="admin-notice error">
              {preview.result.rejected[0]?.reason ??
                "Synchronization aborted."}
            </div>
          ) : (
            <>
              <div className="admin-summary">
                <span>
                  {preview.result.decisions.filter(
                    (item) => item.type === "create",
                  ).length}{" "}
                  create
                </span>

                <span>
                  {preview.result.decisions.filter(
                    (item) => item.type === "update",
                  ).length}{" "}
                  update
                </span>

                <span>
                  {preview.result.decisions.filter(
                    (item) => item.type === "deactivate",
                  ).length}{" "}
                  deactivate
                </span>

                <span>
                  {preview.result.decisions.filter(
                    (item) => item.type === "review",
                  ).length}{" "}
                  review
                </span>
              </div>

              <form
                action={applyCatalogAction}
                className="admin-sync-form"
              >
                <input
                  type="hidden"
                  name="provider"
                  value={providerName}
                />

                <input
                  type="hidden"
                  name="game"
                  value={gameSlug}
                />

                <div className="admin-list">
                  {preview.result.decisions.map(
                    (decision) => {
                      const providerProduct =
                        decision.type === "deactivate"
                          ? decision.previous
                          : decision.product;

                      return (
                        <article
                          key={`${providerProduct.providerProductId}-${decision.type}`}
                          className="admin-list-item"
                        >
                          <div>
                            <p className="eyebrow">
                              {decision.type.toUpperCase()}
                            </p>

                            <h3>
                              {providerProduct.name}
                            </h3>

                            <p>
                              Provider ID:{" "}
                              <strong>
                                {
                                  providerProduct.providerProductId
                                }
                              </strong>
                            </p>

                            <p>
                              Cost:{" "}
                              {providerProduct.currency}{" "}
                              {providerProduct.cost}
                            </p>

                            <p>
                              Status:{" "}
                              {providerProduct.available
                                ? "Available"
                                : "Unavailable"}
                            </p>
                          </div>

                          {decision.type === "review" &&
                            !decision.previous && (
                              <label className="admin-map">
                                Map to ClutchTopUp product
                                <select
                                  name={`match:${providerProduct.providerProductId}`}
                                  defaultValue=""
                                >
                                  <option value="">
                                    Select product
                                  </option>

                                  {products.map(
                                    (product) => (
                                      <option
                                        key={product.id}
                                        value={product.id}
                                      >
                                        {product.name}
                                      </option>
                                    ),
                                  )}
                                </select>
                              </label>
                            )}

                          {decision.type === "review" && (
                            <p className="error">
                              {decision.reasons.join(
                                " ",
                              )}
                            </p>
                          )}
                        </article>
                      );
                    },
                  )}
                </div>

                <button
                  type="submit"
                  disabled={preview.result.decisions.some(
                    (decision) =>
                      decision.type === "review",
                  )}
                >
                  Apply approved synchronization
                </button>

                {preview.result.decisions.some(
                  (decision) =>
                    decision.type === "review",
                ) && (
                  <p className="notice">
                    Resolve every review item before applying
                    the synchronization.
                  </p>
                )}
              </form>
            </>
          )}
        </section>
      )}
    </main>
  );
}
