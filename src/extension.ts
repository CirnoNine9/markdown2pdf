import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as vscode from 'vscode';
import { resolveBrowserExecutable } from './browser';
import { normalizeConfig, themePresets, type BuiltInTheme, type ExportConfig } from './config';
import { exportPdfThenNotify } from './exportLifecycle';
import {
  markdownSurfaceContextKey,
  MarkdownSurfaceVisibilityController,
  resolveMarkdownSurfaceVisibility,
} from './markdownSurfaceVisibility';
import { exportMarkdownToPdf } from './pdf';
import { MarkdownPreviewManager, previewViewType } from './preview';
import {
  createSidebarSessionState,
  replaceExtension,
  setSidebarOutputPath,
  setSidebarTheme,
  setSidebarThemeOptions,
  updateSidebarFocus,
  type SidebarSessionState,
} from './sidebarState';

const markdownLanguages = new Set(['markdown']);
const markdownExtensions = new Set(['.md', '.markdown']);
const sidebarViewId = 'markdown2pdfActivityView';

interface ExportRequestOptions {
  outputPath?: string;
  showSaveDialog?: boolean;
  includeToc?: boolean;
  includePageNumbers?: boolean;
  theme?: BuiltInTheme;
}

interface SidebarState {
  isMarkdown: boolean;
  fileName?: string;
  sourcePath?: string;
  defaultOutputPath?: string;
  outputPath?: string;
  selectedTheme: BuiltInTheme;
  themePresets: typeof themePresets;
  includeToc: boolean;
  includePageNumbers: boolean;
  pageFormat: string;
}

export function activate(context: vscode.ExtensionContext): void {
  const sidebar = new MarkdownToPdfSidebarProvider(context);
  const visibility = new MarkdownSurfaceVisibilityController((visible) => {
    void vscode.commands.executeCommand('setContext', markdownSurfaceContextKey, visible);
  });
  const refreshVisibility = () => {
    visibility.update(isMarkdownSurfaceActive(vscode.window.activeTextEditor));
  };
  const preview = new MarkdownPreviewManager(
    context,
    () => {
      const previewOptions = sidebar.getPreviewOptions();
      return {
        config: { ...readConfig(), theme: previewOptions.theme },
        includeToc: previewOptions.includeToc,
      };
    },
    isMarkdownDocument,
    (document) => {
      if (document) {
        sidebar.selectDocument(document);
      }
      refreshVisibility();
    }
  );
  sidebar.setPreviewRefreshHandler(() => preview.refreshAll());

  context.subscriptions.push(
    visibility,
    preview,
    vscode.window.registerWebviewViewProvider(sidebarViewId, sidebar),
    vscode.commands.registerCommand('markdown2pdf.exportCurrent', () =>
      runExportCommand(() => exportCurrentMarkdown(context))
    ),
    vscode.commands.registerCommand('markdown2pdf.exportFile', (resource?: vscode.Uri) =>
      runExportCommand(() => exportMarkdownFile(context, resource))
    ),
    vscode.commands.registerCommand('markdown2pdf.chooseOutputPath', () =>
      runExportCommand(() => sidebar.chooseOutputPath())
    ),
    vscode.commands.registerCommand('markdown2pdf.openPreview', (resource?: vscode.Uri) =>
      runPreviewCommand(() => preview.openPreview(resource))
    ),
    vscode.commands.registerCommand('markdown2pdf.focusSidebar', () =>
      runExportCommand(async () => {
        await vscode.commands.executeCommand(`${sidebarViewId}.focus`);
      })
    ),
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      sidebar.selectTextEditor(editor);
      refreshVisibility();
    }),
    vscode.window.tabGroups.onDidChangeTabs(refreshVisibility),
    vscode.window.tabGroups.onDidChangeTabGroups(refreshVisibility),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('markdown2pdf')) {
        sidebar.refresh();
        preview.refreshAll();
      }
    })
  );

  sidebar.selectTextEditor(vscode.window.activeTextEditor);
  sidebar.refresh();
  refreshVisibility();
}

export function deactivate(): void {
  // No-op.
}

