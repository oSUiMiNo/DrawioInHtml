import * as vscode from 'vscode';
import { extractDrawioBlocks } from './htmlPatcher';
import { EditorPanelManager } from './editorPanelManager';
import { buildPreviewHtml } from './previewHtmlBuilder';

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
    const documentDir = vscode.Uri.joinPath(document.uri, '..');
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media'),
        documentDir,
      ],
    };

    // 現在の diagramId の集合（順序保持）
    let lastDiagramIds: string[] = [];

    const rebuildHtml = (): string => {
      const result = buildPreviewHtml({
        rawHtml: document.getText(),
        documentUri: document.uri,
        extensionUri: this.context.extensionUri,
        webview: webviewPanel.webview,
      });
      lastDiagramIds = result.diagramIds;
      return result.html;
    };

    webviewPanel.webview.html = rebuildHtml();

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

    // ドキュメント変更検知
    // - diagramId 集合が変わった場合のみ webview.html を再構築（高コスト、debounce 300ms）
    // - 変わっていなければ XML 差分だけ postMessage で送る（cheap）
    let rebuildTimer: NodeJS.Timeout | undefined;
    const changeSub = vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.toString() !== document.uri.toString()) {
        return;
      }
      const blocks = extractDrawioBlocks(e.document.getText());
      const currentIds = blocks.filter((b) => b.diagramId).map((b) => b.diagramId);
      const idsChanged =
        currentIds.length !== lastDiagramIds.length ||
        currentIds.some((id, i) => id !== lastDiagramIds[i]);

      if (idsChanged) {
        // slot 構造が変わった → HTML 再構築
        if (rebuildTimer) clearTimeout(rebuildTimer);
        rebuildTimer = setTimeout(() => {
          webviewPanel.webview.html = rebuildHtml();
        }, 300);
      } else {
        // XML 差分だけ
        sendBlocks();
      }
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
      if (rebuildTimer) clearTimeout(rebuildTimer);
    });
  }
}
