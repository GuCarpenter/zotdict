/**
 * StarDict reader (``*.idx`` + ``*.dict.dz`` + optional ``*.syn``), pure JS.
 *
 * Supports the two dictionaries this plugin cares about:
 *   - OALD: ``<div><b>word</b> /phon/ <i>pos</i></div><hr/>…``
 *   - ODE:  headword div, a separate ``<i>pos</i>`` div, then sense divs
 *
 * No Zotero/DOM APIs are used here, so the module is unit-testable in Node.
 * gzip comes from fflate because dictzip files include a gzip FEXTRA header,
 * which fflate skips correctly.
 */

import { gunzipSync } from "fflate";
import { decodeEntities, htmlToText, normalizeSpace } from "./text";

export type DictKind = "oald" | "ode";

export interface DictSense {
  pos: string;
  /** Definition HTML; may contain <i>examples</i>. */
  gloss: string;
  /** Dictionary that supplied this sense ("OALD" / "ODE"). */
  dict: string;
}

export interface DictEntry {
  word: string;
  phon: string;
  pos: string;
  senses: DictSense[];
  /** Which dictionary produced the entry ("OALD" / "ODE"). */
  name: string;
}

interface IdxRecord {
  word: string;
  offset: number;
  size: number;
}

export class StarDict {
  readonly name: string;
  readonly kind: DictKind;

  private records: IdxRecord[] = [];
  private byKey = new Map<string, number[]>();
  private synonyms = new Map<string, number>();
  private data: Uint8Array;

  get wordCount(): number {
    return this.records.length;
  }

  constructor(
    name: string,
    kind: DictKind,
    idx: Uint8Array,
    synonyms: Uint8Array | null,
    data: Uint8Array,
  ) {
    this.name = name.toUpperCase();
    this.kind = kind;
    this.data = data;
    this.loadIndex(idx);
    if (synonyms && synonyms.length) this.loadSynonyms(synonyms);
  }

  lookup(term: string): DictEntry | null {
    for (const candidate of lookupCandidates(term)) {
      const key = candidate.toLowerCase();
      let refs = this.byKey.get(key);
      if (!refs) {
        const ref = this.synonyms.get(key);
        if (ref !== undefined) refs = [ref];
      }
      if (!refs || !refs.length) continue;
      const entry = this.buildEntry(refs);
      if (entry.senses.length) return entry;
    }
    return null;
  }

