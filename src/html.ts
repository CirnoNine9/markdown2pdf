import { promises as fs } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import MarkdownIt = require('markdown-it');
import anchor from 'markdown-it-anchor';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import sanitizeHtml from 'sanitize-html';
import { codeToHtml } from 'shiki';
import {
  beamerPaginationGlobal,
  beamerPaginationReadyGlobal,
  paginateBeamerFramesInBrowser,
} from './beamerPagination';
import type { ExportConfig } from './config';
import { mathPlugin } from './math';
import { buildCss } from './theme';

export interface RenderOptions {
  sourcePath: string;
  content: string;
  config: ExportConfig;
  includeToc?: boolean;
  includeTocPageNumbers?: boolean;
  autoTypesetMath?: boolean;
  mathJaxScriptSource?: string;
  resolveImageSource?: (source: string) => string;
}

export interface TocHeading {
  level: 1 | 2 | 3;
  title: string;
  anchor: string;
}

interface BeamerFrame {
  html: string;
  deckTitle: string;
  deckIndex: number;
  sectionTitle: string;
  sectionIndex: number;
  markerIndex: number;
  showDeckHeading: boolean;
}

export async function renderMarkdownDocument(options: RenderOptions): Promise<string> {
  const md = createMarkdownIt(options.sourcePath, options.config, options.resolveImageSource);
  const allHeadings = extractTocHeadings(md, options.content);
  const tocHeadings = options.includeToc ? allHeadings : [];
  const body = md.render(options.content);
  const highlighted = await resolveShikiPlaceholders(body);
  const beamerFrames = options.config.theme === 'beamer' ? buildBeamerFrames(highlighted) : [];
  const themedBody = options.config.theme === 'beamer' ? renderBeamerFrames(highlighted, beamerFrames) : highlighted;
  const renderedToc =
    tocHeadings.length > 0
      ? renderTableOfContents(
          tocHeadings,
          options.config.theme === 'beamer' ? renderBeamerNavigation(beamerFrames) : '',
          options.includeTocPageNumbers ?? false
        )
      : '';
  const withToc = renderedToc ? `${renderedToc}\n${themedBody}` : themedBody;
  const baseDir = path.dirname(options.sourcePath);
  const sanitized = sanitizeRenderedHtml(withToc, (source) => {
    const normalized = normalizeImageSource(source, baseDir);
    return options.resolveImageSource?.(normalized) ?? normalized;
  });
  const css = await buildCss(options.config);
  const mathJaxScript = options.mathJaxScriptSource ? undefined : await loadMathJaxScript();

  return buildHtmlShell({
    title: path.basename(options.sourcePath),
    theme: options.config.theme,
    css,
    beamerFooter: options.config.theme === 'beamer' ? renderBeamerFooter(options.config.beamerFooterText) : '',
    body: sanitized,
    mathJaxScript,
    mathJaxScriptSource: options.mathJaxScriptSource,
    autoTypesetMath: options.autoTypesetMath ?? false,
  });
}

function createMarkdownIt(
  sourcePath: string,
  config: ExportConfig,
  resolveImageSource?: (source: string) => string
): MarkdownIt {
  const baseDir = path.dirname(sourcePath);

  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: true,
    breaks: false,
    highlight: () => '',
  })
    .use(footnote)
    .use(taskLists, { enabled: true, label: true, labelAfter: true })
    .use(mathPlugin)
    .use(anchor, { permalink: false });

  md.renderer.rules.fence = createFenceRenderer(config);
  md.renderer.rules.image = createImageRenderer(md.renderer.rules.image, baseDir, resolveImageSource);

  return md;
}

export function extractTocHeadings(md: MarkdownIt, markdown: string): TocHeading[] {
  const tokens = md.parse(markdown, {});
  const headings: TocHeading[] = [];

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.type !== 'heading_open' || !/^h[1-3]$/.test(token.tag)) {
      continue;
    }

    const inline = tokens[index + 1];
    const title = extractInlineText(inline);
    const anchorId = token.attrGet('id');
    if (!title || !anchorId) {
      continue;
    }

    headings.push({
      level: Number(token.tag.slice(1)) as TocHeading['level'],
      title,
      anchor: anchorId,
    });
  }

  return headings;
}

