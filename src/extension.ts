import * as vscode from 'vscode';
import { DrawioHtmlEditorProvider } from './editorProvider';
import { EditorPanelManager } from './editorPanelManager';

export function activate(context: vscode.ExtensionContext): void {
  const editorPanelManager = new EditorPanelManager(context);
  context.subscriptions.push(editorPanelManager);
  context.subscriptions.push(
    DrawioHtmlEditorProvider.register(context, editorPanelManager)
  );

  // 右クリックメニュー / Ctrl+Shift+V から呼ばれる「プレビューで開く」コマンド
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'drawioInHtml.openPreview',
      async (uri?: vscode.Uri) => {
        const target = uri ?? vscode.window.activeTextEditor?.document.uri;
        if (!target) {
          vscode.window.showInformationMessage(
            'Drawio in HTML: 対象のHTMLファイルが特定できません。'
          );
          return;
        }
        await vscode.commands.executeCommand(
          'vscode.openWith',
          target,
          'drawioInHtml.editor'
        );
      }
    )
  );
}

export function deactivate(): void {
  // no-op
}
