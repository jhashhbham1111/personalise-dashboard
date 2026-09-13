import { createHmac, timingSafeEqual } from "crypto";

import { env } from "../env";
import type {
  CreateOrderInput,
  CreatedOrder,
  PaymentProvider,
  WebhookHeaders,
} from "./provider";

/**
 * Dodo Payments — redirect checkout, webhook-only fulfilment.
 *
 * Dodo is a merchant of record: Dodo is the legal seller of record and owns
 * GST/VAT collection, not Personalise. There is no in-page SDK modal the way
 * Razorpay has one — `createOrder` asks Dodo for a hosted checkout session and
 * gets back a URL; the browser is redirected there and back. Nothing about
 * that return trip is signed, so unlike Razorpay there is no browser callback
 * worth verifying — `verifyCheckoutSignature` always returns false, and the
 * checkout return page only ever polls our own database for the status the
 * webhook below eventually sets. See provider.ts for why that split exists.
 *
 * `productId` (DODO_PRODUCT_ID) is one placeholder product created once in the
 * Dodo dashboard with "Pay what you want" turned on. Every checkout overrides
 * its price with `product_cart[0].amount` — that override is silently ignored
 * on a product where PWYW is off, so this is a one-time dashboard step, not
 * something this file can get right on its own.
 */

const API_BASE =
  env.dodo.environment === "live_mode"
    ? "https://live.dodopayments.com"
    : "https://test.dodopayments.com";

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

async function dodoFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.dodo.apiKey}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (body as { message?: string })?.message ??
      `Dodo Payments request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

export const dodoProvider: PaymentProvider = {
  name: "dodo",

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const body = (await dodoFetch("/checkout-sessions", {
      method: "POST",
      body: JSON.stringify({
        product_cart: [
          {
            product_id: env.dodo.productId,
            quantity: 1,
            // Overrides the product's own price. Only takes effect if the
            // product has "Pay what you want" enabled — see the file header.
            amount: input.amountPaise,
          },
        ],
        customer: {
          email: input.customer.email,
          name: input.customer.name,
        },
        return_url: `${env.appUrl}/checkout/${input.referenceId}/return`,
        // Our own Payment.id, echoed back on every webhook event for this
        // session — this is how the webhook finds the row to fulfil, rather
        // than relying on Dodo echoing back whatever id we handed it.
        metadata: { referenceId: input.referenceId },
      }),
    })) as { session_id: string; checkout_url?: string | null };

    return {
      provider: "dodo",
      orderId: body.session_id,
      amountPaise: input.amountPaise,
      currency: input.currency,
      checkoutKey: null,
      checkoutUrl: body.checkout_url ?? null,
    };
  },

  async verifyCheckoutSignature() {
    // Dodo's checkout is a redirect, not an in-page callback — there is no
    // browser-signed handoff to check. The webhook is the only path that can
    // ever mark a Dodo payment PAID; see the file header.
    return false;
  },

  /**
   * Standard Webhooks (the same scheme Svix uses), which is what Dodo signs
   * with. The secret arrives as `whsec_<base64>`; the signed content is
   * `${webhook-id}.${webhook-timestamp}.${rawBody}`, HMAC-SHA256'd with the
   * base64-decoded key and base64-encoded again. The header can carry more
   * than one space-separated `v1,<sig>` candidate (a secret rotation sends
   * both old and new momentarily) — any match is accepted.
   */
  verifyWebhookSignature(rawBody: string, headers: WebhookHeaders): boolean {
    const secret = env.dodo.webhookKey;
    if (!secret) return false;

    const id = headers["webhook-id"];
    const timestamp = headers["webhook-timestamp"];
    const signatureHeader = headers["webhook-signature"];
    if (!id || !timestamp || !signatureHeader) return false;

    const ts = Number(timestamp);
    if (!Number.isFinite(ts)) return false;
    const skewSeconds = Math.abs(Math.floor(Date.now() / 1000) - ts);
    if (skewSeconds > 300) return false; // 5-minute tolerance, replay window

    const keyBytes = Buffer.from(
      secret.startsWith("whsec_") ? secret.slice("whsec_".length) : secret,
      "base64",
    );
    const expected = createHmac("sha256", keyBytes)
      .update(`${id}.${timestamp}.${rawBody}`)
      .digest("base64");

    return signatureHeader
      .split(" ")
      .map((candidate) => candidate.split(",")[1])
      .filter((sig): sig is string => !!sig)
      .some((sig) => safeEqual(expected, sig));
  },

  async refund(paymentId: string, amountPaise: number) {
    const body = (await dodoFetch("/refunds", {
      method: "POST",
      body: JSON.stringify({ payment_id: paymentId, amount: amountPaise }),
    })) as { refund_id: string };
    return { refundId: body.refund_id };
  },
};
