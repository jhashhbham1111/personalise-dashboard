import type { Metadata } from "next";
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Database,
  IndianRupee,
  Mail,
  Smartphone,
  Video,
} from "lucide-react";

import { env } from "@/lib/env";
import { capabilities } from "@/lib/capabilities";
import { LEGAL } from "@/lib/legal";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PageHeader, SectionTitle } from "@/components/ui/page";

export const metadata: Metadata = { title: "Diagnostics · Admin" };

// Reads live configuration, so it must never be cached or prerendered.
export const dynamic = "force-dynamic";

/**
 * What this deployment is actually configured to do.
 *
 * This page exists because of a specific failure mode: every provider in this
 * app falls back to a mock, and the mocks succeed. `NOTIFY_PROVIDER` unset
 * means booking confirmations are written to a log nobody reads, and the app
 * looks perfectly healthy while no student receives anything. /api/health
 * can't answer that — it's public, so it deliberately says nothing about
 * configuration. This page can, because it's behind requireAdmin.
 *
 * It reports booleans, never values. "RESEND_API_KEY is set" is the useful
 * fact; the key itself would be a secret rendered into HTML.
 */

type Status = "live" | "mock" | "problem";

function StatusPill({ status, label }: { status: Status; label: string }) {
  const tone = status === "live" ? "success" : status === "problem" ? "danger" : "warning";
  const Icon =
    status === "live" ? CheckCircle2 : status === "problem" ? AlertTriangle : CircleSlash;
  return (
    <Badge tone={tone}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Badge>
  );
}

function Row({ label, ok, note }: { label: string; ok: boolean; note?: string }) {
  return (
    <li className="flex items-start justify-between gap-4 border-b border-line py-2 last:border-0">
      <div className="min-w-0">
        <span className="font-mono text-xs text-ink">{label}</span>
        {note ? <p className="mt-0.5 text-xs text-ink-soft">{note}</p> : null}
      </div>
      <span
        className={ok ? "shrink-0 text-xs text-brand-700" : "shrink-0 text-xs text-danger-600"}
      >
        {ok ? "set" : "not set"}
      </span>
    </li>
  );
}

function Panel({
  icon: Icon,
  title,
  status,
  statusLabel,
  summary,
  children,
}: {
  icon: React.ElementType;
  title: string;
  status: Status;
  statusLabel: string;
  summary: string;
  children?: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4.5 w-4.5 text-ink-faint" />
          <h3 className="font-medium text-ink">{title}</h3>
        </div>
        <StatusPill status={status} label={statusLabel} />
      </div>
      <p className="mt-2 text-sm leading-relaxed text-ink-soft">{summary}</p>
      {children ? <ul className="mt-3">{children}</ul> : null}
    </Card>
  );
}

async function databaseStatus() {
  const started = Date.now();
  try {
    await db.run(sql`select 1`);
    return { ok: true, latencyMs: Date.now() - started };
  } catch {
    return { ok: false, latencyMs: Date.now() - started };
  }
}