async function runExportCommand(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Markdown To PDF 导出失败：${detail}`);
  }
}

async function runPreviewCommand(action: () => Promise<void>): Promise<void> {
  try {
    await action();
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    void vscode.window.showErrorMessage(`Markdown To PDF 预览失败：${detail}`);
  }
}

async function exportCurrentMarkdown(context: vscode.ExtensionContext): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isMarkdownDocument(editor.document)) {
    throw new Error('请先打开一个 Markdown 文档。');
  }

  if (editor.document.isUntitled) {
    throw new Error('导出 PDF 前请先保存当前 Markdown 文档。');
  }

  await exportDocument(context, editor.document.uri, editor.document.getText(), {
    showSaveDialog: true,
    includeToc: false,
    includePageNumbers: false,
  });
}

async function exportMarkdownFile(context: vscode.ExtensionContext, resource?: vscode.Uri): Promise<void> {
  if (!resource) {
    await exportCurrentMarkdown(context);
    return;
  }

  ensureMarkdownFile(resource);
  const markdown = await fs.readFile(resource.fsPath, 'utf8');
  await exportDocument(context, resource, markdown, {
    showSaveDialog: true,
    includeToc: false,
    includePageNumbers: false,
  });
}

async function exportDocument(
  context: vscode.ExtensionContext,
  sourceUri: vscode.Uri,
  markdown: string,
  options: ExportRequestOptions = {}
): Promise<void> {
  ensureMarkdownFile(sourceUri);
  const baseConfig = readConfig();
  const config: ExportConfig = options.theme ? { ...baseConfig, theme: options.theme } : baseConfig;
  const defaultOutput = vscode.Uri.file(replaceExtension(sourceUri.fsPath, '.pdf'));
  const shouldShowSaveDialog = options.showSaveDialog ?? true;
  const outputUri = shouldShowSaveDialog
    ? await vscode.window.showSaveDialog({
        defaultUri: options.outputPath ? vscode.Uri.file(options.outputPath) : defaultOutput,
        filters: { PDF: ['pdf'] },
        saveLabel: '导出 PDF',
      })
    : vscode.Uri.file(options.outputPath ?? defaultOutput.fsPath);

  if (!outputUri) {
    return;
  }

  const executablePath = await resolveBrowserExecutable(config, context);

  await exportPdfThenNotify(
    () =>
      vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `正在导出 ${path.basename(sourceUri.fsPath)} 为 PDF`,
          cancellable: false,
        },
        () =>
          exportMarkdownToPdf({
            sourcePath: sourceUri.fsPath,
            markdown,
            outputPath: outputUri.fsPath,
            executablePath,
            config,
            includeToc: options.includeToc ?? false,
            includePageNumbers: options.includePageNumbers ?? false,
          })
      ),
    () => showExportCompleted(outputUri),
    (error) => {
      const detail = error instanceof Error ? error.message : String(error);
      void vscode.window.showWarningMessage(`PDF 已导出，但完成操作失败：${detail}`);
    }
  );
}

async function showExportCompleted(outputUri: vscode.Uri): Promise<void> {
  const open = await vscode.window.showInformationMessage(
    `PDF 已导出：${outputUri.fsPath}`,
    '打开 PDF',
    '在资源管理器中显示'
  );

  if (open === '打开 PDF') {
    await vscode.env.openExternal(outputUri);
  } else if (open === '在资源管理器中显示') {
    await vscode.commands.executeCommand('revealFileInOS', outputUri);
  }
}

function readConfig(): ExportConfig {
  const config = vscode.workspace.getConfiguration('markdown2pdf');
  return normalizeConfig({
    theme: config.get('theme'),
    codeTheme: config.get('codeTheme'),
    pageFormat: config.get('pageFormat'),
    margin: config.get('margin'),
    fontFamily: config.get('fontFamily'),
    beamerFooterText: config.get('beamerFooterText'),
    customCssFile: config.get('customCssFile'),
    chromePath: config.get('chromePath'),
  });
}

function ensureMarkdownFile(uri: vscode.Uri): void {
  const extension = path.extname(uri.fsPath).toLowerCase();
  if (!markdownExtensions.has(extension)) {
    throw new Error('请选择 .md 或 .markdown 文件进行导出。');
  }
}

function isMarkdownDocument(document: vscode.TextDocument): boolean {
  return markdownLanguages.has(document.languageId) || markdownExtensions.has(path.extname(document.uri.fsPath).toLowerCase());
}

function isMarkdownSurfaceActive(editor: vscode.TextEditor | undefined): boolean {
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  let activeTabVisibility: boolean | undefined;
  if (input instanceof vscode.TabInputWebview) {
    activeTabVisibility = input.viewType === previewViewType;
  } else if (input instanceof vscode.TabInputText) {
    activeTabVisibility = isMarkdownUri(input.uri);
  } else if (input instanceof vscode.TabInputTextDiff) {
    activeTabVisibility = isMarkdownUri(input.modified) || isMarkdownUri(input.original);
  } else if (input) {
    activeTabVisibility = false;
  }
  return resolveMarkdownSurfaceVisibility(
    activeTabVisibility,
    editor ? isMarkdownDocument(editor.document) : false
  );
}

function isMarkdownUri(uri: vscode.Uri): boolean {
  const document = vscode.workspace.textDocuments.find(
    (candidate) => candidate.uri.toString() === uri.toString()
  );
  return document ? isMarkdownDocument(document) : markdownExtensions.has(path.extname(uri.fsPath).toLowerCase());
}

class MarkdownToPdfSidebarProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private sessionState: SidebarSessionState = createSidebarSessionState(readConfig().theme);
  private previewRefreshHandler?: () => void;

  constructor(private readonly context: vscode.ExtensionContext) {}

  setPreviewRefreshHandler(handler: () => void): void {
    this.previewRefreshHandler = handler;
  }

  getPreviewOptions(): { theme: BuiltInTheme; includeToc: boolean } {
    return {
      theme: this.sessionState.selectedTheme,
      includeToc: this.sessionState.includeToc,
    };
  }

  selectTextEditor(editor: vscode.TextEditor | undefined): void {
    if (!editor) {
      this.sessionState = updateSidebarFocus(this.sessionState, { kind: 'nonText' });
      return;
    }
    this.selectDocument(editor.document);
  }

  selectDocument(document: vscode.TextDocument): void {
    const isMarkdown = isMarkdownDocument(document) && !document.isUntitled;
    const sourcePath = isMarkdown ? document.uri.fsPath : undefined;
    this.sessionState = updateSidebarFocus(this.sessionState, {
      kind: 'document',
      sourcePath,
      defaultOutputPath: sourcePath ? replaceExtension(sourcePath, '.pdf') : undefined,
    });
    this.refresh();
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = { enableScripts: true };
    webviewView.webview.html = this.renderHtml();
    webviewView.webview.onDidReceiveMessage((message: unknown) => {
      void this.handleMessage(message);
    });
    this.refresh();
  }

  async chooseOutputPath(): Promise<void> {
    const state = this.getState();
    if (!state.isMarkdown || !state.sourcePath) {
      throw new Error('请先打开一个 Markdown 文档，再选择导出位置。');
    }

    const selected = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(state.outputPath ?? state.defaultOutputPath ?? replaceExtension(state.sourcePath, '.pdf')),
      filters: { PDF: ['pdf'] },
      saveLabel: '使用此位置',
    });

    if (selected) {
      this.sessionState = setSidebarOutputPath(this.sessionState, selected.fsPath);
      this.refresh();
    }
  }

  refresh(): void {
    const view = this.view;
    if (!view) {
      return;
    }

    const state = this.getState();
    void view.webview.postMessage({ type: 'state', state });
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!isRecord(message) || typeof message.type !== 'string') {
      return;
    }

    if (message.type === 'chooseOutputPath') {
      await this.chooseOutputPath();
      return;
    }

    if (message.type === 'setOutputPath') {
      this.sessionState = setSidebarOutputPath(this.sessionState, typeof message.outputPath === 'string' ? message.outputPath : '');
      return;
    }

    if (message.type === 'setTheme') {
      const previousTheme = this.sessionState.selectedTheme;
      this.sessionState = setSidebarTheme(this.sessionState, message.theme);
      this.refresh();
      if (this.sessionState.selectedTheme !== previousTheme) {
        this.previewRefreshHandler?.();
      }
      return;
    }

    if (message.type === 'setThemeOptions') {
      const previousIncludeToc = this.sessionState.includeToc;
      this.sessionState = setSidebarThemeOptions(
        this.sessionState,
        message.includeToc !== false,
        message.includePageNumbers !== false
      );
      if (this.sessionState.includeToc !== previousIncludeToc) {
        this.previewRefreshHandler?.();
      }
      return;
    }

    if (message.type !== 'export') {
      return;
    }

    const state = this.getState();
    if (!state.isMarkdown || !state.sourcePath) {
      this.postStatus('error', '请先打开一个 Markdown 文档。');
      return;
    }

    const outputPath = typeof message.outputPath === 'string' ? message.outputPath.trim() : '';
    if (!outputPath) {
      this.postStatus('error', '请输入导出位置。');
      return;
    }

    this.sessionState = setSidebarOutputPath(this.sessionState, outputPath);

    try {
      this.postStatus('running', '正在导出 PDF...');
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(state.sourcePath));
      await exportDocument(this.context, document.uri, document.getText(), {
        outputPath,
        showSaveDialog: false,
        includeToc: message.includeToc !== false,
        includePageNumbers: message.includePageNumbers !== false,
        theme: state.selectedTheme,
      });
      this.postStatus('success', `PDF 已导出：${outputPath}`);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.postStatus('error', detail);
    }
  }

  private getState(): SidebarState {
    const config = readConfig();
    const sourcePath = this.sessionState.sourcePath;
    const isMarkdown = Boolean(sourcePath);
    const defaultOutputPath = sourcePath ? replaceExtension(sourcePath, '.pdf') : undefined;

    return {
      isMarkdown,
      fileName: sourcePath ? path.basename(sourcePath) : undefined,
      sourcePath,
      defaultOutputPath,
      outputPath: this.sessionState.outputPath,
      selectedTheme: this.sessionState.selectedTheme,
      themePresets,
      includeToc: this.sessionState.includeToc,
      includePageNumbers: this.sessionState.includePageNumbers,
      pageFormat: config.pageFormat,
    };
  }

  private postStatus(kind: 'idle' | 'running' | 'success' | 'error', message: string): void {
    void this.view?.webview.postMessage({ type: 'status', kind, message });
  }

  private renderHtml(): string {
    const nonce = createNonce();
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Markdown To PDF</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      padding: 14px 12px 18px;
      color: var(--vscode-foreground);
      background: var(--vscode-sideBar-background);
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
    }
    .panel { display: flex; flex-direction: column; gap: 14px; }
    .file-card {
      padding: 10px;
      border: 1px solid var(--vscode-sideBarSectionHeader-border, var(--vscode-input-border, transparent));
      border-radius: 6px;
      background: var(--vscode-sideBarSectionHeader-background);
    }
    .file-title { font-weight: 600; line-height: 1.35; word-break: break-word; }
    .file-path { margin-top: 4px; color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.35; word-break: break-all; }
    .section { display: flex; flex-direction: column; gap: 7px; }
    .label { font-weight: 600; }
    .muted { color: var(--vscode-descriptionForeground); font-size: 12px; line-height: 1.4; word-break: break-all; }
    .inline-field { display: flex; gap: 6px; align-items: center; }
    .inline-field input { flex: 1; min-width: 0; }
    input[type="text"], select {
      width: 100%;
      min-height: 28px;
      padding: 3px 6px;
      color: var(--vscode-input-foreground);
      background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, transparent);
      border-radius: 2px;
    }
    button {
      min-height: 28px;
      padding: 4px 10px;
      color: var(--vscode-button-foreground);
      background: var(--vscode-button-background);
      border: 1px solid var(--vscode-button-border, transparent);
      border-radius: 2px;
      cursor: pointer;
      font-family: inherit;
    }
    button:hover { background: var(--vscode-button-hoverBackground); }
    .browse-button { flex: 0 0 auto; white-space: nowrap; }
    .export-button { width: 100%; font-weight: 600; }
    .option-list { display: flex; flex-direction: column; gap: 6px; }
    label.option { display: flex; gap: 7px; align-items: center; min-height: 22px; color: var(--vscode-foreground); }
    label.option input { margin: 0; }
    .status {
      padding: 8px 9px;
      border-left: 3px solid var(--vscode-descriptionForeground);
      border-radius: 3px;
      background: var(--vscode-input-background);
      color: var(--vscode-descriptionForeground);
      line-height: 1.4;
    }
    .status.running { border-left-color: var(--vscode-progressBar-background); color: var(--vscode-foreground); }
    .status.success { border-left-color: var(--vscode-testing-iconPassed); color: var(--vscode-testing-iconPassed); }
    .status.error { border-left-color: var(--vscode-errorForeground); color: var(--vscode-errorForeground); }
    .hidden { display: none; }
  </style>
</head>
<body>
  <div id="empty" class="muted">打开 Markdown 文件后，可在这里导出 PDF。</div>
  <div id="panel" class="panel hidden">
    <div class="file-card">
      <div id="fileName" class="file-title"></div>
      <div id="sourcePath" class="file-path"></div>
    </div>
    <div class="section">
      <span class="label">导出位置</span>
      <div class="inline-field">
        <input id="outputPath" type="text" aria-label="导出位置">
        <button id="choose" class="browse-button" type="button">浏览...</button>
      </div>
    </div>
    <div class="section">
      <span class="label">主题</span>
      <select id="theme"></select>
    </div>
    <div class="section">
      <span class="label">导出选项</span>
      <div class="option-list">
        <label class="option"><input id="includeToc" type="checkbox"> <span>生成目录页</span></label>
        <label class="option"><input id="includePageNumbers" type="checkbox" checked> <span>显示页脚页码</span></label>
      </div>
    </div>
    <div class="section">
      <span class="label">当前配置</span>
      <div id="configSummary" class="muted"></div>
    </div>
    <button id="export" class="export-button" type="button">导出 PDF</button>
    <div id="status" class="status idle">准备就绪。</div>
  </div>
  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    const panel = document.getElementById('panel');
    const empty = document.getElementById('empty');
    const fileName = document.getElementById('fileName');
    const sourcePath = document.getElementById('sourcePath');
    const outputPath = document.getElementById('outputPath');
    const theme = document.getElementById('theme');
    const includeToc = document.getElementById('includeToc');
    const includePageNumbers = document.getElementById('includePageNumbers');
    const configSummary = document.getElementById('configSummary');
    const status = document.getElementById('status');

    document.getElementById('choose').addEventListener('click', () => {
      vscode.postMessage({ type: 'chooseOutputPath' });
    });

    outputPath.addEventListener('input', () => {
      vscode.postMessage({ type: 'setOutputPath', outputPath: outputPath.value });
    });

    theme.addEventListener('change', () => {
      vscode.postMessage({ type: 'setTheme', theme: theme.value });
    });

    includeToc.addEventListener('change', postThemeOptions);
    includePageNumbers.addEventListener('change', postThemeOptions);

    document.getElementById('export').addEventListener('click', () => {
      vscode.postMessage({
        type: 'export',
        outputPath: outputPath.value,
        includeToc: includeToc.checked,
        includePageNumbers: includePageNumbers.checked
      });
    });

    window.addEventListener('message', (event) => {
      const message = event.data;
      if (message.type === 'state') {
        renderState(message.state);
      }
      if (message.type === 'status') {
        renderStatus(message.kind, message.message);
      }
    });

    function renderState(state) {
      panel.classList.toggle('hidden', !state.isMarkdown);
      empty.classList.toggle('hidden', state.isMarkdown);
      if (!state.isMarkdown) {
        return;
      }
      fileName.textContent = state.fileName || '';
      sourcePath.textContent = state.sourcePath || '';
      outputPath.value = state.outputPath || '';
      renderThemeOptions(state.themePresets || [], state.selectedTheme);
      includeToc.checked = state.includeToc === true;
      includePageNumbers.checked = state.includePageNumbers !== false;
      const pageDescription = state.selectedTheme === 'beamer' ? '128 x 96 mm (4:3)' : state.pageFormat;
      configSummary.textContent = '主题：' + selectedThemeLabel(state.themePresets || [], state.selectedTheme) + ' · 页面：' + pageDescription;
    }

    function renderThemeOptions(presets, selectedTheme) {
      const currentOptions = Array.from(theme.options).map((option) => option.value).join(',');
      const nextOptions = presets.map((preset) => preset.id).join(',');
      if (currentOptions !== nextOptions) {
        theme.replaceChildren(...presets.map((preset) => {
          const option = document.createElement('option');
          option.value = preset.id;
          option.textContent = preset.label;
          return option;
        }));
      }
      theme.value = selectedTheme || 'academic';
    }

    function selectedThemeLabel(presets, selectedTheme) {
      const preset = presets.find((item) => item.id === selectedTheme);
      return preset ? preset.label : selectedTheme;
    }

    function postThemeOptions() {
      vscode.postMessage({
        type: 'setThemeOptions',
        includeToc: includeToc.checked,
        includePageNumbers: includePageNumbers.checked
      });
    }

    function renderStatus(kind, message) {
      status.className = 'status ' + kind;
      status.textContent = message;
    }
  </script>
</body>
</html>`;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function createNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let index = 0; index < 32; index += 1) {
    nonce += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return nonce;
}