function extractInlineText(token: MarkdownIt.Token | undefined): string {
  if (!token || token.type !== 'inline') {
    return '';
  }

  return (token.children ?? [])
    .map(extractVisibleTokenText)
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractVisibleTokenText(token: MarkdownIt.Token): string {
  if (token.children?.length) {
    return token.children.map(extractVisibleTokenText).join('');
  }

  if (['text', 'code_inline', 'math_inline', 'image'].includes(token.type)) {
    return token.content;
  }

  if (token.type === 'softbreak' || token.type === 'hardbreak') {
    return ' ';
  }

  return '';
}

export function renderTableOfContents(
  headings: TocHeading[],
  beamerNavigation = '',
  includePageNumbers = false
): string {
  if (headings.length === 0) {
    return '';
  }

  const items = headings
    .map((heading) => {
      const title = escapeHtml(heading.title);
      const linkContent = includePageNumbers
        ? [
            `<span class="markdown2pdf-toc-label">${title}</span>`,
            '<span class="markdown2pdf-toc-leader" aria-hidden="true"></span>',
            '<span class="markdown2pdf-toc-page-number"></span>',
          ].join('')
        : title;
      return `<li class="markdown2pdf-toc-item markdown2pdf-toc-level-${heading.level}"><a href="#${escapeHtml(heading.anchor)}">${linkContent}</a></li>`;
    })
    .join('\n');

  return [
    '<section class="markdown2pdf-toc" role="doc-toc">',
    beamerNavigation,
    '<h1>&#30446;&#24405;</h1>',
    '<ol>',
    items,
    '</ol>',
    '</section>',
  ].join('\n');
}

export function renderBeamerNavigation(frames: BeamerFrame[], activeFrame?: BeamerFrame): string {
  const navItems = frames
    .filter((frame, index) => frames.findIndex((item) => item.deckIndex === frame.deckIndex) === index)
    .slice(0, 8);

  if (navItems.length === 0) {
    return '<nav class="markdown2pdf-beamer-nav" aria-hidden="true"></nav>';
  }

  const items = navItems
    .map((item) => {
      const sectionFrames = frames.filter((frame) => frame.deckIndex === item.deckIndex);
      const markerCount = Math.max(1, sectionFrames.length);
      const markerRadius = 1.25;
      const markerStep = 6.2;
      const markerWidth = markerRadius * 2 + markerStep * (markerCount - 1);
      const markerHeight = markerRadius * 2;
      const markers = [
        `<svg class="markdown2pdf-beamer-markers" viewBox="0 0 ${markerWidth} ${markerHeight}" aria-hidden="true" focusable="false" style="width: ${Math.max(0.5, markerCount * 0.45)}mm;">`,
        ...Array.from({ length: markerCount }, (_, markerIndex) => {
        const active = activeFrame?.deckIndex === item.deckIndex && sectionFrames[markerIndex] === activeFrame;
        const className = active ? ' markdown2pdf-beamer-marker-active' : '';
          return `<circle class="markdown2pdf-beamer-marker${className}" cx="${markerRadius + markerIndex * markerStep}" cy="${markerRadius}" r="${markerRadius}"></circle>`;
        }),
        '</svg>',
      ].join('');
      return [
        '<span class="markdown2pdf-beamer-nav-item">',
        `<span class="markdown2pdf-beamer-nav-title">${escapeHtml(item.deckTitle)}</span>`,
        `<span class="markdown2pdf-beamer-nav-markers">${markers}</span>`,
        '</span>',
      ].join('');
    })
    .join('');

  return `<nav class="markdown2pdf-beamer-nav" aria-hidden="true" style="--beamer-nav-count: ${navItems.length};">${items}</nav>`;
}

export function wrapBeamerFrames(html: string): string {
  return renderBeamerFrames(html, buildBeamerFrames(html));
}

function renderBeamerFrames(html: string, frames = buildBeamerFrames(html)): string {
  if (frames.length === 0) {
    return html;
  }

  return frames
    .map((frame) => {
      const className = frame.showDeckHeading
        ? 'markdown2pdf-beamer-frame'
        : 'markdown2pdf-beamer-frame markdown2pdf-beamer-frame-continuation';
      let frameHtml = frame.html;
      if (!frame.showDeckHeading) {
        frameHtml = frameHtml.replace(/^\s*<h1\b[^>]*>[\s\S]*?<\/h1>/i, '');
        frameHtml = removeFirstHeadingId(frameHtml, 'h2');
      }

      return [
        `<section class="${className}" data-beamer-deck-index="${frame.deckIndex}" data-beamer-deck-title="${escapeHtml(frame.deckTitle)}">`,
        renderBeamerNavigation(frames, frame),
        frameHtml,
        '</section>',
      ].join('');
    })
    .join('\n');
}

function buildBeamerFrames(html: string): BeamerFrame[] {
  const h1Parts = html.split(/(<h1\b[^>]*>[\s\S]*?<\/h1>)/i);
  const frames: BeamerFrame[] = [];
  let preamble = '';
  let deckHtml = '';
  let deckTitle = '';
  let deckIndex = -1;

  for (const part of h1Parts) {
    if (!part) {
      continue;
    }

    if (/^<h1\b/i.test(part)) {
      if (deckIndex >= 0 && deckHtml) {
        appendBeamerDeckFrames(frames, deckHtml, deckTitle, deckIndex);
      }
      deckHtml = deckIndex < 0 ? `${part}${preamble}` : part;
      deckTitle = extractHeadingText(part);
      deckIndex += 1;
      continue;
    }

    if (deckIndex < 0) {
      preamble += part;
    } else {
      deckHtml += part;
    }
  }

  if (deckIndex >= 0 && deckHtml) {
    appendBeamerDeckFrames(frames, deckHtml, deckTitle, deckIndex);
  } else if (hasMeaningfulHtml(preamble)) {
    const fallbackTitle = extractHeadingText(preamble.match(/<h[2-3]\b[^>]*>[\s\S]*?<\/h[2-3]>/i)?.[0] ?? '');
    appendBeamerDeckFrames(frames, preamble, fallbackTitle, 0);
  }

  return frames;
}

function appendBeamerDeckFrames(frames: BeamerFrame[], html: string, deckTitle: string, deckIndex: number): void {
  const headingMatch = html.match(/^\s*(<h1\b[^>]*>[\s\S]*?<\/h1>)/i);
  const deckHeading = headingMatch?.[1] ?? '';
  const body = deckHeading ? html.slice(html.indexOf(deckHeading) + deckHeading.length) : html;
  const parts = body.split(/(<h2\b[^>]*>[\s\S]*?<\/h2>)/i);
  let sectionHeading = '';
  let sectionBody = '';
  let sectionTitle = deckTitle;
  let sectionIndex = 0;
  let sawSectionHeading = false;

  const flush = (keepHeadingOnly: boolean): void => {
    if (!hasMeaningfulHtml(sectionBody) && !(keepHeadingOnly && (sectionHeading || deckHeading))) {
      return;
    }

    appendBeamerSectionFrames(
      frames,
      `${deckHeading}${sectionHeading}${sectionBody}`,
      deckTitle,
      deckIndex,
      sectionTitle,
      sectionIndex
    );
    sectionIndex += 1;
  };

  for (const part of parts) {
    if (!part) {
      continue;
    }

    if (/^<h2\b/i.test(part)) {
      flush(sawSectionHeading);
      sectionHeading = part;
      sectionBody = '';
      sectionTitle = extractHeadingText(part);
      sawSectionHeading = true;
      continue;
    }

    sectionBody += part;
  }

  flush(sawSectionHeading || !!deckHeading);
}

function appendBeamerSectionFrames(
  frames: BeamerFrame[],
  html: string,
  deckTitle: string,
  deckIndex: number,
  sectionTitle: string,
  sectionIndex: number
): void {
  const deckHeadingMatch = html.match(/^\s*(<h1\b[^>]*>[\s\S]*?<\/h1>)/i);
  const deckHeading = deckHeadingMatch?.[1] ?? '';
  const sectionHtml = deckHeading ? html.slice(html.indexOf(deckHeading) + deckHeading.length) : html;
  const headingMatch = html.match(/^\s*(<h2\b[^>]*>[\s\S]*?<\/h2>)/i);
  const sectionHeading = headingMatch?.[1] ?? sectionHtml.match(/^\s*(<h2\b[^>]*>[\s\S]*?<\/h2>)/i)?.[1] ?? '';
  const body = sectionHeading ? sectionHtml.slice(sectionHtml.indexOf(sectionHeading) + sectionHeading.length) : sectionHtml;
  const parts = body.split(/(<h3\b[^>]*>[\s\S]*?<\/h3>)/i);
  let subheading = '';
  let frameBody = '';
  let markerIndex = 0;
  let sawSubheading = false;

  const pushCurrentFrame = (keepHeadingOnly: boolean): void => {
    if (!hasMeaningfulHtml(frameBody) && !(keepHeadingOnly && (subheading || sectionHeading || deckHeading))) {
      return;
    }

    frames.push({
      html: `${deckHeading}${sectionHeading}${subheading}${frameBody}`,
      deckTitle,
      deckIndex,
      sectionTitle,
      sectionIndex,
      markerIndex,
      showDeckHeading: markerIndex === 0,
    });
    markerIndex += 1;
  };

  for (const part of parts) {
    if (!part) {
      continue;
    }

    if (/^<h3\b/i.test(part)) {
      pushCurrentFrame(sawSubheading);
      subheading = part;
      frameBody = '';
      sawSubheading = true;
      continue;
    }

    frameBody += part;
  }

  pushCurrentFrame(sawSubheading || !!sectionHeading || !!deckHeading);
}

function removeFirstHeadingId(html: string, tagName: 'h2' | 'h3'): string {
  return html.replace(new RegExp(`<${tagName}\\b[^>]*>`, 'i'), (heading) =>
    heading.replace(/\s+id=(?:"[^"]*"|'[^']*')/i, '')
  );
}

function hasMeaningfulHtml(html: string): boolean {
  const withoutHeadings = html.replace(/<h[1-3]\b[^>]*>[\s\S]*?<\/h[1-3]>/gi, '');
  const text = withoutHeadings
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .trim();
  return text.length > 0 || /<(img|table|pre|blockquote|mjx-container|svg)\b/i.test(withoutHeadings);
}

function extractHeadingText(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function renderBeamerFooter(footerText: string): string {
  const lines = footerText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 2);

  const content = lines.map((line) => `<span>${escapeHtml(line)}</span>`).join('');
  return `<footer class="markdown2pdf-beamer-footer" aria-hidden="true">${content}</footer>`;
}

type RenderRule = MarkdownIt.Renderer.RenderRule;

function createFenceRenderer(config: ExportConfig): RenderRule {
  return (tokens: MarkdownIt.Token[], index: number) => {
    const token = tokens[index];
    const language = token.info.trim().split(/\s+/)[0] || 'text';
    return `@@SHIKI_BLOCK_${Buffer.from(JSON.stringify({ language, code: token.content, theme: config.codeTheme })).toString('base64url')}@@`;
  };
}

function createImageRenderer(
  defaultRenderer: RenderRule | undefined,
  baseDir: string,
  resolveImageSource?: (source: string) => string
): RenderRule {
  return (tokens, index, options, env, self) => {
    const token = tokens[index];
    const srcIndex = token.attrIndex('src');

    if (srcIndex >= 0 && token.attrs?.[srcIndex]?.[1]) {
      const source = token.attrs[srcIndex][1];
      const normalizedSource = normalizeImageSource(source, baseDir);
      token.attrs[srcIndex][1] = resolveImageSource?.(normalizedSource) ?? normalizedSource;
    }

    return defaultRenderer
      ? defaultRenderer(tokens, index, options, env, self)
      : self.renderToken(tokens, index, options);
  };
}

export function normalizeImageSource(source: string, baseDir: string): string {
  if (/^(https?:|data:|file:)/i.test(source)) {
    return source;
  }

  if (path.isAbsolute(source)) {
    return pathToFileUrl(source);
  }

  return pathToFileUrl(path.resolve(baseDir, source));
}

function pathToFileUrl(filePath: string): string {
  return pathToFileURL(filePath).href;
}

export async function resolveShikiPlaceholders(html: string): Promise<string> {
  const matches = [...html.matchAll(/@@SHIKI_BLOCK_([A-Za-z0-9_-]+)@@/g)];
  let resolved = html;

  for (const match of matches) {
    const payload = JSON.parse(Buffer.from(match[1], 'base64url').toString('utf8')) as {
      language: string;
      code: string;
      theme: string;
    };

    const highlighted = await renderCode(payload.code, payload.language, payload.theme);
    resolved = resolved.replace(match[0], highlighted);
  }

  return resolved;
}

async function renderCode(code: string, language: string, theme: string): Promise<string> {
  try {
    return await codeToHtml(code, {
      lang: language,
      theme,
    });
  } catch {
    const escaped = escapeHtml(code);
    return `<pre class="shiki fallback"><code>${escaped}</code></pre>`;
  }
}

export function sanitizeRenderedHtml(html: string, resolveImageSource?: (source: string) => string): string {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      'img',
      'input',
      'span',
      'section',
      'nav',
      'footer',
      'summary',
      'details',
      's',
      'sub',
      'sup',
      'mark',
      'figure',
      'figcaption',
      'math',
      'mjx-container',
      'svg',
      'path',
      'g',
      'line',
      'rect',
      'circle',
      'polyline',
      'polygon',
      'defs',
      'use',
    ]),
    allowedAttributes: {
      '*': [
        'class',
        'id',
        'title',
        'aria-hidden',
        'role',
        'style',
        'data-source-line',
        'data-math-source',
        'data-beamer-deck-index',
        'data-beamer-deck-title',
      ],
      a: ['href', 'name', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      input: ['type', 'checked', 'disabled', 'aria-label'],
      ol: ['start', 'reversed', 'type'],
      li: ['value'],
      details: ['open'],
      code: ['class'],
      pre: ['class', 'style', 'tabindex'],
      span: ['class', 'style'],
      div: ['class', 'style'],
      svg: ['class', 'viewBox', 'viewbox', 'width', 'height', 'xmlns', 'role', 'aria-hidden', 'focusable'],
      path: ['d', 'fill', 'stroke', 'stroke-width'],
      g: ['fill', 'stroke', 'transform'],
      circle: ['cx', 'cy', 'r', 'fill', 'stroke', 'stroke-width'],
      use: ['href', 'xlink:href'],
    },
    allowedSchemes: ['http', 'https', 'file', 'data', 'mailto'],
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer' }, true),
      img: (tagName, attributes) => ({
        tagName,
        attribs:
          attributes.src && resolveImageSource
            ? { ...attributes, src: resolveImageSource(attributes.src) }
            : attributes,
      }),
    },
  });
}

