# Changelog

All notable changes to this extension are documented here.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.5.2] - 2026-05-19

### Changed
- README.md and README.ja.md now embed two demo GIFs (edit flow + window-width resize) so visitors can see the extension in action before installing. The GIFs live under `docs/img/` and are excluded from the `.vsix` package — Marketplace pulls them from the GitHub repository instead.

## [0.5.1] - 2026-05-19

### Changed
- README.md is now a full English user guide (was an English stub pointing at the Japanese version). Mirrors the structure and depth of README.ja.md so Marketplace visitors get the full picture without switching languages.
- README_DEV.html (developer documentation) remains Japanese-only; an English translation is on the roadmap.

## [0.5.0] - 2026-05-18

### Breaking
- **Extension-only markers are no longer recognized.** Starting in v0.5, the only supported marker is `<script type="application/xml" id="X">` whose body starts with `<mxfile>` or `<mxGraphModel>` — the standard HTML5 inline-data pattern that browsers ignore and user-side JS can read via `document.getElementById('X').textContent`.
- The previous `<script type="application/xml" data-drawio-id="X">` (extension-only attribute) and `<script type="application/drawio+xml" data-diagram-id="X">` (v0.2.x legacy marker) are now ignored. Existing files written in those forms will show no Drawio diagram in the preview until they are migrated.

### Migration
- Replace `data-drawio-id="X"` or `data-diagram-id="X"` with `id="X"`. The diagram XML body (`<mxfile>...</mxfile>` or `<mxGraphModel>...</mxGraphModel>`) is unchanged.
- For files that also want to render in a plain browser, pair the script with a user-side `<div class="mxgraph">` host plus a CDN-loaded `viewer-static.min.js` and a small mount script. The bundled `README_DEV.html` is an example.

### Changed
- `src/htmlPatcher.ts` and `src/previewHtmlBuilder.ts` simplified — only one pattern to maintain.
- `README_DEV.html` showcase rewrites the embedded architecture diagram to the new portable form, so the diagram now renders in a plain browser too.

## [0.4.0] - 2026-05-18

### Changed
- **Internationalized for a global audience.** README is now English-first, with a Japanese version available as `README.ja.md` / `README.ja.html`. All in-product strings (button tooltips, status messages, panel titles, warning banner) are now in English.
- **Icon-only overlay buttons.** The hover overlay now shows just 🔍 (toggle fullscreen) and ✏️ (edit) — the prior `🔍 拡大` / `✏️ 編集` text has been removed. `aria-label` attributes provide accessible names.
- Extension `description` and command `title` in `package.json` are now in English.

### Notes
- No functional behavior changes beyond the strings and labels.

## [0.3.6] - 2026-05-18

### Added
- **Drawio render follows the dark theme.** When VSCode (or `prefers-color-scheme`) is dark, the viewer is invoked with `dark-mode: true`, so the SVG background also turns dark.

### Changed
- `media/preview.css`: `.drawio-slot` background changed from `white` to `transparent`. The slot now blends into the user's HTML body (which follows the VSCode theme by default, or honors a user-specified `<style>`).
- The empty-diagram placeholder and the fullscreen background were updated likewise (transparent / `var(--vscode-editor-background)`), so the slot does not flash white in dark mode.

## [0.3.5] - 2026-05-18

### Reverted
- Reverted the v0.3.4 change that set `auto-crop: false`. The earlier edge-label regression was a misidentification — v0.3.3 was actually fine. `auto-crop: false` had a real downside: it falls back to the page dimensions, producing huge whitespace for small diagrams.

## [0.3.4] - 2026-05-18

### Fixed
- **Edge labels overlapping nodes:** with `auto-crop: true` the viewer cropped to the element bbox, pushing edge labels outside the bbox so they overlapped element bodies. Switched to `auto-crop: false` (page-size based) so edge labels stay between elements.

## [0.3.3] - 2026-05-18

### Fixed
- **Double-load of viewer-static.min.js:** when the user HTML already loaded the viewer from a CDN, the bundled copy and the CDN copy raced in `processElements`, leaving the diagram tiny and dropping the edit overlay. The preview now strips any `<script src=".../viewer-static.min.js">` from the user DOM (the source HTML is left untouched).
- **More robust CSS isolation:** the v0.3.2 `display: revert !important` trick did not work consistently across all Chromium builds. `preview.js` now adds a dedicated `drawio-rendered` class to its render target, and the injected CSS uses `.mxgraph:not(.drawio-rendered) { display: none !important; }` for strict separation.

### Compatibility
- "Self-mount" patterns like `Test.html` (CDN viewer + user `mountDrawio` + `<script type="application/xml" id="X">`) now work **without any HTML edits**, with the extension providing rich rendering and the edit overlay.

## [0.3.2] - 2026-05-18

### Added
- **Recognize `id`-only markers:** `<script type="application/xml" id="X">` whose body starts with `<mxfile>` or `<mxGraphModel>` is now treated as Drawio, so the extension's rich rendering and edit overlay apply.
- Re-introduced CSS that hides the user's own `<div class="mxgraph">` / `<div class="drawio-host">`, but scoped strictly so `.drawio-slot` contents are not affected.

### Fixed
- v0.3.1 regression: the generic "self-mount" pattern (id attribute, no extension-specific marker) was not recognized by the extension, so only the user's own render path ran and rich features were lost.

### Compatibility
- All three of the following are now first-class:
  - `<script type="application/xml" data-drawio-id="X">XML</script>` (v0.3 recommended)
  - `<script type="application/xml" id="X">XML</script>` (generic self-mount, body must look like Drawio)
  - `<script type="application/drawio+xml" data-diagram-id="X">XML</script>` (v0.2.x legacy)

## [0.3.1] - 2026-05-18

