# VSCode WebView で Drawio viewer-static.min.js を使うときの必須設定

## 結論

`<div class="mxgraph" data-mxgraph="...">` に渡す JSON 設定で
**`'check-visible-state': false`** を必ず指定する。

```javascript
div.setAttribute('data-mxgraph', JSON.stringify({
  xml,
  // ...その他のオプション
  'check-visible-state': false,  // ← これが無いと VSCode WebView では永遠に描画されない
}));
```

## なぜ必須か

viewer-static.min.js の `GraphViewer` は、デフォルトで `checkVisibleState = true` 設定で動作する。
これは「対象 div が画面上で可視と確認できるまで描画を遅延する」最適化機能で、
通常ページではパフォーマンス改善になる。
ところが VSCode WebView 環境では「可視」判定機構（恐らく IntersectionObserver か
offsetParent ベースのチェック）が想定どおり機能せず、要素は永遠に「不可視」扱いされ、
描画が一度も走らないまま終わる。

`'check-visible-state': false` を渡すと、この可視性判定分岐がバイパスされ、
`createViewerForElement` の呼び出しで即時に SVG が生成される。

## 症状（このフラグが無い場合）

- 例外もエラーログも一切出ない
- `GraphViewer.createViewerForElement(div)` は同期的に return する
- `div.children.length === 0` のまま（SVG が生成されない）
- DevTools コンソールにも CSP 違反等は出ない（CSP の問題ではない）

調査時、原因が見えないと「ライブラリが silent abort している」「CSP が阻害している」など
誤った仮説に走りやすいので注意。

## 関連トリガー

このナレッジは下記のキーワードで参照すべき：
- VSCode WebView / Custom Editor で Drawio を表示する
- viewer-static.min.js が真っ白／何も描画されない
- GraphViewer / createViewerForElement / mxGraph
- Drawio のプレビュー機能を VSCode拡張に組み込む

## 補足：editor (embed.diagrams.net) 側は影響なし

`embed.diagrams.net` の Drawio エディタを iframe で読み込む場合は、ライブラリではなく
完全な Web アプリなので、この問題は発生しない。あくまで `viewer-static.min.js` を
直接ホストする場合に限った話。

---

## 追加知見：`updateContainerHeight` 副作用で中央配置が崩れる

### 症状
container 幅を広げていくと、ある拡大率（`allowZoomIn:false` で maxFitScale=1）で
拡大が止まる。それ以降さらに広げると、**図が container の中央ではなく左上に寄って**
表示される。

### 原因
viewer の `fitGraph` 内に次の処理がある：

```javascript
(0 != this.graphConfig.resize || "" == b.style.height || this.hCenterOnly)
  && this.updateContainerHeight(b, max(minHeight, graphBounds.height + 2*border + 1));
```

`resize: true`（デフォルト）だと毎回 `updateContainerHeight` が呼ばれ、container 高さ
が figure 高さに切り詰められる。結果、**縦の中央余地が消える**ため「左上に寄って見える」
状態になる。

### 対策
`updateContainerHeight` をスキップさせるには、次の **3 条件全部**を満たす必要がある：

1. `graphConfig.resize` を `false`
2. container（mxgraph div の親）に**インラインで** `style.height` を設定する
   （CSS の `height` プロパティでは検知されない。`b.style.height != ""` の判定なので必須）
3. `hCenterOnly: false`（デフォルト）

### 抑止する場合の設定例
```javascript
viewerHost.style.height = '70vh';  // インライン必須（"" や CSSのheightは無効）
{
  resize: false,
  'auto-fit': true,
  'auto-crop': true,
  center: true,
  'check-visible-state': false,
}
```

### 抑止すべきかどうかの判断軸
`updateContainerHeight` の挙動は「container 高さを figure 高さに追随させる」もの。
これを抑止すると container 高さが固定値（70vh等）になり、figure が小さい時は
**上下に余白が残る**。これを許容するかどうかで設定が変わる：

| 要件 | 推奨設定 |
|------|---------|
| 縦の中央余白も保ちたい（広い container 内で図がプレゼン的に中央配置される） | 抑止する。`resize: false` + インライン `style.height` |
| 縦余白は要らない、figure サイズに追随で OK | **抑止しない**。`resize: true` で viewer 任せ、`style.height` 未設定 |
| 拡大表示モード（フルスクリーン）など特定タイミングだけ固定高さにしたい | 切替時のみインライン `style.height` を設定し、終了時に空文字に戻す |

### 本プロジェクトの最終採用設定
ユーザ要望「横方向は中央余白OK、縦方向は figure 追随で余白なし」を満たすため、
**通常時は viewer 任せ（`resize: true`、`style.height` 空）**、フルスクリーン時のみ
`style.height = '100vh'` をインライン設定して `updateContainerHeight` を抑止する
ハイブリッド構成を採用している。`preview.js` の `zoomBtn` のクリックハンドラと
ESC ハンドラで height のインライン値を切替＋再描画している。

---

## VSIX パッケージング：node_modules を `.vscodeignore` で全除外しない

### 症状
VSCode Marketplace 経由でインストールした拡張が
`Activating extension 'X' failed: Cannot find module 'Y'` でクラッシュする。
スタックトレースは本拡張の dependency（例：`node-html-parser`）が、その
推移的依存（例：`he`、`css-select`、`entities`）を `require` した位置を指す。

### 原因
`.vscodeignore` に下記のような記述を入れていた：
```
node_modules/**
!node_modules/node-html-parser/**
```
これは「本パッケージだけは入れて他の node_modules は全除外」のつもりだが、
**推移的依存（dependency の dependency）まで除外**してしまう。結果、
パッケージ本体は同梱されたが、それが必要とする `he` 等が同梱されず、
ロード時にクラッシュする。

### 正しい対処
`vsce` は**デフォルトで `npm list --production` を実行して本番依存を自動解析し、
それに該当する node_modules だけを同梱**する。なので：
- `.vscodeignore` から `node_modules/**` の除外は**削除する**
- `!node_modules/...` のような逆指定も不要
- devDependencies（`@types/*`、`typescript` 等）は `vsce` が自動で除外する

### 同梱物確認の習慣
publish 前に必ず：
```
npx --yes @vscode/vsce ls --tree | grep node_modules
```
で同梱される node_modules 配下のディレクトリ一覧を確認する。
本拡張の場合、最低限以下が含まれているべき：
- `node-html-parser/`
- `he/`（HTML エンティティ処理）
- `css-select/`（CSS セレクタ）
- `entities/`（HTML エンティティ）
- `nth-check/`（CSS :nth-child）
- `domutils/` `domelementtype/` `domhandler/`（DOM 抽象）
- `boolbase/`（CSS セレクタ補助）

### 教訓
- VSIX の `.vscodeignore` 設計時は「除外」より「自動同梱に任せる」を基本にする
- F5 の Extension Development Host は workspace の node_modules を直接参照するので
  **この種のバグはマーケットプレイス経由インストール時にしか再現しない**。
  開発時に問題なくても publish 後に発覚するパターンに注意。
- 初回 publish 後は必ず**実機 VSCode へインストールして動作確認**を取る習慣にする
