import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BuiltInTheme, ExportConfig } from './config';

const sharedCss = `
:root {
  color-scheme: light;
  --body-font: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  --text: #1f2933;
  --muted: #64748b;
  --border: #d8dee9;
  --soft: #f7f9fc;
  --accent: #1f5fbf;
  --code-bg: #f6f8fa;
}

* {
  box-sizing: border-box;
}

html {
  background: #ffffff;
}

body {
  margin: 0;
  color: var(--text);
  font-family: var(--body-font);
  font-size: 11.5pt;
  line-height: 1.72;
  -webkit-font-smoothing: antialiased;
}

.markdown2pdf-document {
  max-width: 780px;
  margin: 0 auto;
}

h1, h2, h3, h4, h5, h6 {
  color: #111827;
  line-height: 1.25;
  page-break-after: avoid;
  break-after: avoid-page;
}

h1 {
  margin: 0 0 1.4rem;
  padding-bottom: 0.7rem;
  border-bottom: 2px solid var(--border);
  font-size: 28pt;
  letter-spacing: 0;
}

h2 {
  margin: 2.2rem 0 0.8rem;
  padding-bottom: 0.35rem;
  border-bottom: 1px solid var(--border);
  font-size: 19pt;
}

h3 {
  margin: 1.8rem 0 0.5rem;
  font-size: 15pt;
}

h4, h5, h6 {
  margin: 1.4rem 0 0.4rem;
}

p, ul, ol, blockquote, pre, table, figure, .math-display {
  margin-top: 0;
  margin-bottom: 1rem;
}

a {
  color: var(--accent);
  text-decoration: none;
}

a:hover {
  text-decoration: underline;
}

blockquote {
  padding: 0.1rem 0 0.1rem 1rem;
  border-left: 4px solid var(--border);
  color: #475569;
  background: linear-gradient(90deg, var(--soft), transparent);
}

hr {
  height: 1px;
  border: 0;
  background: var(--border);
  margin: 2rem 0;
}

table {
  width: 100%;
  border-collapse: collapse;
  font-size: 10.5pt;
  page-break-inside: avoid;
}

th, td {
  border: 1px solid var(--border);
  padding: 0.42rem 0.55rem;
  vertical-align: top;
  overflow-wrap: anywhere;
  word-break: break-word;
}

th {
  background: var(--soft);
  font-weight: 700;
}

tr:nth-child(even) td {
  background: #fbfcfe;
}

img {
  max-width: 100%;
  height: auto;
}

code {
  font-family: "JetBrains Mono", "SFMono-Regular", Consolas, monospace;
  font-size: 0.92em;
}

:not(pre) > code {
  padding: 0.12rem 0.3rem;
  border-radius: 4px;
  background: var(--code-bg);
  color: #9f1239;
}

pre {
  overflow: visible;
  padding: 0.85rem 1rem;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--code-bg);
  page-break-inside: avoid;
  white-space: pre-wrap;
  word-break: break-word;
}

pre code {
  font-size: 9.7pt;
  line-height: 1.58;
}

.contains-task-list {
  padding-left: 1.2rem;
}

.task-list-item {
  list-style: none;
}

.task-list-item-checkbox {
  margin-left: -1.2rem;
  margin-right: 0.45rem;
}

.footnotes {
  margin-top: 2.5rem;
  padding-top: 1rem;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 9.5pt;
}

.math-display {
  overflow-x: auto;
  padding: 0.25rem 0;
}

.mjx-container {
  outline: none;
}

.markdown2pdf-toc {
  margin-bottom: 2.5rem;
  page-break-after: always;
  break-after: page;
}

.markdown2pdf-toc ol {
  padding-left: 0;
  list-style: none;
}

.markdown2pdf-toc-item {
  margin: 0.25rem 0;
  line-height: 1.5;
}

.markdown2pdf-toc-item > a {
  display: flex;
  align-items: baseline;
  color: inherit;
}

.markdown2pdf-toc-label {
  min-width: 0;
}

.markdown2pdf-toc-leader {
  min-width: 1rem;
  margin: 0 0.45rem;
  border-bottom: 1px dotted var(--muted);
}

.markdown2pdf-toc-page-number {
  flex: 0 0 4ch;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.markdown2pdf-toc-level-2 {
  padding-left: 1.2rem;
}

.markdown2pdf-toc-level-3 {
  padding-left: 2.4rem;
  font-size: 0.95em;
}

@page {
  size: auto;
}
`;

