import puppeteer from 'puppeteer-core';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../src/config';
import { renderMarkdownDocument } from '../src/html';
import { preparePreviewHtml } from '../src/previewHtml';

describe('preview html', () => {
  it('applies a webview CSP, script nonces, preview layout, and scroll restoration', () => {
    const html = `<!doctype html>
<html>
<head>
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline';">
  <script src="https://preview.invalid/mathjax.js"></script>
</head>
<body>
  <main class="markdown2pdf-document markdown2pdf-theme-academic">Hello</main>
</body>
</html>`;

    const prepared = preparePreviewHtml(html, {
      cspSource: 'https://webview.invalid',
      nonce: 'test-nonce',
    });

    expect(prepared).toContain('markdown2pdf-preview-document');
    expect(prepared).toContain("script-src https://webview.invalid 'nonce-test-nonce'");
    expect(prepared).not.toContain("script-src 'unsafe-inline'");
    expect(prepared.match(/<script nonce="test-nonce"/g)).toHaveLength(2);
    expect(prepared).toContain('vscode.setState');
    expect(prepared).toContain('window.MathJax.startup.promise');
  });

  it('builds responsive, paginated slide canvases for beamer previews', () => {
    const prepared = preparePreviewHtml(
      '<html><head></head><body><main class="markdown2pdf-theme-beamer"></main></body></html>',
      { cspSource: 'https://webview.invalid', nonce: 'nonce' }
    );

    expect(prepared).toContain('markdown2pdf-preview-beamer');
    expect(prepared).toContain('width: 128mm');
    expect(prepared).toContain('height: 96mm');
    expect(prepared).toContain('markdown2pdf-preview-slide');
    expect(prepared).toContain('markdown2pdfBeamerPaginationReady');
    expect(prepared).toContain('footer.cloneNode(true)');
    expect(prepared).toContain('new ResizeObserver(resizeSlides)');
    expect(prepared).toContain('padding-bottom: 16.8mm');
  });

  it.skipIf(!process.env.M2PDF_E2E_BROWSER)(
    'contains wide academic content inside narrow preview pages',
    async () => {
      const html = await renderMarkdownDocument({
        sourcePath: 'E:/docs/preview-academic.md',
        content: `# Wide content

| No. | Feature | Status | Boundary content | Type | Scope | Owner | Notes |
| ---: | --- | :---: | --- | --- | --- | --- | --- |
| 1 | Markdown rendering | OK | ChineseEnglish123mixed | text | preview | QA | normal |
| 2 | Long token | CHECK | \`ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789\` | code | preview | QA | wrap |
| 3 | URL | CHECK | https://example.com/releases/2026/07/18/markdown-to-pdf/preview/export/regression/check | link | preview | QA | wrap |

- Nested formula
  - Deeply nested formula $T(n)=O(n\\log n)+\\sum_{i=1}^{n}i$`,
        config: defaultConfig,
        autoTypesetMath: true,
      });
      const withWebviewApi = html.replace(
        '</body>',
        `<script>
          window.acquireVsCodeApi = () => ({
            getState: () => ({}),
            setState: () => {}
          });
        </script></body>`
      );
      const prepared = preparePreviewHtml(withWebviewApi, {
        cspSource: 'https://webview.invalid',
        nonce: 'preview-test-nonce',
      });
      const browser = await puppeteer.launch({
        executablePath: process.env.M2PDF_E2E_BROWSER!,
        headless: true,
        args: ['--no-sandbox'],
      });

      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 192, height: 700, deviceScaleFactor: 1 });
        await page.setContent(prepared, { waitUntil: ['load', 'domcontentloaded'] });
        await page.waitForFunction(
          () => Boolean(document.querySelector('.math-inline mjx-container'))
        );

        const layout = await page.evaluate(() => {
          const documentRoot = document.documentElement;
          const pageRoot = document.querySelector<HTMLElement>('.markdown2pdf-document')!;
          const pageStyle = getComputedStyle(pageRoot);
          const pageRect = pageRoot.getBoundingClientRect();
          const contentRight = pageRect.right - (Number.parseFloat(pageStyle.paddingRight) || 0);
          const table = pageRoot.querySelector<HTMLTableElement>('table')!;
          const tableRect = table.getBoundingClientRect();
          const linkRect = pageRoot.querySelector<HTMLAnchorElement>('a[href^="https://example.com"]')!
            .getBoundingClientRect();
          const math = pageRoot.querySelector<HTMLElement>('.math-inline')!;
          const mathRect = math.getBoundingClientRect();

          return {
            viewportWidth: documentRoot.clientWidth,
            pageScrollWidth: documentRoot.scrollWidth,
            contentRight,
            tableRight: tableRect.right,
            tableClientWidth: table.clientWidth,
            tableScrollWidth: table.scrollWidth,
            tableOverflowX: getComputedStyle(table).overflowX,
            linkRight: linkRect.right,
            mathRight: mathRect.right,
          };
        });

        expect(layout.pageScrollWidth).toBeLessThanOrEqual(layout.viewportWidth + 1);
        expect(layout.tableRight).toBeLessThanOrEqual(layout.contentRight + 1);
        expect(layout.linkRight).toBeLessThanOrEqual(layout.contentRight + 1);
        expect(layout.mathRight).toBeLessThanOrEqual(layout.contentRight + 1);
        expect(layout.tableOverflowX).toBe('auto');
        expect(layout.tableScrollWidth).toBeGreaterThan(layout.tableClientWidth);

        await page.setViewport({ width: 381, height: 700, deviceScaleFactor: 1 });
        const normalWidthMath = await page.evaluate(() => {
          const math = document.querySelector<HTMLElement>('.math-inline')!;
          return {
            display: getComputedStyle(math).display,
            overflowX: getComputedStyle(math).overflowX,
          };
        });
        expect(normalWidthMath.display).toBe('inline');
        expect(normalWidthMath.overflowX).toBe('visible');
      } finally {
        await browser.close();
      }
    },
    30_000
  );

  it.skipIf(!process.env.M2PDF_E2E_BROWSER)(
    'keeps beamer pagination geometry stable while scaling narrow previews',
    async () => {
      const longParagraph = Array.from(
        { length: 520 },
        (_, index) => `word${index + 1}`
      ).join(' ');
      const html = await renderMarkdownDocument({
        sourcePath: 'E:/docs/preview-slides.md',
        content: `# Preview deck\n\n## Long slide\n\n${longParagraph}\n\n## Final slide\n\nDone.\n\n# Second deck\n\n## Closing slide\n\nComplete.`,
        config: { ...defaultConfig, theme: 'beamer' },
        includeToc: true,
      });
      const withWebviewApi = html.replace(
        '</body>',
        `<script>
          window.acquireVsCodeApi = () => ({
            getState: () => ({}),
            setState: () => {}
          });
          window.markdown2pdfBeamerPaginationReady = window.markdown2pdfPaginateBeamer();
        </script></body>`
      );
      const prepared = preparePreviewHtml(withWebviewApi, {
        cspSource: 'https://webview.invalid',
        nonce: 'preview-test-nonce',
      });
      const browser = await puppeteer.launch({
        executablePath: process.env.M2PDF_E2E_BROWSER!,
        headless: true,
        args: ['--no-sandbox'],
      });

      try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1000, height: 800, deviceScaleFactor: 1 });
        await page.setContent(prepared, { waitUntil: ['load', 'domcontentloaded'] });
        await page.waitForSelector('html.markdown2pdf-preview-beamer-ready');

        const inspectLayout = () =>
          page.evaluate((expectedParagraph) => {
            const frames = Array.from(
              document.querySelectorAll<HTMLElement>('.markdown2pdf-beamer-frame')
            );
            const slides = Array.from(
              document.querySelectorAll<HTMLElement>('.markdown2pdf-preview-slide')
            );
            const contentWidths = frames.map((frame) => {
              const style = getComputedStyle(frame);
              return (
                frame.clientWidth -
                (Number.parseFloat(style.paddingLeft) || 0) -
                (Number.parseFloat(style.paddingRight) || 0)
              );
            });
            const overflow = frames.map((frame) => {
              const frameRect = frame.getBoundingClientRect();
              const style = getComputedStyle(frame);
              const scale = frame.offsetWidth > 0 ? frameRect.width / frame.offsetWidth : 1;
              const usableBottom =
                (frame.clientHeight - (Number.parseFloat(style.paddingBottom) || 0)) * scale + 1;
              const contentBottom = Math.max(
                0,
                ...Array.from(frame.children)
                  .filter(
                    (child) =>
                      !child.classList.contains('markdown2pdf-beamer-nav') &&
                      !child.classList.contains('markdown2pdf-beamer-footer')
                  )
                  .map((child) => child.getBoundingClientRect().bottom - frameRect.top)
              );
              return contentBottom - usableBottom;
            });

            return {
              frameCount: frames.length,
              slideCount: slides.length,
              directSlideCount: document.querySelectorAll(
                '.markdown2pdf-theme-beamer > .markdown2pdf-preview-slide'
              ).length,
              footerCount: document.querySelectorAll(
                '.markdown2pdf-preview-slide > .markdown2pdf-beamer-footer'
              ).length,
              contentWidths,
              overflow,
              slideRatios: slides.map((slide) => {
                const rect = slide.getBoundingClientRect();
                return rect.width / rect.height;
              }),
              slideWidths: slides.map((slide) => slide.getBoundingClientRect().width),
              zooms: frames.map((frame) => getComputedStyle(frame).zoom),
              navigationOffsets: slides.flatMap((slide) => {
                const navigation = slide.querySelector<HTMLElement>(
                  ':scope > .markdown2pdf-beamer-nav'
                );
                if (!navigation) {
                  return [];
                }
                const slideRect = slide.getBoundingClientRect();
                const navigationRect = navigation.getBoundingClientRect();
                return [
                  navigationRect.left - slideRect.left,
                  navigationRect.right - slideRect.right,
                ];
              }),
              footerOffsets: slides.map((slide) => {
                const footer = slide.querySelector<HTMLElement>(
                  ':scope > .markdown2pdf-beamer-footer'
                );
                const slideRect = slide.getBoundingClientRect();
                const footerRect = footer!.getBoundingClientRect();
                return footerRect.bottom - slideRect.bottom;
              }),
              longParagraphPreserved:
                Array.from(document.querySelectorAll<HTMLElement>('.markdown2pdf-beamer-frame'))
                  .flatMap((frame) =>
                    Array.from(frame.querySelectorAll<HTMLParagraphElement>('p'))
                  )
                  .map((paragraph) => paragraph.textContent ?? '')
                  .join('')
                  .includes(expectedParagraph),
              viewportWidth: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
            };
          }, longParagraph);

        const wide = await inspectLayout();
        expect(wide.frameCount).toBeGreaterThan(2);
        expect(wide.slideCount).toBe(wide.frameCount + 1);
        expect(wide.directSlideCount).toBe(wide.slideCount);
        expect(wide.footerCount).toBe(wide.slideCount);
        expect(Math.max(...wide.overflow)).toBeLessThanOrEqual(1.5);
        expect(wide.contentWidths.every((width) => width > 417 && width < 419)).toBe(true);
        expect(wide.slideRatios.every((ratio) => Math.abs(ratio - 4 / 3) < 0.01)).toBe(true);
        expect(wide.navigationOffsets.every((offset) => Math.abs(offset) < 0.5)).toBe(true);
        expect(wide.footerOffsets.every((offset) => Math.abs(offset) < 0.5)).toBe(true);
        expect(wide.longParagraphPreserved).toBe(true);

        await page.setViewport({ width: 420, height: 800, deviceScaleFactor: 1 });
        await page.waitForFunction(
          () =>
            document.querySelector<HTMLElement>('.markdown2pdf-preview-slide')!.getBoundingClientRect()
              .width < 400
        );
        const narrow = await inspectLayout();
        expect(narrow.frameCount).toBe(wide.frameCount);
        expect(narrow.directSlideCount).toBe(narrow.slideCount);
        expect(narrow.contentWidths).toEqual(wide.contentWidths);
        expect(narrow.footerCount).toBe(narrow.slideCount);
        expect(Math.max(...narrow.overflow)).toBeLessThanOrEqual(1.5);
        expect(narrow.slideRatios.every((ratio) => Math.abs(ratio - 4 / 3) < 0.01)).toBe(true);
        expect(narrow.navigationOffsets.every((offset) => Math.abs(offset) < 0.5)).toBe(true);
        expect(narrow.footerOffsets.every((offset) => Math.abs(offset) < 0.5)).toBe(true);
        expect(narrow.longParagraphPreserved).toBe(true);
        expect(Math.max(...narrow.slideWidths)).toBeLessThanOrEqual(396);
        expect(narrow.scrollWidth).toBeLessThanOrEqual(narrow.viewportWidth);
        expect(narrow.zooms.every((zoom) => Number.parseFloat(zoom) < 1)).toBe(true);
      } finally {
        await browser.close();
      }
    },
    30_000
  );
});
