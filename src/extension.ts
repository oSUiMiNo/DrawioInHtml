import * as vscode from 'vscode';
import { DrawioHtmlEditorProvider } from './editorProvider';
import { EditorPanelManager } from './editorPanelManager';

export function activate(context: vscode.ExtensionContext): void {
  const editorPanelManager = new EditorPanelManager(context);
  context.subscriptions.push(editorPanelManager);
  context.subscriptions.push(
    DrawioHtmlEditorProvider.register(context, editorPanelManager)
  );
}

export function deactivate(): void {
  // no-op
}
