# Drawio in HTML

[![Version](https://img.shields.io/visual-studio-marketplace/v/Maku.drawio-in-html)](https://marketplace.visualstudio.com/items?itemName=Maku.drawio-in-html)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-source-blue?logo=github)](https://github.com/oSUiMiNo/DrawioInHtml)

単一のHTMLファイル内に埋め込んだ Drawio 図を、VSCode 上で**静的SVGとして閲覧**し、必要な時だけ**別タブで Drawio エディタを開いて編集**できる拡張機能。**保存先は同じHTMLファイル**で、単一HTML完結を維持。

## 何ができる？

- HTMLの中に `<script type="application/drawio+xml" data-diagram-id="...">XML</script>` の形で Drawio 図を埋め込み
- VSCode で対象 HTML を右クリック → **Open With → Drawio HTML Editor** で開くと、各図が SVG として静的に並ぶ
- マウスホバーで右上にオーバーレイ表示される **「🔍 拡大」「✏️ 編集」** ボタン
  - **拡大**：画面全体に展開（ESC または ✕縮小で戻る）
  - **編集**：右側に編集タブが開き、Drawio 公式エディタで編集できる
- Drawio エディタで保存（💾）すると、元のHTMLの該当 `<script>` の中身だけが書き換わり、**HTMLファイルもディスクに自動保存**される
- 1つのHTMLに複数の Drawio 図を埋め込み可。それぞれ独立して編集できる

## 必要環境

- VSCode 1.85.0 以降
- **編集時のみ**インターネット接続必須（`embed.diagrams.net` から Drawio エディタを読み込む）
- 閲覧（プレビュー）はオフラインで動作（Drawio ビューアーは拡張に同梱）

## インストール

### 方法A: VSCode Marketplace から（推奨）

VSCode 左サイドバーの拡張機能タブを開き、`drawio-in-html` で検索 → Install。
または：

```sh
code --install-extension Maku.drawio-in-html
```

### 方法B: ソースから開発・カスタムビルド

```sh
git clone https://github.com/oSUiMiNo/DrawioInHtml.git
cd DrawioInHtml
npm install           # postinstall で viewer-static.min.js (3.6MB) が自動取得される
npm run compile
# VSCode でフォルダを開いて F5（Extension Development Host が起動）
```

## HTMLへの埋め込み方

```html
<!DOCTYPE html>
<html>
<body>
<h1>システム構成図</h1>

<script type="application/drawio+xml" data-diagram-id="architecture">
<mxGraphModel dx="800" dy="600" grid="1" gridSize="10">
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <mxCell id="2" value="API" style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="1">
      <mxGeometry x="40" y="40" width="120" height="60" as="geometry"/>
    </mxCell>
  </root>
</mxGraphModel>
</script>

<h2>もう1つの図</h2>
<script type="application/drawio+xml" data-diagram-id="flow">
<mxGraphModel>...</mxGraphModel>
</script>
</body>
</html>
```

### 重要な決まり

- 必ず `type="application/drawio+xml"` を指定（これがないと拡張は無視する）
- 必ず `data-diagram-id="一意な名前"` を付ける（同一HTML内で重複不可、欠落していると赤帯警告）
- 中身は `<mxGraphModel>...</mxGraphModel>` の生のXML、または `<mxfile><diagram><mxGraphModel>...</mxGraphModel></diagram></mxfile>` どちらでもOK
- 一度Drawio側で編集して保存すると `<mxfile>` 形式に統一される

## 操作

| 動作 | 操作 |
|------|------|
| HTMLをプレビュー表示 | エクスプローラで右クリック → Open With → Drawio HTML Editor |
| 図を拡大表示 | カードにホバー → 「🔍 拡大」 |
| 拡大解除 | ESC または「✕ 縮小」 |
| 図を編集 | カードにホバー → 「✏️ 編集」 |
| 編集結果を保存 | Drawio画面左上の保存ボタン（💾）← HTMLにも自動保存される |
| 通常のHTML編集に戻す | タブを閉じて、HTMLファイルを通常の Open（ダブルクリック）で開き直す |

## アーキテクチャ概略

```
[VSCode]
 ├─ プレビュータブ（CustomTextEditor）       ← 閲覧専用・静的SVG表示
 │   └─ Webview "preview"
 │        ├─ viewer-static.min.js 同梱読み込み
 │        ├─ 各<script>のXMLを <div class="mxgraph"> に変換しSVG描画
 │        └─ ホバー時に「拡大」「編集」ボタンを overlay 表示
 │              └─ クリック → 拡張本体へ postMessage
 │
 └─ 編集タブ（WebviewPanel, ViewColumn.Beside）← 1図1タブ
     └─ Webview "editor"
          └─ embed.diagrams.net iframe で Drawio 公式エディタ
                └─ 保存時に postMessage で XML を拡張本体へ送る
                      └─ 拡張本体 (htmlPatcher) が <script> の中身を書き換え
                            └─ doc.save() でディスクへ自動保存
```

## ファイル構成

| パス | 役割 |
|------|------|
| `src/extension.ts` | 拡張のエントリポイント |
| `src/editorProvider.ts` | プレビュー用 CustomTextEditorProvider |
| `src/editorPanelManager.ts` | 編集タブのライフサイクル管理 |
| `src/htmlPatcher.ts` | HTML内の `<script>` 抽出・置換の純粋関数 |
| `media/preview.js` / `preview.css` | プレビュー側WebView（SVG描画、ホバー、拡大） |
| `media/editor.js` / `editor.css` | 編集タブ側WebView（Drawioエディタとブリッジ） |
| `media/viewer-static.min.js` | Drawio公式ビューアー（postinstallで自動取得） |
| `scripts/fetch-viewer.js` | viewer-static.min.js を取得するスクリプト |
| `sample/demo.html` | 動作確認用サンプル |

## トラブルシューティング

### Drawio 図が真っ白になる
- viewer-static.min.js が読み込まれていない可能性。`npm install` を再実行して `media/viewer-static.min.js` の存在を確認
- Output panel → "Drawio HTML" にエラーが出ていないか確認

### 「Open With」に Drawio HTML Editor が出てこない
- 通常のHTML扱いのまま開かれている可能性。`Ctrl+Shift+P` → `Reopen Editor With...` でも切替可能
- 拡張機能がインストールされていない／無効化されているか確認

### 編集タブの Drawio が表示されない
- ネット接続を確認（編集タブは `embed.diagrams.net` をオンライン読み込み）
- 企業プロキシ環境ではブロックされる可能性あり

### 編集後にHTML側が dirty マークになるが内容は反映されている
- 自動保存が走っているはずだが、まれに失敗時はOutput panelに警告が出る
- 手動で `Ctrl+S` を押せば確実に永続化

## 制約

- 対象は `data-diagram-id` 属性を持つ `<script type="application/drawio+xml">` のみ
- 1つのHTML内で `data-diagram-id` は一意であること
- 編集機能はネット必須（Drawio エディタ本体は本家オンライン版を利用）

## ライセンス・クレジット

- 内部で利用している `viewer-static.min.js` は [drawio (jgraph/drawio)](https://github.com/jgraph/drawio) のもの
- 編集機能は [embed.diagrams.net](https://embed.diagrams.net/) を iframe で利用