async function loadMathJaxScript(): Promise<string> {
  const candidates = [
    path.join(__dirname, 'assets', 'mathjax', 'tex-svg-full.js'),
    path.join(process.cwd(), 'node_modules', 'mathjax-full', 'es5', 'tex-svg-full.js'),
    path.join(__dirname, 'assets', 'mathjax', 'tex-svg.js'),
    path.join(process.cwd(), 'node_modules', 'mathjax-full', 'es5', 'tex-svg.js'),
  ];

  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate, 'utf8');
    } catch {
      // Try the next candidate.
    }
  }

  throw new Error('Unable to locate local MathJax asset. Run npm install and npm run build.');
}

function buildHtmlShell(input: {
  title: string;
  theme: ExportConfig['theme'];
  css: string;
  beamerFooter: string;
  body: string;
  mathJaxScript?: string;
  mathJaxScriptSource?: string;
  autoTypesetMath: boolean;
}): string {
  const mathJaxScriptTag = input.mathJaxScriptSource
    ? `<script src="${escapeHtml(input.mathJaxScriptSource)}"></script>`
    : `<script>${input.mathJaxScript ?? ''}</script>`;
  const beamerPaginationScript =
    input.theme === 'beamer'
      ? `<script>
    window.${beamerPaginationGlobal} = ${paginateBeamerFramesInBrowser.toString()};
    ${
      input.autoTypesetMath
        ? `window.${beamerPaginationReadyGlobal} = Promise.resolve(window.MathJax?.startup?.promise).then(() => window.${beamerPaginationGlobal}());`
        : ''
    }
  </script>`
      : '';
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: file: http: https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; font-src data: file:;">
  <title>${escapeHtml(input.title)}</title>
  <style>${input.css}</style>
  <script>
    window.MathJax = {
      tex: {
        inlineMath: [['\\\\(', '\\\\)']],
        displayMath: [['\\\\[', '\\\\]']],
        processEscapes: true,
        packages: {'[+]': ['ams', 'mathtools']}
      },
      svg: {
        fontCache: 'none'
      },
      startup: {
        typeset: ${input.autoTypesetMath}
      }
    };
  </script>
  ${mathJaxScriptTag}
</head>
<body>
  <main class="markdown2pdf-document markdown2pdf-theme-${input.theme}">
    ${input.body}
  </main>
  ${input.beamerFooter}
  ${beamerPaginationScript}
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
