import { env } from "../env";
import { mockPaymentProvider } from "./mock";
import type { PaymentProvider } from "./provider";
import { razorpayProvider } from "./razorpay";

export function getPaymentProvider(): PaymentProvider {
  return env.paymentProvider === "razorpay" ? razorpayProvider : mockPaymentProvider;
}

export * from "./provider";

/**
 * Invoice numbers are human-facing and must be stable and unique.
 * Format: INV-YYMM-XXXXXX
 */
export function generateInvoiceNo(): string {
  const now = new Date();
  const yy = String(now.getUTCFullYear()).slice(2);
  const mm = String(now.getUTCMonth() + 1).padStart(2, "0");
  const rand = Math.random().toString(36).toUpperCase().slice(2, 8);
  return `INV-${yy}${mm}-${rand}`;
}
