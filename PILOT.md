# Running the pilot

A step-by-step guide to putting Personalise in front of real instructors and
students, with money handled offline.

Money staying offline is what makes this possible now: no payment gateway
account, no GST modelling, no refund engine, no KYC. Students pay their
instructor the way they already do — cash, GPay, UPI, bank transfer — and the
instructor activates their pass in the app.

---

## 1. How the pilot works day to day

```
Student signs up  →  pays the instructor directly (outside the app)
                  →  instructor records it in Studio → Earnings
                  →  pass activates, student books classes
                  →  reminders go out an hour before each class
```

Nobody can pay inside the app while `ONLINE_PAYMENTS=off`. Students still see
every price on the enrol page, along with instructions to pay the instructor
directly — so pricing stays transparent, there's just no checkout button.

**Run it alongside the existing WhatsApp group for the first few weeks.** If
something breaks, the class still happens. Turn the group off only once
instructors trust the app more than they trust the group.

---

## 2. Deploying

### 2.1 Database — Turso

```bash
brew install tursodatabase/tap/turso     # or: curl -sSfL https://get.tur.so/install.sh | bash
turso auth signup
turso db create personalise
turso db show personalise --url          # → libsql://personalise-<org>.turso.io
turso db tokens create personalise       # → the auth token
```

Turso's free tier is comfortably enough for a pilot. **Turn on point-in-time
recovery** — it's the only backup story you have:

```bash
turso db show personalise                # confirm PITR retention
```

### 2.2 Apply the schema

Migrations are versioned files in `drizzle/`, applied with:

```bash
DATABASE_URL="libsql://…" DATABASE_AUTH_TOKEN="…" npm run db:migrate
```

Do **not** use `db:push` against production. Push diffs the live database
against the schema and resolves differences by dropping and recreating tables —
fine on a throwaway dev database, catastrophic on one holding real bookings.

After any future schema change: `npm run db:generate`, commit the new file in
`drizzle/`, then `npm run db:migrate` on deploy.

### 2.3 Hosting — Vercel

```bash
npm i -g vercel
vercel link
vercel --prod
```

`vercel.json` already schedules both cron jobs (see §2.5).

### 2.4 Environment variables

Set these in Vercel → Project → Settings → Environment Variables:

| Variable | Value | Why |
|---|---|---|
| `DATABASE_URL` | `libsql://…` from Turso | A `file:` URL is refused in production |
| `DATABASE_AUTH_TOKEN` | Turso token | |
| `AUTH_SECRET` | `openssl rand -base64 32` | Signs session cookies — anyone who knows it can forge an admin login |
| `CRON_SECRET` | `openssl rand -base64 32` | Without it the cron endpoints disable themselves |
| `APP_URL` | `https://your-domain` | Used in emails |
| `ONLINE_PAYMENTS` | `off` | Keeps money offline |
| `NOTIFY_PROVIDER` | `resend` | Reminders are the main promise — don't pilot without real email |
| `RESEND_API_KEY` | from Resend | |
| `FROM_EMAIL` | `no-reply@yourdomain.com` | Must be on a domain verified in Resend |
| `NODE_ENV` | `production` | Set by Vercel automatically |

The app **refuses to boot** if any of these are missing or unsafe, with the
specific problem printed in the deployment log. That's deliberate: every one of
these previously produced a deploy that came up healthy and quietly did the
wrong thing.

Two more, once you build the Android app (see `PLAYSTORE.md`). Both are read by
`/.well-known/assetlinks.json`, which 404s until they are set — and a TWA whose
assetlinks don't verify shows a browser URL bar over your app:

| Variable | Value | Why |
|---|---|---|
| `ANDROID_PACKAGE_NAME` | `app.personalise.twa` | The package Bubblewrap generated |
| `ANDROID_SHA256_FINGERPRINTS` | `AA:BB:…,CC:DD:…` | Comma-separated. **Both** the upload key and the Play App Signing key — listing only the upload key works on your own device and fails on every store install |

