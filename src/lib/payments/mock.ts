import { createHmac, randomUUID } from "crypto";

import type {
  CreateOrderInput,
  CreatedOrder,
  PaymentProvider,
} from "./provider";

const MOCK_SECRET = "mock_payment_secret";

function sign(orderId: string, paymentId: string): string {
  return createHmac("sha256", MOCK_SECRET)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");
}

/**
 * Development payment provider.
 *
 * Produces order and payment ids in the same shape as Razorpay's and signs them
 * with the same HMAC-SHA256 scheme, so the verification code path exercised in
 * dev is the identical code path used in production — only the secret differs.
 *
 * The fake checkout page at /checkout/mock/[paymentId] drives it.
 */
export const mockPaymentProvider: PaymentProvider = {
  name: "mock",

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    return {
      provider: "mock",
      orderId: `order_mock_${randomUUID().replace(/-/g, "").slice(0, 14)}`,
      amountPaise: input.amountPaise,
      currency: input.currency,
      checkoutKey: null,
    };
  },

  async verifyCheckoutSignature({ orderId, paymentId, signature }) {
    return sign(orderId, paymentId) === signature;
  },

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    return (
      createHmac("sha256", MOCK_SECRET).update(rawBody).digest("hex") === signature
    );
  },

  async refund(paymentId: string, amountPaise: number) {
    void paymentId;
    void amountPaise;
    return { refundId: `rfnd_mock_${randomUUID().replace(/-/g, "").slice(0, 14)}` };
  },
};

/** Used by the mock checkout page to produce a signature the verifier accepts. */
export function mockSignPayment(orderId: string, paymentId: string): string {
  return sign(orderId, paymentId);
}

export function mockPaymentId(): string {
  return `pay_mock_${randomUUID().replace(/-/g, "").slice(0, 14)}`;
}
