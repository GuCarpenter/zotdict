# Zotdict

A Zotero reader plugin: select a word or phrase, click the **Zotdict** button in
the text-selection popup, and get an LLM-generated explanation of its meaning in
context. Optionally save the explanation as the annotation's comment.

## Features

- Adds a **Zotdict** button to the reader's text-selection popup.
- Sends the selected term plus surrounding document context to an
  OpenAI-compatible chat completions endpoint.
- Renders the Markdown answer in a popup window.
- Optional auto-annotation: save the explanation as a highlight comment in a
  configurable color.

## Configuration

Open **Zotero → Settings → Zotdict**:

| Setting              | Default                                  |
| -------------------- | ---------------------------------------- |
| Base URL             | `https://oneapi-comate.baidu-int.com/v1` |
| API Key              | _(required)_                             |
| Model                | `glm-5.3-flash`                          |
| Answer language      | `English`                                |
| Context characters   | `400`                                    |
| Auto-save annotation | off                                      |
| Annotation color     | `#5fb236`                                |
| System prompt        | dictionary-style prompt                  |

The endpoint must implement the OpenAI `POST {baseURL}/chat/completions` API.

## Development

```bash
npm install
npm start        # launch Zotero with the plugin loaded (live reload)
npm run build    # produce .scaffold/build/zotdict.xpi and typecheck
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
