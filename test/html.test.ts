import { readFile } from 'node:fs/promises';
import path from 'node:path';
import puppeteer from 'puppeteer-core';
import { describe, expect, it, vi } from 'vitest';
import { defaultConfig } from '../src/config';
import { normalizeImageSource, renderMarkdownDocument, wrapBeamerFrames } from '../src/html';

describe('markdown rendering', () => {
  it('renders gfm-style content and local image paths', async () => {
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/sample.md',
      content: [
        '# Title',
        '',
        '- [x] done',
        '',
        '| A | B |',
        '| - | - |',
        '| 1 | 2 |',
        '',
        '![Alt](images/pic.png)',
        '',
        '<img src="images/raw-pic.png" alt="Raw image">',
        '',
        '```ts',
        'const answer = 42;',
        '```',
      ].join('\n'),
      config: defaultConfig,
    });

    expect(html).toContain('<table>');
    expect(html).toContain('task-list-item-checkbox');
    expect(html).toContain('file:///E:/docs/images/pic.png');
    expect(html).toContain('file:///E:/docs/images/raw-pic.png');
    expect(html).toContain('overflow-wrap: anywhere');
    expect(html).toContain('shiki');
    expect(html).toContain('answer');
    expect(html).toContain('42');
    expect(html).toContain('markdown2pdf-theme-academic');
  });

  it('supports webview image URLs and automatic MathJax typesetting for previews', async () => {
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/sample.md',
      content: [
        '![Local](images/pic.png)',
        '',
        '![Remote](https://example.com/pic.png)',
        '',
        '<img src="images/raw-pic.png" alt="Raw image">',
      ].join('\n'),
      config: defaultConfig,
      autoTypesetMath: true,
      mathJaxScriptSource: 'https://preview.invalid/mathjax.js',
      resolveImageSource: (source) =>
        source.startsWith('file:') ? 'https://preview.invalid/local-image.png' : source,
    });

    expect(html).toContain('src="https://preview.invalid/local-image.png"');
    expect(html).toContain('src="https://example.com/pic.png"');
    expect(html.match(/src="https:\/\/preview\.invalid\/local-image\.png"/g)).toHaveLength(2);
    expect(html).toContain('typeset: true');
    expect(html).toContain('<script src="https://preview.invalid/mathjax.js"></script>');
  });

  it('renders normal inline and display math', async () => {
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/sample.md',
      content: [
        'Inline $a^2 + b^2 = c^2$ and paren \\(x+1\\).',
        '',
        '$$',
        '\\int_0^1 x dx',
        '$$',
        '',
        '\\[',
        '\\begin{bmatrix}1 & 2\\\\3 & 4\\end{bmatrix}',
        '\\]',
        '',
        '$$\\mathclap{x+y}$$',
      ].join('\n'),
      config: defaultConfig,
    });

    expect(html).toContain('<span class="math-inline"');
    expect(html).toContain('\\(a^2 + b^2 = c^2\\)');
    expect(html).toContain('\\(x+1\\)');
    expect(html).toContain('<div class="math-display"');
    expect(html).toContain('\\[\\int_0^1 x dx\\]');
    expect(html).toContain('\\[\\begin{bmatrix}1 &amp; 2\\\\3 &amp; 4\\end{bmatrix}\\]');
    expect(html).toContain('\\[\\mathclap{x+y}\\]');
  });

  it('loads MathJax independently of the consumer working directory', async () => {
    const driveRoot = path.parse(process.cwd()).root;
    const cwd = vi
      .spyOn(process, 'cwd')
      .mockReturnValue(path.join(driveRoot, 'external-consumer'));

    try {
      const html = await renderMarkdownDocument({
        sourcePath: 'E:/docs/sample.md',
        content: '$$x^2$$',
        config: defaultConfig,
      });

      expect(html).toContain('<div class="math-display"');
    } finally {
      cwd.mockRestore();
    }
  });

  it('renders standalone numeric single-dollar math', async () => {
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/sample.md',
      content: [
        '$1$',
        '',
        'Decimal $2.5$.',
        '',
        'Power $2^{23}$.',
        '',
        'Price is \\$5 plus inline $x+1$.',
      ].join('\n'),
      config: defaultConfig,
    });

    expect(html).toContain('\\(1\\)');
    expect(html).toContain('\\(2.5\\)');
    expect(html).toContain('\\(2^{23}\\)');
    expect(html).toContain('Price is $5 plus inline <span class="math-inline"');
    expect(html).toContain('\\(x+1\\)');
    expect(html).not.toContain('\\(5 plus inline\\)');
  });

  it('renders comma-separated numeric math in paragraphs and table cells', async () => {
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/sample.md',
      content: [
        'Paragraph $1,2$.',
        '',
        '| Value |',
        '| --- |',
        '| $1,2$ |',
      ].join('\n'),
      config: defaultConfig,
    });
    const body = mainContent(html);

    expect(body).toContain(
      '<p>Paragraph <span class="math-inline" data-math-source="1,2">\\(1,2\\)</span>.</p>'
    );
    expect(body).toContain(
      '<td><span class="math-inline" data-math-source="1,2">\\(1,2\\)</span></td>'
    );
    expect(html.match(/data-math-source="1,2"/g)).toHaveLength(2);
  });

  it('treats paired single dollars as math without guessing the TeX grammar', async () => {
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/sample.md',
      content: [
        'Expressions: $1+1$, $2 x$, $1≤2$, and $arbitrary words$.',
        '',
        'Ambiguous: $1 and $1+1$.',
        '',
        'Unescaped range $5-$10.',
        '',
        'Operator boundary $1+$1+1$.',
        '',
        'Adjacent text $1$2.',
        '',
        '| Expression |',
        '| --- |',
        '| $1≤2$ |',
      ].join('\n'),
      config: defaultConfig,
    });
    const body = mainContent(html);

    expect(body).toContain('data-math-source="1+1">\\(1+1\\)</span>');
    expect(body).toContain('data-math-source="2 x">\\(2 x\\)</span>');
    expect(body.match(/data-math-source="1≤2"/g)).toHaveLength(2);
    expect(body).toContain('data-math-source="arbitrary words">\\(arbitrary words\\)</span>');
    expect(body).toContain(
      'Ambiguous: <span class="math-inline" data-math-source="1 and">\\(1 and\\)</span>1+1$.'
    );
    expect(body).toContain('Unescaped range <span class="math-inline" data-math-source="5-">');
    expect(body).toContain(
      'Operator boundary <span class="math-inline" data-math-source="1+">\\(1+\\)</span>1+1$.'
    );
    expect(body).toContain(
      'Adjacent text <span class="math-inline" data-math-source="1">\\(1\\)</span>2.'
    );
  });

  it('renders numeric-leading TeX with trailing delimiter whitespace', async () => {
    const formula = "$1-x\\Phi'(T(x))=1-\\dfrac{T(x)\\Phi'(T(x))}{\\Phi(T(x))} $";
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/sample.md',
      content: formula,
      config: defaultConfig,
    });

    expect(mainContent(html)).toContain('<span class="math-inline"');
    expect(html).toContain("\\(1-x\\Phi'(T(x))=1-\\dfrac{T(x)\\Phi'(T(x))}{\\Phi(T(x))}\\)");
  });

  it('treats standalone single-dollar multiline math as display math', async () => {
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/sample.md',
      content: [
        '$',
        '\\phi(x,a) = ',
        '\\left\\{\\begin{matrix}',
        '  & x \\quad a=0  \\\\',
        '  & \\phi(x,a-1)-\\phi(\\frac{x}{p_a},a-1)\\quad a\\not=0',
        '\\end{matrix}\\right.',
        '$',
      ].join('\n'),
      config: defaultConfig,
    });

    expect(html).toContain('<div class="math-display"');
    expect(html).toContain('\\[\\phi(x,a)');
    expect(html).toContain('\\end{matrix}\\right.\\]');
    expect(html).not.toContain('<span class="math-inline"');
  });

  it('keeps compatible embedded multiline dollar math as inline math', async () => {
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/sample.md',
      content: [
        '测试行内：$',
        '\\phi(x,a) = ',
        '\\left\\{\\begin{matrix}',
        '  & x \\quad a=0  \\\\',
        '  & \\phi(x,a-1)-\\phi(\\frac{x}{p_a},a-1)\\quad a\\not=0',
        '\\end{matrix}\\right.',
        '$ 测试。',
      ].join('\n'),
      config: defaultConfig,
    });

    expect(html).toContain('<p>测试行内：<span class="math-inline"');
    expect(html).toContain('\\(\\phi(x,a)');
    expect(html).toContain('\\end{matrix}\\right.\\)');
    expect(html).toContain('</span> 测试。</p>');
    expect(html).not.toContain('<div class="math-display"');
  });

  it('uses escaped dollars for literal currency alongside math', async () => {
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/sample.md',
      content: [
        'Price is \\$5 plus inline $x+1$.',
        '',
        'Escaped amount: \\$1 and $1+1$.',
        '',
        'Range: \\$5-\\$10 then real $y$.',
      ].join('\n'),
      config: defaultConfig,
    });

    expect(html).toContain('Price is $5 plus inline <span class="math-inline"');
    expect(html).toContain('\\(x+1\\)');
    expect(html).toContain(
      'Escaped amount: $1 and <span class="math-inline" data-math-source="1+1">\\(1+1\\)</span>.'
    );
    expect(html).toContain('Range: $5-$10 then real <span class="math-inline"');
    expect(html).toContain('\\(y\\)');
    expect(html).not.toContain('data-math-source="5-"');
  });

  it('does not parse math delimiters inside inline or fenced code', async () => {
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/sample.md',
      content: [
        '`$x$` should stay code.',
        '',
        '```tex',
        '$x$',
        '$$y$$',
        '\\mathclap{x+y}',
        '```',
      ].join('\n'),
      config: defaultConfig,
    });
    const body = mainContent(html);

    expect(body).toContain('<code>$x$</code>');
    expect(body).toContain('$</span><span style="color:#005CC5">x</span><span style="color:#032F62">$');
    expect(body).toContain('\\mathclap');
    expect(body).not.toContain('@@MARKDOWN2PDF_MATH_');
    expect(body).not.toContain('math-inline');
    expect(body).not.toContain('math-display');
  });

  it('does not render paragraph-level double dollars as display math', async () => {
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/sample.md',
      content: 'List item: $$a+b$$ trailing text after display math.',
      config: defaultConfig,
    });

    expect(mainContent(html)).toContain('<p>List item: $$a+b$$ trailing text after display math.</p>');
    expect(html).not.toContain('<div class="math-display"');
  });

  it('normalizes image sources', () => {
    expect(normalizeImageSource('https://example.com/a.png', 'E:/docs')).toBe('https://example.com/a.png');
    expect(normalizeImageSource('images/a.png', 'E:/docs')).toBe('file:///E:/docs/images/a.png');
  });

  it('falls back for unknown code language', async () => {
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/sample.md',
      content: '```unknown-language\nvalue\n```',
      config: defaultConfig,
    });

    expect(html).toContain('value');
    expect(html).toContain('<pre');
  });

  it('preserves ordered-list numbering and open details content', async () => {
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/sample.md',
      content: [
        '5. Fifth',
        '6. Sixth',
        '',
        '<details open><summary>More</summary><p>Visible details</p></details>',
      ].join('\n'),
      config: defaultConfig,
    });

    expect(html).toContain('<ol start="5">');
    expect(html).toMatch(/<details open(?:="")?>/);
    expect(html).toContain('<p>Visible details</p>');
  });

  it('adds a table of contents when requested', async () => {
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/sample.md',
      content: [
        '# Title',
        '',
        '## 中文标题',
        '',
        '## Formatted *title* with `code` and [link](https://example.com)',
        '',
        '#### Ignored',
        '',
        '```md',
        '# Not a heading',
        '```',
        '',
        '### Title',
      ].join('\n'),
      config: defaultConfig,
      includeToc: true,
    });

    expect(html).toContain('class="markdown2pdf-toc"');
    expect(html).toContain('href="#title"');
    expect(html).toContain('href="#%E4%B8%AD%E6%96%87%E6%A0%87%E9%A2%98"');
    expect(html).toContain('>Formatted title with code and link</a>');
    expect(html).not.toContain('>Formatted *title* with `code`');
    expect(html).toContain('href="#title-1"');
    expect(html).not.toContain('href="#ignored"');
    expect(html).not.toContain('href="#not-a-heading"');
  });

  it('adds the beamer theme class and keeps table of contents support', async () => {
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/slides.md',
      content: '# Title\n\n## Agenda',
      config: { ...defaultConfig, theme: 'beamer' },
      includeToc: true,
    });

    expect(html).toContain('markdown2pdf-theme-beamer');
    expect(html).toContain('markdown2pdf-beamer-nav');
    expect(html).toContain('markdown2pdf-beamer-footer');
    expect(html).toContain('class="markdown2pdf-toc"');
    expect(html).toContain('href="#agenda"');
  });

  it('adds page-number placeholders to the table of contents only when requested', async () => {
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/sample.md',
      content: '# Title\n\n## Section',
      config: defaultConfig,
      includeToc: true,
      includeTocPageNumbers: true,
    });

    expect(html).toContain('class="markdown2pdf-toc-label"');
    expect(html).toContain('class="markdown2pdf-toc-leader"');
    expect(html).toContain('class="markdown2pdf-toc-page-number"');
  });

  it('wraps beamer h2 sections in slide frames', () => {
    const html = wrapBeamerFrames('<h1>Deck</h1><h2>A</h2><p>One</p><h2>B</h2><p>Two</p>');

    expect(html).toContain('<h1>Deck</h1>');
    expect(html.match(/markdown2pdf-beamer-frame/g)).toHaveLength(2);
    expect(html).toContain('markdown2pdf-beamer-nav');
    expect(html).toContain('<span class="markdown2pdf-beamer-nav-title">Deck</span>');
    expect(html).toContain('<h2>A</h2><p>One</p>');
    expect(html).toContain('<h2>B</h2><p>Two</p>');
    expect(html.match(/markdown2pdf-beamer-marker-active/g)).toHaveLength(2);
  });

  it('keeps nested lists intact until browser-side pagination', () => {
    const html = wrapBeamerFrames(
      '<h1>Deck</h1><h2>List</h2><ul><li>Outer<ul><li>Inner</li></ul></li><li>Tail</li></ul>'
    );

    expect(html.match(/markdown2pdf-beamer-frame(?:\s|\")/g)).toHaveLength(1);
    expect(html).toContain('<li>Outer<ul><li>Inner</li></ul></li><li>Tail</li>');
  });

  it('preserves content before the first h1 and heading-only sections', () => {
    const html = wrapBeamerFrames(
      '<p>Before title</p><h1>Deck</h1><h2>Empty</h2><h2>Filled</h2><p>Body</p>'
    );

    expect(html).toContain('<p>Before title</p>');
    expect(html).toContain('<h2>Empty</h2>');
    expect(html).toContain('<h2>Filled</h2><p>Body</p>');
    expect(html.match(/markdown2pdf-beamer-frame(?:\s|\")/g)).toHaveLength(3);
  });

  it('builds beamer frames when the document has no h1', () => {
    const html = wrapBeamerFrames('<h2>Section</h2><p>Body</p>');

    expect(html).toContain('markdown2pdf-beamer-frame');
    expect(html).toContain('<h2>Section</h2><p>Body</p>');
  });

  it('embeds browser-side beamer pagination and keeps marker view boxes', async () => {
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/slides.md',
      content: '# Deck\n\n## Slide\n\nBody',
      config: { ...defaultConfig, theme: 'beamer' },
      autoTypesetMath: true,
      mathJaxScriptSource: 'https://preview.invalid/mathjax.js',
    });

    expect(html).toContain('markdown2pdfPaginateBeamer');
    expect(html).toContain('markdown2pdfBeamerPaginationReady');
    expect(html).toContain('data-beamer-deck-index="0"');
    expect(html).toMatch(/<svg[^>]+viewbox="0 0 [^"]+"/);
  });

  it.skipIf(!process.env.M2PDF_E2E_BROWSER)(
    'paginates the complex beamer sample after MathJax layout without losing content',
    async () => {
      const sourcePath = path.join(process.cwd(), 'samples', 'complex.md');
      const content = await readFile(sourcePath, 'utf8');
      const html = await renderMarkdownDocument({
        sourcePath,
        content,
        config: { ...defaultConfig, theme: 'beamer' },
        includeToc: true,
      });
      const browser = await puppeteer.launch({
        executablePath: process.env.M2PDF_E2E_BROWSER!,
        headless: true,
        args: ['--no-sandbox'],
      });

      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: ['load', 'domcontentloaded'] });
        const result = await page.evaluate(async () => {
          const mathJax = (
            window as typeof window & {
              MathJax?: { typesetPromise?: () => Promise<void> };
            }
          ).MathJax;
          if (mathJax?.typesetPromise) {
            await mathJax.typesetPromise();
          }
          await document.fonts.ready;
          const before = {
            math: document.querySelectorAll('.math-display').length,
            listItems: document.querySelectorAll('.markdown2pdf-beamer-frame li').length,
          };
          await (
            window as typeof window & {
              markdown2pdfPaginateBeamer: () => Promise<void>;
            }
          ).markdown2pdfPaginateBeamer();

          const frames = Array.from(
            document.querySelectorAll<HTMLElement>('.markdown2pdf-beamer-frame')
          );
          return {
            before,
            after: {
              math: document.querySelectorAll('.math-display').length,
              listItems: document.querySelectorAll('.markdown2pdf-beamer-frame li').length,
            },
            frameCount: frames.length,
            overflow: frames.map((frame) => {
              const frameRect = frame.getBoundingClientRect();
              const paddingBottom = Number.parseFloat(getComputedStyle(frame).paddingBottom) || 0;
              const usableBottom = frame.clientHeight - paddingBottom + 1;
              const contentBottom = Math.max(
                0,
                ...Array.from(frame.children)
                  .filter((child) => !child.classList.contains('markdown2pdf-beamer-nav'))
                  .map((child) => child.getBoundingClientRect().bottom - frameRect.top)
              );
              return contentBottom - usableBottom;
            }),
            markerCounts: frames.map(
              (frame) => frame.querySelectorAll('.markdown2pdf-beamer-marker').length
            ),
            activeMarkerCounts: frames.map(
              (frame) => frame.querySelectorAll('.markdown2pdf-beamer-marker-active').length
            ),
            viewBoxes: frames.map((frame) =>
              frame.querySelector('svg')?.getAttribute('viewBox')
            ),
          };
        });

        expect(result.frameCount).toBeGreaterThan(5);
        expect(result.after).toEqual(result.before);
        expect(Math.max(...result.overflow)).toBeLessThanOrEqual(0);
        expect(result.markerCounts).toEqual(
          Array.from({ length: result.frameCount }, () => result.frameCount)
        );
        expect(result.activeMarkerCounts).toEqual(
          Array.from({ length: result.frameCount }, () => 1)
        );
        expect(result.viewBoxes.every(Boolean)).toBe(true);
      } finally {
        await browser.close();
      }
    },
    30_000
  );

  it.skipIf(!process.env.M2PDF_E2E_BROWSER)(
    'splits long beamer lists, code blocks, tables, and paragraphs on DOM boundaries',
    async () => {
      const listItems = Array.from({ length: 28 }, (_, index) => `- item ${index + 1}`);
      const codeLines = Array.from(
        { length: 34 },
        (_, index) => `const value${index + 1} = ${index + 1};`
      );
      const tableRows = Array.from(
        { length: 24 },
        (_, index) => `| row ${index + 1} | value ${index + 1} |`
      );
      const longParagraph = 'A long paragraph sentence. '.repeat(90);
      const markdown = [
        '# Stress',
        '',
        '## Long list',
        '',
        ...listItems,
        '',
        '## Long code',
        '',
        '```ts',
        ...codeLines,
        '```',
        '',
        '## Long table',
        '',
        '| Name | Value |',
        '| --- | --- |',
        ...tableRows,
        '',
        '## Long paragraph',
        '',
        longParagraph,
      ].join('\n');
      const html = await renderMarkdownDocument({
        sourcePath: 'E:/docs/stress.md',
        content: markdown,
        config: { ...defaultConfig, theme: 'beamer' },
      });
      const browser = await puppeteer.launch({
        executablePath: process.env.M2PDF_E2E_BROWSER!,
        headless: true,
        args: ['--no-sandbox'],
      });

      try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: ['load', 'domcontentloaded'] });
        const result = await page.evaluate(async () => {
          await (
            window as typeof window & {
              markdown2pdfPaginateBeamer: () => Promise<void>;
            }
          ).markdown2pdfPaginateBeamer();
          const frames = Array.from(
            document.querySelectorAll<HTMLElement>('.markdown2pdf-beamer-frame')
          );
          return {
            listItems: document.querySelectorAll('.markdown2pdf-beamer-frame li').length,
            codeLines: document.querySelectorAll('.markdown2pdf-beamer-frame pre .line').length,
            tableRows: document.querySelectorAll('.markdown2pdf-beamer-frame tbody tr').length,
            paragraphText: Array.from(
              document.querySelectorAll('.markdown2pdf-beamer-frame p')
            )
              .map((paragraph) => paragraph.textContent ?? '')
              .join(''),
            overflow: frames.map((frame) => {
              const frameRect = frame.getBoundingClientRect();
              const paddingBottom = Number.parseFloat(getComputedStyle(frame).paddingBottom) || 0;
              const usableBottom = frame.clientHeight - paddingBottom + 1;
              const contentBottom = Math.max(
                0,
                ...Array.from(frame.children)
                  .filter((child) => !child.classList.contains('markdown2pdf-beamer-nav'))
                  .map((child) => child.getBoundingClientRect().bottom - frameRect.top)
              );
              return contentBottom - usableBottom;
            }),
          };
        });

        expect(result.listItems).toBe(listItems.length);
        expect(result.codeLines).toBe(codeLines.length + 1);
        expect(result.tableRows).toBe(tableRows.length);
        expect(result.paragraphText.trim()).toBe(longParagraph.trim());
        expect(Math.max(...result.overflow)).toBeLessThanOrEqual(0);
      } finally {
        await browser.close();
      }
    },
    30_000
  );

  it('does not add a table of contents by default', async () => {
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/sample.md',
      content: '# Title',
      config: defaultConfig,
    });

    expect(html).not.toContain('class="markdown2pdf-toc"');
  });

  it('does not add a table of contents when explicitly disabled', async () => {
    const html = await renderMarkdownDocument({
      sourcePath: 'E:/docs/sample.md',
      content: '# Title',
      config: defaultConfig,
      includeToc: false,
    });

    expect(html).not.toContain('class="markdown2pdf-toc"');
  });
});

function mainContent(html: string): string {
  return html.slice(html.indexOf('<main'), html.indexOf('</main>') + '</main>'.length);
}
