# Drawio in HTML

[![Version](https://img.shields.io/visual-studio-marketplace/v/Maku.drawio-in-html)](https://marketplace.visualstudio.com/items?itemName=Maku.drawio-in-html)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-source-blue?logo=github)](https://github.com/oSUiMiNo/DrawioInHtml)

VSCode で HTML ファイルを開くと、**HTML本文をそのままプレビュー表示**しつつ、HTML内に埋め込まれた `<script type="application/drawio+xml">` を**元の位置にインラインで Drawio 図として描画**する拡張機能。必要な時だけ別タブで Drawio エディタを開いて編集でき、**保存先は同じHTMLファイル**で単一HTML完結を維持。

## 何ができる？

- VSCode で対象 HTML を右クリック → **Open With → Drawio HTML Editor** で開くと、**HTML本文（見出し、段落、表、画像、リンク）が普通にプレビュー表示**される
- HTMLの中に `<script type="application/drawio+xml" data-diagram-id="...">XML</script>` を入れておくと、**その位置にインラインで Drawio 図が SVG として描画**される
- 図にマウスホバーで右上にオーバーレイ表示される **「🔍 拡大」「✏️ 編集」** ボタン
  - **拡大**：画面全体に展開（ESC または ✕縮小で戻る）
  - **編集**：右側に編集タブが開き、Drawio 公式エディタで編集できる
- Drawio エディタで保存（💾）すると、元のHTMLの該当 `<script>` の中身だけが書き換わり、**HTMLファイルもディスクに自動保存**される
- 1つのHTMLに複数の Drawio 図を埋め込み可。それぞれ独立して編集できる
- 相対パス画像 `<img src="./img.png">` も同フォルダなら表示可能

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

### A. 拡張専用（VSCode で開く前提、最小記述）

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

- VSCode 拡張で開いた時：本拡張のリッチ描画 + 編集ボタン
- ブラウザで直接開いた時：`type="application/xml"` はブラウザに無視されるので**何も表示されない**

### B. ポータブル（ブラウザでも描画される、推奨）

ブラウザでも図を見たい場合、Drawio 公式 viewer-static.min.js を CDN から読み込んで `<div class="mxgraph">` を自前で書き、加えて拡張が認識するマーカー `<script type="application/xml" data-drawio-id="...">` を併記します。サンプル：`sample/portable-example.html`

```html
<script src="https://viewer.diagrams.net/js/viewer-static.min.js"></script>
<div class="mxgraph" data-mxgraph='{"xml":"...","toolbar":null}'></div>
<script type="application/xml" data-drawio-id="architecture">
<mxGraphModel>...同じ内容のXML...</mxGraphModel>
</script>
```

VSCode 拡張で開いた時は、ユーザ自前の `<div class="mxgraph">` は自動で隠され、拡張のリッチ描画に切り替わります。

### C. 旧形式（v0.2.x 互換、引き続きサポート）

```html
<script type="application/drawio+xml" data-diagram-id="architecture">
<mxGraphModel>...</mxGraphModel>
</script>
```

v0.2.x までのフォーマット。VSCode 拡張で開いた時は描画＋編集ともサポート。ただし `type="application/drawio+xml"` は拡張独自で、ブラウザで直接開いても描画されない。

### 共通の決まり

- 編集対象の識別属性は同一HTML内で**一意**にする（A/Bなら `data-drawio-id="..."`、Cなら `data-diagram-id="..."`）
- XMLは `<mxGraphModel>...</mxGraphModel>` または `<mxfile><diagram><mxGraphModel>...</mxGraphModel></diagram></mxfile>` どちらでもOK
- 一度 Drawio エディタで編集・保存すると `<mxfile>` 形式に統一される

## 操作

| 動作 | 操作 |
|------|------|
| HTMLをプレビュー表示（ショートカット） | `Ctrl+Shift+V`（Mac: `Cmd+Shift+V`） |
| HTMLをプレビュー表示（右クリック） | エクスプローラまたはエディタタブで右クリック → **「Drawio in HTML: プレビューで開く」** |
| HTMLをプレビュー表示（旧来手順） | 右クリック → Open With → Drawio HTML Editor |
| 図を拡大表示 | カードにホバー → 「🔍 拡大」 |
| 拡大解除 | ESC または「✕ 縮小」 |
| 図を編集 | カードにホバー → 「✏️ 編集」 |
| 編集結果を保存 | Drawio画面左上の保存ボタン（💾）← HTMLにも自動保存される |
| 通常のHTML編集に戻す | タブを閉じて、HTMLファイルを通常の Open（ダブルクリック）で開き直す |

### デフォルトプレビューに設定する（任意）

ダブルクリックで常に Drawio プレビューで開きたい場合、VSCode の `settings.json` に下記を追加：

```json
"workbench.editorAssociations": {
  "*.html": "drawioInHtml.editor"
}
```

元に戻したい時は同設定を削除するか、`"default"` に書き換え。

### テーマ（ダーク／ライト）

- VSCode のテーマ設定に**自動追従**
- ユーザHTMLの `<style>` で `body { background: ... }` 等を明示している場合は、ユーザ指定が尊重される（強制上書きはしない）

## アーキテクチャ概略

```
[VSCode]
 ├─ プレビュータブ（CustomTextEditor）           ← HTML本文+Drawioインライン表示
 │   └─ Webview "preview"
 │        ├─ ユーザのHTML本文をベースにレンダリング（<head>/<body> 保持）
 │        ├─ <meta CSP>、preview.css、viewer-static.min.js、preview.js を注入
 │        ├─ <script type="application/drawio+xml"> を <div class="drawio-slot"> に置換
 │        ├─ 相対パスの <img>、<link>、<a> 等を webview.asWebviewUri() で自動変換
 │        └─ slot 内に viewer SVG を生成 / ホバー時オーバーレイ「拡大」「編集」
 │              └─ クリック → 拡張本体へ postMessage
 │
 └─ 編集タブ（WebviewPanel, ViewColumn.Beside）  ← 1図1タブ
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
| `src/previewHtmlBuilder.ts` | ユーザHTMLにCSP/JS注入、Drawio script の slot 化、相対URL変換（純粋関数） |
| `src/editorPanelManager.ts` | 編集タブのライフサイクル管理 |
| `src/htmlPatcher.ts` | HTML内の `<script>` 抽出・置換（保存往復用、純粋関数） |
| `media/preview.js` / `preview.css` | プレビュー側WebView（slot 内 SVG 描画、ホバー、拡大） |
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

- 編集対象は `data-diagram-id` 属性を持つ `<script type="application/drawio+xml">` のみ
- 1つのHTML内で `data-diagram-id` は一意であること
- 編集機能はネット必須（Drawio エディタ本体は本家オンライン版を利用）

## ⚠️ セキュリティに関する注意

**v0.2.3 以降**：このプレビューは HTML の中に書かれた **JavaScript をそのまま実行します**。Mermaid や Drawio などを CDN 経由で使えるようにするための仕様です。

これは便利な反面、**他人が作ったHTMLや、ネットで拾ったHTML** をプレビューで開くと、その中の JavaScript が動いて以下のような望ましくない動作が起きる可能性があります：

- 知らないサイトに勝手にアクセスする
- 個人情報を外部に送信する
- ブラウザ操作を乗っ取る（XSS と呼ばれる類の挙動）

### 安全に使うために

- **自分で書いたHTMLのみ**プレビューで開く
- 信頼できない他人のHTMLは、**通常のテキストエディタ**で中身を確認してから開く
- 心配な時は VSCode の右下「ステータスバー」のテーマ表示などを見て、おかしな動きがないか観察

> 一般のブラウザで HTML を開くのと同じレベルのリスクがあると考えてください。VSCode のプレビューだから安全、ということはありません。

## ライセンス・クレジット

- 内部で利用している `viewer-static.min.js` は [drawio (jgraph/drawio)](https://github.com/jgraph/drawio) のもの
- 編集機能は [embed.diagrams.net](https://embed.diagrams.net/) を iframe で利用
