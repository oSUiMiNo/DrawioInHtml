import * as vscode from 'vscode';
import { parse, HTMLElement } from 'node-html-parser';

// 新マーカー（v0.3+）：ブラウザ標準の application/xml を採用し、data-drawio-id で識別
const NEW_MARKER_TYPE = 'application/xml';
const NEW_MARKER_ID_ATTR = 'data-drawio-id';
// 旧マーカー（v0.2.x 互換）：拡張独自 type
const OLD_MARKER_TYPE = 'application/drawio+xml';
const OLD_MARKER_ID_ATTR = 'data-diagram-id';

export interface BuildOptions {
  rawHtml: string;
  documentUri: vscode.Uri;
  extensionUri: vscode.Uri;
  webview: vscode.Webview;
}

export interface BuildResult {
  html: string;
  diagramIds: string[];
  missingId: boolean;
  warnings: string[];
}

/**
 * ユーザのHTMLを WebView 表示用に加工する：
 *  - <meta CSP> の強制注入（既存のCSPは削除）
 *  - <base> 削除
 *  - preview.css / viewer-static.min.js / preview.js の注入
 *  - 各 <script type="application/drawio+xml"> を <div class="drawio-slot"> に置換
 *  - 相対パス URL（img.src, link.href, a.href, script.src）を webview.asWebviewUri で変換
 *  - インラインスクリプト・外部CSS の検出と警告メッセージ生成
 */
