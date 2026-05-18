import * as vscode from 'vscode';
import { parse, HTMLElement } from 'node-html-parser';

// v0.5+ marker: standard <script type="application/xml" id="X"> whose body
// starts with <mxfile> or <mxGraphModel>. Browser-portable and HTML5 standard.
const MARKER_TYPE = 'application/xml';

export interface BuildOptions {
  rawHtml: string;
  documentUri: vscode.Uri;
  extensionUri: vscode.Uri;
  webview: vscode.Webview;
}

export interface BuildResult {
  html: string;
  diagramIds: string[];
  warnings: string[];
}

/**
 * Transform user HTML for display inside the WebView:
 *  - Force-inject <meta CSP> (existing CSP is removed)
 *  - Remove <base>
 *  - Inject preview.css / viewer-static.min.js / preview.js
 *  - Replace each Drawio <script> with <div class="drawio-slot">
 *  - Rewrite relative URLs (img.src, link.href, a.href, script.src, ...) via webview.asWebviewUri
 *  - Detect inline scripts / external CSS and generate warning messages
 */
export function buildPreviewHtml(opts: BuildOptions): BuildResult {
  const { rawHtml, documentUri, extensionUri, webview } = opts;
  const documentDir = vscode.Uri.joinPath(documentUri, '..');
  const mediaRoot = vscode.Uri.joinPath(extensionUri, 'media');
  const previewCssUri = String(webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'preview.css')));
  const viewerJsUri = String(webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'viewer-static.min.js')));
  const previewJsUri = String(webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'preview.js')));
  const nonce = generateNonce();

  // Snippet HTML without html/head/body: wrap it as body content.
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
    // If head/body still cannot be obtained, give up and treat the whole input as body.
    return {
      html: `<!DOCTYPE html><html><head></head><body>${escapeText(rawHtml)}</body></html>`,
      diagramIds: [],
      warnings: ['Failed to parse the HTML structure.'],
    };
  }

  // Remove any existing CSP meta tags.
  for (const meta of head.querySelectorAll('meta')) {
    const httpEquiv = (meta.getAttribute('http-equiv') ?? '').toLowerCase();
    if (httpEquiv === 'content-security-policy') {
      meta.remove();
    }
  }

  // Remove any existing <base> (breaks viewer URL resolution).
  for (const base of head.querySelectorAll('base')) {
    base.remove();
  }

  // Inject a fresh CSP at the beginning of <head>.
  // v0.2.3: To allow user inline scripts and external CDN scripts inside the preview,
  // we relax the CSP with 'unsafe-inline' and https:. Nonce is dropped on purpose:
  // per CSP3, when 'unsafe-inline' and nonce coexist, the nonce wins and 'unsafe-inline'
  // is disabled. The security trade-off is documented in README.
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
  // 1) Insert CSP at the very top of <head> (highest priority).
  // 2) Immediately after that (= before the user's <style>), insert preview.css.
  //    At equal specificity the user's <style> wins by ordering, so user styles are honored.
  //    When the user did not specify a value, preview.css's theme-following defaults apply.
  // 3) Auto-add a color-scheme meta with 'light dark' if the user did not set one
  //    (so scrollbars and form controls follow the theme).
  head.insertAdjacentHTML(
    'afterbegin',
    `<meta http-equiv="Content-Security-Policy" content="${escapeAttr(csp)}">` +
      `<link rel="stylesheet" href="${escapeAttr(previewCssUri)}">`
  );

  // Auto-add color-scheme meta (skip if the user already set one).
  const hasColorScheme = head
    .querySelectorAll('meta')
    .some((m) => (m.getAttribute('name') ?? '').toLowerCase() === 'color-scheme');
  if (!hasColorScheme) {
    head.insertAdjacentHTML('beforeend', '<meta name="color-scheme" content="light dark">');
  }

  // If the user HTML loads viewer-static.min.js from a CDN or any other path,
  // it clashes with the bundled copy and causes double-load races. During preview
  // we want the extension's bundled viewer to win, so we strip those <script src>
  // tags from the DOM (the source HTML is left untouched).
  for (const scriptEl of Array.from(root.querySelectorAll('script[src]'))) {
    const src = scriptEl.getAttribute('src') ?? '';
    if (/viewer-static\.min\.js(\?|$|#)/i.test(src)) {
      scriptEl.remove();
    }
  }

  // Rewrite relative URLs to webview URIs.
  rewriteRelativeUrl(root, 'img', 'src', documentDir, webview);
  rewriteRelativeUrl(root, 'link', 'href', documentDir, webview);
  rewriteRelativeUrl(root, 'a', 'href', documentDir, webview);
  rewriteRelativeUrl(root, 'script', 'src', documentDir, webview);
  rewriteRelativeUrl(root, 'source', 'src', documentDir, webview);
  rewriteRelativeUrl(root, 'video', 'src', documentDir, webview);
  rewriteRelativeUrl(root, 'audio', 'src', documentDir, webview);
  rewriteRelativeUrl(root, 'iframe', 'src', documentDir, webview);

  // Replace Drawio <script> tags with slot divs.
  // Recognized pattern (v0.5+, the only one):
  //   <script type="application/xml" id="X"> with body starting with <mxfile> or <mxGraphModel>
  // Replacement: <div class="drawio-slot" data-diagram-id="X"></div>
  // (The slot's data-diagram-id attribute is the internal key used by preview.js
  //  and editorPanelManager; it does not need to match the user's authoring style.)
  const diagramIds: string[] = [];

  for (const scriptEl of Array.from(root.querySelectorAll(`script[type="${MARKER_TYPE}"]`))) {
    const idAttr = scriptEl.getAttribute('id');
    if (!idAttr) continue;
    const body = scriptEl.rawText.trim();
    if (!isDrawioXmlSnippet(body)) continue;

    diagramIds.push(idAttr);
    const slotHtml = `<div class="drawio-slot" data-diagram-id="${escapeAttr(idAttr)}"></div>`;
    scriptEl.replaceWith(slotHtml);
  }

  // Hide the user's own render hosts (<div class="mxgraph">, <div class="drawio-host">).
  // The extension renders into `.mxgraph.drawio-rendered`, so `.mxgraph:not(.drawio-rendered)`
  // cleanly separates the two. (The v0.3.2 `display: revert` trick was dropped because some
  // Chromium builds did not honor it consistently.)
  if (diagramIds.length > 0) {
    head.insertAdjacentHTML(
      'beforeend',
      `<style id="__drawio-in-html-hide-native">
        /* Hide non-extension .mxgraph nodes and the user's own host divs. */
        .mxgraph:not(.drawio-rendered),
        .drawio-host { display: none !important; }
      </style>`
    );
  }

  // No preview-time warnings are emitted in v0.5+. The previous warning about
  // missing data-diagram-id only applied to the legacy marker, which is gone.
  const warnings: string[] = [];

  // Inject viewer-static.min.js and preview.js at the end of <body>.
  // Because the CSP includes 'unsafe-inline', the nonce attribute is omitted on purpose
  // (with both present, nonce wins and the user's inline scripts stop running).
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
      // Ignore invalid paths.
    }
  }
}

function isAbsoluteOrSpecial(url: string): boolean {
  // Absolute URL / data: / mailto: / tel: / javascript: / #hash / //hostname
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
