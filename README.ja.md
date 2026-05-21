# Drawio in HTML

[English](./README.md) | **日本語**

[![Version](https://img.shields.io/visual-studio-marketplace/v/Maku.drawio-in-html)](https://marketplace.visualstudio.com/items?itemName=Maku.drawio-in-html)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![GitHub](https://img.shields.io/badge/GitHub-source-blue?logo=github)](https://github.com/oSUiMiNo/DrawioInHtml)

VSCode 上で HTML ファイルをプレビューしつつ、HTML 内に埋め込まれた Drawio 図をその場で表示・編集できる拡張機能。編集結果は同じ HTML ファイルに自動保存されるので、**1つのファイルで文書も図も完結**します。

## できること

- HTML 文書（見出し・段落・表・画像）がそのままプレビュー表示される
- HTML に埋め込んだ Drawio 図がインラインで描画される
- 図にマウスを乗せると **🔍**（拡大）と **✏️**（編集）が出る
- ✏️ を押すと Drawio 公式エディタが横に開いて編集できる
- 保存すると元の HTML が自動で更新される
- 1つの HTML に複数の図を入れて、それぞれ独立に編集できる
- VSCode のテーマ（ダーク/ライト）に自動追従
- ウィンドウ幅に合わせて図のサイズが自動で伸縮する

### 編集デモ

![Drawio 編集デモ](docs/img/drawio-edit-demo.gif)

### 伸縮デモ（ウィンドウ幅に追従）

![Drawio 伸縮デモ](docs/img/drawio-resize-demo.gif)

## 必要環境

- VSCode 1.85.0 以降
- 図を**編集する時のみ**インターネット接続が必要（プレビューはオフラインで動作）

## インストール

VSCode の拡張機能タブで `drawio-in-html` を検索して Install。または：

```sh
code --install-extension Maku.drawio-in-html
```

## HTML への埋め込み方

本拡張機能は **2 種類の埋め込み形式**を認識します。どちらでも同じ図が描画されます。
以下の例はどれも下のような「A → B」の 2 ノードの図を描画します：

```
┌───┐      ┌───┐
│ A │ ───▶ │ B │
└───┘      └───┘
```

### A. シンプル形式（id 属性付き script）

```html
<script type="application/xml" id="hello">
<mxfile>
  <diagram name="hello" id="hello">
    <mxGraphModel>
      <root>
        <mxCell id="0" />
        <mxCell id="1" parent="0" />
        <mxCell id="A" value="A" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;" vertex="1" parent="1">
          <mxGeometry x="40" y="40" width="80" height="40" as="geometry" />
        </mxCell>
        <mxCell id="B" value="B" style="rounded=0;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;" vertex="1" parent="1">
          <mxGeometry x="200" y="40" width="80" height="40" as="geometry" />
        </mxCell>
        <mxCell id="AB" edge="1" parent="1" source="A" target="B" style="endArrow=classic;html=1;">
          <mxGeometry relative="1" as="geometry" />
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
</script>
```

- HTML5 標準の「インラインデータブロック」用法そのもの。ブラウザは中身を無視するので副作用なし
- `id` の値は同じ HTML ファイル内でユニークに
- まずは適当な `id` で空の `<script>` タグを置き、✏️ から Drawio エディタで描き始めるのが楽
- ブラウザでも図を表示したい場合は同じ `id` を読み出す自前マウントを追加（[開発者向けドキュメント](./README.dev.html) 参照）

### B. Drawio 公式エクスポート形式（mxgraph div）

```html
<div class="mxgraph" data-mxgraph='{"xml":"<mxfile><diagram name=\"hello\" id=\"hello\"><mxGraphModel><root><mxCell id=\"0\"/><mxCell id=\"1\" parent=\"0\"/><mxCell id=\"A\" value=\"A\" style=\"rounded=0;whiteSpace=wrap;html=1;fillColor=#dae8fc;strokeColor=#6c8ebf;\" vertex=\"1\" parent=\"1\"><mxGeometry x=\"40\" y=\"40\" width=\"80\" height=\"40\" as=\"geometry\"/></mxCell><mxCell id=\"B\" value=\"B\" style=\"rounded=0;whiteSpace=wrap;html=1;fillColor=#d5e8d4;strokeColor=#82b366;\" vertex=\"1\" parent=\"1\"><mxGeometry x=\"200\" y=\"40\" width=\"80\" height=\"40\" as=\"geometry\"/></mxCell><mxCell id=\"AB\" edge=\"1\" parent=\"1\" source=\"A\" target=\"B\" style=\"endArrow=classic;html=1;\"><mxGeometry relative=\"1\" as=\"geometry\"/></mxCell></root></mxGraphModel></diagram></mxfile>"}'></div>
<script src="https://viewer.diagrams.net/js/viewer-static.min.js"></script>
```

- Drawio の「Extras → Edit Diagram → Publish → HTML」または「Embed → HTML」がそのまま出力するフォーマット
- XML はホスト div の `data-mxgraph` 属性内に JSON 文字列として埋め込まれる（XML 中の `"` は `\"` でエスケープ）
- **ブラウザでも本拡張機能でも、何の手直しもなく描画＆編集できる**
- 識別子は div の `id` 属性。無ければ HTML 内の出現順で自動的に `drawio-mxgraph-1`, `drawio-mxgraph-2` … が割り当てられる
- Drawio 公式ツールで作った HTML をそのまま VSCode で開けるのが利点

## 操作

| やりたいこと | やり方 |
|---|---|
| プレビューで開く（ショートカット） | `Ctrl+Shift+V`（Mac: `Cmd+Shift+V`） |
| プレビューで開く（右クリック） | エクスプローラまたはエディタタブで右クリック → **Drawio in HTML: Open Preview** |
| プレビューで開く（その他） | 右クリック → Open With → Drawio HTML Editor |
| 図を拡大 | 図にホバー → 🔍 |
| 拡大解除 | `ESC` または ✕ |
| 図を編集 | 図にホバー → ✏️ |
| 編集を保存 | Drawio エディタ左上の 💾 ← HTML ファイルにも自動保存される |
| 通常の HTML 編集に戻す | プレビュータブを閉じてダブルクリックで開き直す |

### `.html` のデフォルトを Drawio プレビューにする（任意）

ダブルクリックで常にこのプレビューを使いたい場合、VSCode の `settings.json` に：

```json
"workbench.editorAssociations": {
  "*.html": "drawioInHtml.editor"
}
```

を追加してください。元に戻したい時はこの設定を削除します。

## テーマ

- VSCode のダーク/ライトテーマに自動追従します。
- HTML の `<style>` で背景色などを指定している場合は、ユーザ指定が優先されます。

## ⚠️ セキュリティに関する注意

このプレビューは、HTML の中に書かれた **JavaScript をそのまま実行します**（Mermaid などの CDN ライブラリを動かすため）。

そのため、**他人が作った HTML やネットで拾った HTML をプレビューで開くと、その中の JavaScript が動いて以下のようなことが起きる可能性**があります：

- 知らないサイトに勝手にアクセスする
- 個人情報を外部に送信する
- ブラウザ操作を乗っ取る（いわゆる XSS）

**安全に使うには：**

- 基本的に **自分で書いた HTML だけ** を開いてください
- 信頼できない HTML は、通常のテキストエディタで中身を確認してから開いてください

ブラウザで HTML を開くのと同じレベルのリスクがあると考えてください。「VSCode のプレビューだから安全」ということはありません。

## 開発者の方へ

拡張機能の内部構造・コントリビュート方法は [README.dev.html](./README.dev.html) を参照してください（VSCode で本拡張機能を使って開くと、アーキテクチャ図も Drawio で描画されます）。

## ライセンス・クレジット

- 同梱している `viewer-static.min.js` は [drawio (jgraph/drawio)](https://github.com/jgraph/drawio) のものです
- 編集機能は [embed.diagrams.net](https://embed.diagrams.net/) を iframe で利用しています
- ソースコードは MIT ライセンス — [LICENSE](./LICENSE) 参照
