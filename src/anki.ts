/**
 * Tiny AnkiConnect client.
 *
 * AnkiConnect exposes a JSON-RPC-ish HTTP API on http://127.0.0.1:8765 while
 * Anki is running. We use it to make sure the AIWord note type and deck exist,
 * add one note, and read the live card template so the popup can show exactly
 * the back side Anki will display.
 */

import { getPref, log } from "./prefs";
import {
  AIWORD_BACK,
  AIWORD_CSS,
  AIWORD_FIELDS,
  AIWORD_FRONT,
} from "./aiword-template";

export interface AnkiTemplate {
  back: string;
  css: string;
}

export interface AddResult {
  noteId: number | null;
  duplicate: boolean;
}

interface ClientConfig {
  url: string;
  deck: string;
  model: string;
  tags: string[];
}

export class AnkiClient {
  private config: ClientConfig;
  private templatePromise: Promise<AnkiTemplate> | null = null;

  constructor(config?: Partial<ClientConfig>) {
    this.config = {
      url: String(getPref("ankiConnectURL") || "http://127.0.0.1:8765"),
      deck: String(getPref("ankiDeck") || "EnglishWords2w"),
      model: String(getPref("ankiModel") || "AIWord"),
      tags: String(getPref("ankiTags") || "zotdict")
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      ...config,
    };
  }

  get deck(): string {
    return this.config.deck;
  }

  get model(): string {
    return this.config.model;
  }

  async ping(): Promise<number> {
    return this.invoke("version");
  }

  async ensureDeck(): Promise<void> {
    await this.invoke("createDeck", { deck: this.config.deck });
  }

  async ensureModel(): Promise<void> {
    const names: string[] = (await this.invoke("modelNames")) || [];
    if (names.includes(this.config.model)) return;
    log(`creating note type ${this.config.model}`);
    await this.invoke("createModel", {
      modelName: this.config.model,
      inOrderFields: AIWORD_FIELDS,
      css: AIWORD_CSS,
      cardTemplates: [
        {
          Name: "Recognition",
          Front: AIWORD_FRONT,
          Back: AIWORD_BACK,
        },
      ],
    });
  }

  async addNote(
    fields: Record<string, string>,
    extraTags: string[] = [],
  ): Promise<AddResult> {
    try {
      const noteId: number = await this.invoke("addNote", {
        note: {
          deckName: this.config.deck,
          modelName: this.config.model,
          fields,
          tags: [...this.config.tags, ...extraTags],
          options: { allowDuplicate: false },
        },
      });
      return { noteId, duplicate: false };
    } catch (error: any) {
      if (/duplicate/i.test(String(error?.message ?? error))) {
        return { noteId: null, duplicate: true };
      }
      throw error;
    }
  }

  async deleteNotes(notes: number[]): Promise<void> {
    if (!notes.length) return;
    await this.invoke("deleteNotes", { notes });
  }

  /** Live back template + CSS from Anki, with a bundled fallback. */
  getTemplate(): Promise<AnkiTemplate> {
    if (!this.templatePromise) {
      this.templatePromise = this.loadTemplate().catch((error: any) => {
        log(`could not read card template from Anki: ${error?.message ?? error}`);
        return { back: AIWORD_BACK, css: AIWORD_CSS };
      });
    }
    return this.templatePromise;
  }

  private async loadTemplate(): Promise<AnkiTemplate> {
    const templates: Record<string, { Front: string; Back: string }> =
      await this.invoke("modelTemplates", { modelName: this.config.model });
    const styling: { css: string } = await this.invoke("modelStyling", {
      modelName: this.config.model,
    });
    const template =
      templates["Recognition"] ?? templates[Object.keys(templates)[0]];
    if (!template) throw new Error("note type has no card template");
    return {
      back: template.Back || AIWORD_BACK,
      css: styling?.css || AIWORD_CSS,
    };
  }

  private async invoke(action: string, params: Record<string, unknown> = {}): Promise<any> {
    const body = JSON.stringify({ action, version: 6, params });
    let payload: any;
    try {
      const xhr = await Zotero.HTTP.request("POST", this.config.url, {
        body,
        headers: { "Content-Type": "application/json" },
        responseType: "json",
        timeout: 30000,
      });
      payload = xhr.response;
      if (typeof payload === "string") payload = JSON.parse(payload);
    } catch (error: any) {
      throw new Error(
        `AnkiConnect is unreachable at ${this.config.url} (${error?.message ?? error})`,
      );
    }
    if (!payload) throw new Error("Empty response from AnkiConnect");
    if (payload.error) throw new Error(String(payload.error));
    return payload.result;
  }
}
