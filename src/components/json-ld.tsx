import type { JsonLdObject } from "@/lib/structured-data";

/**
 * Renders schema.org markup into the page.
 *
 * The `<` escape is not cosmetic. This markup is built from instructor-supplied
 * text — a bio, a class description — and a bio containing `</script>` would
 * otherwise close this tag early and let the rest of that field run as markup
 * on the page. JSON.stringify does not escape it, because it is valid JSON;
 * it is only dangerous once it is sitting inside a script element. Escaping
 * the angle bracket as a unicode sequence keeps the JSON identical to a parser
 * while making it impossible to terminate the tag.
 */
export function JsonLd({ data }: { data: JsonLdObject | JsonLdObject[] }) {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}
