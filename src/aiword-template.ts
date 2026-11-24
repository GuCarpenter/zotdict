/**
 * Fallback definition of the AIWord note type.
 *
 * The plugin prefers the live templates/CSS from Anki (via AnkiConnect), so
 * edits made in Anki's card template editor show up in the popup. These copies
 * are only used to create the model if it does not exist and to render a
 * preview when Anki is unreachable.
 */

export const AIWORD_FIELDS = [
  "Term",
  "Phon",
  "Pos",
  "Usage",
  "Title",
  "Dict",
  "DictDef",
  "AIDef",
];

export const AIWORD_FRONT = `<div class="sheet">
  <div class="headword">{{Term}}</div>
  {{#Usage}}<blockquote class="usage">{{Usage}}</blockquote>{{/Usage}}
  {{#Title}}<div class="source">{{Title}}</div>{{/Title}}
</div>
`;

export const AIWORD_BACK = `<div class="sheet">
  <div class="headword">{{Term}}</div>
  <div class="meta">{{#Phon}}<span class="phon">{{Phon}}</span>{{/Phon}}{{#Pos}}<span class="pos">{{Pos}}</span>{{/Pos}}</div>
  {{#DictDef}}<section class="block dict"><div class="label">Dictionary{{#Dict}} · {{/Dict}}{{Dict}}</div><div class="body">{{DictDef}}</div></section>{{/DictDef}}
  {{#AIDef}}<section class="block ai"><div class="label">AI definition</div><div class="body">{{AIDef}}</div></section>{{/AIDef}}
</div>
`;

export const AIWORD_CSS = `/* ===== AIWord ======================================================= */
.card {
  --page: #f2efe9;
  --card: #fffdf8;
  --ink: #1e2328;
  --muted: #6e7681;
  --line: #e8e3d8;
  --accent: #2f6f5e;
  --accent-soft: #ebf3ef;
  --ai: #7b5cc0;
  --ai-soft: #f4f0fc;
  --shadow: 0 1px 2px rgba(20, 24, 33, .05), 0 12px 32px rgba(20, 24, 33, .08);

  margin: 0;
  padding: 28px 16px 36px;
  background: var(--page);
  color: var(--ink);
  font-family: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
    "Helvetica Neue", Arial, sans-serif;
  font-size: 18px;
  line-height: 1.62;
  text-align: left;
  -webkit-font-smoothing: antialiased;
}

.sheet {
  box-sizing: border-box;
  max-width: 660px;
  margin: 0 auto;
  padding: 32px 36px 30px;
  background: var(--card);
  border: 1px solid var(--line);
  border-radius: 18px;
  box-shadow: var(--shadow);
  animation: aiword-rise .22s ease-out both;
}

@keyframes aiword-rise {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: none; }
}

/* ---- headword ------------------------------------------------------ */
.headword {
  margin: 0;
  font-family: "Iowan Old Style", "Palatino Linotype", Palatino, Georgia,
    "Times New Roman", serif;
  font-size: 42px;
  font-weight: 600;
  line-height: 1.18;
  letter-spacing: -.015em;
  text-align: center;
  overflow-wrap: anywhere;
}

/* ---- front: usage + source ----------------------------------------- */
.usage {
  position: relative;
  margin: 22px 0 0;
  padding: 14px 18px 14px 42px;
  background: var(--accent-soft);
  border-radius: 12px;
  color: var(--ink);
  font-size: 17px;
  font-style: italic;
  line-height: 1.65;
}

.usage::before {
  content: "\\201C";
  position: absolute;
  left: 13px;
  top: 2px;
  font-family: Georgia, "Times New Roman", serif;
  font-size: 40px;
  line-height: 1;
  color: var(--accent);
  opacity: .45;
}

.usage b,
.usage strong {
  font-style: normal;
  font-weight: 600;
  color: var(--accent);
}

.source {
  margin-top: 12px;
  color: var(--muted);
  font-size: 12px;
  letter-spacing: .12em;
  text-align: right;
  text-transform: uppercase;
}

.source::before { content: "\\2014\\00A0"; }

/* ---- back: phonetics + part of speech ------------------------------ */
.meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: 10px;
  margin-top: 12px;
}

.meta:empty { display: none; }

.phon {
  color: var(--accent);
  font-family: "Charis SIL", "Doulos SIL", "Gentium Plus", "Segoe UI", serif;
  font-size: 19px;
  letter-spacing: .01em;
}

.pos {
  display: inline-block;
  padding: 2px 10px;
  background: var(--accent-soft);
  border-radius: 999px;
  color: var(--accent);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: .08em;
  text-transform: uppercase;
}

/* ---- back: definitions --------------------------------------------- */
.block { margin-top: 24px; }

.block .label {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: .14em;
  text-transform: uppercase;
}

.block .label::before {
  content: "";
  flex: none;
  width: 7px;
  height: 7px;
  background: var(--accent);
  border-radius: 50%;
}

.block.ai .label::before { background: var(--ai); }

.block .body { color: var(--ink); }

/* --- dictionary: exactly one sense, picked by the LLM ---------------- */
.block.dict .body {
  padding: 2px 0 2px 14px;
  border-left: 3px solid var(--accent);
  font-size: 18.5px;
}
.block.dict .body ol,
.block.dict .body ul {
  margin: 0;
  padding: 0;
  list-style: none;
}
.block.dict .body li { margin: 0; }
.block.dict .body li + li { margin-top: 6px; }
.block .body p { margin: 0 0 8px; }
.block .body p:last-child { margin-bottom: 0; }
.block .body ol,
.block .body ul { margin: 6px 0; padding-left: 24px; }
.block .body li { margin: 4px 0; }
.block .body b,
.block .body strong { font-weight: 650; }
.block .body i,
.block .body em { color: var(--muted); }

.block.ai .body {
  padding: 12px 16px;
  background: var(--ai-soft);
  border: 1px solid var(--line);
  border-radius: 14px;
}

/* ---- night mode ---------------------------------------------------- */
.nightMode.card,
.nightMode .card {
  --page: #121417;
  --card: #1c1f25;
  --ink: #e7eaef;
  --muted: #98a1ae;
  --line: #2c313a;
  --accent: #6fd3b0;
  --accent-soft: #1b2b27;
  --ai: #b9a4ff;
  --ai-soft: #262032;
  --shadow: 0 1px 2px rgba(0, 0, 0, .4), 0 12px 32px rgba(0, 0, 0, .35);
}

/* ---- small screens ------------------------------------------------- */
@media (max-width: 480px) {
  .card { padding: 16px 10px 24px; }
  .sheet { padding: 22px 20px; border-radius: 14px; }
  .headword { font-size: 34px; }
  .usage { font-size: 16px; }
}
`;
