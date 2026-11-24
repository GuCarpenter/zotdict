/**
 * Build the AIWord fields: pick one dictionary sense with the LLM, then write
 * the in-context AI definition. The returned fields map 1:1 onto the note type
 * created in Anki:
 *
 *   Term, Phon, Pos, Usage, Title, DictDef, AIDef
 */

import { marked } from "marked";
import { getPref, log } from "./prefs";
import { DictEntry, DictSense } from "./stardict";
import { escapeHtml, htmlToText, normalizeSpace, sanitizeHtml } from "./text";
import { UsageResult } from "./sentence";

export interface AiWordInput {
  /** The selection as it appears in the text. */
  term: string;
  usage: UsageResult;
  title: string;
  entry: DictEntry | null;
}

export interface AiWordResult {
  fields: Record<string, string>;
  entry: DictEntry | null;
  senseIndex: number;
  warning: string;
  aiPlainText: string;
}

interface LlmAnswer {
  sense_index?: unknown;
  definition?: unknown;
  aid?: unknown;
  phon?: unknown;
  pos?: unknown;
}

export async function makeAiWord(input: AiWordInput): Promise<AiWordResult> {
  const senses = input.entry?.senses ?? [];
  const targetLang = String(getPref("targetLang") || "English").trim() || "English";

  let answer: LlmAnswer | null = null;
  let warning = "";
  try {
    answer = await askLlm(input, senses, targetLang);
  } catch (error: any) {
    warning = `AI lookup failed: ${error?.message ?? error}`;
    log(warning);
  }

  const senseIndex = pickSenseIndex(answer?.sense_index, senses.length);
  const chosen: DictSense | null = senses[senseIndex] ?? null;

  let aiDef = "";
  if (answer?.aid) {
    aiDef = enforceAiLength(
      sanitizeHtml(markdownToHtml(String(answer.aid))).trim(),
    );
  }

  let dictDef = chosen?.gloss ?? "";
  if (!dictDef && answer?.definition) {
    dictDef = sanitizeHtml(markdownToHtml(String(answer.definition))).trim();
  }

  const dictName =
    chosen?.dict || (chosen ? input.entry?.name || "" : dictDef ? "LLM" : "");

  const fields: Record<string, string> = {
    Term: escapeHtml(normalizeSpace(input.entry?.word || input.term)),
    Phon: escapeHtml(
      normalizeSpace(input.entry?.phon || String(answer?.phon || "")),
    ),
    Pos: escapeHtml(
      normalizeSpace(chosen?.pos || input.entry?.pos || String(answer?.pos || "")),
    ),
    Usage: input.usage.html,
    Title: escapeHtml(normalizeSpace(input.title)),
    Dict: escapeHtml(dictName),
    DictDef: dictDef.trim(),
    AIDef: aiDef,
  };

  return {
    fields,
    entry: input.entry,
    senseIndex,
    warning,
    aiPlainText: htmlToText(aiDef) || htmlToText(dictDef),
  };
}

function pickSenseIndex(raw: unknown, count: number): number {
  const parsed = Number.parseInt(String(raw ?? 0), 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed >= count) return 0;
  return parsed;
}

/** Keep the AI explanation card-sized even when the model ignores the limit. */
function enforceAiLength(html: string, maxWords = 40): string {
  const plain = htmlToText(html);
  if (!plain) return html;
  const words = plain.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return html;

  const sentences = plain.match(/[^.!?]+[.!?]+/g) ?? [];
  let shortened = "";
  for (const sentence of sentences) {
    const candidate = shortened ? `${shortened} ${sentence.trim()}` : sentence.trim();
    if (candidate.split(/\s+/).filter(Boolean).length > maxWords) break;
    shortened = candidate;
  }
  if (!shortened) {
    shortened = words.slice(0, maxWords).join(" ") + "\u2026";
  }
  return `<p>${escapeHtml(shortened)}</p>`;
}

function markdownToHtml(text: string): string {
  try {
    return marked.parse(text, { async: false }) as string;
  } catch {
    return text;
  }
}

async function askLlm(
  input: AiWordInput,
  senses: DictSense[],
  targetLang: string,
): Promise<LlmAnswer> {
  const baseURL = String(getPref("baseURL") || "").replace(/\/+$/, "");
  const apiKey = getPref("apiKey");
  const model = getPref("model");
  if (!baseURL) throw new Error("Base URL is not configured");
  if (!apiKey) {
    throw new Error("API key is not configured (see Zotdict preferences)");
  }

  const withSenses = senses.length > 0;
  const system = buildSystemPrompt(withSenses, targetLang);
  const user = buildUserPrompt(input, senses);

  const body = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.3,
    stream: false,
  };

  let xhr: any;
  try {
    xhr = await Zotero.HTTP.request("POST", `${baseURL}/chat/completions`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(body),
      responseType: "json",
      timeout: 90000,
    });
  } catch (error: any) {
    throw new Error(`request failed (${error?.message ?? error})`);
  }

  let data: any = xhr.response;
  if (typeof data === "string") data = JSON.parse(data);
  const content =
    data?.choices?.[0]?.message?.content ??
    data?.choices?.[0]?.text ??
    null;
  if (!content) throw new Error("empty response from the model");
  return parseJsonAnswer(String(content));
}

function buildSystemPrompt(withSenses: boolean, targetLang: string): string {
  const style = String(
    getPref("cardPrompt") ||
      "You are a precise lexicographer helping build vocabulary flashcards. " +
        "Explain the term as it is used in the given sentence.",
  ).trim();

  const schema = withSenses
    ? `{"sense_index": 0, "aid": "<html>", "phon": "<ipa>", "pos": "<part of speech>"}`
    : `{"definition": "<html>", "aid": "<html>", "phon": "<ipa>", "pos": "<part of speech>"}`;

  return `${style}

You always answer in ${targetLang}. If an instruction above conflicts with the
output format below, the output format wins.

Return ONLY a JSON object, with no markdown fences and no commentary:
${schema}

Rules:
${
  withSenses
    ? "- sense_index: choose EXACTLY ONE entry from SENSES that best matches how the term is used in USAGE. It must be the index of the single most suitable sense.\n"
    : "- definition: one dictionary-style definition of the term for this context, as clean HTML (no markdown).\n"
}- aid: ONE short sentence (max 25 words), or two very short sentences only when necessary (max 35 words total). Explain what the term means AS USED IN THIS SENTENCE, including connotation or register when useful. Do not restate the dictionary definition, do not give examples, do not repeat the headword. Clean HTML only, no markdown, no labels.
- phon: IPA transcription in slashes, or "" if unknown.
- pos: part of speech (e.g. noun, verb, adjective), or "".`;
}

function buildUserPrompt(input: AiWordInput, senses: DictSense[]): string {
  const lines = [
    `TERM: ${input.term}`,
    `USAGE: ${input.usage.text}`,
    `TITLE: ${input.title}`,
  ];
  if (senses.length) {
    const listing = senses
      .slice(0, 100)
      .map((sense, index) => {
        const gloss = htmlToText(sense.gloss).slice(0, 400);
        return sense.pos
          ? `[${index}] (${sense.pos}) ${gloss}`
          : `[${index}] ${gloss}`;
      })
      .join("\n");
    lines.push(`SENSES:\n${listing}`);
  } else {
    lines.push("SENSES: (the term was not found in the local dictionaries)");
  }
  return lines.join("\n");
}

function parseJsonAnswer(text: string): LlmAnswer {
  const cleaned = text
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("the model did not return JSON");
  }
  return JSON.parse(cleaned.slice(start, end + 1));
}