**Live video is off** (`LIVE_PROVIDER` unset ⇒ mock — instructor and student
never actually see each other). This is deferred for the pilot: run online
classes on whatever you use today and put the joining link on the class. §2.7 compares the
options for when you come back to it — the short version is **LiveKit's free
tier**, not `meet.jit.si`, which now forces a Google login on whoever opens
the room.

Whatever you set, `/admin/diagnostics` on the deployed site reports what each
provider is *actually* configured to do — that page exists because every mock
in this app succeeds, so a misconfigured deployment looks perfectly healthy.

### 2.5 Cron

Two jobs, but they can't both run as native Vercel Cron on the free **Hobby**
plan — Hobby caps every cron job at once per day, and reminders need to fire
every 5–15 minutes to be useful. Split them:

| Path | Schedule | Runs via | What breaks without it |
|---|---|---|---|
| `/api/cron/generate-sessions` | daily, 02:00 UTC | Vercel Cron (declared in `vercel.json`) | Classes stop appearing ~60 days out. No error — the site just empties. |
| `/api/cron/send-reminders` | every 5–15 min | an external scheduler (see below) | No class reminders. |

Vercel sends `Authorization: Bearer $CRON_SECRET` automatically for the job
declared in `vercel.json`, so `generate-sessions` needs no extra setup.

**`send-reminders` needs an external pinger**, since it must run more often
than Hobby allows. The endpoint doesn't care who calls it or how often — it's
safe to hit as often as you like, since a class is only ever reminded once
(see `src/lib/reminders.ts`). The only requirement is the `Authorization`
header carrying `CRON_SECRET`.

