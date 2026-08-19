# Personalise

A multi-instructor teaching platform. Any instructor — yoga, guitar, dance,
cooking, coding — publishes what they teach, sets a recurring schedule and
their own prices, and takes bookings and payments. Students find them, buy a
pass, book a seat, and join the class live inside the app.

`Personalise` is a placeholder name. Rebranding is one find-and-replace plus the
`--color-brand-*` ramp in `src/app/globals.css`.

---

## Running it

Requires **Node 20 or newer**.

```bash
npm install
npm run db:reset   # creates the SQLite database and seeds demo data
npm run dev        # http://localhost:3000
```

`db:reset` is destructive and safe to run whenever you want a clean demo.

### Demo logins

Password for every account: `password123`

| Email | Role |
| --- | --- |
| `student@personalise.app` | Student with an active pass, bookings and payment history |
| `ananya@personalise.app` | Instructor — yoga, Bengaluru |
| `admin@personalise.app` | Platform admin |

The seed is deliberately minimal — one instructor, one student — so the app
reads as a real account rather than a marketplace full of fixtures. Ananya
has 3 offerings with pricing plans, sessions spanning three weeks of history
and five weeks ahead, an active pass and booking history for Meera, one
paid and one pending payment, a couple of videos, updates and a review.

---

## What's built

**Public marketplace** — landing page, instructor directory with discipline/city
search, instructor profile pages (classes, schedule, videos, updates, reviews),
a class directory grouped by day, and a video library.

**Accounts** — email/password auth with three roles (student, instructor,
admin), a learn-or-teach signup fork, and instructor profile onboarding.

**Enrolment & payments** — pricing plans (drop-in, class packs, monthly
unlimited), a UPI-first checkout, invoice numbers, and a student payment
ledger.

**Booking engine** — capacity enforcement, automatic waitlisting, waitlist
promotion when a seat frees up, a 4-hour free-cancellation window with credit
return, and attendance tracking.

**Scheduling** — recurring rules ("Mon/Wed/Fri at 6:30am IST") that materialize
into concrete sessions over a rolling 60-day horizon, skipping the instructor's
blocked days. Every time is stored as a UTC instant and rendered in the viewer's
own timezone.

**Student dashboard** — upcoming classes, passes with remaining credits, booking
management, payment history, notifications.

**Instructor studio** — offerings and pricing CRUD, a recurring schedule
builder, class rosters with one-pass attendance marking, a fees ledger with
offline/cash payment recording, a media library, a daily-updates composer,
venue management, and a public-page editor with a publish toggle.

**Live class room** (`/live/[sessionId]`) — video grid, mic/camera/screen
share, chat, hand raise, host controls (mute one, mute everyone, remove,
record), and an end-class action. Works with zero credentials against the
mock provider (your real camera plus simulated peers built from the class's
actual roster) or a real LiveKit project by setting `LIVE_PROVIDER=livekit`.
Joining marks attendance automatically; ending the class finalizes it for
anyone who never showed, and a saved recording lands straight in the
instructor's media library. See `src/lib/live/` and `src/components/live/`.

**Admin** — platform metrics, instructor moderation and payout reporting.
Verifying adds the badge; suspending hides the instructor from search, their
public page, the class directory and the video library, and blocks new bookings
and payments — it deliberately leaves existing bookings and passes alone, since
those carry money and should be unwound one at a time. Suspension needs a
written reason, which the instructor is shown verbatim, and every decision is
recorded in an append-only moderation log with who made it and when. The payout
report shows what each instructor is owed from online payments after the
platform fee (`PLATFORM_FEE_PERCENT`, default 10%), counting cash they collected
themselves separately since it never passed through the platform.

### Not built yet

A student-facing review submission form (reviews currently only display, so
instructor ratings never move), password reset, image uploads for profiles and
classes, in-app messaging, refunds, and a mobile menu for the public navigation.

[PILOT.md](./PILOT.md) §6 lists these as a table with the impact of each, for
setting expectations with pilot users.

