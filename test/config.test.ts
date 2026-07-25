import { describe, expect, it } from 'vitest';
import { getThemePreset, normalizeConfig, themePresets } from '../src/config';
import { buildCss } from '../src/theme';

describe('configuration', () => {
  it('normalizes invalid theme and partial margins', () => {
    const config = normalizeConfig({
      theme: 'invalid' as never,
      margin: {
        top: '10mm',
        right: '',
        bottom: '',
        left: '',
      },
    });

    expect(config.theme).toBe('academic');
    expect(config.margin.top).toBe('10mm');
    expect(config.margin.right).toBe('18mm');
  });

  it('throws a clear error for missing custom css', async () => {
    const config = normalizeConfig({ customCssFile: 'Z:/missing/custom.css' });

    await expect(buildCss(config)).rejects.toThrow('Unable to read custom CSS file');
  });

  it('defines theme presets for all built-in themes', () => {
    expect(themePresets.map((preset) => preset.id)).toEqual(['academic', 'beamer']);
    expect(getThemePreset('academic')).toMatchObject({
      label: '学术',
      includeToc: false,
      includePageNumbers: true,
    });
    expect(getThemePreset('beamer')).toMatchObject({
      label: 'Beamer',
      includeToc: false,
      includePageNumbers: false,
    });
  });
});
