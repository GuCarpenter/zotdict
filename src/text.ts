/**
 * Small, dependency-free text helpers shared by the dictionary, sentence and
 * card code. Kept pure so they can be unit-tested outside Zotero.
 */

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  mdash: "\u2014",
  ndash: "\u2013",
  hellip: "\u2026",
  lsquo: "\u2018",
  rsquo: "\u2019",
  ldquo: "\u201c",
  rdquo: "\u201d",
  times: "\u00d7",
  middot: "\u00b7",
};

export function normalizeSpace(text: string): string {
  return String(text || "").replace(/\s+/g, " ").trim();
}

export function escapeHtml(text: string): string {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function decodeEntities(text: string): string {
  return String(text || "").replace(
    /&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi,
    (match, entity: string) => {
      if (entity.charAt(0) === "#") {
        const hex = entity.charAt(1).toLowerCase() === "x";
        const code = parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
        if (Number.isFinite(code) && code > 0 && code <= 0x10ffff) {
          try {
            return String.fromCodePoint(code);
          } catch {
            return match;
          }
        }
        return match;
      }
      return ENTITIES[entity.toLowerCase()] ?? match;
    },
  );
}

/** Convert the inline HTML stored in StarDict entries to readable plain text. */
export function htmlToText(html: string): string {
  return normalizeSpace(
    decodeEntities(
      String(html || "")
        .replace(/<\s*(script|style)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, " ")
        .replace(/<br\s*\/?>/gi, " ")
        .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, " ")
        .replace(/<li\b[^>]*>/gi, " \u2022 ")
        .replace(/<[^>]+>/g, ""),
    ),
  );
}

/** Conservative scrub for model-generated HTML before it reaches Anki. */
export function sanitizeHtml(html: string): string {
  return String(html || "")
    .replace(
      /<\s*(script|style|iframe|object|embed|link|meta)\b[\s\S]*?<\s*\/\s*\1\s*>/gi,
      "",
    )
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?>/gi, "")
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(
      /\b(href|src)\s*=\s*(?:"\s*javascript:[^"]*"|'\s*javascript:[^']*')/gi,
      "",
    );
}

/** Strip remote/active bits from the Anki card CSS before using it in a window. */
export function sanitizeCss(css: string): string {
  return String(css || "")
    .replace(/@import[^;{]*[;{]/gi, "")
    .replace(/url\s*\([^)]*\)/gi, "none")
    .replace(/expression\s*\([^)]*\)/gi, "")
    .replace(/-moz-binding\s*:[^;]*;?/gi, "");
}

export function stripMarkdownFences(text: string): string {
  return String(text || "")
    .replace(/^\s*```(?:json|html|markdown|md)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
}

/** Fill a Mustache-lite Anki template (sections + fields). */
export function renderTemplate(
  template: string,
  fields: Record<string, string>,
): string {
  let out = String(template || "");
  const sections = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  const inverted = /\{\{\^(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
  // Nested sections can appear inside another section's body, which a single
  // replace pass would leave unrendered. Repeat until stable.
  for (let i = 0; i < 20; i++) {
    const before = out;
    out = out.replace(sections, (_m, key: string, inner: string) =>
      fields[key] ? inner : "",
    );
    out = out.replace(inverted, (_m, key: string, inner: string) =>
      fields[key] ? "" : inner,
    );
    if (out === before) break;
  }
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => fields[key] ?? "");
  return out;
}