Actually *paying* instructors is out of scope: the payout screen is a report,
not a settlement system. Moving money automatically would mean Razorpay Route
with per-instructor KYC.

---

## How it's put together

```
src/
  app/
    (marketing)/   public site — landing, instructors, classes, videos
    (auth)/        login, signup, instructor onboarding
    (student)/     student dashboard
    (instructor)/  teaching studio
    (admin)/       platform admin — moderation and payouts
    checkout/      payment flow
    live/          the in-app live class room (/live/[sessionId])
    api/live/      token / moderate / recording / end route handlers
  components/
    live/          room UI + client-side mock and LiveKit engines
    (everything else) UI primitives and shared cards
  db/              Drizzle schema, client, seed
  lib/
    live/          live-video provider interface + mock + LiveKit
    payments/      payment provider interface + mock + Razorpay
    admin.ts       moderation, the audit log, and the payout report
    booking.ts     capacity, waitlist and cancellation rules
    scheduling.ts  recurrence → concrete sessions
    time.ts        timezone-correct formatting and conversion
```

Next.js App Router with React Server Components for reads and Server Actions
for writes. Drizzle ORM over SQLite (libSQL) — the same schema runs on Turso in
production without changes.

**Two conventions worth knowing:** money is always an integer count of paise,
never a float; and every timestamp in the database is a UTC instant, with local
wall-clock time existing only in a `ScheduleRule`'s timezone field and at render
time.

### Provider interfaces

Live video, payments and email each sit behind an interface with a `mock`
implementation, so the whole app runs end-to-end with no third-party accounts.
Going live is an `.env` change, not a refactor:

| Env var | Dev | Live |
| --- | --- | --- |
| `LIVE_PROVIDER` | `mock` | `livekit` + `LIVEKIT_*` keys |
| `PAYMENT_PROVIDER` | `mock` | `razorpay` + `RAZORPAY_*` keys |
| `NOTIFY_PROVIDER` | `console` | `resend` + `RESEND_API_KEY` |

The mock payment provider signs its handoff with the same HMAC-SHA256 scheme
Razorpay uses, so the verification code path you exercise locally is the same
one that runs in production — only the secret differs.

---

## Verifying it

```bash
npm run typecheck
npm run lint
npm run build
npm run start            # in one terminal
node scripts/smoke.mjs   # in another
```

`scripts/smoke.mjs` drives a real browser through the full student journey —
browse, filter, enrol, pay by UPI, book, view the dashboard, cancel — and the
full instructor journey — create a class, price it, build a schedule, mark
attendance, post an update — plus the admin login. 34 checks, screenshots land
in `screenshots/`.

`scripts/live-smoke.mjs` exercises the live class room specifically (host and
student joining, chat, hand raise, host mute, recording, ending the class). It
needs a class whose join window is open, so pair it with `make-live`:

```bash
npm run make-live                                   # prints the session id + URL
LIVE_SESSION_ID=<id printed above> node scripts/live-smoke.mjs
```

`scripts/admin-smoke.mjs` (23 checks) covers moderation and payouts. The
assertions that matter aren't that the buttons render — they're that suspending
actually removes the instructor from the directory, 404s their public page,
empties the class listing and tells them why, and that reinstating puts all of
it back:

```bash
node scripts/admin-smoke.mjs
```

It suspends and reinstates the demo instructor, so run `npm run db:reset`
afterwards if you want a pristine moderation log.

Four more suites cover the things that only break under real use:

```bash
node scripts/reminder-smoke.mjs      # 15 checks — class reminders, both roles
node scripts/pilot-smoke.mjs         # 13 checks — offline money, no online checkout
node scripts/concurrency-smoke.mjs   #  5 checks — capacity and credits under load
node scripts/security-smoke.mjs      #  3 checks — attacks that used to work
```

`concurrency-smoke.mjs` is the one worth understanding: it sets a class to a
single seat and has five students press Book in the same instant. Before the
booking writes were made atomic, all five were confirmed. Sequential tests
cannot catch that.

