import * as vscode from 'vscode';
import * as path from 'path';
import { extractDrawioBlocks, replaceDrawioXml } from './htmlPatcher';

type EditorToHostMsg =
  | { type: 'ready' }
  | { type: 'save'; xml: string }
  | { type: 'exit' }
  | { type: 'log'; level: 'info' | 'warn' | 'error'; message: string };

type HostToEditorMsg =
  | { type: 'load'; xml: string }
  | { type: 'saved' };

interface PanelEntry {
  panel: vscode.WebviewPanel;
  diagramId: string;
  documentUri: vscode.Uri;
  dispose: vscode.Disposable;
  suppressNextChange: boolean;
  // Tracks the XML last delivered to the editor iframe. When the user types
  // outside the diagram (e.g. editing HTML body text), the XML stays equal to
  // this value, so we skip the postMessage and avoid reloading the Drawio
  // iframe — which otherwise steals focus from the HTML tab on every keystroke.
  lastSentXml: string;
}

function panelKey(uri: vscode.Uri, diagramId: string): string {
  return `${uri.toString()}::${diagramId}`;
}

export class EditorPanelManager implements vscode.Disposable {
  private readonly panels = new Map<string, PanelEntry>();
  private readonly subs: vscode.Disposable[] = [];

  constructor(private readonly context: vscode.ExtensionContext) {
    this.subs.push(
      vscode.workspace.onDidChangeTextDocument((e) => this.onDocumentChanged(e))
    );
  }

  public dispose(): void {
    for (const entry of this.panels.values()) {
      entry.dispose.dispose();
      entry.panel.dispose();
    }
    this.panels.clear();
    for (const s of this.subs) {
      s.dispose();
    }
  }

  public openOrFocus(document: vscode.TextDocument, diagramId: string): void {
    const key = panelKey(document.uri, diagramId);
    const existing = this.panels.get(key);
    if (existing) {
      existing.panel.reveal(vscode.ViewColumn.Beside, false);
      return;
    }

    const fileName = path.basename(document.uri.fsPath);
    const panel = vscode.window.createWebviewPanel(
      'drawioInHtml.editorPanel',
      `Edit: ${fileName}#${diagramId}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')],
      }
    );
    panel.webview.html = this.buildEditorHtml(panel.webview);

    const initialXml = this.findXml(document, diagramId);

    const entry: PanelEntry = {
      panel,
      diagramId,
      documentUri: document.uri,
      suppressNextChange: false,
      lastSentXml: initialXml ?? '',
      dispose: panel.onDidDispose(() => {
        this.panels.delete(key);
      }),
    };
    this.panels.set(key, entry);

    panel.webview.onDidReceiveMessage(async (raw: EditorToHostMsg) => {
      if (raw.type === 'ready') {
        const xml = this.findXml(document, diagramId) ?? '';
        entry.lastSentXml = xml;
        const msg: HostToEditorMsg = { type: 'load', xml };
        panel.webview.postMessage(msg);
        return;
      }
      if (raw.type === 'log') {
        console.log(`[drawio-in-html editor] ${raw.level}: ${raw.message}`);
        return;
      }
      if (raw.type === 'save') {
        await this.applySave(entry, raw.xml);
        return;
      }
      if (raw.type === 'exit') {
        panel.dispose();
        return;
      }
    });

    if (initialXml === undefined) {
      vscode.window.showWarningMessage(
        `diagram-id "${diagramId}" was not found in the HTML.`
      );
    }
  }

  private async applySave(entry: PanelEntry, xml: string): Promise<void> {
    const doc = await this.findDocument(entry.documentUri);
    if (!doc) {
      vscode.window.showErrorMessage('Target HTML document not found.');
      return;
    }
    const current = doc.getText();
    const { html: next, replaced } = replaceDrawioXml(current, entry.diagramId, xml);
    if (!replaced) {
      vscode.window.showWarningMessage(
        `diagram-id "${entry.diagramId}" was not found in the HTML.`
      );
      return;
    }
    if (next === current) {
      const ack: HostToEditorMsg = { type: 'saved' };
      entry.panel.webview.postMessage(ack);
      return;
    }
    entry.suppressNextChange = true;
    // Our own save is the new "last sent" XML — keeps the equality check in
    // onDocumentChanged correct for subsequent unrelated keystrokes.
    entry.lastSentXml = xml;
    const edit = new vscode.WorkspaceEdit();
    const fullRange = new vscode.Range(
      doc.positionAt(0),
      doc.positionAt(current.length)
    );
    edit.replace(doc.uri, fullRange, next);
    const ok = await vscode.workspace.applyEdit(edit);
    if (!ok) {
      entry.suppressNextChange = false;
      vscode.window.showErrorMessage('Drawio: failed to apply edit.');
      return;
    }
    // Persist to disk too, so the user does not need to press Ctrl+S on the HTML tab.
    try {
      await doc.save();
    } catch (e) {
      vscode.window.showWarningMessage(
        `Drawio: failed to save the HTML file: ${e instanceof Error ? e.message : String(e)}`
      );
    }
    const ack: HostToEditorMsg = { type: 'saved' };
    entry.panel.webview.postMessage(ack);
  }

  private onDocumentChanged(e: vscode.TextDocumentChangeEvent): void {
    for (const entry of this.panels.values()) {
      if (entry.documentUri.toString() !== e.document.uri.toString()) {
        continue;
      }
      if (entry.suppressNextChange) {
        entry.suppressNextChange = false;
        continue;
      }
      const xml = this.findXml(e.document, entry.diagramId);
      if (xml === undefined) {
        continue;
      }
      // Skip when the diagram's XML did not actually change. The
      // onDidChangeTextDocument event fires for every keystroke in the HTML
      // tab, including edits to the document body that have nothing to do
      // with the Drawio block; reloading the iframe in those cases steals
      // focus from the HTML editor.
      if (xml === entry.lastSentXml) {
        continue;
      }
      entry.lastSentXml = xml;
      const msg: HostToEditorMsg = { type: 'load', xml };
      entry.panel.webview.postMessage(msg);
    }
  }

  private findXml(document: vscode.TextDocument, diagramId: string): string | undefined {
    const blocks = extractDrawioBlocks(document.getText());
    return blocks.find((b) => b.diagramId === diagramId)?.xml;
  }

  private async findDocument(uri: vscode.Uri): Promise<vscode.TextDocument | undefined> {
    for (const doc of vscode.workspace.textDocuments) {
      if (doc.uri.toString() === uri.toString()) {
        return doc;
      }
    }
    try {
      return await vscode.workspace.openTextDocument(uri);
    } catch {
      return undefined;
    }
  }

  private buildEditorHtml(webview: vscode.Webview): string {
    const nonce = generateNonce();
    const mediaRoot = vscode.Uri.joinPath(this.context.extensionUri, 'media');
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'editor.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(mediaRoot, 'editor.css'));
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource} https: data:`,
      `style-src ${webview.cspSource} 'unsafe-inline'`,
      `script-src ${webview.cspSource} 'nonce-${nonce}'`,
      `frame-src https://embed.diagrams.net`,
    ].join('; ');

    return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<title>Drawio Editor</title>
<link rel="stylesheet" href="${styleUri}">
</head>
<body>
<iframe id="drawio" src="https://embed.diagrams.net/?embed=1&proto=json&spin=1&ui=atlas&modified=unsavedChanges&keepmodified=1"></iframe>
<script nonce="${nonce}" src="${scriptUri}"></script>
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
