# Putting Personalise on the Play Store

The app ships as a **Trusted Web Activity** (TWA): a real Android package whose
whole UI is this website, running full-screen with no browser chrome. There is
no second codebase — you ship the site, the store listing points at it, and an
update to the site *is* an update to the app.

That only works if two things line up:

1. The site is installable as a PWA (manifest, icons, theme, no sideways scroll
   on a phone) — **done**, and `scripts/playstore-smoke.mjs` keeps it that way.
2. The site publicly vouches for the Android package, at
   `/.well-known/assetlinks.json` — **needs the two env vars below**, which you
   can't know until Bubblewrap has generated a signing key.

Until step 2 is done the app still installs and runs, but Android can't verify
it owns the domain, so **it draws a browser URL bar across the top of your app**.
That's the single most common way a TWA looks broken on launch day.

---

## 1. What's already in the repo

| Thing | Where | Note |
|---|---|---|
| Web manifest | `src/app/manifest.ts` | Served at `/manifest.webmanifest`. Bubblewrap reads this to name the app, pick the colours and pull the icons |
| Icons | `public/icons/` | 192/512 `any`, 192/512 `maskable`, 512 `monochrome`, plus `apple-touch-icon.png`. Regenerate with `node scripts/generate-icons.mjs` |
| Theme + viewport | `src/app/layout.tsx` | `viewport-fit=cover` so the safe-area insets work; pinch-zoom deliberately **not** disabled, because Play's accessibility review flags that |
| Digital Asset Links | `src/app/.well-known/assetlinks.json/route.ts` | Driven by env, 404s until configured |
| Privacy policy | `/legal/privacy` | Play requires a public URL, reachable signed-out |
| Terms | `/legal/terms` | |
| Refunds/cancellation | `/legal/refunds` | |
| Contact | `/contact` | |
| Account deletion | `/account/delete` | Play requires **both** an in-app path and a public web page. This is the public page |
| Readiness check | `scripts/playstore-smoke.mjs` | 43 checks. Run it against the deployment before every submission |

Run the check against production, not localhost:

```bash
BASE_URL=https://personalise-dashboard.vercel.app \
CHROMIUM_PATH=/opt/pw-browsers/chromium \
  node scripts/playstore-smoke.mjs
```

---

## 2. Before you start: the blockers

These are not Play mechanics, they're facts about your business that Play (and
Razorpay) both check. Nothing below can be finished without them.

- **`src/lib/legal.ts` still holds five `TODO:` placeholders** — `operatorName`,
  `supportEmail`, `address`, `phone`, `lastUpdated`. Google rejects a privacy
  policy that names no one and gives no address. Sign in as admin and open
  `/admin/diagnostics` to see them listed.
- **A Google Play developer account** — one-time US$25, and identity
  verification that can take a few days. Start this first; it's the longest
  lead time on the list.
- **A verified sending domain in Resend**, so the account-deletion and password
  emails actually arrive. A reviewer will test the deletion flow.

---

## 3. Build the Android package

Bubblewrap is Google's own tool for this. It needs **Node 20+** and the
**Java 17 JDK** — it will offer to download the Android SDK and JDK itself the
first time, which is the easier path.

```bash
npm install -g @bubblewrap/cli
mkdir -p ~/personalise-android && cd ~/personalise-android

bubblewrap init --manifest https://personalise-dashboard.vercel.app/manifest.webmanifest
```

It reads the manifest and asks you to confirm each value. The ones that matter:

| Prompt | Answer | Why |
|---|---|---|
| Application ID / package | `app.personalise.twa` | **Permanent.** It can never be changed once published, and it must be globally unique. Use a domain you control, reversed |
| Host | `personalise-dashboard.vercel.app` | Use your own domain here instead if you have one — changing it later means a new assetlinks entry |
| Start URL | `/` | |
| Display mode | `standalone` | |
| Status bar colour | `#1f6650` | Matches the manifest `theme_color` |
| Signing key | let it generate one | Writes `android.keystore` |

