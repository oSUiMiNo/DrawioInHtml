# PJTガイドライン

## ケース別参照ナレッジ

| 状況 | 参照先 |
|------|--------|
| VSCode WebView 内で Drawio Viewer (viewer-static.min.js) が真っ白／描画されない | `knowledge/drawio-viewer-in-vscode-webview.md` |
| HTML本文プレビュー方式（v0.2.0〜）の CSP / 相対URL変換のハマりどころ | `knowledge/drawio-viewer-in-vscode-webview.md` 末尾 |
| HTML中の `<script type="application/drawio+xml">` の抽出・置換ロジック | `src/htmlPatcher.ts`（保存往復、純粋関数） |
| ユーザHTMLへの CSP/JS 注入と Drawio script の slot 化 | `src/previewHtmlBuilder.ts`（プレビュー構築、純粋関数） |
| プレビューと編集タブの postMessage プロトコル | プラン `~/.claude/plans/warm-swinging-diffie.md` のアーキテクチャ図 |
| VSIX で推移的依存が同梱されずクラッシュ（`Cannot find module 'X'`） | `knowledge/drawio-viewer-in-vscode-webview.md` の `node_modules` 同梱セクション |

## 設計原則

- Drawio エディタ・ビューアー本体は**自作しない**。本家を iframe / 同梱JSとして利用する
- 編集差し戻しは `vscode.WorkspaceEdit` 経由（`fs.writeFile` ではなく）→ undo/redo・dirty管理を VSCode に任せる
- HTMLパースは正規表現ではなく `node-html-parser` ベース＋属性順非依存の置換戦略
- 単一HTMLファイル完結を維持する。Drawio図のXMLは `<script type="application/drawio+xml" data-diagram-id="...">` 内に格納
- **ユーザHTML本文を尊重する**（v0.2.0〜）：拡張側で固定スタイルを `html/body` に当てない、`<style>` の影響範囲はスロット内に限定

## 拡張時の留意点

### Drawio viewer 関連
- viewer-static.min.js を新規Webview に組み込む際は必ず `check-visible-state: false` を渡す（上記ナレッジ参照）

### CSP 設計
- プレビュー側 WebView CSP の必須項目：
  - `script-src ${cspSource} 'unsafe-eval' 'nonce-XXX'`（viewer の動的評価対応）
  - `connect-src ${cspSource} blob: data: https:`（viewer 内部 XHR）
  - `worker-src ${cspSource} blob:`（viewer 内部 Worker）
  - `img-src ${cspSource} https: data: blob:`（外部URL画像と data URI 対応）
  - `style-src ${cspSource} 'unsafe-inline'`（ユーザHTMLの `<style>` 対応）
  - `font-src ${cspSource} data: blob:`（フォント data URI 対応）
- **編集タブ側のみ** `frame-src https://embed.diagrams.net`（プレビュー側は不要）

### VSIX パッケージング
- `.vscodeignore` から `node_modules/**` の除外は**書かない**。`vsce` のデフォルト挙動（`npm list --production` 自動同梱）に任せる
- publish 前に必ず `npx --yes @vscode/vsce ls --tree | grep node_modules` で同梱物を確認

### ユーザHTML受入時の処理（previewHtmlBuilder）
- 既存 `<meta CSP>` は必ず削除して拡張の CSP を強制注入
- `<base>` は viewer の URL 解決を壊すので削除
- `<img>`/`<link>`/`<a>`/`<script src>` の相対パスは `webview.asWebviewUri()` で変換
- `webviewOptions.localResourceRoots` にドキュメントのディレクトリを追加
- インラインスクリプト・外部CSSは動かない仕様。検出時に警告バナーを表示
