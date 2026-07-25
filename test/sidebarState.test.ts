import { describe, expect, it } from 'vitest';
import {
  createSidebarSessionState,
  setSidebarOutputPath,
  setSidebarTheme,
  setSidebarThemeOptions,
  updateSidebarFocus,
  updateSidebarSource,
} from '../src/sidebarState';

describe('sidebar state', () => {
  it('defaults output path to the current markdown file pdf path', () => {
    const state = updateSidebarSource(
      createSidebarSessionState('academic'),
      'E:/docs/sample.md',
      'E:/docs/sample.pdf'
    );

    expect(state.outputPath).toBe('E:/docs/sample.pdf');
    expect(state.outputPathTouched).toBe(false);
  });

  it('keeps a manually typed output path until the source file changes', () => {
    const initial = updateSidebarSource(
      createSidebarSessionState('academic'),
      'E:/docs/sample.md',
      'E:/docs/sample.pdf'
    );
    const edited = setSidebarOutputPath(initial, 'E:/exports/custom.pdf');
    const sameSource = updateSidebarSource(edited, 'E:/docs/sample.md', 'E:/docs/sample.pdf');
    const nextSource = updateSidebarSource(sameSource, 'E:/docs/next.md', 'E:/docs/next.pdf');

    expect(sameSource.outputPath).toBe('E:/exports/custom.pdf');
    expect(nextSource.outputPath).toBe('E:/docs/next.pdf');
    expect(nextSource.outputPathTouched).toBe(false);
  });

  it('keeps the selected markdown and output path on non-text focus', () => {
    const selected = updateSidebarSource(
      createSidebarSessionState('academic'),
      'E:/docs/sample.md',
      'E:/docs/sample.pdf'
    );
    const edited = setSidebarOutputPath(selected, 'E:/exports/custom.pdf');
    const previewFocused = updateSidebarFocus(edited, { kind: 'nonText' });

    expect(previewFocused).toBe(edited);
    expect(previewFocused.sourcePath).toBe('E:/docs/sample.md');
    expect(previewFocused.outputPath).toBe('E:/exports/custom.pdf');
    expect(previewFocused.outputPathTouched).toBe(true);
  });

  it('switches to the focused preview document and clears on a non-markdown editor', () => {
    const documentB = updateSidebarSource(
      createSidebarSessionState('academic'),
      'E:/docs/b.md',
      'E:/docs/b.pdf'
    );
    const previewA = updateSidebarFocus(documentB, {
      kind: 'document',
      sourcePath: 'E:/docs/a.md',
      defaultOutputPath: 'E:/docs/a.pdf',
    });
    const nonMarkdown = updateSidebarFocus(previewA, { kind: 'document' });

    expect(previewA.sourcePath).toBe('E:/docs/a.md');
    expect(previewA.outputPath).toBe('E:/docs/a.pdf');
    expect(nonMarkdown.sourcePath).toBeUndefined();
    expect(nonMarkdown.outputPath).toBeUndefined();
  });

  it('applies theme defaults until export options are manually changed', () => {
    const initial = createSidebarSessionState('academic');
    const beamer = setSidebarTheme(initial, 'beamer');
    const changedOptions = setSidebarThemeOptions(beamer, false, true);
    const academic = setSidebarTheme(changedOptions, 'academic');

    expect(beamer.includeToc).toBe(false);
    expect(beamer.includePageNumbers).toBe(false);
    expect(academic.includeToc).toBe(false);
    expect(academic.includePageNumbers).toBe(true);
  });

  it('keeps manually changed export options when switching themes', () => {
    const initial = createSidebarSessionState('academic');
    const changedOptions = setSidebarThemeOptions(initial, false, true);
    const beamer = setSidebarTheme(changedOptions, 'beamer');

    expect(beamer.includeToc).toBe(false);
    expect(beamer.includePageNumbers).toBe(true);
  });
});
