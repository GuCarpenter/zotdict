# Zotdict

A Zotero reader plugin: select a word or phrase, click **Zotdict** in the
text-selection popup, and the plugin

1. finds the **complete sentence** containing the selection (expanding to the
   previous/next sentence when the sentence is very short),
2. looks the term up in local **OALD** and **ODE** StarDict files (their senses
   are merged, because the bundled OALD only keeps one part of speech per
   headword),
3. asks an LLM to pick the **one dictionary sense** that fits the sentence and
   write a short in-context explanation,
4. creates an **AIWord** note in Anki through AnkiConnect, and
5. shows the rendered **back side of the AIWord card** in a popup.

An optional annotation comment with the AI explanation can also be saved.
Deleting that annotation (or moving it to the trash) also deletes the linked
Anki note.

## How it works

```
selection ─▶ complete sentence ─▶ OALD/ODE lookup ─▶ LLM: pick one sense +
             (Usage)                                  write AIDef
                                                            │
                              ┌─────────────────────────────┘
                              ▼
                    AIWord note via AnkiConnect ─▶ popup shows back template
```

### AIWord note fields

| Field     | Contents                                                        |
| --------- | --------------------------------------------------------------- |
| `Term`    | dictionary headword (or the selection when not in a dictionary) |
| `Phon`    | IPA transcription from the dictionary                           |
| `Pos`     | part of speech of the chosen sense                              |
| `Usage`   | complete sentence(s) with the term highlighted                  |
| `Title`   | title of the parent Zotero item                                 |
| `Dict`    | source of the chosen sense: `OALD`, `ODE`, or `LLM`             |
| `DictDef` | the single dictionary sense chosen by the LLM                   |
| `AIDef`   | in-context AI explanation                                       |

If the `AIWord` note type does not exist, the plugin creates it with a clean,
responsive template (light + dark mode). The popup reads the **live** template
and CSS from Anki, so edits made in Anki's card editor show up immediately.

## Configuration

Open **Zotero → Settings → Zotdict**:

### Language model

| Setting         | Default                                  |
| --------------- | ---------------------------------------- |
| Base URL        | `https://oneapi-comate.baidu-int.com/v1` |
| API Key         | _(required)_                             |
| Model           | `glm-5.3-flash`                          |
| Answer language | `English`                                |
| AI prompt       | lexicographer instructions               |

The endpoint must implement the OpenAI `POST {baseURL}/chat/completions` API.

### Anki

| Setting          | Default                 |
| ---------------- | ----------------------- |
| Create AIWord    | on                      |
| AnkiConnect URL  | `http://127.0.0.1:8765` |
| Deck             | `EnglishWords2w`        |
| Note type        | `AIWord`                |
| Tags             | `zotdict`               |

Anki must be running with the
[AnkiConnect](https://ankiweb.net/shared/info/2055492159) add-on.

### Dictionaries

| Setting             | Default                                                |
| ------------------- | ------------------------------------------------------ |
| StarDict directory  | `/home/anyinlover/Documents/Area/koreader/data/dict`   |
| Lookup order        | `oald,ode`                                             |
| Min. sentence length| `60`                                                   |

The directory must contain StarDict dictionaries named `oald` and/or `ode`:

```
<dictDir>/oald.idx  oald.dict.dz  [oald.syn]
<dictDir>/ode.idx   ode.dict.dz   [ode.syn]
```

Both dictionaries are consulted and their senses are merged before the LLM
picks one; the order decides which dictionary supplies the phonetic and leads
the sense list. `~` in the directory path is expanded to your home directory.
Dictionaries are loaded lazily and cached for the session.

### Annotations

| Setting          | Default   |
| ---------------- | --------- |
| Save AI comment  | off       |
| Annotation color | `#5fb236` |

## Development

```bash
npm install
npm start        # launch Zotero with the plugin loaded (live reload)
npm run build    # build .scaffold/build/zotdict.xpi and typecheck
```

## Release

`npm run release` bumps the version, commits, tags `v<version>` and pushes. The
GitHub Actions release workflow then builds the XPI and publishes it, along with
an `update.json` used for auto-updates.

## Install

Download `zotdict.xpi` from the [latest release](https://github.com/GuCarpenter/zotdict/releases),
then in Zotero: **Tools → Add-ons → gear icon → Install Add-on From File**.

## License

AGPL-3.0-or-later
