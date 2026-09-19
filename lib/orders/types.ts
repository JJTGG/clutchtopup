export type CreateOrderInput = {
  productId: string;
  quantity: number;
  fulfillmentData: Record<string, unknown>;
  idempotencyKey: string;
};

export type CreateOrderResult = {
  orderId: string;
  orderNumber: string;
  status: "pending";
  total: number;
  currency: string;
};