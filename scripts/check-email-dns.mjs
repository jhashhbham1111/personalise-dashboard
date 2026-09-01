/**
 * Check whether a sending domain is ready for Resend — before pressing Verify.
 *
 * Resend's own dashboard tells you "not verified" without saying which record
 * is wrong, and DNS changes take anywhere from a minute to a day, so the
 * failure mode is sitting on a screen re-pressing a button with no idea
 * whether you have a propagation problem or a typo. This says which.
 *
 * Run it from a normal terminal — it needs real internet, so it will not work
 * from a restricted shell.
 *
 *   node scripts/check-email-dns.mjs send.koshcloud.com
 *
 * The argument is the domain you added *in Resend*. Use a subdomain if the
 * root already carries mail — see the SPF warning this prints.
 */

const sendingDomain = (process.argv[2] || "").trim().replace(/\.$/, "");

if (!sendingDomain) {
  console.error(
    "Usage: node scripts/check-email-dns.mjs <sending-domain>\n" +
      "  e.g. node scripts/check-email-dns.mjs send.koshcloud.com",
  );
  process.exit(1);
}

/** The registrable domain, for the DMARC lookup — DMARC lives at the root. */
function rootOf(domain) {
  const parts = domain.split(".");
  return parts.length > 2 ? parts.slice(-2).join(".") : domain;
}

async function lookup(name, type) {
  const res = await fetch(
    `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`,
    { headers: { accept: "application/dns-json" } },
  );
  if (!res.ok) throw new Error(`DNS lookup failed (${res.status})`);
  const json = await res.json();
  // TXT answers arrive quoted, and long ones arrive split into chunks.
  return (json.Answer ?? [])
    .filter((a) => a.type === (type === "TXT" ? 16 : type === "MX" ? 15 : a.type))
    .map((a) => a.data.replace(/^"|"$/g, "").replace(/" "/g, ""));
}

/**
 * Turn the raw records into a verdict.
 *
 * Split out from the network call so it can be exercised against recorded
 * answers — the logic is the part worth being sure about.
 */
export function analyse({ root, sendingDomain, rootTxt, subTxt, subMx, dkimTxt, dmarcTxt }) {
  const findings = [];
  const usingSubdomain = sendingDomain !== root;
  const rootSpf = rootTxt.filter((r) => r.toLowerCase().startsWith("v=spf1"));
  const subSpf = subTxt.filter((r) => r.toLowerCase().startsWith("v=spf1"));

  /*
   * The trap worth catching before anything else: a domain may hold exactly
   * one SPF record. A second one does not add to the first, it makes both
   * invalid — every receiver treats two v=spf1 records as a permanent error,
   * so adding one next to an existing provider's silently breaks the mail
   * that was working.
   */
  if (!usingSubdomain && rootSpf.length > 0) {
    findings.push({
      level: "stop",
      text:
        `${root} already publishes SPF (${rootSpf[0]}) — almost certainly an ` +
        `existing mail provider. Verify a SUBDOMAIN in Resend instead ` +
        `(send.${root}) and set FROM_EMAIL to that, or you will break the ` +
        `mail this domain already sends.`,
    });
  }
  if (rootSpf.length > 1) {
    findings.push({
      level: "stop",
      text: `${root} publishes ${rootSpf.length} SPF records. A domain may have exactly one; all of them are being treated as invalid.`,
    });
  }
  if (subSpf.length > 1) {
    findings.push({
      level: "stop",
      text: `${sendingDomain} publishes ${subSpf.length} SPF records. Merge them into one.`,
    });
  }

  const has = (ok, text, fix) =>
    findings.push({ level: ok ? "ok" : "missing", text, fix });

  has(dkimTxt.some((r) => r.includes("p=")), `DKIM at resend._domainkey.${sendingDomain}`,
    "Copy the DKIM TXT record from Resend's Records tab.");
  has(subSpf.length === 1, `SPF on ${sendingDomain}`,
    "Copy the SPF TXT record from Resend's Records tab.");
  has(subMx.length > 0, `MX on ${sendingDomain} (return path)`,
    "Copy the MX record from Resend's Records tab.");
  has(dmarcTxt.some((r) => r.toLowerCase().startsWith("v=dmarc1")), `DMARC at _dmarc.${root}`,
    "Add a TXT record at _dmarc with: v=DMARC1; p=none;");

  /*
   * Strict alignment on an existing DMARC record rejects a subdomain sender
   * even when its own DKIM is perfect, which looks exactly like a broken
   * Resend setup and is not one.
   */
  const dmarc = dmarcTxt.find((r) => r.toLowerCase().startsWith("v=dmarc1"));
  if (dmarc && usingSubdomain) {
    const strictDkim = /adkim\s*=\s*s/i.test(dmarc);
    const strictSpf = /aspf\s*=\s*s/i.test(dmarc);
    if (strictDkim || strictSpf) {
      findings.push({
        level: "warn",
        text:
          `${root}'s DMARC uses strict alignment (${strictDkim ? "adkim=s" : ""}${strictDkim && strictSpf ? " " : ""}${strictSpf ? "aspf=s" : ""}). ` +
          `Mail from ${sendingDomain} will fail DMARC even with valid DKIM. Relax it (adkim=r) or send from the root.`,
      });
    }
    const sp = dmarc.match(/sp\s*=\s*(none|quarantine|reject)/i)?.[1];
    if (sp && sp.toLowerCase() === "reject") {
      findings.push({
        level: "warn",
        text: `${root}'s DMARC sets sp=reject, which applies to ${sendingDomain}. Confirm DKIM passes before sending anything real.`,
      });
    }
  }

  return findings;
}

const root = rootOf(sendingDomain);

const [rootTxt, subTxt, subMx, dkimTxt, dmarcTxt] = await Promise.all([
  lookup(root, "TXT"),
  lookup(sendingDomain, "TXT"),
  lookup(sendingDomain, "MX"),
  lookup(`resend._domainkey.${sendingDomain}`, "TXT"),
  lookup(`_dmarc.${root}`, "TXT"),
]).catch((e) => {
  console.error(`\nCould not reach DNS: ${e.message}`);
  console.error("This needs ordinary internet access — run it from your own terminal.\n");
  process.exit(1);
});

const findings = analyse({ root, sendingDomain, rootTxt, subTxt, subMx, dkimTxt, dmarcTxt });

console.log(`\nSending domain: ${sendingDomain}${sendingDomain === root ? "  (the root domain)" : `  (subdomain of ${root})`}\n`);

const icon = { ok: "  ok  ", missing: " miss ", warn: " warn ", stop: " STOP " };
for (const f of findings) {
  console.log(`[${icon[f.level]}] ${f.text}`);
  if (f.level === "missing" && f.fix) console.log(`          ${f.fix}`);
}

const blocked = findings.filter((f) => f.level === "stop").length;
const missing = findings.filter((f) => f.level === "missing").length;

console.log("");
if (blocked) {
  console.log(`${blocked} problem(s) that will break mail — fix before pressing Verify in Resend.\n`);
  process.exit(1);
} else if (missing) {
  console.log(
    `${missing} record(s) not visible yet. Either not added, or still propagating —\n` +
      `re-run in a few minutes before assuming a typo.\n`,
  );
  process.exit(1);
} else {
  console.log("All records are live. Press Verify in Resend, then send a test to an address that isn't your own.\n");
}
