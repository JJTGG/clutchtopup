import { notFound } from "next/navigation";
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

  return (
    <main>
      <h1>Checkout</h1>

      <section>
        <h2>{product.name}</h2>

        {product.description && (
          <p>{product.description}</p>
        )}

        <p>
          {product.currency} {product.price}
        </p>
      </section>

      <CheckoutForm
        productId={product.id}
        config={config}
      />
    </main>
  );
}