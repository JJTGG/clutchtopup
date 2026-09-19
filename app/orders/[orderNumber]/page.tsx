import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function OrderPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    notFound();
  }

  const { data: order, error } = await supabase
    .from("orders")
    .select(`
      id,
      order_number,
      status,
      currency,
      subtotal,
      discount,
      total,
      created_at,
      order_items (
        id,
        product_name,
        unit_price,
        quantity,
        subtotal
      )
    `)
    .eq("order_number", orderNumber)
    .eq("user_id", user.id)
    .single();

  if (error || !order) {
    notFound();
  }

  return (
    <main>
      <h1>Order Created</h1>

      <p>
        Order: <strong>{order.order_number}</strong>
      </p>

      <p>
        Status: <strong>{order.status}</strong>
      </p>

      <section>
        {order.order_items.map((item) => (
          <div key={item.id}>
            <h2>{item.product_name}</h2>
            <p>
              Quantity: {item.quantity}
            </p>
            <p>
              {order.currency} {item.subtotal}
            </p>
          </div>
        ))}
      </section>

      <p>
        Total:{" "}
        <strong>
          {order.currency} {order.total}
        </strong>
      </p>

      <p>
        Your order has been created and is awaiting
        payment.
      </p>
    </main>
  );
}