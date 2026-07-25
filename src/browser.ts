import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  install,
  resolveBuildId,
  Browser,
  ChromeReleaseChannel,
  detectBrowserPlatform,
} from '@puppeteer/browsers';
import * as vscode from 'vscode';
import type { ExportConfig } from './config';

export async function resolveBrowserExecutable(
  config: ExportConfig,
  context: vscode.ExtensionContext
): Promise<string> {
  if (config.chromePath && existsSync(config.chromePath)) {
    return config.chromePath;
  }

  const localBrowser = findSystemBrowser();
  if (localBrowser) {
    return localBrowser;
  }

  const choice = await vscode.window.showWarningMessage(
    'Markdown To PDF could not find Chrome or Edge. Install a managed Chromium runtime for this extension?',
    'Install Chromium',
    'Cancel'
  );

  if (choice !== 'Install Chromium') {
    throw new Error('Chrome, Edge, or Chromium is required to export PDF.');
  }

  const cacheDir = path.join(context.globalStorageUri.fsPath, 'browsers');
  const platform = detectBrowserPlatform();
  if (!platform) {
    throw new Error(`Unsupported platform for managed Chromium: ${os.platform()}`);
  }

  const buildId = await resolveBuildId(Browser.CHROME, platform, ChromeReleaseChannel.STABLE);
  const installed = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Installing Chromium for Markdown To PDF',
      cancellable: false,
    },
    () =>
      install({
        browser: Browser.CHROME,
        buildId,
        cacheDir,
        platform,
      })
  );

  return installed.executablePath;
}

function findSystemBrowser(): string | undefined {
  const candidates = process.platform === 'win32' ? windowsBrowserCandidates() : unixBrowserCandidates();
  return candidates.find((candidate) => existsSync(candidate));
}

function windowsBrowserCandidates(): string[] {
  const programFiles = process.env.ProgramFiles ?? 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)';
  const localAppData = process.env.LOCALAPPDATA ?? '';

  return [
    path.join(programFiles, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(programFilesX86, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(localAppData, 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(programFiles, 'Microsoft\\Edge\\Application\\msedge.exe'),
    path.join(programFilesX86, 'Microsoft\\Edge\\Application\\msedge.exe'),
  ];
}

function unixBrowserCandidates(): string[] {
  if (process.platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
    ];
  }

  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/microsoft-edge',
  ];
}
