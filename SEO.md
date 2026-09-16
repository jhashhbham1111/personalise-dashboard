# SEO for Personalise

The canonical domain is **https://personalise.koshcloud.com**. Everything below
assumes that, and the code enforces it.

---

## 1. What is already in the repo

| Thing | Where | What it does |
|---|---|---|
| Sitemap | `src/app/sitemap.ts` | Lists every public instructor, enrol page and public video. Filtered by `publiclyVisibleInstructor`, the same predicate the listing pages use, so it can never advertise an unpublished or suspended profile. Rebuilt hourly |
| Robots | `src/app/robots.ts` | Blocks `/studio`, `/dashboard`, `/admin`, `/checkout` and the auth routes. **Also returns `Disallow: /` on any hostname that isn't the canonical one**, which is what keeps preview deployments and the `.vercel.app` alias out of the index |
| Structured data | `src/lib/structured-data.ts` | schema.org builders: `Organization`, `WebSite`, `Person`, `Course` + `Offer`, `Event`, `VideoObject`, `BreadcrumbList` |
| Renderer | `src/components/json-ld.tsx` | Escapes `<` so an instructor bio containing `</script>` can't break out of the tag |
| Canonicals | each public page's metadata | Every public page declares its own canonical. Deliberately **not** on the root layout — it would be inherited and make every page a duplicate of `/` |

Indexing rules encoded in the pages:

- Unpublished / unverified / suspended instructor → `noindex` (owner and admins can still view).
- Class session in the future → indexed, with `Event` markup. In the past → `noindex, follow`, because a dated page nobody can book is index bloat.
- Non-public video (ENROLLED_ONLY / PAID) → `noindex`, since a crawler only sees a locked page.

---

## 2. What you have to do — Google won't find you on its own

1. **Set `APP_URL=https://personalise.koshcloud.com` in Vercel, Production scope.**
   This is not optional. `env.appUrl` falls back to Vercel's `.vercel.app`
   domain, and every canonical URL, sitemap entry and OG tag is built from it.
   Get this wrong and you are telling Google the wrong site is the real one.
2. **Verify the domain in Google Search Console** (`search.google.com/search-console`),
   then submit `https://personalise.koshcloud.com/sitemap.xml`.
3. **Create a Google Business Profile** if there is a physical studio. For
   "near me" searches this outranks anything on-site SEO can do.
4. **Check the Rich Results Test** on one instructor page and one enrol page
   (`search.google.com/test/rich-results`). Confirm Course and Person parse.

---

## 3. Keyword reality check

You mentioned wanting to rank for "personalise", "online training" and
one-on-one sessions. Two of those need rethinking, and it's better to know now.

**"personalise"** — this is an ordinary English verb. The results are
dictionaries, Shopify apps, printing companies and a decade of "personalise
your marketing" content. A new site does not win a generic dictionary word, and
chasing it would waste every rupee you spend. What you *can* own is your brand
once people know it: "personalise yoga", "personalise classes app",
"personalise instructor login". Brand searches are cheap to win and convert
extremely well — but they only happen after someone has heard of you, which
comes from instructors sharing links, not from SEO.

**"online training"** — a head term owned by corporate e-learning platforms
with enormous budgets. Even ranking page three would send you the wrong
visitors, since most people typing it want compliance courses, not yoga.

**One-on-one sessions** — this one is realistic, because it is specific.
Nobody searches "one on one"; they search "one on one yoga classes online" or
"personal yoga trainer in Gurgaon". Those are winnable.

The pattern: **you win specific, you lose generic.** A new marketplace ranks by
being the best possible answer to a narrow question, then widening.

---

## 4. What actually wins for you

In priority order.

**Instructor name searches.** When Tanu Sharma tells forty students about her
classes, some of them Google her name. That search has almost no competition
and enormous intent. Your instructor pages now carry `Person` markup with city
and disciplines, so they're built to win these. This is your fastest traffic.

**City + discipline long-tail.** "yoga classes in Gurgaon", "online hatha yoga
india", "personal yoga trainer bengaluru". Each has modest volume, but there
are hundreds of them and they convert. Your instructor and enrol pages already
put the city in the title and description.

**Class-specific searches.** "morning vinyasa online", "restorative yin class".
The enrol pages now carry `Course` + `Offer` markup, so results can show the
price directly — which filters out people who were never going to pay anyway.

**Free video content.** The `/videos` section is the only part of your site
that can attract people who aren't yet looking to buy. A genuinely useful
"10 minute desk stretch" video ranks, builds trust, and feeds the rest.

---

## 5. The highest-leverage thing: instructor profile text

Most of your SEO content will be written by instructors, not by you. Their
headline and bio become the page title and meta description. Right now nothing
tells them that.

Add guidance to the profile editor, and send instructors this:

- **Headline** — say what you teach, to whom, and where. "Hatha and Vinyasa
  yoga for people who sit at desks all day" works. "Certified instructor.
  Passionate about wellness." says nothing anyone searches for.
- **Name your city** in the bio, in words. "I teach in Sector 45, Gurgaon" is
  worth more than a dropdown value.
- **Name your style**, specifically. Hatha, Ashtanga, Yin, prenatal, weight
  training — these are what people type.
- **Say who it's for.** Beginners, seniors, post-natal, desk workers, athletes.
- **Class descriptions**: describe what happens in the hour, not adjectives.
  The Morning Vinyasa description in your seed data is a good model.

A worthwhile product change: warn instructors when their headline is under
about forty characters or their bio under about two hundred, the way you
already validate signup fields. Thin profiles are the single biggest thing
holding back a marketplace's SEO, and instructors will not fix them unless
asked.

---

## 6. Roadmap

**Now (this week)**
- Set `APP_URL` in Vercel Production. Redeploy.
- Verify in Search Console, submit the sitemap.
- Fill the five `TODO:` placeholders in `src/lib/legal.ts` — Play needs them too.

**Next (this month)**
- City landing pages: `/classes/yoga-in-gurgaon`, generated from the city data
  you already have in `instructorCities()` and `classCities()`. This is the
  single biggest remaining technical win, and the queries exist.
- OG images: an `opengraph-image.tsx` per public route so shared links show a
  card. Instructor links get shared on WhatsApp constantly; right now they
  render as bare URLs.
- Instructor profile guidance in the editor, per section 5.

**Later**
- Reviews on instructor pages already exist in the schema — surfacing an
  aggregate rating would let `AggregateRating` markup put stars in results.
- A blog or guides section, if anyone will genuinely maintain it. An abandoned
  blog is worse than none.

**Don't bother with**
- Buying links, directory submissions, or anything that promises fast rankings.
- Chasing "online training" or "personalise" as head terms, per section 3.

---

## 7. Measuring it

Search Console is the only source that matters, and it takes weeks to populate.
Look at impressions before clicks: impressions rising means Google is starting
to show you, which happens well before anyone clicks. Judge it at **three
months**, not three weeks. Anyone promising faster is selling something.