> **Back up `android.keystore` and its passwords somewhere you will still have
> them in three years.** With Play App Signing enabled (below) a lost upload key
> is recoverable by asking Google to reset it, which takes days. Without it,
> losing the key means you can never update the app again — you'd have to
> publish a new listing and every install would be orphaned.

Then:

```bash
bubblewrap build
```

You get `app-release-bundle.aab` (upload this to Play) and `app-release-signed.apk`
(sideload this to test on your own phone).

---

## 4. Wire up Digital Asset Links

You now need **two** SHA-256 fingerprints, and getting this wrong is the classic
failure: it works perfectly on your own phone and shows a URL bar for everyone
who installs from the store.

**Your upload key** — what `bubblewrap build` signed with:

```bash
keytool -list -v -keystore android.keystore -alias android | grep SHA256
```

**Google's Play App Signing key** — Play re-signs your upload with its own key
before distributing, so the app users install is signed by a key you have never
held. After your first upload, find it in
**Play Console → your app → Test and release → Setup → App signing**, under
"App signing key certificate".

Set both in Vercel → Settings → Environment Variables, comma-separated, then
redeploy:

```
ANDROID_PACKAGE_NAME=app.personalise.twa
ANDROID_SHA256_FINGERPRINTS=AA:BB:...:ZZ,11:22:...:99
```

Verify it's live:

```bash
curl https://personalise-dashboard.vercel.app/.well-known/assetlinks.json
```

Two statements, both fingerprints, `"namespace": "android_app"`. Before those
vars are set the route returns **404 by design** — a 200 with empty fields would
be worse, because Android reports both cases as "no matching statement" and only
one of them tells you why.

Then install the APK on a real phone and open it. **No URL bar across the top**
is the whole test. If there is one, the fingerprint doesn't match — re-check
which key signed the build you installed.

---

## 5. The Play Console listing

Beyond the obvious (title, short and full description, screenshots, feature
graphic), these are the ones that get submissions rejected:

- **Privacy policy URL** — `https://…/legal/privacy`. Must load signed-out.
- **Data safety form** — declare what you collect. For this app: name, email
  address, phone number, and (if the instructor uploads one) a photo; plus
  payment records for classes. Say that data is encrypted in transit and that
  users can request deletion, and link `https://…/account/delete`.
- **Account deletion URL** — `https://…/account/delete`. Required for any app
  that lets people create an account. A reviewer will follow it.
- **Content rating questionnaire** — answer it honestly; the app is
  education/fitness with user accounts and no user-generated public content
  beyond instructor posts.
- **Target audience** — 18+, or 13+ with the extra families policy work. Pick
  18+ unless you specifically want minors, because the families requirements are
  substantial.
- **Target API level** — Bubblewrap sets this from the version it generated
  with. Google raises the floor for new submissions roughly every August, so
  before you submit run `bubblewrap update` in the project folder and rebuild;
  that bumps the wrapper to the current requirement. Check the current floor at
  <https://support.google.com/googleplay/android-developer/answer/11926878>.
- **Payments** — while `ONLINE_PAYMENTS=off` the app takes no money in-app, so
  Google Play Billing does not apply. That changes the moment you turn Razorpay
  on: Play's billing policy exempts payments for *in-person* services and
  physical goods, but "online class you attend live" is exactly the boundary
  case Google has been tightening. Read the current policy before you flip that
  flag, not after.

Submit to **internal testing** first, not production. Internal testing installs
in minutes with no review, which is how you find the URL-bar problem before a
reviewer does.

---

## 6. Shipping updates

Two different things now update independently:

- **Content and features** — deploy the site. Every installed app picks it up on
  next launch. No store review, no version bump. This is the whole point of a TWA.
- **The wrapper** — only needed when the package name, host, icons, splash
  colours or target API level change:

  ```bash
  bubblewrap update    # pulls the current manifest + bumps the wrapper
  bubblewrap build
  ```

  then upload the new `.aab` and increment the version in `twa-manifest.json`.

If you change the manifest's `name`, icons or `theme_color` in
`src/app/manifest.ts`, the *installed app* keeps the old ones until you rebuild
the wrapper — only the web content updates on its own.
