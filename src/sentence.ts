/**
 * Context extraction for the AIWord "Usage" field.
 *
 * The reader gives us the whole attachment text; we need one *complete*
 * sentence containing the selected word or phrase. If that sentence is very
 * short ("He left.") we grow the window with the previous / next sentence until
 * it is long enough to be useful on a flashcard.
 */

import { escapeHtml, normalizeSpace } from "./text";

export interface UsageResult {
  /** Plain sentence(s), suitable for annotation comments. */
  text: string;
  /** Same sentence(s) with the target wrapped in <b>, for the card. */
  html: string;
}

interface Span {
  start: number;
  end: number;
}

/** Fragments shorter than this are treated as abbreviations/fragments. */
const MIN_FRAGMENT = 30;
/** Default minimum length for an expanded usage window. */
export const DEFAULT_MIN_USAGE_CHARS = 60;

export function extractUsage(
  fullText: string,
  term: string,
  pageIndex?: number,
  minChars: number = DEFAULT_MIN_USAGE_CHARS,
): UsageResult {
  const cleaned = cleanSelection(term);
  if (!cleaned) return { text: normalizeSpace(term), html: "" };
  if (!fullText) return fallback(cleaned);

  const min = Number.isFinite(minChars) && minChars > 0 ? minChars : 60;

  // Prefer the page the annotation is on, then the whole attachment.
  const pages = fullText.split("\f");
  const regions: string[] = [];
  if (
    typeof pageIndex === "number" &&
    pageIndex >= 0 &&
    pages.length > 1 &&
    pages[pageIndex]
  ) {
    regions.push(pages[pageIndex]);
  }
  regions.push(fullText);

  for (const region of regions) {
    const text = normalizeRegion(region);
    const hit = findTerm(text, cleaned);
    if (hit) {
      return buildUsage(text, hit.index, hit.length, min);
    }
  }
  return fallback(cleaned);
}

/** Remove surrounding punctuation/whitespace from a reader selection. */
export function cleanSelection(raw: string): string {
  return normalizeSpace(raw)
    .replace(/^[\s"'`\u201c\u201d\u2018\u2019([{<]+/, "")
    .replace(/[\s"'`\u201c\u201d\u2018\u2019)\]}>,.;:!?]+$/, "")
    .trim();
}

/** Normalise PDF line breaks and whitespace without losing sentence punctuation. */
function normalizeRegion(raw: string): string {
  return normalizeSpace(
    String(raw || "")
      // join words hyphenated across a line break: "seren-\ndipity"
      .replace(/([A-Za-z])-\s*\n\s*([a-z])/g, "$1$2")
      .replace(/\u00ad\s*\n\s*/g, ""),
  );
}

/**
 * Case/apostrophe-insensitive search. Replacements are 1:1 so the index is
 * valid for the original string.
 */
function findTerm(text: string, term: string): { index: number; length: number } | null {
  const haystack = text.toLowerCase().replace(/[\u2018\u2019]/g, "'");
  const needle = term.toLowerCase().replace(/[\u2018\u2019]/g, "'");
  const index = haystack.indexOf(needle);
  if (index < 0) return null;
  return { index, length: needle.length };
}

/** Split a normalised paragraph into sentences, merging obvious fragments. */
function sentenceSpans(text: string): Span[] {
  const raw: Span[] = [];
  const ends = /[.!?\u2026]+["'\u201d\u2019)\]]*(?=\s|$)/g;
  let start = 0;
  let match: RegExpExecArray | null;
  while ((match = ends.exec(text))) {
    const end = match.index + match[0].length;
    pushSpan(raw, text, start, end);
    start = end;
    while (start < text.length && /\s/.test(text[start])) start++;
  }
  if (start < text.length) pushSpan(raw, text, start, text.length);

  // Merge short fragments forward so "Mr." / "J. R. R." do not become sentences.
  const merged: Span[] = [];
  let i = 0;
  while (i < raw.length) {
    const span = { ...raw[i] };
    while (spanLength(text, span) < MIN_FRAGMENT && i + 1 < raw.length) {
      i++;
      span.end = raw[i].end;
    }
    merged.push(span);
    i++;
  }
  return merged;
}

function pushSpan(spans: Span[], text: string, start: number, end: number): void {
  const value = text.slice(start, end).trim();
  if (!value) return;
  spans.push({ start, end });
}

function spanLength(text: string, span: Span): number {
  return text.slice(span.start, span.end).trim().length;
}

function buildUsage(
  text: string,
  hitIndex: number,
  hitLength: number,
  minChars: number,
): UsageResult {
  const spans = sentenceSpans(text);
  if (!spans.length) return fallback(text.slice(hitIndex, hitIndex + hitLength));

  let index = spans.findIndex(
    (span) => span.start <= hitIndex && hitIndex < span.end,
  );
  if (index < 0) {
    index = spans.findIndex((span) => span.start > hitIndex);
    if (index < 0) index = spans.length - 1;
  }

  let first = index;
  let last = index;
  while (windowLength(text, spans, first, last) < minChars) {
    const canPrev = first > 0;
    const canNext = last < spans.length - 1;
    if (!canPrev && !canNext) break;
    if (canPrev) first--;
    if (windowLength(text, spans, first, last) < minChars && canNext) last++;
  }

  const windowStart = spans[first].start;
  const windowEnd = spans[last].end;
  let sentence = text.slice(windowStart, windowEnd).trim();
  const leading = text.slice(windowStart, windowEnd).indexOf(sentence);
  const matchStart = hitIndex - windowStart - Math.max(0, leading);

  if (matchStart < 0 || matchStart + hitLength > sentence.length) {
    const again = sentence
      .toLowerCase()
      .indexOf(text.slice(hitIndex, hitIndex + hitLength).toLowerCase());
    if (again >= 0) {
      return toResult(sentence, again, hitLength);
    }
    return { text: sentence, html: escapeHtml(sentence) };
  }
  return toResult(sentence, matchStart, hitLength);
}

function windowLength(text: string, spans: Span[], first: number, last: number): number {
  return text.slice(spans[first].start, spans[last].end).trim().length;
}

function toResult(sentence: string, start: number, length: number): UsageResult {
  const before = sentence.slice(0, start);
  const word = sentence.slice(start, start + length);
  const after = sentence.slice(start + length);
  return {
    text: sentence,
    html: `${escapeHtml(before)}<b>${escapeHtml(word)}</b>${escapeHtml(after)}`,
  };
}

function fallback(term: string): UsageResult {
  return { text: term, html: `<b>${escapeHtml(term)}</b>` };
}
