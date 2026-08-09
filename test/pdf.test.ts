import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config';
import { exportMarkdownToPdf, toPdfOptions, validatePdfOutputPath } from '../src/pdf';

describe('pdf export', () => {
  it('rejects unsafe output paths before export', () => {
    expect(() => validatePdfOutputPath('E:/docs/source.md', 'E:/docs/source.md')).toThrow(
      'must end with ".pdf"'
    );
    expect(() => validatePdfOutputPath('E:/docs/source.pdf', 'E:/docs/source.pdf')).toThrow(
      'must not overwrite'
    );
    expect(() => validatePdfOutputPath('E:/docs/source.md', 'E:/docs/source.PDF')).not.toThrow();
  });

  it('builds page-number footer options only when requested', () => {
    const withoutPageNumbers = toPdfOptions(defaultConfig, 'E:/docs/sample.pdf');
    const withPageNumbers = toPdfOptions(defaultConfig, 'E:/docs/sample.pdf', true);

    expect(withoutPageNumbers.displayHeaderFooter).toBeUndefined();
    expect(withoutPageNumbers.footerTemplate).toBeUndefined();
    expect(withPageNumbers.displayHeaderFooter).toBe(true);
    expect(withPageNumbers.headerTemplate).toBe('<span></span>');
    expect(withPageNumbers.footerTemplate).toContain('pageNumber');
    expect(withPageNumbers.footerTemplate).toContain('totalPages');
    expect(withPageNumbers.footerTemplate).toContain('&#31532;');
  });

  it('uses landscape css-sized pages for beamer without default footer', () => {
    const options = toPdfOptions({ ...defaultConfig, theme: 'beamer' }, 'E:/docs/slides.pdf');

    expect(options.width).toBe('128mm');
    expect(options.height).toBe('96mm');
    expect(options.format).toBeUndefined();
    expect(options.preferCSSPageSize).toBe(true);
    expect(options.margin).toEqual({
      top: '0',
      right: '0',
      bottom: '0',
      left: '0',
    });
    expect(options.displayHeaderFooter).toBeUndefined();
    expect(options.footerTemplate).toBeUndefined();
  });

  it('renders optional beamer page numbers in white on the built-in footer', () => {
    const options = toPdfOptions(
      { ...defaultConfig, theme: 'beamer' },
      'E:/docs/slides.pdf',
      true
    );

    expect(options.displayHeaderFooter).toBe(true);
    expect(options.footerTemplate).toContain('color:#fff');
    expect(options.footerTemplate).toContain('text-align:right');
  });

  it.skipIf(!process.env.M2PDF_E2E_BROWSER)('exports a non-empty pdf with a configured browser', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'markdown2pdf-'));
    const outputPath = path.join(tempDir, 'sample.pdf');

    try {
      await writeFile(
        path.join(tempDir, 'local-image.svg'),
        '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="#205493"/></svg>',
        'utf8'
      );
      await exportMarkdownToPdf({
        sourcePath: path.join(tempDir, 'sample.md'),
        markdown: [
          '# PDF',
          '',
          'Inline math $x^2$.',
          '',
          '$$(x_1+\\cdots+x_r)^n=',
          '\\sum_{k_1+\\cdots+k_r=n}\\binom n{k_1,\\dots,k_r}x_1^{k_1}\\cdots x_r^{k_r}.$$',
          '',
          '$$\\begin{aligned}',
          '\\frac{x}{(1-x)(1-2x)}',
          ' &=x\\left\\{\\frac2{1-2x}-\\frac1{1-x}\\right\\}\\\\',
          ' &=\\{2x+2^2x^2+2^3x^3+2^4x^4+\\cdots\\}\\\\',
          ' &\\quad-\\{x+x^2+x^3+x^4+\\cdots\\}\\\\',
          ' &=(2-1)x+(2^2-1)x^2+(2^3-1)x^3+(2^4-1)x^4+\\cdots.',
          '\\end{aligned}$$',
          '',
          '![Markdown image](local-image.svg)',
          '',
          '<img src="local-image.svg" alt="Raw HTML image">',
          '',
          '```ts',
          'const value = 1;',
          '```',
        ].join('\n'),
        outputPath,
        executablePath: process.env.M2PDF_E2E_BROWSER!,
        config: defaultConfig,
        includeToc: true,
        includePageNumbers: true,
      });

      const output = await stat(outputPath);
      expect(output.size).toBeGreaterThan(1000);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it.skipIf(!process.env.M2PDF_E2E_BROWSER)('fails clearly when a local image cannot load', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'markdown2pdf-'));

    try {
      await expect(
        exportMarkdownToPdf({
          sourcePath: path.join(tempDir, 'sample.md'),
          markdown: '# Missing image\n\n![Missing](does-not-exist.png)',
          outputPath: path.join(tempDir, 'missing-image.pdf'),
          executablePath: process.env.M2PDF_E2E_BROWSER!,
          config: defaultConfig,
        })
      ).rejects.toThrow('Failed to load one or more images');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it.skipIf(!process.env.M2PDF_E2E_BROWSER)('exports mathtools formulas with a configured browser', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'markdown2pdf-'));
    const outputPath = path.join(tempDir, 'mathtools.pdf');

    try {
      await exportMarkdownToPdf({
        sourcePath: path.join(tempDir, 'sample.md'),
        markdown: '# MathJax\n\n$$\\mathclap{x+y}$$',
        outputPath,
        executablePath: process.env.M2PDF_E2E_BROWSER!,
        config: defaultConfig,
      });

      const output = await stat(outputPath);
      expect(output.size).toBeGreaterThan(1000);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it.skipIf(!process.env.M2PDF_E2E_BROWSER)('fails when MathJax renders an error', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'markdown2pdf-'));
    const outputPath = path.join(tempDir, 'bad-math.pdf');

    try {
      await expect(
        exportMarkdownToPdf({
          sourcePath: path.join(tempDir, 'sample.md'),
          markdown: '# Bad Math\n\n$$\\definitelyUnknown{x}$$',
          outputPath,
          executablePath: process.env.M2PDF_E2E_BROWSER!,
          config: defaultConfig,
        })
      ).rejects.toThrow('MathJax failed to render');
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });
});
