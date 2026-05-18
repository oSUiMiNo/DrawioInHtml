# Drawio in HTML

**English** | [日本語](./README.ja.md)

[![Version](https://img.shields.io/visual-studio-marketplace/v/Maku.drawio-in-html)](https://marketplace.visualstudio.com/items?itemName=Maku.drawio-in-html)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-source-blue?logo=github)](https://github.com/oSUiMiNo/DrawioInHtml)

A VSCode extension that **previews HTML files in place** while rendering embedded `<script type="application/xml" data-drawio-id="...">` blocks as **inline Drawio SVG diagrams**. When you need to edit a diagram, a side tab opens the official Drawio editor; saving writes the result back into the **same HTML file** — single-file delivery is preserved.

## What you get

- Right-click an HTML file → **Open With → Drawio HTML Editor** to render the document body (headings, paragraphs, tables, images, links) as a live preview.
- Any `<script type="application/xml" data-drawio-id="...">XML</script>` inside the HTML is rendered **in place** as an SVG diagram.
- Hovering a diagram reveals an overlay in the top-right with two icon-only buttons:
  - 🔍 **Toggle fullscreen** — expands the diagram (ESC or ✕ to exit).
  - ✏️ **Edit** — opens a side tab with the official Drawio editor.
- Saving in the Drawio editor (💾) rewrites just the matching `<script>` body and **auto-saves the HTML file** to disk.
- Multiple diagrams per HTML file are supported, each editable independently.
- Relative-path images (`<img src="./img.png">`) inside the same folder render correctly.
- Follows the VSCode color theme; user-specified `body { background: ... }` is preserved.

## Requirements

- VSCode 1.85.0 or later.
- Internet access **only while editing** (the editor side tab loads `embed.diagrams.net`).
- Preview itself runs offline — the Drawio viewer is bundled with the extension.

## Install

### A. From the VSCode Marketplace (recommended)

Open the Extensions side bar in VSCode, search for `drawio-in-html`, click Install. Or:

```sh
code --install-extension Maku.drawio-in-html
```

### B. From source

```sh
git clone https://github.com/oSUiMiNo/DrawioInHtml.git
cd DrawioInHtml
npm install            # postinstall downloads viewer-static.min.js (~3.6 MB)
npm run compile
# Open the folder in VSCode and press F5 (launches the Extension Development Host)
```

## How to embed diagrams in HTML

### A. Extension-only (VSCode-first, minimal markup)

```html
<script type="application/xml" data-drawio-id="architecture">
<mxGraphModel>
  <root>
    <mxCell id="0"/>
    <mxCell id="1" parent="0"/>
    <mxCell id="2" value="API" style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="1">
      <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>
</script>
```

- VSCode + this extension: rich rendering and edit button.
- Plain browser: `type="application/xml"` is ignored by the browser, so nothing is drawn.

### B. Portable (also renders in a plain browser, recommended)

If you also want the diagram to render in a regular browser, load `viewer-static.min.js` from the Drawio CDN and provide your own `<div class="mxgraph">` alongside the extension marker. The browser draws via the user-side viewer, while the extension hides the duplicate and renders its own rich version.

```html
<script src="https://viewer.diagrams.net/js/viewer-static.min.js"></script>
<div class="mxgraph" data-mxgraph='{"xml":"...","toolbar":null}'></div>
<script type="application/xml" data-drawio-id="architecture">
<mxGraphModel>...same XML as above...</mxGraphModel>
</script>
```

Inside VSCode, the user-provided `<div class="mxgraph">` is hidden automatically and the extension's rich render takes over.

### C. Legacy format (v0.2.x compatibility, still supported)

```html
<script type="application/drawio+xml" data-diagram-id="architecture">
<mxGraphModel>...</mxGraphModel>
</script>
```

Pre-v0.3 marker. Both render and edit still work, but `type="application/drawio+xml"` is extension-specific and a plain browser will ignore it.

### Rules

- The diagram identifier must be **unique within the same HTML file**
  (`data-drawio-id` for A/B, `data-diagram-id` for C).
- The XML can be either `<mxGraphModel>...</mxGraphModel>` or `<mxfile><diagram><mxGraphModel>...</mxGraphModel></diagram></mxfile>`.
- After you save once from the Drawio editor, the block is normalized to `<mxfile>` form.

## Usage

| Action | How |
|------|------|
| Open preview (shortcut) | `Ctrl+Shift+V` (Mac: `Cmd+Shift+V`) |
| Open preview (context menu) | Right-click in Explorer or on the editor tab → **Drawio in HTML: Open Preview** |
| Open preview (Open With) | Right-click → Open With → Drawio HTML Editor |
| Toggle fullscreen | Hover a diagram → 🔍 |
| Exit fullscreen | ESC or ✕ |
| Edit a diagram | Hover a diagram → ✏️ |
| Save edits | Drawio's save button (💾) — the HTML file is updated on disk automatically |
| Back to plain HTML editing | Close the tab, then open the HTML file again with the normal text editor |

### Make Drawio the default editor for `.html` (optional)

To open every `.html` file with this preview on double-click, add the following to your VSCode `settings.json`:

```json
"workbench.editorAssociations": {
  "*.html": "drawioInHtml.editor"
}
```

Remove the entry (or change it to `"default"`) to undo.

### Themes

- The preview automatically follows VSCode's dark/light theme.
- If the user HTML's `<style>` sets `body { background: ... }` (or similar), the user-specified value is preserved (no forced override).
- Drawio's SVG also follows the theme: in dark mode the viewer is rendered with `dark-mode: true`.

## Architecture overview

```
[VSCode]
 ├─ Preview tab (CustomTextEditor)         ← HTML body + inline Drawio
 │   └─ Webview "preview"
 │        ├─ Renders the user's HTML body verbatim (head/body preserved)
 │        ├─ Injects <meta CSP>, preview.css, viewer-static.min.js, preview.js
 │        ├─ Replaces Drawio <script> with <div class="drawio-slot">
 │        ├─ Rewrites relative URLs (img/link/a/...) via webview.asWebviewUri()
 │        └─ Renders viewer SVG inside each slot; overlay icons on hover
 │              └─ Click → postMessage to extension host
 │
 └─ Editor tab (WebviewPanel, ViewColumn.Beside)   ← one tab per diagram
     └─ Webview "editor"
          └─ embed.diagrams.net iframe (official Drawio)
                └─ Save event → postMessage XML to extension host
                      └─ htmlPatcher rewrites the matching <script>
                            └─ doc.save() persists to disk
```

## File layout

| Path | Purpose |
|------|------|
| `src/extension.ts` | Extension entry point |
| `src/editorProvider.ts` | Preview-side CustomTextEditorProvider |
| `src/previewHtmlBuilder.ts` | Inject CSP/JS into user HTML, replace Drawio scripts with slots, rewrite relative URLs (pure function) |
| `src/editorPanelManager.ts` | Lifecycle of editor side tabs |
| `src/htmlPatcher.ts` | Extract/replace `<script>` bodies in HTML (pure function, used during save) |
| `media/preview.js` / `preview.css` | Preview-side WebView (slot rendering, hover overlay, fullscreen) |
| `media/editor.js` / `editor.css` | Editor-side WebView (bridges to embed.diagrams.net) |
| `media/viewer-static.min.js` | Official Drawio viewer (downloaded by postinstall) |
| `scripts/fetch-viewer.js` | Downloads viewer-static.min.js |

## Troubleshooting

### A Drawio diagram is blank

- `viewer-static.min.js` may not have been downloaded. Run `npm install` again and confirm that `media/viewer-static.min.js` exists.
- Check the **Output panel → "Drawio HTML"** for error messages.

### "Open With" does not list "Drawio HTML Editor"

- The file may have been opened with the default editor. Use `Ctrl+Shift+P` → **Reopen Editor With...** to switch.
- Confirm that the extension is installed and enabled.

### The Drawio editor side tab is blank

- Check your internet connection — the editor loads `embed.diagrams.net` online.
- Corporate proxies may block this; ask your admin to allow `embed.diagrams.net`.

### The HTML tab shows the "dirty" indicator after saving from Drawio

- Auto-save should fire, but transient failures are logged in the Output panel.
- A manual `Ctrl+S` always reliably persists the file.

## Limitations

- The editor recognizes `<script type="application/xml" data-drawio-id="X">` (recommended),
  `<script type="application/xml" id="X">` whose body starts with `<mxfile>`/`<mxGraphModel>`,
  and `<script type="application/drawio+xml" data-diagram-id="X">` (legacy).
- Identifiers must be unique within a single HTML file.
- Editing requires an internet connection (the editor itself is `embed.diagrams.net`).

## ⚠️ Security notice

Starting in v0.2.3, the preview **runs JavaScript that is written inside the HTML**. This is required so that user-side libraries (Mermaid, Drawio, etc.) loaded from CDNs can run.

That convenience has a trade-off: if you open someone else's HTML — or any HTML you found on the web — its scripts will run inside the preview and could:

- Make outbound requests to arbitrary sites
- Send local data to external endpoints
- Hijack DOM behavior (the XSS class of attack)

### To stay safe

- Only open **HTML you wrote yourself** in this preview.
- For HTML from untrusted sources, **inspect the source first** in the normal text editor before previewing.
- Treat this preview as if you were opening the HTML in a regular browser. There is no extra sandbox.

## License & credits

- The bundled `viewer-static.min.js` ships from [drawio (jgraph/drawio)](https://github.com/jgraph/drawio).
- Editing uses [embed.diagrams.net](https://embed.diagrams.net/) inside an iframe.
- Source code is MIT licensed — see [LICENSE](./LICENSE).
