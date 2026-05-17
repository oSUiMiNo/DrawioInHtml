# VSCode Marketplace 公開手順（ユーザ操作分）

## あなたが手で実施する3ステップ

私（エージェント）はあなたのMicrosoftアカウント認証ができないので、以下の3つは**あなたがブラウザで操作**してください。完了したら PAT（最後の4)）を私にコピペで渡してくれれば、その後の `vsce login` → `vsce publish` は私が実行します。

---

### 1) Azure DevOps 組織を作成（既にあるならスキップ）

1. <https://aex.dev.azure.com/me?mkt=ja-JP> にアクセス
2. Microsoftアカウント（あなたの Hotmail/Outlook/会社アカウントなど）でサインイン
3. 案内に従って組織を1つ作成（既存組織があればそれでOK）。
   - 組織名は何でもいい（公開には影響しない、PATを発行する場所として使うだけ）
   - リージョンは「東日本」など適当でOK

---

### 2) Marketplace Publisher を作成

1. <https://marketplace.visualstudio.com/manage> にアクセス
2. 同じMicrosoftアカウントでサインイン
3. 「Create publisher」ボタン → 以下の情報を入力：

| 項目 | 値 |
|------|----|
| **ID** | **`Maku`** （←世界一意。`package.json` と一致させる必要あり） |
| **Name** | お好きに（例: `Maku`、表示名） |
| **Description** | 短い説明（例: `Drawio HTML embed tools for VSCode`） |

> ⚠️ ID `Maku` が**既に他のユーザに取られている**場合はエラーになります。その時は別ID（例: `osuimino`）を選び、私に教えてください。`package.json` の publisher を書き換えて再ビルドします。

---

### 3) Personal Access Token (PAT) を発行

1. <https://dev.azure.com/> にサインインして、右上のユーザアイコン → **Personal access tokens**
2. 「+ New Token」をクリック
3. 以下のように設定：

| 項目 | 値 |
|------|----|
| Name | `vscode-publish` （何でもOK） |
| Organization | **All accessible organizations** ← これ重要 |
| Expiration | 90日 か 1年（短い方が安全） |
| Scopes | **Custom defined** → **Marketplace → Manage**（チェック） |

4. 「Create」 → 表示されるトークンを**その画面でコピー**（**この画面を閉じると二度と見れません**）

---

### 4) PAT を私に渡す

トークンを次の私のメッセージに貼り付けてください。形式は `azdoxxxxxxxxxxxxxx...` のような長い文字列です。

私が受け取ったら：
```sh
npx --yes @vscode/vsce login Maku
# → PAT を私が入力
npx --yes @vscode/vsce publish
```
を実行して公開完了です。

---

## セキュリティの注意

- **PAT は他人に見せない**（あなたのAzure DevOps組織のManage権限が握られる）
- 不要になったら <https://dev.azure.com/> の Personal access tokens 画面で Revoke してください
- このセッションが終わったら PAT 文字列が残っているチャットログは消すか、PAT を Revoke するのが安全

## 公開後にできること

- <https://marketplace.visualstudio.com/items?itemName=Maku.drawio-in-html> でページが見れる
- VSCode内で `Ctrl+P` → `ext install Maku.drawio-in-html` でインストール可能
- バージョンアップ：`package.json` の `version` を上げて `npm run compile` → `vsce publish`
- アンパブリッシュ：誤公開した場合 `vsce unpublish Maku.drawio-in-html`