  private loadIndex(idx: Uint8Array): void {
    const view = new DataView(idx.buffer, idx.byteOffset, idx.byteLength);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j < idx.length && idx[j] !== 0) j++;
      if (j + 9 > idx.length) break;
      const word = utf8Decode(idx.subarray(i, j));
      const offset = view.getUint32(j + 1);
      const size = view.getUint32(j + 5);
      const record: IdxRecord = { word, offset, size };
      const index = this.records.push(record) - 1;
      const key = word.toLowerCase();
      const list = this.byKey.get(key);
      if (list) list.push(index);
      else this.byKey.set(key, [index]);
      i = j + 9;
    }
  }

  private loadSynonyms(syn: Uint8Array): void {
    const view = new DataView(syn.buffer, syn.byteOffset, syn.byteLength);
    let i = 0;
    while (i < syn.length) {
      let j = i;
      while (j < syn.length && syn[j] !== 0) j++;
      if (j + 5 > syn.length) break;
      const word = utf8Decode(syn.subarray(i, j)).toLowerCase();
      const ref = view.getUint32(j + 1);
      if (ref < this.records.length) this.synonyms.set(word, ref);
      i = j + 5;
    }
  }

  private buildEntry(refs: number[]): DictEntry {
    const first = this.records[refs[0]];
    const entry: DictEntry = {
      word: first.word,
      phon: "",
      pos: "",
      senses: [],
      name: this.name,
    };
    const seen = new Set<string>();
    for (const ref of refs) {
      const record = this.records[ref];
      const html = utf8Decode(
        this.data.subarray(record.offset, record.offset + record.size),
      );
      const parsed =
        this.kind === "oald" ? parseOaldEntry(html) : parseOdeEntry(html);
      if (!entry.phon && parsed.phon) entry.phon = parsed.phon;
      if (!entry.pos && parsed.pos) entry.pos = parsed.pos;
      for (const sense of parsed.senses) {
        const key = `${sense.pos}\u0000${sense.gloss}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entry.senses.push({ ...sense, dict: this.name });
      }
    }
    return entry;
  }
}

/** Decompress a dictzip/dict.dz payload. */
export async function openStarDict(
  name: string,
  kind: DictKind,
  idx: Uint8Array,
  synonyms: Uint8Array | null,
  dictDz: Uint8Array,
): Promise<StarDict> {
  const data = gunzipSync(dictDz);
  return new StarDict(name, kind, idx, synonyms, data);
}

function parseOaldEntry(html: string): {
  phon: string;
  pos: string;
  senses: Omit<DictSense, "dict">[];
} {
  const hr = html.search(/<hr\b/i);
  const header = hr >= 0 ? html.slice(0, hr) : html;
  const body = hr >= 0 ? html.slice(html.indexOf(">", hr) + 1) : "";

  const phonMatch = header.match(/\/[^/<>]+\//);
  const phon = phonMatch ? decodeEntities(phonMatch[0]).trim() : "";
  const posMatch = header.match(/<i>([^<]+)<\/i>/);
  const pos = posMatch ? normalizeSpace(decodeEntities(posMatch[1])) : "";

  const senses: Omit<DictSense, "dict">[] = [];
  const divRe = /<div\b[^>]*>([\s\S]*?)<\/div>/gi;
  let match: RegExpExecArray | null;
  while ((match = divRe.exec(body))) {
    const gloss = cleanGloss(match[1]);
    if (gloss) senses.push({ pos, gloss });
  }
  return { phon, pos, senses };
}

function parseOdeEntry(html: string): {
  phon: string;
  pos: string;
  senses: Omit<DictSense, "dict">[];
} {
  const phonMatch = html.match(/<span[^>]*>\s*(\/[^<]*\/)\s*<\/span>/i);
  const phon = phonMatch ? decodeEntities(phonMatch[1]).trim() : "";

  let pos = "";
  const senses: Omit<DictSense, "dict">[] = [];
  const divRe = /<div\b[^>]*>([\s\S]*?)<\/div>/gi;
  let match: RegExpExecArray | null;
  let first = true;
  while ((match = divRe.exec(html))) {
    const inner = match[1].trim();
    // The first div is always the headword line, with or without a phonetic.
    if (first && /^<b>/.test(inner)) {
      first = false;
      continue;
    }
    first = false;
    const posMatch = inner.match(/^<i>([a-zA-Z .]+)<\/i>$/);
    if (posMatch) {
      pos = normalizeSpace(decodeEntities(posMatch[1]));
      continue;
    }
    // Headword line in variants where it is not the first div.
    if (
      /<b>/.test(inner) &&
      /<span[^>]*>\s*\/[^<]*\/\s*<\/span>/.test(inner)
    ) {
      continue;
    }
    const gloss = cleanGloss(inner);
    if (gloss) senses.push({ pos, gloss });
  }
  return { phon, pos, senses };
}

function cleanGloss(inner: string): string {
  const gloss = String(inner || "")
    .replace(/^\s*<b>\s*\d+(?:\.\d+)*\.?\s*<\/b>\s*/i, "")
    .trim();
  if (!gloss) return "";
  return htmlToText(gloss) ? gloss : "";
}

/** Cheap morphological reductions, ported from the anki-dict project. */
export function lookupCandidates(term: string): string[] {
  const base = normalizeSpace(term)
    .replace(/^[\s"'`\u201c\u201d\u2018\u2019([{<]+/, "")
    .replace(/[\s"'`\u201c\u201d\u2018\u2019)\]}>,.;:!?]+$/, "");
  if (!base) return [];
  const out: string[] = [];
  const add = (value: string) => {
    if (value && !out.some((item) => item.toLowerCase() === value.toLowerCase())) {
      out.push(value);
    }
  };
  add(base);
  add(base.toLowerCase());
  // possessives: "Tolkien's" -> "Tolkien"
  const possessive = base.replace(/[\u2019']s$/i, "");
  if (possessive !== base) add(possessive);

  if (/\s/.test(base)) {
    // Phrases: only exact / lowercase / possessive variants.
    return out;
  }

  const word = base.toLowerCase();
  for (const candidate of suffixCandidates(word)) {
    add(candidate);
    add(decodeEntities(candidate));
  }
  return out;
}

function suffixCandidates(w: string): string[] {
  const out: string[] = [];
  const add = (value: string) => {
    if (value && value !== w && !out.includes(value)) out.push(value);
  };
  if (w.endsWith("ies") && w.length > 4) add(w.slice(0, -3) + "y");
  if (w.endsWith("es") && w.length > 3) add(w.slice(0, -2));
  if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) add(w.slice(0, -1));
  if (w.endsWith("ied") && w.length > 4) add(w.slice(0, -3) + "y");
  if (w.endsWith("ed") && w.length > 3) {
    add(w.slice(0, -2));
    add(w.slice(0, -1));
    if (w.length > 4 && w[w.length - 3] === w[w.length - 4]) {
      add(w.slice(0, -3));
    }
  }
  if (w.endsWith("ing") && w.length > 4) {
    add(w.slice(0, -3));
    add(w.slice(0, -3) + "e");
    if (w.length > 5 && w[w.length - 4] === w[w.length - 5]) {
      add(w.slice(0, -4));
    }
  }
  if (w.endsWith("ly") && w.length > 3) add(w.slice(0, -2));
  if (w.endsWith("er") && w.length > 3) {
    add(w.slice(0, -2));
    add(w.slice(0, -1));
  }
  if (w.endsWith("est") && w.length > 4) {
    add(w.slice(0, -3));
    add(w.slice(0, -2));
  }
  return out;
}

/**
 * Minimal UTF-8 decoder. Avoids relying on TextDecoder being present in the
 * plugin sandbox; the byte streams here are small and valid.
 */
export function utf8Decode(bytes: Uint8Array): string {
  let out = "";
  let i = 0;
  while (i < bytes.length) {
    const b0 = bytes[i++];
    if (b0 < 0x80) {
      out += String.fromCharCode(b0);
    } else if (b0 < 0xe0) {
      const b1 = bytes[i++] ?? 0;
      out += String.fromCharCode(((b0 & 0x1f) << 6) | (b1 & 0x3f));
    } else if (b0 < 0xf0) {
      const b1 = bytes[i++] ?? 0;
      const b2 = bytes[i++] ?? 0;
      out += String.fromCharCode(
        ((b0 & 0x0f) << 12) | ((b1 & 0x3f) << 6) | (b2 & 0x3f),
      );
    } else {
      const b1 = bytes[i++] ?? 0;
      const b2 = bytes[i++] ?? 0;
      const b3 = bytes[i++] ?? 0;
      let code =
        ((b0 & 0x07) << 18) |
        ((b1 & 0x3f) << 12) |
        ((b2 & 0x3f) << 6) |
        (b3 & 0x3f);
      code -= 0x10000;
      out += String.fromCharCode(
        0xd800 + (code >> 10),
        0xdc00 + (code & 0x3ff),
      );
    }
  }
  return out;
}