`security-smoke.mjs` replays real attacks — cancelling a stranger's booking by
posting their booking id, an external `next=` redirect after login, and
password brute-forcing. They're kept as tests because "we fixed that" decays.

---

## Trying the live class room by hand

The room only opens 15 minutes before a class starts, so none of the seeded
classes (6:30am, 7pm…) is joinable at an arbitrary moment. To get one now:

```bash
npm run make-live
```

That picks an online class the demo student is booked into, moves it to
"started five minutes ago, running for another 55", and prints the URL. It
changes nothing else in your data, and you can re-run it whenever you want a
fresh live class.

Open the printed URL as `ananya@personalise.app` (you're the host), and in an
**incognito window** as `student@personalise.app` (you're a student). You can
also get there through the UI: Studio → Schedule → the class → "Start the
class", or Dashboard → Bookings → "Join live".

With the default `mock` provider there's no media server, so the two windows
don't see each other's video — each gets your real camera plus a simulated
peer built from the class's actual roster. Every control is real; only the
transport is faked. Set `LIVE_PROVIDER=livekit` with LiveKit credentials for
genuine multi-party video.

---

## Going to production

**Start with [PILOT.md](./PILOT.md)** — a step-by-step runbook for deploying to
Turso + Vercel and running a real pilot with money handled offline.

The app now **refuses to start** in production if it is misconfigured in a way
that would be unsafe or silently broken — a missing `AUTH_SECRET`, a file-backed
database, no `CRON_SECRET`, or the mock payment provider left on with online
payments enabled. The specific problem is printed in the deploy log.

1. **Database** — point `DATABASE_URL` at Turso (`libsql://…`) with
   `DATABASE_AUTH_TOKEN`, then `npm run db:migrate`. **Not `db:push`** — push
   resolves schema differences by dropping and recreating tables, which is fine
   on a dev database and destroys a production one. After changing the schema,
   run `npm run db:generate` and commit the file it writes to `drizzle/`.
   For Postgres instead, change the driver in `src/db/index.ts` and the dialect
   in `drizzle.config.ts`; the schema is written to port cleanly.
2. **`AUTH_SECRET`** — generate with `openssl rand -base64 32`. Sessions are
   JWTs signed with it, so it is the whole authentication system.
3. **`CRON_SECRET`** — generate the same way. Without it the cron endpoints
   disable themselves rather than sit open to the internet. On Vercel, setting
   the env var makes Vercel Cron send it automatically.
4. **Email** — set `NOTIFY_PROVIDER=resend` with `RESEND_API_KEY` and a
   `FROM_EMAIL` on a domain verified in Resend. Failures are logged as
   `[notify]` rather than swallowed.
5. **Payments** — keep `ONLINE_PAYMENTS=off` until Razorpay is live (see
   PILOT.md §8 for the prerequisites, including the legal pages Razorpay
   requires). Then add the keys, register the webhook at
   `https://your-domain/api/payments/razorpay/webhook` with
   `RAZORPAY_WEBHOOK_SECRET`, and set `PAYMENT_PROVIDER=razorpay`. The webhook
   is the authority on payment status; the browser callback is only a fast path.
6. **LiveKit** — create a project, set `LIVEKIT_URL`/`LIVEKIT_API_KEY`/
   `LIVEKIT_API_SECRET`, and set `LIVE_PROVIDER=livekit`.
7. **Cron** — `vercel.json` already schedules both jobs. Elsewhere, hit
   `GET /api/cron/generate-sessions` daily and `GET /api/cron/send-reminders`
   every ~10 minutes, with `Authorization: Bearer $CRON_SECRET`.
8. **Monitoring** — point an uptime check at `GET /api/health`, which verifies
   the database is actually reachable rather than just that the process is up.

Copy `.env.example` to `.env` and fill in what you need.

To run a production build locally for testing, set `ALLOW_INSECURE_CONFIG=1` to
skip the production safety checks. Never set it on a deployed environment.
