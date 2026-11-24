/**
 * Link an auto-created Zotero annotation to the Anki note it produced.
 *
 * The mapping is kept in a plugin preference (annotation key -> Anki note id).
 * When the annotation is deleted or moved to the trash, the linked note is
 * removed from Anki as well. Anki notes also carry a `zotdict::<annotationKey>`
 * tag, which makes the link visible/recoverable from Anki's side.
 */

import { config } from "../package.json";
import { AnkiClient } from "./anki";
import { getPref, log } from "./prefs";

const MAP_PREF = "annotationNotes";

type NoteMap = Record<string, number>;

let observerId: string | null = null;
let tail: Promise<void> = Promise.resolve();

export function registerAnnotationSync(): void {
  if (observerId) return;
  observerId = Zotero.Notifier.registerObserver(
    {
      notify: (event, type, ids, extraData) => {
        tail = tail
          .then(() => handleItemEvent(event, type, ids, extraData))
          .catch((error: any) => {
            log(`annotation sync failed: ${error?.message ?? error}`);
          });
        return tail;
      },
    },
    ["item"],
    `${config.addonRef}-annotation-sync`,
  );
}

export function unregisterAnnotationSync(): void {
  if (!observerId) return;
  try {
    Zotero.Notifier.unregisterObserver(observerId);
  } catch (error: any) {
    log(`could not unregister annotation sync: ${error?.message ?? error}`);
  }
  observerId = null;
}

export function rememberAnnotationNote(
  annotationKey: string,
  noteId: number,
): void {
  if (!annotationKey || !noteId) return;
  const map = loadMap();
  map[annotationKey] = noteId;
  saveMap(map);
}

export function annotationTag(annotationKey: string): string {
  return `zotdict::${annotationKey}`;
}

async function handleItemEvent(
  event: string,
  type: string,
  ids: string[] | number[],
  extraData: any,
): Promise<void> {
  if (type !== "item") return;
  if (event !== "delete" && event !== "trash") return;

  const map = loadMap();
  const linked: { key: string; noteId: number }[] = [];
  for (const id of ids) {
    let key: string | undefined =
      extraData && extraData[id] ? extraData[id].key : undefined;
    if (!key) {
      try {
        const item = Zotero.Items.get(Number(id));
        key = item ? item.key : undefined;
      } catch {
        key = undefined;
      }
    }
    if (!key) continue;
    const noteId = map[key];
    if (noteId) linked.push({ key, noteId });
  }
  if (!linked.length) return;

  const anki = new AnkiClient();
  const removed = new Set<string>();
  try {
    await anki.deleteNotes(linked.map((item) => item.noteId));
    for (const item of linked) removed.add(item.key);
    log(
      `removed ${linked.length} Anki note(s) for deleted annotation(s): ` +
        linked.map((item) => item.key).join(", "),
    );
  } catch (error: any) {
    // Leave the mapping in place so a later deletion can retry.
    log(
      `could not remove Anki note(s) ${linked
        .map((item) => item.noteId)
        .join(", ")}: ${error?.message ?? error}`,
    );
  }

  if (removed.size) {
    for (const key of removed) delete map[key];
    saveMap(map);
  }
}

function loadMap(): NoteMap {
  try {
    const raw = getPref(MAP_PREF);
    const parsed = typeof raw === "string" ? JSON.parse(raw || "{}") : raw;
    if (!parsed || typeof parsed !== "object") return {};
    const map: NoteMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      const noteId = Number(value);
      if (key && Number.isFinite(noteId) && noteId > 0) map[key] = noteId;
    }
    return map;
  } catch {
    return {};
  }
}

function saveMap(map: NoteMap): void {
  Zotero.Prefs.set(
    `${config.prefsPrefix}.${MAP_PREF}`,
    JSON.stringify(map),
    true,
  );
}
