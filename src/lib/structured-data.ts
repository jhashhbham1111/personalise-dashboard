import { env } from "./env";
import { ClassMode } from "./enums";
import { paiseToRupees } from "./utils";

/**
 * schema.org JSON-LD.
 *
 * Titles and descriptions decide whether a page *can* rank; this decides what
 * it looks like once it does. A class with Course/Offer markup can show its
 * price in the result itself, and a session with Event markup can show its
 * date — which is the difference between a blue link and a listing someone can
 * act on without clicking.
 *
 * Every builder here returns plain data and is rendered by <JsonLd>. Nothing
 * in this file reads the database: the pages already load what they need, and
 * a second query per page for markup nobody sees would be a poor trade.
 *
 * One rule throughout: never describe something the page doesn't actually
 * show. Marking up a price the visitor can't see, or an event that isn't on
 * the page, is what Google calls spammy structured data, and the penalty for
 * it is losing rich results across the whole site rather than on one page.
 */

export type JsonLdObject = Record<string, unknown>;

/** Absolute URLs, because schema.org consumers don't resolve relative paths. */
function abs(path: string): string {
  return path.startsWith("http") ? path : `${env.appUrl}${path}`;
}

/** ISO 8601 duration — "PT60M". Schema.org wants this, not "60 min". */
function isoMinutes(minutes: number): string {
  return `PT${Math.max(1, Math.round(minutes))}M`;
}

function isoSeconds(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s > 0 ? `PT${m}M${s}S` : `PT${m}M`;
}

/**
 * Ends a fragment with a full stop so joined sentences don't run together.
 *
 * Instructors don't punctuate their headlines, so building a description by
 * joining fields produced "…who sit at desks all day Teaches Yoga." — one
 * sentence Google shows verbatim in the snippet.
 */
export function endSentence(text: string | null | undefined): string | null {
  const trimmed = text?.trim();
  if (!trimmed) return null;
  return /[.!?]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/** `disciplines` is stored as a JSON array in a text column. */
export function parseDisciplines(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((d) => typeof d === "string") : [];
  } catch {
    return [];
  }
}

/* --------------------------------------------------------------- site-wide */

/**
 * Who publishes this site. Sitewide, so Google can attach the name and logo to
 * results from any page rather than only the homepage.
 */
export function organizationJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: env.appName,
    url: env.appUrl,
    logo: abs("/icons/icon-512.png"),
    description:
      "Book live and in-person classes with yoga teachers, musicians, dancers and coaches across India.",
  };
}

/**
 * Declares the site's own search, which is what lets Google render a search
 * box directly under the result for a brand query.
 */
export function websiteJsonLd(): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: env.appName,
    url: env.appUrl,
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${env.appUrl}/instructors?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

/* ------------------------------------------------------------- instructors */

/**
 * An instructor as a person, not a listing.
 *
 * `address` is the part that earns local traffic: without a locality, a page
 * about a teacher in Gurgaon is just a page about a teacher, and has nothing
 * to match against "yoga classes near me".
 */
export function instructorJsonLd(args: {
  name: string;
  slug: string;
  headline: string;
  bio?: string | null;
  city?: string | null;
  avatarUrl?: string | null;
  disciplines: string[];
}): JsonLdObject {
  const url = abs(`/i/${args.slug}`);
  const data: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: args.name,
    url,
    description: args.bio?.trim() || args.headline,
    disambiguatingDescription: args.headline,
    mainEntityOfPage: url,
  };

  if (args.avatarUrl) data.image = abs(args.avatarUrl);
  if (args.disciplines.length) {
    data.knowsAbout = args.disciplines;
    data.jobTitle = `${args.disciplines[0]} Instructor`;
  }
  if (args.city?.trim()) {
    data.address = {
      "@type": "PostalAddress",
      addressLocality: args.city.trim(),
      addressCountry: "IN",
    };
  }
  return data;
}

/* ----------------------------------------------------------------- classes */

/**
 * An offering as a Course, with the cheapest active pass as its Offer.
 *
 * The lowest price is the honest one to advertise: it's what "from ₹X" means,
 * and quoting anything higher would mark up a number the student can beat on
 * the page itself.
 */
