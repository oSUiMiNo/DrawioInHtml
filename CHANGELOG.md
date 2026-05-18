# Changelog

本拡張機能のすべての注目すべき変更はこのファイルに記録される。
フォーマットは [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠する。

## [0.3.4] - 2026-05-18

### Fixed
- **エッジラベルが要素に重なる問題**：`auto-crop: true` で要素bboxにきつく crop していたため、エッジ（矢印）のラベルがbbox外に押し出されて要素本体の上に重なって表示されていた。`auto-crop: false` に変更し、ページ寸法ベースの表示に切り替え。エッジラベルが正しく要素間に配置される

## [0.3.3] - 2026-05-18

### Fixed
- **viewer-static.min.js の二重ロード問題**：ユーザHTML が CDN（`<script src="https://viewer.diagrams.net/...">` 等）から viewer をロードしていると、拡張同梱版と二重に動作して `processElements` が競合し、図が小さくしか描画されない／編集ボタンが出ない症状が起きていた。プレビュー時にユーザHTML 内の `viewer-static.min.js` を読む `<script src>` を DOM から削除して回避（ソースHTMLは無変更）
- **CSS 分離の堅牢化**：v0.3.2 の `display: revert !important` トリックが一部 Chromium 環境で期待通り動かないケースに対応。preview.js が生成する拡張描画 `<div class="mxgraph">` に専用クラス `drawio-rendered` を付与し、CSS を `.mxgraph:not(.drawio-rendered) { display: none !important; }` に変更して厳密に分離

### Compatibility
- `Test.html` のような「CDN viewer ロード + 自前 mountDrawio + `<script type="application/xml" id="X">`」パターンが**書き換え不要で**拡張のリッチ描画＋編集ボタン込みで動くようになった

## [0.3.2] - 2026-05-18

### Added
- **id 属性ベースの認識**：`<script type="application/xml" id="X">` 形式（自前 mount JS で id 経由で読み出す一般的な書き方）でも、中身が `<mxfile>` または `<mxGraphModel>` で始まる場合は Drawio として認識し、拡張のリッチ描画＋編集機能を提供
- ユーザ自前の `<div class="mxgraph">` / `<div class="drawio-host">` を非表示にする CSS を再導入。スコープを `.drawio-slot` 内は除外する形に厳密化したため、拡張描画の slot 内 mxgraph は表示される

### Fixed
- v0.3.1 で問題報告：「Test.html のような id 属性ベースの一般的な書き方」が拡張に認識されず、ユーザ自前の通常描画だけ動いてリッチ機能が活かされない不具合を解消

### Compatibility
- これでユーザは以下3パターンのどれを書いても拡張のリッチ描画＋編集が動く：
  - `<script type="application/xml" data-drawio-id="X">XML</script>` （v0.3 推奨）
  - `<script type="application/xml" id="X">XML</script>` （自前 mount JS パターン、中身が mxfile/mxGraphModel）
  - `<script type="application/drawio+xml" data-diagram-id="X">XML</script>` （v0.2.x 旧）

## [0.3.1] - 2026-05-18

### Fixed
- v0.3.0 で導入した「ユーザ自前 `<div class="mxgraph">` を非表示にする CSS」が、**拡張描画の slot 内に preview.js が動的に生成する `<div class="mxgraph">` まで隠してしまう**バグを修正。結果として「描画が極端に小さい」「編集ボタンが表示されない」現象が起きていた
- CSS 注入ロジックを削除（ユーザは「自前描画と併記する複雑なパターン」を書く必要はなく、新マーカーだけ書けば拡張が描画＋編集を全部やる、というシンプル仕様に統一）
- `sample/portable-example.html` をシンプルなマーカーだけのサンプルに書き直し

## [0.3.0] - 2026-05-18

### Added
- **新マーカー `<script type="application/xml" data-drawio-id="X">XML</script>` 採用**：HTML標準の type 値を使うのでブラウザで安全に無視される。ユーザは「ブラウザでも見える書き方」（自前 CDN viewer + mxgraph div）と併用できる
- **ユーザ自前 `<div class="mxgraph">` の自動非表示**：拡張で開いた時はリッチ描画と二重表示にならないよう、ユーザの自前描画 div を自動で隠す CSS を注入
- 新サンプル `sample/portable-example.html`：ブラウザ直接表示でも図が見えるパターンの実例

### Changed
- `htmlPatcher.extractDrawioBlocks` が新旧両マーカーを返すように拡張。`DrawioBlock.marker: 'new' | 'old'` で識別
- `replaceDrawioXml` が新マーカー（application/xml + data-drawio-id）と旧マーカー（application/drawio+xml + data-diagram-id）の両方に対応

### Compatibility
- 旧マーカー（v0.2.x で使っていた `application/drawio+xml + data-diagram-id`）は引き続き**描画＋編集ともサポート**。破壊的変更なし

## [0.2.3] - 2026-05-18

### Added
- **インラインスクリプト・外部CDNスクリプトの実行を許可**（CSP緩和）。これにより HTML内に Mermaid 等のCDN呼び出しや `<script>...</script>` の初期化コードを書いた場合、プレビューで動作するようになった
- 外部スタイルシート (`<link rel="stylesheet" href="...">`) も読み込み可能に

### Changed
- CSP に `'unsafe-inline'` と `https:` を追加。nonce 指定は撤去（'unsafe-inline' と nonce が共存すると nonce 優先になる CSP3 仕様のため、ユーザのインラインスクリプトを動かすには nonce 廃止が必要）
- 「インラインスクリプトはCSPで動かない」「外部CSSは読み込めない」の警告バナーを廃止

### Security
- ⚠️ **トレードオフ**：プレビューで開いたHTML内の JavaScript が**そのまま実行される**ようになりました。信頼できないHTML（拾い物・他人作）を開くと、その中の JS が任意の動作（外部送信・改ざん等）をしうるリスクがあります。**自分で書いた／信頼できるHTMLのみ**プレビューで開いてください。READMEのセキュリティセクション参照

## [0.2.2] - 2026-05-18

### Added
- **テーマ追従**：プレビューがVSCodeのダーク／ライトテーマに自動追従。ユーザHTML側で `body { background: ... }` 等を明示している場合はそれを尊重（強制上書きしない）
- **`<meta name="color-scheme">` 自動付与**：ユーザHTMLに未指定の場合のみ `light dark` を自動付与（スクロールバー・フォーム要素もテーマ追従）
- **コマンド `drawioInHtml.openPreview`**：エクスプローラ右クリック、エディタタブ右クリック、コマンドパレット、`Ctrl+Shift+V`（Mac: `Cmd+Shift+V`）から1クリックでプレビュー起動
- **デフォルトプレビュー化の手段**：VSCode 標準の `workbench.editorAssociations` 設定で `.html` のデフォルトを Drawio HTML Editor にできる（README に手順記載）

### Changed
- `previewHtmlBuilder`：preview.css の挿入位置をCSP直後（ユーザ `<style>` より前）に変更。これによりユーザCSSが後勝ちで尊重される

## [0.2.1] - 2026-05-18

### Fixed
- `<script type="application/drawio+xml">` の中身に HTML エンティティ（`&lt;`、`&quot;`、`&gt;` 等）を含むXMLを編集タブで開くと「図面ファイルではありません (Unescaped '<' not allowed in attributes values)」エラーで開けなかった問題を修正。
  原因：`htmlPatcher.extractDrawioBlocks` が `node-html-parser` の `el.text` でXMLを取得しており、これが HTML エンティティをデコードしてしまうため、`value="...&lt;script&gt;..."` のような属性値が `value="...<script>..."` に化けて Drawio 側の XML パースで失敗していた。`el.text` → `el.rawText` に置換して生の文字列を保持するようにした。

## [0.2.0] - 2026-05-18

### Added
- **HTML本文プレビュー対応**：ユーザのHTMLの中身（見出し、段落、表、画像、リンク等）を WebView でそのままプレビュー表示し、その中の `<script type="application/drawio+xml">` を**元の位置にインラインで Drawio SVG として描画**するように変更。Markdown プレビューと似た感覚で、HTML本文と Drawio図が共存表示される
- **相対パス画像の表示**：`<img src="./icon.png">` 等の相対URL を `webview.asWebviewUri()` で自動変換するため、ドキュメントと同じフォルダ内の画像が表示可能になった
- **不可能な機能の警告バナー**：ユーザHTMLにインラインスクリプトや外部CSSが含まれている場合、本文先頭に黄色い警告バナーを表示
- 新規ファイル `src/previewHtmlBuilder.ts`：HTMLパース・CSP注入・slot置換・相対URL変換を純粋関数として切り出し

### Changed
- プレビューWebViewの基本動作が「Drawio図だけ並べる」から「HTML本文をそのまま表示 + Drawio図をインライン化」に変更
- `media/preview.css` の `html/body` 全体スタイル削除（ユーザHTMLの見た目を尊重）。スタイルは `.drawio-slot` 配下にスコープ限定
- `media/preview.js` を `.drawio-slot` ベースに書き換え（`#diagrams` 固定スロット廃止）

### Limitations
- ユーザHTML内のインライン `<script>...</script>` および外部 `<script src>` は CSP の制約で実行されません
- ユーザHTML内の外部 `<link rel="stylesheet">` も同様に読み込まれません
- スタイルは `<style>...</style>` インラインで HTML 内に記述してください

## [0.1.1] - 2026-05-18

### Fixed
- 拡張機能の activate に失敗していた問題を修正（`Cannot find module 'he'`）。
  `.vscodeignore` で `node_modules/**` を全除外していたため、`node-html-parser` の
  推移的依存である `he`、`css-select`、`entities` 等が VSIX に同梱されず、
  `node-html-parser` の require が失敗してプロバイダがロードされなかった。
  `vsce` のデフォルト挙動（`npm list --production` での自動同梱）に任せるよう修正。

## [0.1.0] - 2026-05-18

### Added
- 初期リリース。
- HTMLファイル内に `<script type="application/drawio+xml" data-diagram-id="...">XML</script>` 形式で埋め込まれた Drawio 図を、VSCode 上で静的 SVG として閲覧できる Custom Text Editor を提供。
- 各図カードに「✏️ 編集」ボタン。クリックで別タブに Drawio 公式エディタ（`embed.diagrams.net`）を開く。
- Drawio エディタで保存すると、元の HTML の該当 `<script>` の中身だけを書き換えてディスクに自動保存。
- 「🔍 拡大」ボタンによる図のフルスクリーン表示。
- 1つの HTML 内に複数の Drawio 図を埋め込み可能、それぞれ独立に編集可。
- `data-diagram-id` 欠落時の赤帯警告。
- ResizeObserver による container 幅変動への自動追随。
