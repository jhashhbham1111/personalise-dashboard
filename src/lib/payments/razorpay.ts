import { createHmac, timingSafeEqual } from "crypto";

import { env } from "../env";
import type {
  CreateOrderInput,
  CreatedOrder,
  PaymentProvider,
} from "./provider";

/**
 * Razorpay, UPI-first.
 *
 * The order is created server-side; the browser opens Razorpay Checkout with
 * UPI surfaced as the default method (see RazorpayCheckout on the client).
 * Confirmation is authoritative only from the webhook — the browser callback is
 * treated as a fast-path hint that still gets signature-verified.
 */

const API_BASE = "https://api.razorpay.com/v1";

function authHeader(): string {
  const token = Buffer.from(
    `${env.razorpay.keyId}:${env.razorpay.keySecret}`,
  ).toString("base64");
  return `Basic ${token}`;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

async function razorpayFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message =
      (body as { error?: { description?: string } })?.error?.description ??
      `Razorpay request failed (${res.status})`;
    throw new Error(message);
  }
  return body;
}

export const razorpayProvider: PaymentProvider = {
  name: "razorpay",

  async createOrder(input: CreateOrderInput): Promise<CreatedOrder> {
    const body = (await razorpayFetch("/orders", {
      method: "POST",
      body: JSON.stringify({
        amount: input.amountPaise,
        currency: input.currency,
        // Razorpay caps receipts at 40 chars.
        receipt: input.referenceId.slice(0, 40),
        notes: {
          referenceId: input.referenceId,
          description: input.description.slice(0, 200),
        },
      }),
    })) as { id: string; amount: number; currency: string };

    return {
      provider: "razorpay",
      orderId: body.id,
      amountPaise: body.amount,
      currency: body.currency,
      checkoutKey: env.razorpay.keyId ?? null,
    };
  },

  async verifyCheckoutSignature({ orderId, paymentId, signature }) {
    const expected = createHmac("sha256", env.razorpay.keySecret ?? "")
      .update(`${orderId}|${paymentId}`)
      .digest("hex");
    return safeEqual(expected, signature);
  },

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const secret = env.razorpay.webhookSecret;
    if (!secret) return false;
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    return safeEqual(expected, signature);
  },

  async refund(paymentId: string, amountPaise: number) {
    const body = (await razorpayFetch(`/payments/${paymentId}/refund`, {
      method: "POST",
      body: JSON.stringify({ amount: amountPaise, speed: "normal" }),
    })) as { id: string };
    return { refundId: body.id };
  },
};
