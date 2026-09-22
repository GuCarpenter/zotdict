import { config } from "../package.json";
import { marked } from "marked";

function getPref(key: string): any {
  return Zotero.Prefs.get(`${config.prefsPrefix}.${key}`, true);
}

function log(msg: string): void {
  Zotero.debug(`${config.addonName}: ${msg}`);
}

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
    button.textContent = "Querying…";
    try {
      const context = await getContext(reader, selectedText);
      const explanation = await query(selectedText, context);
      showPopup(reader, selectedText, explanation);

      if (getPref("autoAnnotate")) {
        try {
          await createAnnotation(reader, annotation, explanation);
        } catch (e: any) {
          log(`auto-annotate failed: ${e}`);
        }
      }
    } catch (e: any) {
      log(`query failed: ${e}`);
      showPopup(reader, selectedText, `Error: ${e?.message ?? String(e)}`);
    } finally {
      button.disabled = false;
      button.textContent = originalLabel;
    }
  });
}

function showPopup(reader: any, term: string, text: string): void {
  const win =
    (reader && reader._window) ||
    Zotero.getMainWindow() ||
    Services.wm.getMostRecentWindow("navigator:browser");
  if (!win) {
    log("no window to show popup");
    return;
  }
  let html: string;
  try {
    html = marked.parse(text, { async: false }) as string;
  } catch (e) {
    log(`markdown render failed: ${e}`);
    html = "";
  }
  const popup = win.openDialog(
    `chrome://${config.addonRef}/content/popup.xhtml`,
    "zotdict-popup",
    "chrome,titlebar,resizable,centerscreen,dialog=no,alwaysRaised=yes,width=480,height=380",
    { term, text, html },
  );
  // Hold a reference so the window is not garbage-collected, and bring it forward.
  addon.data.popupWin = popup;
  try {
    popup?.focus();
  } catch (e) {
    log(`popup focus failed: ${e}`);
  }
}

async function getContext(reader: any, selectedText: string): Promise<string> {
  let chars = parseInt(getPref("contextChars"), 10);
  if (!chars || chars < 0) chars = 400;
  if (chars === 0) return "";

  const attachment = reader && reader._item;
  if (!attachment) return "";

  let full: string;
  try {
    full = await attachment.attachmentText;
  } catch (e) {
    log(`could not read attachment text: ${e}`);
    return "";
  }
  if (!full) return "";

  const flatFull = full.replace(/\s+/g, " ");
  const flatText = selectedText.replace(/\s+/g, " ").trim();
  const idx = flatFull.indexOf(flatText);
  if (idx === -1) return "";

  const start = Math.max(0, idx - chars);
  const end = Math.min(flatFull.length, idx + flatText.length + chars);
  return flatFull.slice(start, end).trim();
}

async function query(term: string, context: string): Promise<string> {
  const baseURL = String(getPref("baseURL") || "").replace(/\/+$/, "");
  const apiKey = getPref("apiKey");
  const model = getPref("model");
  const systemPrompt = getPref("systemPrompt");
  const targetLang = getPref("targetLang");

  if (!baseURL) throw new Error("Base URL is not configured");
  if (!apiKey) {
    throw new Error("API key is not configured (see Zotdict preferences)");
  }

  const userContent =
    `Target language: ${targetLang}\n\n` +
    `Selected term: ${term}\n\n` +
    (context ? `Context:\n${context}` : "Context: (none available)");

  const body = {
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userContent },
    ],
    temperature: 0.3,
    stream: false,
  };

  const xhr = await Zotero.HTTP.request("POST", `${baseURL}/chat/completions`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    responseType: "json",
    timeout: 60000,
  });

  let data: any = xhr.response;
  if (typeof data === "string") {
    data = JSON.parse(data);
  }
  const content =
    data && data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : null;
  if (!content) {
    throw new Error("Empty response from model");
  }
  return String(content).trim();
}

async function createAnnotation(
  reader: any,
  annotation: any,
  comment: string,
): Promise<void> {
  const attachment = reader && reader._item;
  if (!attachment) throw new Error("No attachment for reader");

  let type = annotation.type || "highlight";
  if (!["highlight", "underline"].includes(type)) {
    type = "highlight";
  }

  const json = {
    key: (Zotero as any).DataObjectUtilities.generateKey(),
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
