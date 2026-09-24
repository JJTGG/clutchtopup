import { notFound } from "next/navigation";

import { SiteFooter } from "@/components/storefront/SiteFooter";
import { SiteHeader } from "@/components/storefront/SiteHeader";
import { getProductById } from "@/lib/catalog/queries";
import { parseFulfillmentConfig } from "@/lib/fulfillment/config";

import { CheckoutForm } from "./checkout-form";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ productId: string }>;
}) {
  const { productId } = await params;

  const product = await getProductById(productId);

  if (!product || !product.fulfillment_config) {
    notFound();
  }

  const config = parseFulfillmentConfig(
    product.fulfillment_config,
  );

  const game = Array.isArray(product.games)
    ? product.games[0]
    : product.games;

  return (
    <>
      <SiteHeader />

      <main className="storefront-shell checkout-page">
        <div className="checkout-heading">
          <a href={`/games/${game.slug}`} className="back-link">
            ← Back to {game.name}
          </a>

          <p className="eyebrow">CHECKOUT</p>

          <h1>Prepare your top-up.</h1>

          <p className="lead">
            Enter the player information required to deliver this
            purchase.
          </p>
        </div>

        <div className="checkout-layout">
          <section className="checkout-main">
            <div className="checkout-section">
              <div className="checkout-section-heading">
                <div>
                  <p className="eyebrow">01 / PRODUCT</p>
                  <h2>{product.name}</h2>
                </div>

                <span className="checkout-product-game">
                  {game.name}
                </span>
              </div>

              {product.description && (
                <p className="checkout-description">
                  {product.description}
                </p>
              )}
            </div>

            <CheckoutForm
              productId={product.id}
              config={config}
              price={Number(product.price)}
              currency={product.currency}
            />
          </section>

          <aside className="checkout-summary">
            <p className="eyebrow">ORDER SUMMARY</p>

            <div className="checkout-summary-product">
              <span>{game.name}</span>
              <strong>{product.name}</strong>
            </div>

            <div className="checkout-summary-row">
              <span>Price</span>
              <strong>
                {product.currency} {product.price}
              </strong>
            </div>

            <div className="checkout-summary-row">
              <span>Quantity</span>
              <strong>1</strong>
            </div>

            <div className="checkout-summary-total">
              <span>Total</span>
              <strong>
                {product.currency} {product.price}
              </strong>
            </div>

            <p className="checkout-summary-note">
              Your order will be created before payment. Payment
              instructions will appear on the order page.
            </p>
          </aside>
        </div>
      </main>

      <div className="storefront-shell">
        <SiteFooter />
      </div>
    </>
  );
}