export function buildPreviewHtml(opts: BuildOptions): BuildResult {
  const { rawHtml, documentUri, extensionUri, webview } = opts;
  const documentDir = vscode.Uri.joinPath(documentUri, '..');
  const mediaRoot = vscode.Uri.joinPath(extensionUri, 'media');
  const previewCssUri = String(webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'preview.css')));
  const viewerJsUri = String(webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'viewer-static.min.js')));
  const previewJsUri = String(webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'preview.js')));
  const nonce = generateNonce();

  // html/head/body 要素が無い snippet HTML は body 直下に包む
  const hasHtml = /<html[\s>]/i.test(rawHtml);
  const wrappedHtml = hasHtml ? rawHtml : `<!DOCTYPE html><html><head></head><body>${rawHtml}</body></html>`;

  const root = parse(wrappedHtml, {
    lowerCaseTagName: false,
    comment: true,
  });

  let head = root.querySelector('head');
  let body = root.querySelector('body');
  const htmlEl = root.querySelector('html');

  if (!head && htmlEl) {
    htmlEl.insertAdjacentHTML('afterbegin', '<head></head>');
    head = root.querySelector('head');
  }
  if (!body && htmlEl) {
    htmlEl.insertAdjacentHTML('beforeend', '<body></body>');
    body = root.querySelector('body');
  }
  if (!head || !body) {
    // それでも head/body が無いなら諦めて全体を body として扱う
    return {
      html: `<!DOCTYPE html><html><head></head><body>${escapeText(rawHtml)}</body></html>`,
      diagramIds: [],
      missingId: false,
      warnings: ['HTML構造の解析に失敗しました'],
    };
  }

  // 既存の CSP meta を削除
  for (const meta of head.querySelectorAll('meta')) {
    const httpEquiv = (meta.getAttribute('http-equiv') ?? '').toLowerCase();
    if (httpEquiv === 'content-security-policy') {
      meta.remove();
    }
  }

  // 既存 <base> 削除（viewer の URL 解決が壊れるため）
  for (const base of head.querySelectorAll('base')) {
    base.remove();
  }

  // 新規 CSP を <head> 先頭に挿入
  // v0.2.3: ユーザHTML内のインラインスクリプトと外部CDNスクリプトを許可するため、
  // 'unsafe-inline' と https: を加えて緩和。nonce は外す（'unsafe-inline' と nonce が
  // 共存すると nonce 優先で 'unsafe-inline' が無効化される CSP3 仕様のため）。
  // セキュリティ低下のトレードオフは README で警告する。
  const csp = [
    `default-src 'none'`,
    `img-src ${webview.cspSource} https: data: blob: vscode-webview-resource:`,
    `style-src ${webview.cspSource} 'unsafe-inline' https:`,
    `font-src ${webview.cspSource} data: blob: https:`,
    `script-src ${webview.cspSource} 'unsafe-eval' 'unsafe-inline' https:`,
    `connect-src ${webview.cspSource} blob: data: https:`,
    `worker-src ${webview.cspSource} blob: https:`,
    `child-src blob: https:`,
    `frame-src https:`,
  ].join('; ');
  // 1) CSP を <head> 先頭に挿入（最優先）
  // 2) その直後（=ユーザ <style> より前）に preview.css を挿入。
  //    同 specificity ならユーザ <style> が後勝ちで尊重される設計。
  //    ユーザ未指定時のみ preview.css のテーマ追従が反映される。
  // 3) color-scheme meta はユーザが未指定なら 'light dark' を自動付与
  //    （スクロールバーやフォーム要素のテーマ追従）。
  head.insertAdjacentHTML(
    'afterbegin',
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}">` +
      `<link rel="stylesheet" href="${escapeAttr(previewCssUri)}">`
  );

  // color-scheme meta 自動付与（ユーザ既指定なら触らない）
  const hasColorScheme = head
    .querySelectorAll('meta')
    .some((m) => (m.getAttribute('name') ?? '').toLowerCase() === 'color-scheme');
  if (!hasColorScheme) {
    head.insertAdjacentHTML('beforeend', '<meta name="color-scheme" content="light dark">');
  }

  // 相対パス URL 変換
  rewriteRelativeUrl(root, 'img', 'src', documentDir, webview);
  rewriteRelativeUrl(root, 'link', 'href', documentDir, webview);
  rewriteRelativeUrl(root, 'a', 'href', documentDir, webview);
  rewriteRelativeUrl(root, 'script', 'src', documentDir, webview);
  rewriteRelativeUrl(root, 'source', 'src', documentDir, webview);
  rewriteRelativeUrl(root, 'video', 'src', documentDir, webview);
  rewriteRelativeUrl(root, 'audio', 'src', documentDir, webview);
  rewriteRelativeUrl(root, 'iframe', 'src', documentDir, webview);

  // Drawio script タグを slot div に置換
  // 認識パターン：
  //   1. <script type="application/xml" data-drawio-id="X"> — v0.3 推奨
  //   2. <script type="application/xml" id="X"> 中身が <mxfile> or <mxGraphModel> — 自前 mount JS パターン
  //   3. <script type="application/drawio+xml" data-diagram-id="X"> — v0.2.x 旧
  // 置換後 slot：<div class="drawio-slot" data-diagram-id="X"></div>（内部表現は一本化）
  const diagramIds: string[] = [];
  let missingId = false;

  for (const scriptEl of Array.from(root.querySelectorAll('script'))) {
    const type = (scriptEl.getAttribute('type') ?? '').toLowerCase();
    let diagramId: string | null = null;

    if (type === NEW_MARKER_TYPE) {
      // パターン1: data-drawio-id 明示
      const dataAttr = scriptEl.getAttribute(NEW_MARKER_ID_ATTR);
      if (dataAttr) {
        diagramId = dataAttr;
      } else {
        // パターン2: id 属性で識別（中身が Drawio XML の時だけ）
        const idAttr = scriptEl.getAttribute('id');
        const body = scriptEl.rawText.trim();
        if (idAttr && isDrawioXmlSnippet(body)) {
          diagramId = idAttr;
        }
      }
    } else if (type === OLD_MARKER_TYPE) {
      // パターン3: 旧マーカー
      const oldId = scriptEl.getAttribute(OLD_MARKER_ID_ATTR);
      if (oldId) {
        diagramId = oldId;
      } else {
        missingId = true;
        continue;
      }
    } else {
      continue;
    }

    if (!diagramId) continue;
    diagramIds.push(diagramId);
    const slotHtml = `<div class="drawio-slot" data-diagram-id="${escapeAttr(diagramId)}"></div>`;
    scriptEl.replaceWith(slotHtml);
  }

  // ユーザ自前の描画ホスト（<div class="mxgraph">、<div class="drawio-host">）を非表示にする CSS。
  // 拡張描画 slot 内の .mxgraph は preview.js が動的に生成するため、それを除外する必要がある。
  // CSS specificity: `.drawio-slot .mxgraph` (0,2,0) が `.mxgraph` (0,1,0) より勝つので
  // slot 内は再表示される。
  if (diagramIds.length > 0) {
    head.insertAdjacentHTML(
      'beforeend',
      `<style id="__drawio-in-html-hide-native">
        /* ユーザ自前の描画ホストを隠す（拡張側でリッチ描画するため二重表示を防ぐ） */
        .mxgraph, .drawio-host { display: none !important; }
        /* ただし拡張の slot 内に preview.js が生成する mxgraph は表示する */
        .drawio-slot, .drawio-slot * { display: revert !important; }
      </style>`
    );
  }

  // 警告検出
  const warnings: string[] = [];
  if (missingId) {
    warnings.push(
      'data-diagram-id を持たない <script type="application/drawio+xml"> があります。表示・編集の対象外です。'
    );
  }

  // 警告バナーを body 先頭に挿入
  if (warnings.length > 0) {
    const items = warnings.map((w) => `<div>${escapeText(w)}</div>`).join('');
    body.insertAdjacentHTML(
      'afterbegin',
      `<div id="__drawio-in-html-warnings">${items}</div>`
    );
  }

  // viewer-static.min.js と preview.js を <body> 末尾に注入
  // CSP に 'unsafe-inline' を含めたので nonce 属性は外す（共存すると nonce 優先で
  // ユーザのインラインスクリプトが動かなくなる）
  body.insertAdjacentHTML(
    'beforeend',
    `<script src="${escapeAttr(viewerJsUri)}"></script>`
  );
  body.insertAdjacentHTML(
    'beforeend',
    `<script src="${escapeAttr(previewJsUri)}"></script>`
  );

  let result = root.toString();
  if (!/^\s*<!DOCTYPE/i.test(result)) {
    result = '<!DOCTYPE html>\n' + result;
  }

  return {
    html: result,
    diagramIds,
    missingId,
    warnings,
  };
}