export function courseJsonLd(args: {
  title: string;
  summary: string;
  description?: string | null;
  instructorName: string;
  instructorSlug: string;
  offeringSlug: string;
  mode: string;
  durationMin: number;
  level?: string | null;
  lowestAmountPaise: number | null;
  city?: string | null;
  venue?: { name: string; addressLine: string; city: string } | null;
}): JsonLdObject {
  const url = abs(`/i/${args.instructorSlug}/enrol/${args.offeringSlug}`);
  const online = args.mode === ClassMode.ONLINE;

  const instance: JsonLdObject = {
    "@type": "CourseInstance",
    courseMode: online ? "Online" : "Onsite",
    courseWorkload: isoMinutes(args.durationMin),
  };
  if (!online && args.venue) {
    instance.location = {
      "@type": "Place",
      name: args.venue.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: args.venue.addressLine,
        addressLocality: args.venue.city,
        addressCountry: "IN",
      },
    };
  }

  const data: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "Course",
    name: args.title,
    description: args.description?.trim() || args.summary,
    url,
    provider: {
      "@type": "Person",
      name: args.instructorName,
      url: abs(`/i/${args.instructorSlug}`),
    },
    hasCourseInstance: instance,
  };

  if (args.level) data.educationalLevel = args.level;

  // Only when there is a real price on the page. A Course with a zero or
  // absent Offer reads as free, which would be a lie in a result snippet.
  if (args.lowestAmountPaise && args.lowestAmountPaise > 0) {
    data.offers = {
      "@type": "Offer",
      price: String(paiseToRupees(args.lowestAmountPaise)),
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      url,
      category: "Paid",
    };
  }

  return data;
}

/**
 * A scheduled session as an Event — the markup that can put a date and a
 * "book" action straight into the search result.
 */
export function sessionEventJsonLd(args: {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date;
  mode: string;
  instructorName: string;
  instructorSlug: string;
  venue?: { name: string; addressLine: string; city: string } | null;
  amountPaise?: number | null;
  isCancelled?: boolean;
}): JsonLdObject {
  const url = abs(`/classes/${args.id}`);
  const online = args.mode === ClassMode.ONLINE;

  const data: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: args.title,
    startDate: args.startsAt.toISOString(),
    endDate: args.endsAt.toISOString(),
    url,
    // Google requires both of these on every Event, and defaults badly when
    // they're missing — an online class silently becomes a physical one.
    eventAttendanceMode: online
      ? "https://schema.org/OnlineEventAttendanceMode"
      : "https://schema.org/OfflineEventAttendanceMode",
    eventStatus: args.isCancelled
      ? "https://schema.org/EventCancelled"
      : "https://schema.org/EventScheduled",
    performer: {
      "@type": "Person",
      name: args.instructorName,
      url: abs(`/i/${args.instructorSlug}`),
    },
    organizer: {
      "@type": "Organization",
      name: env.appName,
      url: env.appUrl,
    },
  };

  data.location =
    online || !args.venue
      ? { "@type": "VirtualLocation", url }
      : {
          "@type": "Place",
          name: args.venue.name,
          address: {
            "@type": "PostalAddress",
            streetAddress: args.venue.addressLine,
            addressLocality: args.venue.city,
            addressCountry: "IN",
          },
        };

  if (args.amountPaise && args.amountPaise > 0) {
    data.offers = {
      "@type": "Offer",
      price: String(paiseToRupees(args.amountPaise)),
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      url,
      validFrom: new Date().toISOString(),
    };
  }

  return data;
}

/* ------------------------------------------------------------------ videos */

export function videoJsonLd(args: {
  id: string;
  title: string;
  description?: string | null;
  thumbnailUrl?: string | null;
  publishedAt: Date;
  durationSec?: number | null;
  instructorName: string;
}): JsonLdObject {
  const data: JsonLdObject = {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    name: args.title,
    description: args.description?.trim() || `${args.title} — with ${args.instructorName}`,
    uploadDate: args.publishedAt.toISOString(),
    url: abs(`/videos/${args.id}`),
    creator: { "@type": "Person", name: args.instructorName },
  };
  if (args.thumbnailUrl) data.thumbnailUrl = abs(args.thumbnailUrl);
  if (args.durationSec && args.durationSec > 0) {
    data.duration = isoSeconds(args.durationSec);
  }
  return data;
}

/* ------------------------------------------------------------- breadcrumbs */

/** Replaces the bare URL in a result with a readable path. */
export function breadcrumbJsonLd(
  trail: Array<{ name: string; path: string }>,
): JsonLdObject {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: abs(item.path),
    })),
  };
}