const themeCss: Record<BuiltInTheme, string> = {
  academic: `
body {
  --accent: #205493;
  --soft: #f6f8fb;
  --border: #cfd7e3;
}

.markdown2pdf-document {
  max-width: 760px;
}

h1 {
  text-align: center;
}
`,
  beamer: `
@page {
  size: 128mm 96mm;
  margin: 0;
}

:root {
  --beamer-nav: #1d1a63;
  --beamer-title: #3432b2;
  --beamer-block: #272389;
  --beamer-block-body: #efeff9;
  --beamer-footer: #25208d;
  --beamer-footer-dark: #181653;
  --beamer-faint: #d8d9f4;
}

html,
body {
  width: 128mm;
  min-height: 96mm;
  background: #ffffff;
}

body {
  --accent: var(--beamer-title);
  --soft: var(--beamer-block-body);
  --border: #d7d7ee;
  --text: #111111;
  position: relative;
  padding: 0 8.7mm 8.4mm;
  font-family: "Microsoft YaHei", "Noto Sans CJK SC", "SimHei", var(--body-font);
  font-size: 9.8pt;
  line-height: 1.22;
}

.markdown2pdf-beamer-nav,
.markdown2pdf-beamer-footer {
  left: 0;
  right: 0;
  color: #ffffff;
}

.markdown2pdf-beamer-nav {
  position: absolute;
  top: 0;
  left: -8.7mm;
  right: -8.7mm;
  z-index: 3;
  height: 5mm;
  border-bottom: 0.25mm solid #3f3aa0;
  background: var(--beamer-nav);
  color: rgba(255, 255, 255, 0.62);
  display: grid;
  grid-template-columns: repeat(var(--beamer-nav-count, 1), minmax(0, 1fr));
  font-size: 5.2pt;
  line-height: 1.8mm;
  letter-spacing: 0;
}

.markdown2pdf-beamer-nav-item {
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 0 1.4mm;
}

.markdown2pdf-beamer-nav-title {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.45mm;
}

.markdown2pdf-beamer-nav-markers {
  display: block;
  height: 1mm;
  margin-top: 0.18mm;
  line-height: 0;
}

.markdown2pdf-beamer-markers {
  display: block;
  height: 0.34mm;
  overflow: visible;
}

.markdown2pdf-beamer-marker {
  color: currentColor;
  fill: currentColor;
  stroke: none;
}

.markdown2pdf-beamer-marker-active {
  color: #ffffff;
}

.markdown2pdf-beamer-footer {
  position: fixed;
  bottom: 0;
  height: 7.2mm;
  border-top: 0.15mm solid #4d4ab8;
  background: linear-gradient(to bottom, var(--beamer-footer) 0 3.2mm, var(--beamer-footer-dark) 3.2mm 100%);
  font-size: 4.8pt;
  line-height: 3.2mm;
}

.markdown2pdf-beamer-footer span {
  display: block;
  height: 3.2mm;
  padding-left: 3.2mm;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.markdown2pdf-theme-beamer {
  position: relative;
  z-index: 1;
  max-width: none;
  min-height: calc(96mm - 17mm);
  margin: 0;
}

.markdown2pdf-theme-beamer h1 {
  position: relative;
  z-index: 1;
  width: 128mm;
  margin: 0 -8.7mm 0;
  padding: 6.8mm 3.2mm 2.4mm;
  border: 0;
  background: var(--beamer-title);
  color: #ffffff;
  text-align: left;
  font-size: 13.5pt;
  font-weight: 400;
  line-height: 1.15;
}

.markdown2pdf-theme-beamer > h1:not(:first-child) {
  break-before: page;
  page-break-before: always;
}

.markdown2pdf-beamer-frame {
  position: relative;
  height: 87.6mm;
  padding-top: 0;
  padding-bottom: 8.4mm;
  break-before: page;
  page-break-before: always;
  break-inside: avoid;
  page-break-inside: avoid;
}

.markdown2pdf-beamer-frame-continuation {
  padding-top: 6.1mm;
}

.markdown2pdf-beamer-frame h1 + h2 {
  margin-top: 2mm;
}

.markdown2pdf-theme-beamer > h1 + .markdown2pdf-beamer-frame,
.markdown2pdf-theme-beamer .markdown2pdf-toc + h1 + .markdown2pdf-beamer-frame {
  break-before: auto;
  page-break-before: auto;
}

.markdown2pdf-theme-beamer h2 {
  margin: 0;
  padding: 1.15mm 1.35mm 1mm;
  border: 0;
  background: var(--beamer-block);
  color: #ffffff;
  font-size: 10.2pt;
  font-weight: 400;
  line-height: 1.15;
  break-after: avoid;
  page-break-after: avoid;
}

.markdown2pdf-theme-beamer h1 + h2,
.markdown2pdf-theme-beamer .markdown2pdf-toc + h1 + h2 {
  margin-top: 2mm;
}

.markdown2pdf-theme-beamer h3 {
  margin: 7mm 0 2.6mm;
  color: #111111;
  font-size: 10.5pt;
  font-weight: 700;
}

.markdown2pdf-theme-beamer p,
.markdown2pdf-theme-beamer ul,
.markdown2pdf-theme-beamer ol,
.markdown2pdf-theme-beamer pre,
.markdown2pdf-theme-beamer table,
.markdown2pdf-theme-beamer figure,
.markdown2pdf-theme-beamer .math-display {
  margin-bottom: 2.2mm;
}

.markdown2pdf-theme-beamer .math-display mjx-container > svg {
  max-width: 100%;
  height: auto;
}

.markdown2pdf-theme-beamer h2 + p,
.markdown2pdf-theme-beamer h2 + ul,
.markdown2pdf-theme-beamer h2 + ol,
.markdown2pdf-theme-beamer blockquote {
  margin-top: 0;
  padding: 1.15mm 1.25mm 1.35mm;
  border: 0;
  border-top: 0;
  background: var(--beamer-block-body);
}

.markdown2pdf-theme-beamer h2 + ul,
.markdown2pdf-theme-beamer h2 + ol {
  padding-left: 1.35mm;
  list-style-position: inside;
}

.markdown2pdf-theme-beamer blockquote {
  width: 100%;
  margin-left: 0;
  margin-right: 0;
  color: #111111;
  background: var(--beamer-block-body);
}

.markdown2pdf-theme-beamer ul,
.markdown2pdf-theme-beamer ol {
  padding-left: 5.4mm;
}

.markdown2pdf-theme-beamer li {
  margin: 0.55mm 0;
}

.markdown2pdf-theme-beamer :not(pre) > code {
  padding: 0 0.9mm;
  border-radius: 1mm;
  background: #f7f7ff;
  color: #9f1239;
}

.markdown2pdf-theme-beamer table {
  font-size: 8.5pt;
}

.markdown2pdf-theme-beamer th,
.markdown2pdf-theme-beamer td {
  padding: 1.1mm 1.3mm;
}

.markdown2pdf-theme-beamer pre {
  padding: 1.6mm 2mm;
  border-radius: 0;
  background: #f5f5ff;
}

.markdown2pdf-theme-beamer pre code {
  font-size: 7.4pt;
  line-height: 1.3;
}

.markdown2pdf-theme-beamer .markdown2pdf-toc {
  position: relative;
  min-height: calc(96mm - 17mm);
  margin: 0;
  page-break-after: always;
  break-after: page;
}

.markdown2pdf-theme-beamer .markdown2pdf-toc h1 {
  margin-bottom: 10mm;
}

.markdown2pdf-theme-beamer .markdown2pdf-toc ol {
  margin: 0 0 0 7mm;
  padding: 0 0 0 1mm;
  border: 0;
  background: transparent;
  columns: 1;
  list-style: none;
  color: #111111;
  font-size: 8.1pt;
  line-height: 1.15;
}

.markdown2pdf-theme-beamer .markdown2pdf-toc-item {
  margin: 0 0 0.38mm;
  line-height: 1.12;
  break-inside: avoid;
}

.markdown2pdf-theme-beamer .markdown2pdf-toc-level-2 {
  padding-left: 3.5mm;
}

.markdown2pdf-theme-beamer .markdown2pdf-toc-level-3 {
  padding-left: 8mm;
  font-size: 7.6pt;
}
`,
};

export async function buildCss(config: ExportConfig): Promise<string> {
  const customCss = config.customCssFile ? await readCustomCss(config.customCssFile) : '';
  return [
    sharedCss,
    `body { --body-font: ${config.fontFamily}; }`,
    themeCss[config.theme],
    customCss,
  ].join('\n');
}

async function readCustomCss(customCssFile: string): Promise<string> {
  const cssPath = path.resolve(customCssFile);
  try {
    return await fs.readFile(cssPath, 'utf8');
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`Unable to read custom CSS file "${cssPath}": ${detail}`);
  }
}