function rewriteRelativeUrl(
  root: HTMLElement,
  tagName: string,
  attrName: string,
  documentDir: vscode.Uri,
  webview: vscode.Webview
): void {
  for (const el of root.querySelectorAll(tagName)) {
    const orig = el.getAttribute(attrName);
    if (!orig) continue;
    if (isAbsoluteOrSpecial(orig)) continue;
    try {
      const resolved = vscode.Uri.joinPath(documentDir, orig);
      const webviewUri = String(webview.asWebviewUri(resolved));
      el.setAttribute(attrName, webviewUri);
    } catch {
      // 無効なパスは放置
    }
  }
}

function isAbsoluteOrSpecial(url: string): boolean {
  // 絶対URL / data: / mailto: / tel: / javascript: / #ハッシュ / //hostname
  return /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith('//') || url.startsWith('#');
}

function escapeAttr(s: string): string {
  return s.replace(/[&"<>]/g, (c) => {
    return c === '&' ? '&amp;' : c === '"' ? '&quot;' : c === '<' ? '&lt;' : '&gt;';
  });
}

function escapeText(s: string): string {
  return s.replace(/[&<>]/g, (c) => {
    return c === '&' ? '&amp;' : c === '<' ? '&lt;' : '&gt;';
  });
}

function isDrawioXmlSnippet(xml: string): boolean {
  const head = xml.trimStart().slice(0, 64);
  return /<mxfile\b/i.test(head) || /<mxGraphModel\b/i.test(head);
}

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}

export const _internal = {
  isAbsoluteOrSpecial,
  escapeAttr,
  escapeText,
};
