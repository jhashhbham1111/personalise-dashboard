/**
 * Payment provider abstraction.
 *
 * The app never imports Razorpay or Dodo directly — it goes through this
 * interface, so the entire booking and fee flow is exercisable locally with
 * zero credentials. Switch with PAYMENT_PROVIDER=razorpay|dodo in .env.
 *
 * The two live providers arrive at "the order is paid" by different routes.
 * Razorpay opens a JS-SDK modal in the current page and hands the browser a
 * signed success callback, which `verifyCheckoutSignature` checks. Dodo has no
 * such callback — the browser is redirected away to a hosted checkout page and
 * back, so there is nothing for the browser to sign. For a redirect-style
 * provider, `createOrder` returns `checkoutUrl` instead of `checkoutKey`, and
 * `verifyCheckoutSignature` always returns false: the return leg is decorative
 * only, and `fulfilPayment` is reached exclusively through the webhook, which
 * is exactly the "webhook is authoritative" rule this file already followed
 * for Razorpay — Dodo just has no fast path to be a fast path for.
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
  provider: "mock" | "razorpay" | "dodo";
  orderId: string;
  amountPaise: number;
  currency: string;
  /** Public key the browser checkout needs. Null unless the provider opens an in-page SDK modal. */
  checkoutKey: string | null;
  /** A hosted checkout page to redirect the browser to. Null unless the provider is redirect-based. */
  checkoutUrl: string | null;
};

export type VerifiedPayment = {
  orderId: string;
  paymentId: string;
  /** UPI | CARD | NETBANKING | WALLET */
  method: string;
  amountPaise: number;
};

/** Raw webhook headers, lower-cased keys. Not every provider needs every key. */
export type WebhookHeaders = Record<string, string | null>;

export interface PaymentProvider {
  readonly name: "mock" | "razorpay" | "dodo";
  createOrder(input: CreateOrderInput): Promise<CreatedOrder>;
  /** Verifies the browser handoff signature (Razorpay Checkout success callback). Always false for redirect-based providers. */
  verifyCheckoutSignature(args: {
    orderId: string;
    paymentId: string;
    signature: string;
  }): Promise<boolean>;
  /** Verifies a raw webhook body against the shared webhook secret. */
  verifyWebhookSignature(rawBody: string, headers: WebhookHeaders): boolean;
  refund(paymentId: string, amountPaise: number): Promise<{ refundId: string }>;
}
