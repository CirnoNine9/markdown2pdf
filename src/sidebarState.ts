import path from 'node:path';
import { getThemePreset, isBuiltInTheme, type BuiltInTheme } from './config';

export interface SidebarSessionState {
  sourcePath?: string;
  outputPath?: string;
  outputPathTouched: boolean;
  selectedTheme: BuiltInTheme;
  themeOptionsTouched: boolean;
  includeToc: boolean;
  includePageNumbers: boolean;
}

export type SidebarFocus =
  | { kind: 'nonText' }
  | { kind: 'document'; sourcePath?: string; defaultOutputPath?: string };

export function createSidebarSessionState(theme: BuiltInTheme): SidebarSessionState {
  const preset = getThemePreset(theme);
  return {
    outputPathTouched: false,
    selectedTheme: theme,
    themeOptionsTouched: false,
    includeToc: preset.includeToc,
    includePageNumbers: preset.includePageNumbers,
  };
}

export function updateSidebarSource(
  state: SidebarSessionState,
  sourcePath: string | undefined,
  defaultOutputPath: string | undefined
): SidebarSessionState {
  const sourceChanged = state.sourcePath !== sourcePath;
  const shouldUseDefaultOutput = !state.outputPathTouched || sourceChanged;

  return {
    ...state,
    sourcePath,
    outputPath: shouldUseDefaultOutput ? defaultOutputPath : state.outputPath,
    outputPathTouched: sourceChanged ? false : state.outputPathTouched,
  };
}

export function updateSidebarFocus(
  state: SidebarSessionState,
  focus: SidebarFocus
): SidebarSessionState {
  if (focus.kind === 'nonText') {
    return state;
  }
  return updateSidebarSource(state, focus.sourcePath, focus.defaultOutputPath);
}

export function setSidebarOutputPath(state: SidebarSessionState, outputPath: string): SidebarSessionState {
  return {
    ...state,
    outputPath,
    outputPathTouched: true,
  };
}

export function setSidebarTheme(state: SidebarSessionState, theme: unknown): SidebarSessionState {
  if (!isBuiltInTheme(theme)) {
    return state;
  }

  const preset = getThemePreset(theme);
  return {
    ...state,
    selectedTheme: theme,
    includeToc: state.themeOptionsTouched ? state.includeToc : preset.includeToc,
    includePageNumbers: state.themeOptionsTouched ? state.includePageNumbers : preset.includePageNumbers,
  };
}

export function setSidebarThemeOptions(
  state: SidebarSessionState,
  includeToc: boolean,
  includePageNumbers: boolean
): SidebarSessionState {
  return {
    ...state,
    includeToc,
    includePageNumbers,
    themeOptionsTouched: true,
  };
}

export function replaceExtension(filePath: string, extension: string): string {
  return path.join(path.dirname(filePath), `${path.basename(filePath, path.extname(filePath))}${extension}`);
}
