import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteFooter } from "@/components/storefront/SiteFooter";
import { SiteHeader } from "@/components/storefront/SiteHeader";
import { getGameBySlug } from "@/lib/catalog/queries";

export default async function GamePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const game = await getGameBySlug(slug);

  if (!game) {
    notFound();
  }

  const products = game.products.filter(
    (product) => product.fulfillment_config !== null,
  );

  return (
    <main>
      <SiteHeader />

      <div className="storefront-shell">
        <Link href="/games" className="back-link">
          ← Games
        </Link>

        <section
          className="game-hero"
          style={
            game.image_url
              ? {
                  backgroundImage: `linear-gradient(
                    90deg,
                    rgba(8, 9, 11, 0.96) 0%,
                    rgba(8, 9, 11, 0.76) 45%,
                    rgba(8, 9, 11, 0.22) 100%
                  ), url("${game.image_url}")`,
                }
              : undefined
          }
        >
          <div>
            <p className="eyebrow">GAME</p>
            <h1>{game.name}</h1>

            {game.description && (
              <p className="lead">{game.description}</p>
            )}
          </div>
        </section>

        <section className="storefront-section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">TOP-UPS</p>
              <h2>Select your top-up.</h2>
            </div>
          </div>

          {products.length === 0 ? (
            <div className="empty-state">
              <p>No top-ups are currently available for this game.</p>
            </div>
          ) : (
            <div className="product-grid">
              {products.map((product) => (
                <article key={product.id} className="product-card">
                  <div className="product-card-copy">
                    <h3>{product.name}</h3>

                    {product.description && (
                      <p>{product.description}</p>
                    )}
                  </div>

                  <div className="product-card-footer">
                    <strong>
                      {product.currency} {product.price}
                    </strong>

                    <Link
                      href={`/checkout/${product.id}`}
                      className="product-action"
                    >
                      Select
                      <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <SiteFooter />
      </div>
    </main>
  );
}