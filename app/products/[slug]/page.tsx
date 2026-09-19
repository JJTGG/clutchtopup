import { notFound } from "next/navigation";
import { getGameBySlug } from "@/lib/catalog/queries";

export default async function GameProductsPage({
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
    <main className="shell">
      <section className="hero">
        <p className="eyebrow">{game.name.toUpperCase()}</p>
        <h1>Choose a top-up.</h1>

        {products.length === 0 ? (
          <p className="lead">No products are currently available.</p>
        ) : (
          <div className="catalog-grid">
            {products.map((product) => (
              <article key={product.id} className="catalog-card">
                <h2>{product.name}</h2>

                {product.description && <p>{product.description}</p>}

                <strong>
                  {product.currency} {product.price}
                </strong>
              </article>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}