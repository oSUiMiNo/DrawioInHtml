import * as vscode from 'vscode';
import { extractDrawioBlocks } from './htmlPatcher';
import { EditorPanelManager } from './editorPanelManager';

type PreviewToHostMsg =
  | { type: 'ready' }
  | { type: 'openEditor'; diagramId: string }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };

type HostToPreviewMsg = {
  type: 'load';
  blocks: { diagramId: string; xml: string }[];
  missingId: boolean;
};

export class DrawioHtmlEditorProvider implements vscode.CustomTextEditorProvider {
  private static readonly viewType = 'drawioInHtml.editor';
  private readonly output: vscode.OutputChannel;

  public static register(
    context: vscode.ExtensionContext,
    editorPanelManager: EditorPanelManager
  ): vscode.Disposable {
    const provider = new DrawioHtmlEditorProvider(context, editorPanelManager);
    return vscode.window.registerCustomEditorProvider(
      DrawioHtmlEditorProvider.viewType,
      provider,
      {
        webviewOptions: { retainContextWhenHidden: true },
        supportsMultipleEditorsPerDocument: false,
      }
    );
  }

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly editorPanelManager: EditorPanelManager
  ) {
    this.output = vscode.window.createOutputChannel('Drawio HTML');
    context.subscriptions.push(this.output);
  }

  public async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    _token: vscode.CancellationToken
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
    };
    webviewPanel.webview.html = this.buildWebviewHtml(webviewPanel.webview);

    const sendBlocks = (): void => {
      const blocks = extractDrawioBlocks(document.getText());
      const missingId = blocks.some((b) => !b.diagramId);
      const msg: HostToPreviewMsg = {
        type: 'load',
        blocks: blocks.filter((b) => b.diagramId),
        missingId,
      };
      webviewPanel.webview.postMessage(msg);
    };

    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) {
        return;
      }
      sendBlocks();
    });

    const msgSub = webviewPanel.webview.onDidReceiveMessage(async (raw: PreviewToHostMsg) => {
      if (raw.type === 'ready') {
        sendBlocks();
        return;
      }
      if (raw.type === 'log') {
        const stamp = new Date().toISOString().substring(11, 19);
        this.output.appendLine(`[${stamp}] ${raw.level.toUpperCase()} ${raw.message}`);
        if (raw.level === 'error') {
          this.output.show(true);
        }
        return;
      }
      if (raw.type === 'openEditor') {
        this.editorPanelManager.openOrFocus(document, raw.diagramId);
        return;
      }
    });

    webviewPanel.onDidDispose(() => {
      changeSub.dispose();
      msgSub.dispose();
    });
  }

  private buildWebviewHtml(webview: vscode.Webview): string {
    const nonce = generateNonce();
    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    const previewJs = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'preview.js'));
    const previewCss = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'preview.css'));
    const viewerJs = webview.asWebviewUri(
      vscode.Uri.joinPath(mediaRoot, 'viewer-static.min.js')
    );
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data: blob:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `font-src ${webview.cspSource} data: blob:`,
      `script-src ${webview.cspSource} 'unsafe-eval' 'nonce-${nonce}'`,
      `connect-src ${webview.cspSource} blob: data: https:`,
      `worker-src ${webview.cspSource} blob:`,
      `child-src blob:`,
    ].join('; ');

    return /* html */ `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>Drawio HTML Preview</title>
<link rel="stylesheet" href="${previewCss}">
</head>
<body>
<div id="warnings"></div>
<div id="diagrams"></div>
<script nonce="${nonce}" src="${viewerJs}"></script>
<script nonce="${nonce}" src="${previewJs}"></script>
</body>
</html>`;
  }
}

function generateNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < 32; i++) {
    s += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return s;
}