### Fixed
- v0.3.0 introduced a CSS rule that hid user-owned `<div class="mxgraph">` — but it also hit the `<div class="mxgraph">` that `preview.js` creates inside its slots, causing "diagram is tiny / no edit button". The hiding CSS was removed; the extension always provides the rendering, so users no longer need to write a parallel self-mount path.
- `sample/portable-example.html` simplified to the marker-only pattern.

## [0.3.0] - 2026-05-18

### Added
- **New marker `<script type="application/xml" data-drawio-id="X">XML</script>`.** Uses a standards-compliant HTML type that browsers safely ignore, so users can combine it with a regular CDN viewer pattern.
- **Auto-hide of user-owned `<div class="mxgraph">`** in the extension, so opening with the preview shows only the rich render (no double render).
- New sample `sample/portable-example.html` demonstrating the dual-mode pattern.

### Changed
- `htmlPatcher.extractDrawioBlocks` returns both new and legacy markers, distinguished by `DrawioBlock.marker: 'new' | 'old'`.
- `replaceDrawioXml` accepts both marker forms.

### Compatibility
- The legacy marker (`application/drawio+xml` + `data-diagram-id`) keeps full render-and-edit support. No breaking changes.

## [0.2.3] - 2026-05-18

### Added
- **Allow inline scripts and external CDN scripts** (CSP relaxed). Mermaid and other CDN-loaded libraries inside the HTML now run during preview.
- External stylesheets (`<link rel="stylesheet" href="...">`) are now loaded too.

### Changed
- CSP gains `'unsafe-inline'` and `https:`. The nonce attribute was dropped on purpose (per CSP3, nonce + `'unsafe-inline'` makes nonce win, blocking user inline scripts).
- The "inline scripts won't run" / "external CSS won't load" warning banner was removed.

### Security
- ⚠️ **Trade-off:** JavaScript inside the previewed HTML now **runs as-is**. Untrusted HTML (from the web, from third parties) can execute arbitrary client-side behavior (exfiltration, DOM hijack, etc.). **Only preview HTML you wrote yourself or trust.** See the Security notice in the README.

## [0.2.2] - 2026-05-18

### Added
- **Theme follow-through:** the preview automatically follows the VSCode dark/light theme. If the user HTML explicitly sets `body { background: ... }`, that value is preserved (no forced override).
- **Auto-add `<meta name="color-scheme">`** when missing (so scrollbars and form controls follow the theme).
- **Command `drawioInHtml.openPreview`:** one-click open from Explorer context menu, editor tab context menu, command palette, or `Ctrl+Shift+V` (Mac: `Cmd+Shift+V`).
- **Default-editor path:** VSCode's `workbench.editorAssociations` can be used to make `.html` open by default in Drawio HTML Editor (documented in the README).

### Changed
- `previewHtmlBuilder` injects `preview.css` immediately after the CSP meta (before the user's `<style>`), so user CSS wins at equal specificity.

## [0.2.1] - 2026-05-18

### Fixed
- Opening a `<script type="application/drawio+xml">` whose XML contains HTML entities (`&lt;`, `&quot;`, `&gt;`, ...) failed with "Unescaped '<' not allowed in attribute values" in the editor tab.
  Root cause: `htmlPatcher.extractDrawioBlocks` read XML via `node-html-parser`'s `el.text`, which decodes HTML entities, so values like `value="...&lt;script&gt;..."` arrived at Drawio's XML parser as `value="...<script>..."`. Switched to `el.rawText` to preserve the original string.

## [0.2.0] - 2026-05-18

### Added
- **HTML body preview.** The user's HTML body (headings, paragraphs, tables, images, links) is rendered as-is in the WebView, with embedded `<script type="application/drawio+xml">` rendered **inline at the original location** as Drawio SVG. Same idea as Markdown preview, but for HTML.
- **Relative-path images.** `<img src="./icon.png">` etc. are auto-rewritten via `webview.asWebviewUri()`, so same-folder images render.
- **Warning banner** for unsupported features (inline scripts, external CSS).
- New `src/previewHtmlBuilder.ts`: HTML parse / CSP inject / slot replacement / relative-URL rewrite (pure function).

### Changed
- Preview WebView no longer shows "just the diagrams" — it shows the full HTML body with inline Drawio.
- `media/preview.css`: removed global `html/body` styles (so user HTML look is preserved), scope reduced to `.drawio-slot`.
- `media/preview.js` reworked around `.drawio-slot` (the fixed `#diagrams` slot is gone).

### Limitations
- User inline `<script>...</script>` and external `<script src>` do not run because of CSP. (Lifted in v0.2.3.)
- External `<link rel="stylesheet">` does not load. (Lifted in v0.2.3.)
- Use inline `<style>...</style>` instead.

## [0.1.1] - 2026-05-18

### Fixed
- Fixed extension activation failure (`Cannot find module 'he'`). `.vscodeignore` had excluded all of `node_modules/**`, so transitive deps of `node-html-parser` (`he`, `css-select`, `entities`, ...) were not bundled. Switched to the `vsce` default behavior (`npm list --production`-based bundling).

## [0.1.0] - 2026-05-18

### Added
- Initial release.
- Custom Text Editor: reads HTML files and renders each `<script type="application/drawio+xml" data-diagram-id="...">XML</script>` as a static SVG inside VSCode.
- Per-diagram **✏️ Edit** button. Click opens the official Drawio editor (`embed.diagrams.net`) in a side tab.
- On save in the editor, the matching `<script>` body is rewritten and the HTML file is auto-saved.
- **🔍 Fullscreen** button per diagram.
- Multiple diagrams per HTML supported; each editable independently.
- Red banner warning for `<script type="application/drawio+xml">` without `data-diagram-id`.
- `ResizeObserver` re-renders on container width changes.
