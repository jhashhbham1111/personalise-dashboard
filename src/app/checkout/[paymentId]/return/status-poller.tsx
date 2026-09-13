"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { getPaymentStatusAction } from "./actions";
import { Alert } from "@/components/ui/page";

const POLL_MS = 2500;
const MAX_POLLS = 24; // ~60 seconds

/**
 * Waits for the webhook to settle a Dodo payment.
 *
 * The redirect back from Dodo's checkout carries no proof of anything — it's
 * just where the browser ends up. This polls our own database, which only the
 * webhook ever writes PAID/FAILED into, so there's nothing here for a student
 * to spoof by hitting this URL directly with someone else's payment id (the
 * action re-checks ownership on every call regardless).
 */
export function StatusPoller({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [outcome, setOutcome] = useState<"waiting" | "failed" | "timeout">(
    "waiting",
  );
  const pollsRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    async function poll() {
      const result = await getPaymentStatusAction(paymentId);
      if (cancelled) return;

      if (result.status === "PAID") {
        router.replace("/dashboard?paid=1");
        return;
      }
      if (result.status === "FAILED") {
        setOutcome("failed");
        return;
      }

      pollsRef.current += 1;
      if (pollsRef.current >= MAX_POLLS) {
        setOutcome("timeout");
        return;
      }
      timer = setTimeout(poll, POLL_MS);
    }

    timer = setTimeout(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [paymentId, router]);

  if (outcome === "failed") {
    return (
      <Alert tone="danger">
        That payment didn&rsquo;t go through. No pass was granted — you can go
        back and try again.
      </Alert>
    );
  }

  if (outcome === "timeout") {
    return (
      <Alert tone="warning">
        This is taking longer than usual. If money left your account, we
        &rsquo;ll confirm it and email you within a few minutes — no need to
        pay again.
      </Alert>
    );
  }

  return (
    <div className="flex items-center justify-center gap-2 py-6 text-sm text-ink-soft">
      <Loader2 className="h-4 w-4 animate-spin text-brand-500" />
      Confirming your payment&hellip;
    </div>
  );
}