Easiest free option, [cron-job.org](https://cron-job.org):

1. Sign up (free).
2. Create a new cron job:
   - URL: `https://your-domain/api/cron/send-reminders`
   - Schedule: every 10 minutes
   - Under "Advanced" → Headers, add: `Authorization: Bearer <your CRON_SECRET>`
3. Save and enable it.

(If you later upgrade to Vercel Pro, you can move `send-reminders` back into
`vercel.json` with a `*/10 * * * *` schedule instead, and drop the external
service.)

Verify after deploy:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" https://your-domain/api/cron/send-reminders
curl https://your-domain/api/health
```

### 2.6 Email

Resend needs your sending domain verified (a few DNS records) before it will
deliver. Until then every send is rejected. Failures now appear in the runtime
logs prefixed `[notify]` — check there first if someone says they got no
reminder.

### 2.7 Live video — the options

> **`meet.jit.si` is a dead end — don't use it.** Since 24 August 2023 Jitsi's
> public server requires whoever *creates* a room to sign in with Google,
> GitHub or Facebook, and Jitsi's own docs say meet.jit.si "is not meant for
> use in production applications". That kills the flow: your instructor would
> hit a Google login before every class. The rest of this section is kept
> because the code still works against a **self-hosted** Jitsi (`JITSI_DOMAIN`).
>
> **The recommendation is LiveKit.** Its free Build tier needs no card and
> includes 5,000 participant-minutes/month, and the integration code is already
> in this repo (`src/lib/live/livekit.ts`), untested. Alternatives compared:
> Daily.co (10,000 min/mo), Agora (10,000 min/mo, but **suspends the account
> two days after you exceed it**), self-hosted Jitsi (~₹1,700–8,500/mo plus
> TURN setup), JaaS (25 monthly active users free).

The setup below applies to a Jitsi server you host yourself.

**What changes for the class room.** Every other provider (`mock`, `livekit`)
renders this app's own video grid and controls. Jitsi is different: joining a
class opens Jitsi's own complete meeting UI in an embedded frame — its video
tiles, mute/camera, screen share, chat, raise hand and participant list, not
this app's. This app still wraps it with the class title and, for the host, an
"End class" button, and still does its own booking/host check before anyone
gets in — that part doesn't change.

**Who's the moderator.** Jitsi gives moderator controls (mute another
person, remove someone) to whoever joins the room first. In practice that's
the instructor, since they're the one who opens the class — no setup needed,
just worth knowing if a student somehow joins before the instructor does.

**What this mode can't do.** No recording — meet.jit.si only offers recording
through a Dropbox connection per meeting, not the automatic "lands in your
media library" flow LiveKit gives you, so the record button doesn't appear in
Jitsi mode. And there's a real security tradeoff worth knowing: meet.jit.si
has no login, so access control is entirely "nobody outside your app can guess
the room's name" (it's derived from `AUTH_SECRET`, not the class ID, so it
isn't guessable) rather than an actual credential check. Good enough for a
pilot; if that ever isn't good enough, self-hosting Jitsi with JWT auth or
moving to `LIVE_PROVIDER=livekit` both close that gap — ask and it can be set
up.

---

## 3. Before you invite anyone

- [ ] `curl https://your-domain/api/health` returns `{"ok":true}`
- [ ] Sign in as admin and open `/admin/diagnostics` — Email must say **Sending**
      and Database must say **Healthy**. Anything red there is a thing the app
      will do silently and wrongly, not a thing it will complain about
- [ ] Sign up as a test student, and check the confirmation email actually arrives
- [ ] Create a test instructor and confirm they do **not** appear in
      `/instructors` before you verify them, and do after
- [ ] Fill in their UPI/bank details and check they show on the enrol page
- [ ] Create a class and finish all three setup steps — details, price, schedule
- [ ] Generate a pass code, redeem it as the student, confirm the pass activates
- [ ] Record a cash payment by hand too, confirm it also activates
- [ ] Book a class as the student, confirm the booking email arrives
- [ ] Wait for a reminder (or temporarily move a class to ~50 minutes away)
- [ ] Request a password reset and check the email arrives and the link works
- [ ] Open the site on a phone and walk the whole flow again
- [ ] Confirm `/checkout/anything` returns 404 (no accidental payment path)

---

## 4. Onboarding an instructor

1. They sign up at `/signup` choosing "I want to teach".
2. They complete the onboarding profile (bio, disciplines, city).
3. They add classes (Studio → Classes), each with at least one pass/price.
4. They add a schedule (Studio → Schedule) — this generates dated sessions.
5. They fill in **how students pay them** (Studio → More → My profile): UPI ID,
   bank details, or a note. Without this the enrol page tells students to pay
   them and gives no way to do it.
6. They publish their page (Studio → More → My profile).
7. **You verify them** in `/admin/instructors`.

**Three separate switches decide whether a student can find an instructor**,
and all three must be on:

| Switch | Who controls it | Off means |
|---|---|---|
| Published | the instructor | Their page is hidden; nobody but them can see it |
| Verified | **you**, in `/admin/instructors` | Same — hidden from the directory, class listings and search |
| Not suspended | you, in `/admin/instructors` | Same, and it outranks the instructor's own publish switch |

An unverified instructor can do everything in Studio and preview their own
page, but no student will find them and their direct links 404 for the public.
The instructor sees a "waiting to be verified" notice on their Studio overview
so they don't sit wondering why nobody turns up.

**`/admin/instructors` shows a count of profiles awaiting verification** — that
number is your queue. Nothing emails you about it, so check it when you invite
someone new.

Worth telling them upfront: profile photos and class images can't be uploaded
yet, so their page will look plain. It's the most-noticed gap — see §6.

## 5. Enrolling a student (the money step)

There are two routes. Both end with the same enrolment and the same row in the
fees ledger — pick whichever fits how the money actually changed hands.

### 5.1 Pass codes — the one that scales

The instructor generates codes once and hands one over each time someone pays.
The student activates it themselves, so the instructor never opens the app per
student.

1. **Studio → Pass codes → Create codes.** Pick the pass, a quantity, and
   optionally an expiry. Print them, or copy them one at a time.
2. Student pays the instructor directly.
3. Instructor hands over a code (on paper, WhatsApp, however).
4. Student signs in and opens **Dashboard → Redeem a code**, types it, sees
   exactly what they're activating, and confirms.

Each code works once. A code carries its own price and terms, so editing or
retiring the underlying plan later never changes what an issued code is worth.
A lost or mis-handed code can be revoked from the same page.

This is the route to use once an instructor has more than a handful of
students — recording every payment by hand does not survive a hundred people.

### 5.2 Recording a payment by hand

For a payment the instructor wants to log themselves.

1. Student creates an account at your site (send them the instructor's public
   page link — `/i/their-slug`).
2. Student pays the instructor directly, however they normally do.
3. Instructor opens **Studio → Earnings → Record a payment**, searches for the
   student by **name, email or phone**, picks them from the list, chooses the
   pass, confirms the amount, and saves.
4. The pass activates immediately and the student can book.

The student must have created an account first. The search only returns real
accounts — if nobody comes up, they haven't signed up yet.

**Passes that aren't on the price list.** Choose "Something else…" under *What
did they buy?* to record a one-off arrangement — a family rate, a pack carried
over from before — giving it a name, a class, a number of sessions and a
validity.

**Topping up.** Recording a second payment for a student who already has a
credit-based pass for that class adds to it rather than creating a second one.
That is how someone who has used up their classes buys more.

**Fixing a mistake.** Every cash payment row has an edit and a void. Edit
changes the amount, date and note; void reverses the payment and takes back the
unspent part of the pass it granted. To change *what* someone bought, void and
record it again.

---

## 6. Known gaps to tell your pilot users about

Be upfront about these — pilot users forgive known limits and resent surprises.

| Gap | Impact | Workaround for now |
|---|---|---|
| No image upload | Instructor pages and class cards have no photos | Set expectations; it's the top thing to build next |
| Live video is simulated | Instructor and student can't actually see each other in class | **Deferred for now** — run online classes on whatever you use today (Zoom/Meet/WhatsApp) and put the joining link on the class. LiveKit's free tier is the route back; see §2.7 |
| No in-app messaging | Students can't ask questions before booking | Keep WhatsApp for conversation |
| Reviews are display-only | Ratings stay at zero | Collect feedback out of band |
| No refunds in-app | Instructor hands money back manually | Void the payment in Studio → Earnings, then return the money directly |
| No instructor double-booking check | `findConflictingSessions()` exists in `src/lib/scheduling.ts` but nothing calls it, so two overlapping classes can be scheduled | Instructors see their own week in Studio → Schedule; watch for it there |
| Invoice numbers are random | GST requires sequential numbering | Fine while money is offline; must change before charging in-app |
| Notifications are email only | Indian students often won't read email | Follow up on WhatsApp for anything time-critical |

---

## 7. What to watch during the pilot

- **`[notify]` lines in the Vercel runtime logs** — every one is an email a
  real person didn't get.
- **`/api/health`** on an uptime monitor (UptimeRobot's free tier is fine).
- **Whether instructors actually record payments.** If they don't, the whole
  model fails and everything downstream looks broken. Ask them directly in
  week one.
- **Whether students book more than once.** A second booking is the real signal
  the product works; the first can just be politeness to their teacher.

---

## 8. Turning payments on later

When you're ready for in-app payments, in this order:

1. Publish Terms, Privacy, Refund/Cancellation and Contact pages — **Razorpay
   will not activate a live account without all four reachable.**
2. Complete Razorpay onboarding and KYC.
3. Model GST on plans and payments.
4. Build the refund path (the provider method exists and is currently unused).
5. Collect instructor payout details (bank/UPI/PAN) — no fields exist yet.
6. Set `PAYMENT_PROVIDER=razorpay`, real keys, then `ONLINE_PAYMENTS=on`.

The app will refuse to start if you turn payments on while still pointed at the
mock provider.
