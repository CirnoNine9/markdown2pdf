import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer-core';
import type { Page, PDFOptions } from 'puppeteer-core';
import { beamerPaginationGlobal } from './beamerPagination';
import type { ExportConfig } from './config';
import { renderMarkdownDocument } from './html';

export interface ExportPdfInput {
  sourcePath: string;
  markdown: string;
  outputPath: string;
  executablePath: string;
  config: ExportConfig;
  includeToc?: boolean;
  includePageNumbers?: boolean;
}

export async function exportMarkdownToPdf(input: ExportPdfInput): Promise<void> {
  validatePdfOutputPath(input.sourcePath, input.outputPath);
  const html = await renderMarkdownDocument({
    sourcePath: input.sourcePath,
    content: input.markdown,
    config: input.config,
    includeToc: input.includeToc ?? false,
    includeTocPageNumbers: (input.includeToc ?? false) && (input.includePageNumbers ?? false),
  });

  await fs.mkdir(path.dirname(input.outputPath), { recursive: true });
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'markdown2pdf-'));
  const temporaryHtmlPath = path.join(temporaryDirectory, 'document.html');

  try {
    await fs.writeFile(temporaryHtmlPath, html, 'utf8');
    const browser = await puppeteer.launch({
      executablePath: input.executablePath,
      headless: true,
      args: ['--allow-file-access-from-files', '--disable-dev-shm-usage', '--no-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.goto(pathToFileURL(temporaryHtmlPath).href, {
        waitUntil: ['load', 'domcontentloaded'],
        timeout: 60_000,
      });
      await page.waitForNetworkIdle({ idleTime: 500, timeout: 60_000 });
      const mathErrors = await page.evaluate(async () => {
        const mathJax = (window as typeof window & {
          MathJax?: { typesetPromise?: () => Promise<void> };
        }).MathJax;

        const errors: Array<{ message: string; source?: string; line?: string }> = [];
        try {
          if (mathJax?.typesetPromise) {
            await mathJax.typesetPromise();
          }
        } catch (error) {
          errors.push({
            message: error instanceof Error ? error.message : String(error),
          });
        }
        await document.fonts.ready;

        const errorNodes = document.querySelectorAll(
          [
            'mjx-merror',
            '[data-mml-node="merror"]',
            'mjx-container [data-mml-node="mtext"][fill="red"]',
            'mjx-container [data-mml-node="mtext"][stroke="red"]',
          ].join(',')
        );

        for (const node of Array.from(errorNodes)) {
          const wrapper = node.closest('.math-inline, .math-display') as HTMLElement | null;
          errors.push({
            message: node.textContent?.trim() || 'MathJax rendered an error node.',
            source: wrapper?.getAttribute('data-math-source') ?? undefined,
            line: wrapper?.getAttribute('data-source-line') ?? undefined,
          });
        }

        return errors;
      });
      if (mathErrors.length > 0) {
        throw new Error(formatMathErrors(mathErrors));
      }

      const brokenImages = await page.evaluate(() =>
        Array.from(document.images)
          .filter((image) => !image.complete || image.naturalWidth === 0)
          .map((image) => image.currentSrc || image.src || image.alt || 'unknown image')
      );
      if (brokenImages.length > 0) {
        throw new Error(formatImageErrors(brokenImages));
      }

      if (input.config.theme === 'beamer') {
        const overflowingFrames = await page.evaluate(async (paginationGlobal) => {
          const pagination = (window as typeof window & Record<string, unknown>)[paginationGlobal];
          if (typeof pagination === 'function') {
            await (pagination as () => Promise<void>)();
          }

          return Array.from(
            document.querySelectorAll<HTMLElement>('.markdown2pdf-beamer-frame')
          )
            .map((frame, index) => {
              const frameRect = frame.getBoundingClientRect();
              const paddingBottom = Number.parseFloat(getComputedStyle(frame).paddingBottom) || 0;
              const usableBottom = frame.clientHeight - paddingBottom + 1.5;
              const contentBottom = Math.max(
                0,
                ...Array.from(frame.children)
                  .filter((child) => !child.classList.contains('markdown2pdf-beamer-nav'))
                  .map((child) => child.getBoundingClientRect().bottom - frameRect.top)
              );
              return contentBottom > usableBottom ? index + 1 : undefined;
            })
            .filter((index): index is number => index !== undefined);
        }, beamerPaginationGlobal);
        if (overflowingFrames.length > 0) {
          throw new Error(
            `Beamer pagination could not fit slide content on frame(s): ${overflowingFrames.join(', ')}`
          );
        }
      }
      const pdfOptions = toPdfOptions(
        input.config,
        input.outputPath,
        input.includePageNumbers ?? false
      );
      if ((input.includeToc ?? false) && (input.includePageNumbers ?? false)) {
        await fillTocPageNumbers(page, pdfOptions);
      }
      await page.pdf(pdfOptions);
    } finally {
      await browser.close();
    }
  } finally {
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

async function fillTocPageNumbers(page: Page, pdfOptions: PDFOptions): Promise<void> {
  const anchors = await page.$$eval('.markdown2pdf-toc-item > a', (links) =>
    links
      .map((link) => link.getAttribute('href') ?? '')
      .filter((href) => href.startsWith('#'))
      .map((href) => href.slice(1))
  );
  if (anchors.length === 0) {
    return;
  }

  const preliminaryOptions = { ...pdfOptions, path: undefined };
  const preliminaryPdf = await page.pdf(preliminaryOptions);
  const pageNumbers = await readPdfDestinationPages(preliminaryPdf, anchors);

  await page.evaluate((resolvedPageNumbers) => {
    for (const link of Array.from(
      document.querySelectorAll<HTMLAnchorElement>('.markdown2pdf-toc-item > a')
    )) {
      const anchor = (link.getAttribute('href') ?? '').replace(/^#/, '');
      const pageNumber = resolvedPageNumbers[anchor];
      const target = link.querySelector<HTMLElement>('.markdown2pdf-toc-page-number');
      if (target && pageNumber !== undefined) {
        target.textContent = String(pageNumber);
      }
    }
  }, pageNumbers);
}

async function readPdfDestinationPages(
  pdfData: Uint8Array,
  anchors: string[]
): Promise<Record<string, number>> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const document = await pdfjs.getDocument({
    data: pdfData,
  }).promise;

  try {
    const entries = await Promise.all(
      anchors.map(async (anchor): Promise<[string, number]> => {
        const destination =
          (await document.getDestination(anchor)) ??
          (await document.getDestination(safeDecodeURIComponent(anchor)));
        if (!destination) {
          throw new Error(`Unable to resolve table-of-contents destination: ${anchor}`);
        }
        const pageIndex = await document.getPageIndex(destination[0]);
        return [anchor, pageIndex + 1];
      })
    );
    return Object.fromEntries(entries);
  } finally {
    await document.destroy();
  }
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function validatePdfOutputPath(sourcePath: string, outputPath: string): void {
  if (path.extname(outputPath).toLowerCase() !== '.pdf') {
    throw new Error('PDF output path must end with ".pdf".');
  }

  const normalizeForComparison = (filePath: string) => {
    const resolved = path.resolve(filePath);
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
  };
  if (normalizeForComparison(sourcePath) === normalizeForComparison(outputPath)) {
    throw new Error('PDF output path must not overwrite the Markdown source file.');
  }
}

function formatMathErrors(errors: Array<{ message: string; source?: string; line?: string }>): string {
  const details = errors
    .slice(0, 3)
    .map((error) => {
      const where = error.line ? `line ${error.line}: ` : '';
      const source = error.source ? ` (${truncate(error.source, 120)})` : '';
      return `${where}${error.message}${source}`;
    })
    .join('; ');
  const suffix = errors.length > 3 ? `; ${errors.length - 3} more math errors` : '';
  return `MathJax failed to render one or more formulas: ${details}${suffix}`;
}

function formatImageErrors(sources: string[]): string {
  const details = sources
    .slice(0, 3)
    .map((source) => truncate(source, 160))
    .join('; ');
  const suffix = sources.length > 3 ? `; ${sources.length - 3} more images` : '';
  return `Failed to load one or more images: ${details}${suffix}`;
}

function truncate(value: string, maxLength: number): string {
  const normalized = value.replace(/\s+/g, ' ').trim();
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 3)}...`;
}

export function toPdfOptions(config: ExportConfig, outputPath: string, includePageNumbers = false): PDFOptions {
  const options: PDFOptions = {
    path: outputPath,
    format: config.pageFormat as PDFOptions['format'],
    printBackground: true,
    margin: config.margin,
    preferCSSPageSize: false,
  };

  if (config.theme === 'beamer') {
    options.width = '128mm';
    options.height = '96mm';
    options.format = undefined;
    options.margin = {
      top: '0',
      right: '0',
      bottom: '0',
      left: '0',
    };
    options.preferCSSPageSize = true;
  }

  if (includePageNumbers) {
    const footerStyle =
      config.theme === 'beamer'
        ? 'width:100%;box-sizing:border-box;padding:0 12px 2px 0;font-size:7px;color:#fff;text-align:right;font-family:Arial, sans-serif;'
        : 'width:100%;font-size:8px;color:#777;text-align:center;font-family:Arial, sans-serif;';
    options.displayHeaderFooter = true;
    options.headerTemplate = '<span></span>';
    options.footerTemplate = [
      `<div style="${footerStyle}">`,
      '&#31532; <span class="pageNumber"></span> &#39029; / &#20849; <span class="totalPages"></span> &#39029;',
      '</div>',
    ].join('');
  }

  return options;
}
