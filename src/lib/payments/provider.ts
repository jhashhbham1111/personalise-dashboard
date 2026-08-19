/**
 * Payment provider abstraction.
 *
 * The app never imports Razorpay directly — it goes through this interface, so
 * the entire booking and fee flow is exercisable locally with zero credentials.
 * Switch with PAYMENT_PROVIDER=razorpay in .env.
 */

export type CreateOrderInput = {
  /** Integer paise. Never a float. */
  amountPaise: number;
  currency: string;
  /** Our own Payment.id — echoed back by the webhook so we can reconcile. */
  referenceId: string;
  description: string;
  customer: { name: string; email: string; phone?: string | null };
};

export type CreatedOrder = {
  provider: "mock" | "razorpay";
  orderId: string;
  amountPaise: number;
  currency: string;
  /** Public key the browser checkout needs. Null for the mock provider. */
  checkoutKey: string | null;
};

export type VerifiedPayment = {
  orderId: string;
  paymentId: string;
  /** UPI | CARD | NETBANKING | WALLET */
  method: string;
  amountPaise: number;
};

export interface PaymentProvider {
  readonly name: "mock" | "razorpay";
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  /** Verifies the browser handoff signature (Razorpay Checkout success callback). */
  verifyCheckoutSignature(args: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): Promise<boolean>;
  /** Verifies a raw webhook body against the shared webhook secret. */
  verifyWebhookSignature(rawBody: string, signature: string): boolean;
  refund(paymentId: string, amountPaise: number): Promise<{ refundId: string }>;
}
