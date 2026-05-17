# PJTガイドライン

## ケース別参照ナレッジ

| 状況 | 参照先 |
|------|--------|
| VSCode WebView 内で Drawio Viewer (viewer-static.min.js) が真っ白／描画されない | `knowledge/drawio-viewer-in-vscode-webview.md` |
| HTML中の `<script type="application/drawio+xml">` の抽出・置換ロジック | `src/htmlPatcher.ts`（純粋関数） |
| プレビューと編集タブの postMessage プロトコル | プラン `~/.claude/plans/warm-swinging-diffie.md` のアーキテクチャ図 |

## 設計原則

- Drawio エディタ・ビューアー本体は**自作しない**。本家を iframe / 同梱JSとして利用する
- 編集差し戻しは `vscode.WorkspaceEdit` 経由（`fs.writeFile` ではなく）→ undo/redo・dirty管理を VSCode に任せる
- HTMLパースは正規表現ではなく `node-html-parser` ベース＋属性順非依存の置換戦略
- 単一HTMLファイル完結を維持する。Drawio図のXMLは `<script type="application/drawio+xml" data-diagram-id="...">` 内に格納

## 拡張時の留意点

- viewer-static.min.js を新規Webview に組み込む際は必ず `check-visible-state: false` を渡す（上記ナレッジ参照）
- WebView の CSP は `script-src ... 'unsafe-eval'`、`connect-src ... blob: data:`、`worker-src ... blob:` を含めること（viewer 内部の `new Blob` / XHR 用）
- embed.diagrams.net を使う側の WebView だけ `frame-src https://embed.diagrams.net` を許可。プレビュー側は不要