export default async function DiagnosticsPage() {
  const database = await databaseStatus();

  // A file: URL on a serverless host means every deploy starts from an empty
  // database — the one configuration mistake that silently loses everything.
  const ephemeralDb =
    env.nodeEnv === "production" && env.databaseUrl.startsWith("file:");

  const legalUnfilled = Object.entries(LEGAL)
    .filter(([, v]) => typeof v === "string" && v.startsWith("TODO:"))
    .map(([k]) => k);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Diagnostics"
        description="What this deployment is configured to do, as opposed to what the code supports. Only whether a value is set is shown — never the value itself."
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel
          icon={Mail}
          title="Email"
          status={capabilities.email ? "live" : "problem"}
          statusLabel={capabilities.email ? "Sending" : "Not sending"}
          summary={
            capabilities.email
              ? `Booking confirmations, reminders and password resets are sent through Resend from ${env.fromEmail}. Delivery failures are logged with a [notify] prefix in the runtime logs.`
              : "NOTIFY_PROVIDER is 'console', so every email is written to the server log and nobody receives anything — including password resets. Set NOTIFY_PROVIDER=resend and RESEND_API_KEY to turn this on."
          }
        >
          <Row label="NOTIFY_PROVIDER=resend" ok={env.notifyProvider === "resend"} />
          <Row label="RESEND_API_KEY" ok={!!env.resendApiKey} />
          <Row
            label="FROM_EMAIL"
            ok={!env.fromEmail.endsWith("@personalise.local")}
            note={
              env.fromEmail.endsWith("@personalise.local")
                ? "Still the placeholder domain. Resend rejects sends from a domain it hasn't verified."
                : env.fromEmail
            }
          />
        </Panel>

        <Panel
          icon={IndianRupee}
          title="Payments"
          status={
            capabilities.onlinePayments
              ? "live"
              : env.onlinePayments
                ? "problem"
                : "mock"
          }
          statusLabel={
            capabilities.onlinePayments
              ? "Online"
              : env.onlinePayments
                ? "Misconfigured"
                : "Offline only"
          }
          summary={
            capabilities.onlinePayments
              ? "Students pay by UPI, card or netbanking inside the app. Confirmation comes from the webhook, not the browser."
              : env.onlinePayments
                ? "ONLINE_PAYMENTS is on but PAYMENT_PROVIDER is still 'mock' — the mock signs its own confirmations, so this hands out free passes. Production refuses to boot in this state."
                : "Money changes hands offline: the student pays their instructor by cash, UPI or bank transfer and the instructor records it in Studio → Earnings, which activates the pass. This is the intended pilot mode."
          }
        >
          <Row label="ONLINE_PAYMENTS=on" ok={env.onlinePayments} />
          <Row label="PAYMENT_PROVIDER=razorpay" ok={env.paymentProvider === "razorpay"} />
          <Row label="RAZORPAY_KEY_ID" ok={!!env.razorpay.keyId} />
          <Row label="RAZORPAY_KEY_SECRET" ok={!!env.razorpay.keySecret} />
          <Row
            label="RAZORPAY_WEBHOOK_SECRET"
            ok={!!env.razorpay.webhookSecret}
            note="Without it the webhook can't verify signatures and payments never confirm."
          />
        </Panel>

        <Panel
          icon={Video}
          title="Live classes"
          status={capabilities.liveVideo ? "live" : "mock"}
          statusLabel={capabilities.liveVideo ? env.liveProvider : "Mock room"}
          summary={
            capabilities.liveVideo
              ? `Rooms are hosted by ${env.liveProvider}. Tokens are minted per session and scoped to the people booked into it.`
              : "LIVE_PROVIDER is 'mock': the room shell renders and shows your own camera, but there is no media server, so two people in the same room cannot see each other. The homepage copy adjusts itself to avoid promising otherwise."
          }
        >
          <Row label="LIVEKIT_URL" ok={!!env.livekit.url} />
          <Row label="LIVEKIT_API_KEY" ok={!!env.livekit.apiKey} />
          <Row label="LIVEKIT_API_SECRET" ok={!!env.livekit.apiSecret} />
        </Panel>

        <Panel
          icon={Database}
          title="Database & jobs"
          status={database.ok && !ephemeralDb && !!env.cronSecret ? "live" : "problem"}
          statusLabel={
            !database.ok
              ? "Unreachable"
              : ephemeralDb
                ? "Ephemeral"
                : env.cronSecret
                  ? "Healthy"
                  : "Cron disabled"
          }
          summary={
            !database.ok
              ? "The database did not answer a select. Check DATABASE_URL and DATABASE_AUTH_TOKEN."
              : ephemeralDb
                ? "DATABASE_URL is a file: URL in production. Every deploy starts from an empty database. Point it at Turso."
                : `Reachable in ${database.latencyMs}ms.${env.cronSecret ? "" : " CRON_SECRET is unset, so /api/cron/* returns 503 and future sessions stop generating."}`
          }
        >
          <Row label="DATABASE_AUTH_TOKEN" ok={!!env.databaseAuthToken} />
          <Row
            label="CRON_SECRET"
            ok={!!env.cronSecret}
            note="Generates the next horizon of class sessions and sends reminders."
          />
          <Row
            label="APP_URL"
            ok={!env.appUrl.includes("localhost")}
            note={env.appUrl}
          />
        </Panel>

        <Panel
          icon={Smartphone}
          title="Android app"
          status={env.android.sha256Fingerprints.length > 0 ? "live" : "mock"}
          statusLabel={
            env.android.sha256Fingerprints.length > 0 ? "Verified" : "Not published"
          }
          summary={
            env.android.sha256Fingerprints.length > 0
              ? `/.well-known/assetlinks.json names ${env.android.packageName} with ${env.android.sha256Fingerprints.length} certificate fingerprint${env.android.sha256Fingerprints.length > 1 ? "s" : ""}. The Play build opens without browser chrome.`
              : "No Android package configured, so /.well-known/assetlinks.json 404s. Set ANDROID_PACKAGE_NAME and ANDROID_SHA256_FINGERPRINTS once Bubblewrap has generated the signing key, or the Play build shows a URL bar."
          }
        >
          <Row label="ANDROID_PACKAGE_NAME" ok={!!env.android.packageName} />
          <Row
            label="ANDROID_SHA256_FINGERPRINTS"
            ok={env.android.sha256Fingerprints.length > 0}
            note="Comma-separated. Include both the upload key and the Play App Signing key."
          />
        </Panel>

        <Panel
          icon={AlertTriangle}
          title="Legal identity"
          status={legalUnfilled.length === 0 ? "live" : "problem"}
          statusLabel={
            legalUnfilled.length === 0 ? "Complete" : `${legalUnfilled.length} missing`
          }
          summary={
            legalUnfilled.length === 0
              ? "The privacy policy, terms, refund policy and contact page all name a real operator."
              : `src/lib/legal.ts still has placeholders for: ${legalUnfilled.join(", ")}. Google Play rejects a privacy policy that names nobody, and Razorpay checks the same four pages before activating a live account.`
          }
        />
      </div>

      <div>
        <SectionTitle>Reading this page</SectionTitle>
        <Card className="p-5 text-sm leading-relaxed text-ink-soft">
          <p>
            Every integration in this app has a mock that succeeds, which is what
            makes the app runnable with an empty <code>.env</code> — and also what
            makes a misconfigured production deployment look healthy.{" "}
            <code>/api/health</code> stays deliberately silent about configuration
            because it is public; this page is the place that isn&rsquo;t.
          </p>
          <p className="mt-3">
            Environment variables are set in Vercel under Settings → Environment
            Variables, and take effect on the next deployment — changing one does
            not update the running deployment.
          </p>
        </Card>
      </div>
    </div>
  );
}
