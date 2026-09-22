import Link from "next/link";

import { requireAdmin } from "@/lib/admin/auth";
import { getAdminCatalogOptions } from "@/lib/catalog/admin";
import { getAdminProducts } from "@/lib/catalog/products";

import {
  createProductAction,
  toggleProductAction,
} from "./actions";

type SearchParams = {
  error?: string;
  created?: string;
  updated?: string;
};

const DEFAULT_FULFILLMENT_CONFIG = JSON.stringify(
  {
    fields: [
      {
        key: "playerId",
        label: "Player ID",
        type: "text",
        required: true,
        placeholder: "Enter player ID",
      },
    ],
    regionRequired: false,
  },
  null,
  2,
);

export default async function AdminProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireAdmin();

  const params = await searchParams;

  const [options, products] =
    await Promise.all([
      getAdminCatalogOptions(),
      getAdminProducts(),
    ]);

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">PRODUCTS</p>
          <h1>Product catalog</h1>
          <p className="lead">
            Create and control the products ClutchTopUp
            can sell.
          </p>
        </div>

        <Link href="/admin">← Admin</Link>
      </header>

      {params.error && (
        <div className="admin-notice error">
          {params.error}
        </div>
      )}

      {params.created === "1" && (
        <div className="admin-notice success">
          Product created. It is active but remains
          unavailable to customers until it has an
          available provider mapping.
        </div>
      )}

      {params.updated === "1" && (
        <div className="admin-notice success">
          Product status updated.
        </div>
      )}

      <section className="admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">NEW PRODUCT</p>
            <h2>Create product</h2>
          </div>
        </div>

        {options.games.length === 0 ? (
          <div className="admin-empty">
            <h3>No active games</h3>
            <p>
              An active game is required before creating
              a product.
            </p>
          </div>
        ) : (
          <form
            action={createProductAction}
            className="admin-form"
          >
            <label>
              Game
              <select name="gameId" required>
                {options.games.map((game) => (
                  <option
                    key={game.id}
                    value={game.id}
                  >
                    {game.name}
                  </option>
                ))}
              </select>
            </label>

            <label>
              Product name
              <input
                name="name"
                placeholder="e.g. 100 Diamonds"
                required
              />
            </label>

            <label>
              Slug
              <input
                name="slug"
                placeholder="e.g. 100-diamonds"
              />
            </label>

            <label>
              Description
              <textarea
                name="description"
                placeholder="Optional product description"
                rows={3}
              />
            </label>

            <label>
              Price
              <input
                name="price"
                type="number"
                min="0.01"
                step="0.01"
                placeholder="1000"
                required
              />
            </label>

            <label>
              Currency
              <input
                name="currency"
                defaultValue="NGN"
                maxLength={10}
                required
              />
            </label>

            <label>
              Fulfillment configuration
              <textarea
                name="fulfillmentConfig"
                defaultValue={
                  DEFAULT_FULFILLMENT_CONFIG
                }
                rows={16}
                required
              />
            </label>

            <button type="submit">
              Create active product
            </button>
          </form>
        )}
      </section>

      <section className="admin-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">CURRENT PRODUCTS</p>
            <h2>
              {products.length} product
              {products.length === 1
                ? ""
                : "s"}
            </h2>
          </div>
        </div>

        {products.length === 0 ? (
          <div className="admin-empty">
            <p>No products have been created yet.</p>
          </div>
        ) : (
          <div className="admin-list">
            {products.map((product) => (
              <article
                key={product.id}
                className="admin-list-item"
              >
                <div>
                  <p className="eyebrow">
                    {product.is_active
                      ? "ACTIVE"
                      : "INACTIVE"}
                  </p>

                  <h3>{product.name}</h3>

                  <p>
                    Game:{" "}
                    <strong>
                      {product.games.name}
                    </strong>
                  </p>

                  <p>
                    Price:{" "}
                    <strong>
                      {product.currency}{" "}
                      {product.price}
                    </strong>
                  </p>

                  <p>
                    Provider mappings:{" "}
                    <strong>
                      {product.availableMappingCount}
                    </strong>{" "}
                    available
                  </p>

                  {product.mappings.length > 0 && (
                    <ul>
                      {product.mappings.map(
                        (mapping) => (
                          <li key={mapping.id}>
                            {mapping.catalog_providers
                              ?.name ?? "Provider"}{" "}
                            —{" "}
                            {
                              mapping.provider_product_id
                            }{" "}
                            —{" "}
                            {mapping.available
                              ? "available"
                              : "unavailable"}
                          </li>
                        ),
                      )}
                    </ul>
                  )}

                  <details>
                    <summary>
                      Fulfillment configuration
                    </summary>

                    <pre>
                      {JSON.stringify(
                        product.fulfillment_config,
                        null,
                        2,
                      )}
                    </pre>
                  </details>
                </div>

                <form
                  action={toggleProductAction}
                >
                  <input
                    type="hidden"
                    name="productId"
                    value={product.id}
                  />

                  <input
                    type="hidden"
                    name="isActive"
                    value={String(
                      product.is_active,
                    )}
                  />

                  <button type="submit">
                    {product.is_active
                      ? "Deactivate"
                      : "Activate"}
                  </button>
                </form>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}