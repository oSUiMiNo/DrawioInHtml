# Drawio in HTML

単一のHTMLファイル内に埋め込んだDrawio図を、VSCode上で**静的SVGとして閲覧**し、**必要な時だけ別タブで編集**して同じHTMLに保存できる拡張機能。

## できること

- HTMLの中に `<script type="application/drawio+xml" data-diagram-id="...">XML</script>` という形でDrawio図を埋め込む
- VSCodeでHTMLを「Open With → Drawio HTML Editor」で開くと、各図が**SVGとして静的に表示**される（閲覧用、軽快）
- 各図カードの「✏️ 編集」ボタンを押すと、右側に編集タブが開き、Drawio公式エディタで編集できる
- Drawio内で保存すると、元のHTMLファイル内の該当 `<script>` タグの中身だけが書き換わる
- 1つのHTMLに複数のDrawio図を埋め込んでも、それぞれ独立して編集できる

## 必要環境

- VSCode 1.85.0 以降
- インターネット接続（**編集時**のみ、`embed.diagrams.net` から Drawio エディタを読み込むため）
- プレビュー（閲覧）はオフラインで動く（Drawioビューアーは拡張に同梱）

## セットアップと起動

1. このフォルダで `npm install`
   - postinstall フックで `media/viewer-static.min.js`（約3.8MB）が自動ダウンロードされる
   - ダウンロードに失敗した場合は手動で `https://viewer.diagrams.net/js/viewer-static.min.js` を `media/` に配置
2. VSCodeで本フォルダを開いて `F5`
3. Extension Development Host が起動するので、`sample/demo.html` を右クリック → Open With → Drawio HTML Editor

## アーキテクチャ

```
[VSCode]
 ├─ プレビュータブ（CustomTextEditor）        ← 閲覧専用・静的SVG表示
 │   └─ 各図カード + 「✏️ 編集」ボタン
 │       └─ クリック → 別タブを開く要求を拡張本体へ
 │
 └─ 編集タブ（WebviewPanel, ViewColumn.Beside） ← 1図1タブ
     └─ Drawio公式エディタ (embed.diagrams.net) iframe
         └─ 保存 → 拡張本体 → HTML内の該当<script>を書き換え
```

## ファイル構成

- `src/extension.ts` – 拡張のエントリポイント
- `src/editorProvider.ts` – プレビュー用 CustomTextEditorProvider
- `src/editorPanelManager.ts` – 編集タブのライフサイクル管理
- `src/htmlPatcher.ts` – HTML中の `<script>` タグの抽出/置換
- `media/preview.js` / `preview.css` – プレビュー用WebView
- `media/editor.js` / `editor.css` – 編集タブ用WebView
- `media/viewer-static.min.js` – Drawio公式ビューアーJS（自動取得）
- `scripts/fetch-viewer.js` – ビューアー初回ダウンロード用
- `sample/demo.html` – 動作確認用サンプル

## 制約

- 編集対象になるのは `data-diagram-id` 属性を持つ `<script type="application/drawio+xml">` のみ
- 1つのHTML内で `diagram-id` は一意であること
