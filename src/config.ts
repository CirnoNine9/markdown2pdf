export type BuiltInTheme = 'academic' | 'beamer';

export interface ThemePreset {
  id: BuiltInTheme;
  label: string;
  includeToc: boolean;
  includePageNumbers: boolean;
}

export interface PageMargin {
  top: string;
  right: string;
  bottom: string;
  left: string;
}

export interface ExportConfig {
  theme: BuiltInTheme;
  codeTheme: string;
  pageFormat: string;
  margin: PageMargin;
  fontFamily: string;
  beamerFooterText: string;
  customCssFile?: string;
  chromePath?: string;
}

const defaultMargin: PageMargin = {
  top: '18mm',
  right: '18mm',
  bottom: '18mm',
  left: '18mm',
};

export const themePresets: readonly ThemePreset[] = [
  {
    id: 'academic',
    label: '学术',
    includeToc: false,
    includePageNumbers: true,
  },
  {
    id: 'beamer',
    label: 'Beamer',
    includeToc: false,
    includePageNumbers: false,
  },
] as const;

const builtInThemes = new Set<BuiltInTheme>(themePresets.map((preset) => preset.id));

export const defaultConfig: ExportConfig = {
  theme: 'academic',
  codeTheme: 'github-light',
  pageFormat: 'A4',
  margin: defaultMargin,
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
  beamerFooterText: '',
};

export function isBuiltInTheme(value: unknown): value is BuiltInTheme {
  return typeof value === 'string' && builtInThemes.has(value as BuiltInTheme);
}

export function getThemePreset(theme: BuiltInTheme): ThemePreset {
  return themePresets.find((preset) => preset.id === theme) ?? themePresets[0];
}

export function normalizeConfig(raw: Partial<ExportConfig> = {}): ExportConfig {
  const candidateTheme = raw.theme ?? defaultConfig.theme;
  const theme: BuiltInTheme = isBuiltInTheme(candidateTheme)
    ? candidateTheme
    : defaultConfig.theme;

  return {
    theme,
    codeTheme: raw.codeTheme || defaultConfig.codeTheme,
    pageFormat: raw.pageFormat || defaultConfig.pageFormat,
    margin: {
      top: raw.margin?.top || defaultMargin.top,
      right: raw.margin?.right || defaultMargin.right,
      bottom: raw.margin?.bottom || defaultMargin.bottom,
      left: raw.margin?.left || defaultMargin.left,
    },
    fontFamily: raw.fontFamily || defaultConfig.fontFamily,
    beamerFooterText: raw.beamerFooterText?.trim() || defaultConfig.beamerFooterText,
    customCssFile: raw.customCssFile?.trim() || undefined,
    chromePath: raw.chromePath?.trim() || undefined,
  };
}
