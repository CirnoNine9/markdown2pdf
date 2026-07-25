import path from 'node:path';
import * as vscode from 'vscode';
import type { ExportConfig } from './config';
import { renderMarkdownDocument } from './html';
import { preparePreviewHtml } from './previewHtml';

export const previewViewType = 'markdown2pdf.livePreview';
const previewDebounceMs = 250;

export interface MarkdownPreviewOptions {
  config: ExportConfig;
  includeToc: boolean;
}

interface PreviewSession {
  document: vscode.TextDocument;
  panel: vscode.WebviewPanel;
  renderId: number;
  timer?: NodeJS.Timeout;
}

export class MarkdownPreviewManager implements vscode.Disposable {
  private readonly sessions = new Map<string, PreviewSession>();
  private readonly disposables: vscode.Disposable[];

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getOptions: () => MarkdownPreviewOptions,
    private readonly isMarkdownDocument: (document: vscode.TextDocument) => boolean,
    private readonly onDidChangeActivePreview: (document: vscode.TextDocument | undefined) => void
  ) {
    this.disposables = [
      vscode.workspace.onDidChangeTextDocument((event) => {
        const session = this.sessions.get(event.document.uri.toString());
        if (session) {
          session.document = event.document;
          this.scheduleRender(session, previewDebounceMs);
        }
      }),
    ];
  }

  async openPreview(resource?: vscode.Uri): Promise<void> {
    const document = await this.resolveDocument(resource);
    if (!document || !this.isMarkdownDocument(document)) {
      throw new Error('请先打开一个 Markdown 文档。');
    }

    const key = document.uri.toString();
    const existing = this.sessions.get(key);
    if (existing) {
      existing.document = document;
      existing.panel.reveal(vscode.ViewColumn.Beside, true);
      this.scheduleRender(existing, 0);
      return;
    }

    const panel = vscode.window.createWebviewPanel(
      previewViewType,
      `预览：${previewTitle(document)}`,
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: true },
      {
        enableFindWidget: true,
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: this.localResourceRoots(document),
      }
    );
    panel.iconPath = vscode.Uri.joinPath(this.context.extensionUri, 'resources', 'markdown2pdf.svg');
    panel.webview.html = statusHtml(panel.webview.cspSource, '正在生成实时预览...');

    const session: PreviewSession = { document, panel, renderId: 0 };
    this.sessions.set(key, session);
    panel.onDidChangeViewState(() => this.notifyActivePreview());
    panel.onDidDispose(() => {
      if (session.timer) {
        clearTimeout(session.timer);
      }
      session.renderId += 1;
      this.sessions.delete(key);
      this.notifyActivePreview();
    });
    this.notifyActivePreview();

    await this.render(session, ++session.renderId);
  }

  refreshAll(): void {
    for (const session of this.sessions.values()) {
      this.scheduleRender(session, 0);
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    for (const session of this.sessions.values()) {
      if (session.timer) {
        clearTimeout(session.timer);
      }
      session.panel.dispose();
    }
    this.sessions.clear();
    this.onDidChangeActivePreview(undefined);
  }

  private notifyActivePreview(): void {
    const activeSession = [...this.sessions.values()].find((session) => session.panel.active);
    this.onDidChangeActivePreview(activeSession?.document);
  }

  private scheduleRender(session: PreviewSession, delay: number): void {
    if (session.timer) {
      clearTimeout(session.timer);
    }
    const renderId = ++session.renderId;
    session.timer = setTimeout(() => {
      session.timer = undefined;
      void this.render(session, renderId);
    }, delay);
  }

  private async render(session: PreviewSession, renderId: number): Promise<void> {
    try {
      const options = this.getOptions();
      const mathJaxUri = session.panel.webview.asWebviewUri(
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'assets', 'mathjax', 'tex-svg-full.js')
      );
      const html = await renderMarkdownDocument({
        sourcePath: sourcePathFor(session.document),
        content: session.document.getText(),
        config: options.config,
        includeToc: options.includeToc,
        autoTypesetMath: true,
        mathJaxScriptSource: mathJaxUri.toString(),
        resolveImageSource: (source) =>
          source.startsWith('file:')
            ? session.panel.webview.asWebviewUri(vscode.Uri.parse(source)).toString()
            : source,
      });

      if (renderId !== session.renderId || !this.sessions.has(session.document.uri.toString())) {
        return;
      }

      session.panel.webview.html = preparePreviewHtml(html, {
        cspSource: session.panel.webview.cspSource,
        nonce: createNonce(),
      });
    } catch (error) {
      if (renderId !== session.renderId) {
        return;
      }
      const detail = error instanceof Error ? error.message : String(error);
      session.panel.webview.html = statusHtml(
        session.panel.webview.cspSource,
        `实时预览生成失败：${detail}`,
        true
      );
    }
  }

  private async resolveDocument(resource?: vscode.Uri): Promise<vscode.TextDocument | undefined> {
    if (resource) {
      const openDocument = vscode.workspace.textDocuments.find(
        (document) => document.uri.toString() === resource.toString()
      );
      return openDocument ?? vscode.workspace.openTextDocument(resource);
    }
    return vscode.window.activeTextEditor?.document;
  }

  private localResourceRoots(document: vscode.TextDocument): vscode.Uri[] {
    const roots = new Map<string, vscode.Uri>();
    const addRoot = (uri: vscode.Uri) => roots.set(uri.toString(), uri);
    addRoot(this.context.extensionUri);
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      addRoot(folder.uri);
    }
    if (document.uri.scheme === 'file') {
      addRoot(vscode.Uri.file(path.dirname(document.uri.fsPath)));
    }
    return [...roots.values()];
  }
}

function sourcePathFor(document: vscode.TextDocument): string {
  if (document.uri.scheme === 'file') {
    return document.uri.fsPath;
  }
  const basePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  return path.join(basePath, previewTitle(document));
}

function previewTitle(document: vscode.TextDocument): string {
  const title = path.basename(document.fileName || 'untitled.md');
  return path.extname(title) ? title : `${title}.md`;
}

function statusHtml(cspSource: string, message: string, isError = false): string {
  const color = isError ? 'var(--vscode-errorForeground)' : 'var(--vscode-descriptionForeground)';
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${cspSource} 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      margin: 0;
      padding: 24px;
      color: ${color};
      background: var(--vscode-editor-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      line-height: 1.5;
    }
  </style>
</head>
<body>${escapeHtml(message)}</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return nonce;
}
