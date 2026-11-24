/**
 * Dictionary loading + lookup order.
 *
 * The StarDict files live in one directory (configurable in preferences):
 *
 *   <dictDir>/oald.idx  oald.dict.dz  [oald.syn]
 *   <dictDir>/ode.idx   ode.dict.dz   [ode.syn]
 *
 * Lookup follows the configured order and stops at the first dictionary that
 * knows the word. Backends are loaded lazily and cached for the session.
 */

import { getPref, log } from "./prefs";
import { DictEntry, DictKind, openStarDict, StarDict } from "./stardict";

interface BackendConfig {
  name: "oald" | "ode";
  kind: DictKind;
  basePath: string;
}

const cache = new Map<string, StarDict | null>();

export class DictionaryChain {
  private backends: BackendConfig[] = [];
  private pending = new Map<string, Promise<StarDict | null>>();

  constructor(dictDir: string, order: string[]) {
    const dir = expandPath(dictDir).replace(/\/+$/, "");
    if (!dir) return;
    for (const raw of order) {
      const name = String(raw).trim().toLowerCase();
      if (name !== "oald" && name !== "ode") {
        if (name) log(`ignoring unknown dictionary "${name}"`);
        continue;
      }
      this.backends.push({
        name,
        kind: name,
        basePath: `${dir}/${name}`,
      });
    }
  }

  get names(): string[] {
    return this.backends.map((backend) => backend.name.toUpperCase());
  }

  /**
   * Look the term up in every configured dictionary and merge the senses.
   *
   * The bundled OALD StarDict only carries one part of speech per headword
   * (e.g. "record" is verb-only, "go" noun-only), so stopping at the first hit
   * can hide the sense the reader actually needs. ODE is richer, so the union
   * gives the LLM a fair choice; the configured order still decides which
   * dictionary supplies the phonetic and leads the sense list.
   */
  async lookup(term: string): Promise<DictEntry | null> {
    let merged: DictEntry | null = null;
    const seen = new Set<string>();

    for (const backend of this.backends) {
      const dictionary = await this.load(backend);
      if (!dictionary) continue;
      const hit = dictionary.lookup(term);
      if (!hit || !hit.senses.length) continue;

      if (!merged) {
        merged = { ...hit, senses: [] };
      } else {
        merged.name = `${merged.name}+${hit.name}`;
      }
      if (!merged.phon) merged.phon = hit.phon;
      if (!merged.pos) merged.pos = hit.pos;
      for (const sense of hit.senses) {
        const key = `${sense.pos}\u0000${sense.gloss}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.senses.push(sense);
      }
    }
    return merged && merged.senses.length ? merged : null;
  }

  private load(backend: BackendConfig): Promise<StarDict | null> {
    const key = backend.basePath;
    if (cache.has(key)) return Promise.resolve(cache.get(key) ?? null);
    let pending = this.pending.get(key);
    if (!pending) {
      pending = loadBackend(backend).then((dictionary) => {
        cache.set(key, dictionary);
        this.pending.delete(key);
        return dictionary;
      });
      this.pending.set(key, pending);
    }
    return pending;
  }
}

export function createDictionaryFromPrefs(): DictionaryChain {
  const dir = String(getPref("dictDir") || "");
  const order = String(getPref("dictOrder") || "oald,ode")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return new DictionaryChain(dir, order);
}

async function loadBackend(backend: BackendConfig): Promise<StarDict | null> {
  const base = backend.basePath;
  try {
    const idx = await readFile(`${base}.idx`);
    const compressed = await readOptionalFile(`${base}.dict.dz`);
    if (!compressed) {
      log(`${backend.name}: missing ${base}.dict.dz`);
      return null;
    }
    const syn = await readOptionalFile(`${base}.syn`);
    const dictionary = await openStarDict(
      backend.name,
      backend.kind,
      idx,
      syn,
      compressed,
    );
    log(
      `${backend.name}: loaded ${dictionary.wordCount} entries from ${base}`,
    );
    return dictionary;
  } catch (error: any) {
    log(`${backend.name}: failed to load (${error?.message ?? error})`);
    return null;
  }
}

async function readOptionalFile(path: string): Promise<Uint8Array | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

async function readFile(path: string): Promise<Uint8Array> {
  if (typeof IOUtils !== "undefined" && IOUtils.read) {
    return IOUtils.read(path);
  }
  // Fallback for older environments; getBinaryContentsAsync returns a
  // binary (Latin-1) string.
  const binary = await Zotero.File.getBinaryContentsAsync(path);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i) & 0xff;
  return out;
}

export function expandPath(path: string): string {
  const value = String(path || "").trim();
  if (!value) return "";
  if (value === "~" || value.startsWith("~/")) {
    const home = homeDirectory();
    if (home) return `${home}/${value.slice(2)}`;
  }
  return value;
}

function homeDirectory(): string {
  try {
    const nsIFile = (globalThis as any).Components?.interfaces?.nsIFile;
    return (Services.dirsvc.get("Home", nsIFile) as any).path;
  } catch {
    return "";
  }
}
