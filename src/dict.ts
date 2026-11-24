import { config } from "../package.json";
import { makeAiWord } from "./aiword";
import {
  annotationTag,
  rememberAnnotationNote,
} from "./annotation-sync";
import { AnkiClient } from "./anki";
import { AIWORD_BACK, AIWORD_CSS } from "./aiword-template";
import { createDictionaryFromPrefs } from "./dictionary";
import { getPref, log } from "./prefs";
import { cleanSelection, extractUsage } from "./sentence";
import {
  htmlToText,
  normalizeSpace,
  renderTemplate,
  sanitizeCss,
} from "./text";

export function onRenderTextSelectionPopup(event: any): void {
  const { reader, doc, params, append } = event;
  const annotation = params && params.annotation;
  const selectedText: string | undefined = annotation && annotation.text;
  if (!selectedText || !selectedText.trim()) {
    return;
  }

  const container = doc.createElement("div");
  container.style.cssText =
    "display:flex;flex-direction:column;gap:6px;padding:4px 2px;";

  const button = doc.createElement("button");
  button.textContent = "Zotdict";
  button.className = "toolbar-button wide-button";
  button.style.cssText = "cursor:pointer;";

  container.append(button);
  append(container);

  button.addEventListener("click", async () => {
    button.disabled = true;
    const originalLabel = button.textContent;
    button.textContent = "Looking up…";
    try {
      await handleLookup(reader, annotation, selectedText);
    } catch (error: any) {
      log(`lookup failed: ${error?.message ?? error}`);
      showPopup(reader, normalizeSpace(selectedText), {
        html: "",
        css: "",
        status: `Error: ${error?.message ?? String(error)}`,
        statusKind: "error",
      });
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });
}

async function handleLookup(
  reader: any,
  annotation: any,
  selectedText: string,
): Promise<void> {
  const term = cleanSelection(selectedText);
  const attachment = reader && reader._item;
  const pageIndex = annotation?.position?.pageIndex;
  const minChars = numberPref("minSentenceChars", 60);

  let fullText = "";
  if (attachment) {
    try {
      fullText = await attachment.attachmentText;
    } catch (error: any) {
      log(`could not read attachment text: ${error?.message ?? error}`);
    }
  }

  const usage = extractUsage(fullText, term, pageIndex, minChars);
  const title = documentTitle(attachment);

  const dictionary = createDictionaryFromPrefs();
  const entry = await dictionary.lookup(term);

  const result = await makeAiWord({ term, usage, title, entry });

  const willAnnotate = Boolean(getPref("autoAnnotate") && annotation);
  const annotationKey = willAnnotate ? generateKey() : "";
  let addedNoteId: number | null = null;

  const status: string[] = [];
  let statusKind: "ok" | "warn" | "error" = "ok";

  const anki = new AnkiClient();
  let template = { back: AIWORD_BACK, css: AIWORD_CSS };
  const hasDefinition = Boolean(result.fields.DictDef || result.fields.AIDef);
  if (getPref("ankiEnabled") && !hasDefinition) {
    status.push("Nothing to save \u2014 dictionary and AI lookups both failed");
    statusKind = "error";
  } else if (getPref("ankiEnabled")) {
    let reachable = false;
    try {
      await anki.ensureDeck();
      reachable = true;
      await anki.ensureModel();
      const added = await anki.addNote(
        result.fields,
        annotationKey ? [annotationTag(annotationKey)] : [],
      );
      if (!added.duplicate) addedNoteId = added.noteId;
      if (added.duplicate) {
        status.push(`Already in Anki \u00b7 ${anki.deck}`);
        statusKind = "warn";
      } else {
        status.push(`Added to Anki \u00b7 ${anki.deck}`);
      }
    } catch (error: any) {
      status.push(`Anki: ${error?.message ?? error}`);
      statusKind = "error";
    }
    if (reachable) {
      try {
        template = await anki.getTemplate();
      } catch (error: any) {
        log(`template unavailable: ${error?.message ?? error}`);
      }
    }
  } else {
    status.push("Anki sync is off \u2014 preview only");
    statusKind = "warn";
  }

  if (result.warning) {
    status.push(result.warning);
    if (statusKind === "ok") statusKind = "warn";
  }

  const cardHtml = renderTemplate(template.back, result.fields);
  showPopup(reader, term || result.fields.Term, {
    html: cardHtml,
    css: sanitizeCss(template.css),
    status: status.join(" \u00b7 "),
    statusKind,
  });

  if (willAnnotate) {
    try {
      const comment =
        result.aiPlainText ||
        htmlToText(result.fields.DictDef) ||
        usage.text ||
        result.fields.Term;
      await createAnnotation(reader, annotation, comment, annotationKey);
      if (addedNoteId) rememberAnnotationNote(annotationKey, addedNoteId);
    } catch (error: any) {
      log(`auto-annotate failed: ${error?.message ?? error}`);
    }
  }
}

interface PopupContent {
  html: string;
  css: string;
  status: string;
  statusKind: "ok" | "warn" | "error";
}

function showPopup(reader: any, term: string, content: PopupContent): void {
  const win =
    (reader && reader._window) ||
    Zotero.getMainWindow() ||
    Services.wm.getMostRecentWindow("navigator:browser");
  if (!win) {
    log("no window to show popup");
    return;
  }
  const popup = win.openDialog(
    `chrome://${config.addonRef}/content/popup.xhtml`,
    "zotdict-popup",
    "chrome,titlebar,resizable,centerscreen,dialog=no,alwaysRaised=yes,width=580,height=720",
    { term, ...content },
  );
  addon.data.popupWin = popup;
  try {
    popup?.focus();
  } catch (error: any) {
    log(`popup focus failed: ${error?.message ?? error}`);
  }
}

function documentTitle(attachment: any): string {
  if (!attachment) return "";
  try {
    const parent = attachment.parentItem;
    if (parent) {
      const title = parent.getField("title");
      if (title) return normalizeSpace(title);
    }
  } catch {
    // fall through to the attachment title
  }
  try {
    return normalizeSpace(attachment.getField("title") || "")
      .replace(/\.(pdf|epub|djvu|txt|html?)$/i, "")
      .trim();
  } catch {
    return "";
  }
}

function numberPref(key: string, fallback: number): number {
  const value = parseInt(getPref(key), 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function generateKey(): string {
  return (Zotero as any).DataObjectUtilities.generateKey();
}

async function createAnnotation(
  reader: any,
  annotation: any,
  comment: string,
  key: string,
): Promise<void> {
  const attachment = reader && reader._item;
  if (!attachment) throw new Error("No attachment for reader");

  let type = annotation.type || "highlight";
  if (!["highlight", "underline"].includes(type)) {
    type = "highlight";
  }

  const json = {
    key: key || generateKey(),
    type,
    text: annotation.text || "",
    comment,
    color: getPref("annotationColor") || annotation.color || "#5fb236",
    pageLabel: annotation.pageLabel || "",
    sortIndex: annotation.sortIndex,
    position: annotation.position,
    tags: [],
  };

  await (Zotero as any).Annotations.saveFromJSON(attachment, json);
}
