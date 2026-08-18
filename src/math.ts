import MarkdownIt = require('markdown-it');

type StateBlock = MarkdownIt.StateBlock;
type StateInline = MarkdownIt.StateInline;
type RenderRule = MarkdownIt.Renderer.RenderRule;

const dollarCode = 0x24;
const backslashCode = 0x5c;

interface ProtectedMathPipes {
  content: string;
  placeholder: string;
}

export function mathPlugin(md: MarkdownIt): void {
  md.block.ruler.before('fence', 'markdown2pdf_math_block', mathBlockRule, {
    alt: ['paragraph', 'reference', 'blockquote', 'list'],
  });
  md.inline.ruler.before('escape', 'markdown2pdf_paren_math_inline', parenInlineRule);
  md.inline.ruler.before('escape', 'markdown2pdf_dollar_math_inline', dollarInlineRule);

  md.renderer.rules.math_inline = renderInlineMath;
  md.renderer.rules.math_display = renderDisplayMath;
}

export function containsTexSignal(value: string): boolean {
  return /[\\_^&{}]/.test(value);
}

/**
 * Markdown-it parses table cells before it parses inline math. Protect pipes in
 * recognized tables so TeX absolute-value delimiters are not treated as cells.
 */
export function protectMathPipesInTables(markdown: string): ProtectedMathPipes {
  const placeholder = findUnusedPrivateUseCharacter(markdown);
  const lines = markdown.split('\n');
  let inFence = false;

  for (let index = 0; index < lines.length; index += 1) {
    if (isFenceLine(lines[index])) {
      inFence = !inFence;
      continue;
    }

    if (inFence || !isTableDelimiterLine(lines[index + 1] ?? '')) {
      continue;
    }

    lines[index] = protectInlineMathPipes(lines[index], placeholder);
    index += 1;

    while (index + 1 < lines.length && isTableRowLine(lines[index + 1])) {
      index += 1;
      lines[index] = protectInlineMathPipes(lines[index], placeholder);
    }
  }

  return { content: lines.join('\n'), placeholder };
}

export function restoreMathPipes(value: string, placeholder: string): string {
  return value.replaceAll(placeholder, '|');
}

function mathBlockRule(state: StateBlock, startLine: number, endLine: number, silent: boolean): boolean {
  if (state.sCount[startLine] - state.blkIndent >= 4) {
    return false;
  }

  const line = getLine(state, startLine);
  const trimmed = line.trim();
  const marker = blockMarker(trimmed);
  if (!marker) {
    return false;
  }

  const { open, close, singleLine } = marker;
  if (singleLine) {
    const body = trimmed.slice(open.length, -close.length).trim();
    if (!body) {
      return false;
    }

    if (!silent) {
      pushMathDisplay(state, body, startLine + 1);
    }
    state.line = startLine + 1;
    return true;
  }

  const bodyLines: string[] = [];
  const openingBody = trimmed.slice(open.length);
  if (openingBody) {
    bodyLines.push(openingBody);
  }

  let nextLine = startLine + 1;
  while (nextLine < endLine) {
    const currentLine = getLine(state, nextLine);
    const trimmedLine = currentLine.trim();
    if (trimmedLine.endsWith(close)) {
      const closingBody = trimmedLine.slice(0, -close.length).trimEnd();
      if (closingBody) {
        bodyLines.push(closingBody);
      }
      break;
    }
    bodyLines.push(currentLine);
    nextLine += 1;
  }

  if (nextLine >= endLine) {
    return false;
  }

  const body = bodyLines.join('\n').trim();
  if (!body) {
    return false;
  }

  if (!silent) {
    pushMathDisplay(state, body, startLine + 1);
  }
  state.line = nextLine + 1;
  return true;
}

function parenInlineRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  if (state.src.charCodeAt(start) !== backslashCode || state.src[start + 1] !== '(') {
    return false;
  }

  const end = findEscapedClose(state.src, start + 2, ')');
  if (end < 0) {
    return false;
  }

  const body = state.src.slice(start + 2, end).trim();
  if (!body) {
    return false;
  }

  if (!silent) {
    pushInlineToken(state, body, start + 1);
  }
  state.pos = end + 2;
  return true;
}

function dollarInlineRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos;
  if (
    state.src.charCodeAt(start) !== dollarCode ||
    (start > 0 && state.src.charCodeAt(start - 1) === backslashCode) ||
    (start > 0 && state.src[start - 1] === '$') ||
    state.src[start + 1] === '$'
  ) {
    return false;
  }

  const multiline = findMultilineInlineClose(state.src, start);
  if (multiline) {
    const body = state.src.slice(start + 1, multiline.close).trim();
    if (!containsTexSignal(body)) {
      return false;
    }

    if (!silent) {
      pushInlineToken(state, body, start + 1);
    }
    state.pos = multiline.close + 1;
    return true;
  }

  if (!canOpenSingleLineDollar(state.src, start)) {
    return false;
  }

  const close = findSingleLineDollarClose(state.src, start + 1);
  if (close < 0) {
    return false;
  }

  const body = state.src.slice(start + 1, close).trim();
  if (!body) {
    return false;
  }

  if (!silent) {
    pushInlineToken(state, body, start + 1);
  }
  state.pos = close + 1;
  return true;
}

function renderInlineMath(tokens: MarkdownIt.Token[], index: number): string {
  return `<span class="math-inline" data-math-source="${escapeHtmlAttribute(tokens[index].content)}">\\(${escapeHtmlText(tokens[index].content)}\\)</span>`;
}

function renderDisplayMath(tokens: MarkdownIt.Token[], index: number): string {
  const token = tokens[index];
  const sourceLine = token.meta?.sourceLine ? ` data-source-line="${escapeHtmlAttribute(String(token.meta.sourceLine))}"` : '';
  return `<div class="math-display"${sourceLine} data-math-source="${escapeHtmlAttribute(token.content)}">\\[${escapeHtmlText(token.content)}\\]</div>\n`;
}

function pushMathDisplay(state: StateBlock, body: string, sourceLine: number): void {
  const token = state.push('math_display', 'div', 0);
  token.block = true;
  token.content = body;
  token.map = [sourceLine - 1, state.line];
  token.meta = { sourceLine };
}

function pushInlineToken(state: StateInline, body: string, sourceOffset: number): void {
  const token = state.push('math_inline', 'span', 0);
  token.content = body;
  token.meta = { sourceOffset };
}

function blockMarker(trimmed: string):
  | { open: '$$'; close: '$$'; singleLine: boolean }
  | { open: '\\['; close: '\\]'; singleLine: boolean }
  | { open: '$'; close: '$'; singleLine: false }
  | undefined {
  if (trimmed.startsWith('$$')) {
    return {
      open: '$$',
      close: '$$',
      singleLine: trimmed.length > 4 && trimmed.endsWith('$$'),
    };
  }

  if (trimmed.startsWith('\\[')) {
    return {
      open: '\\[',
      close: '\\]',
      singleLine: trimmed.length > 4 && trimmed.endsWith('\\]'),
    };
  }

  if (trimmed === '$') {
    return { open: '$', close: '$', singleLine: false };
  }

  return undefined;
}

function getLine(state: StateBlock, line: number): string {
  return state.src.slice(state.bMarks[line] + state.tShift[line], state.eMarks[line]);
}

function canOpenSingleLineDollar(src: string, pos: number): boolean {
  const next = src[pos + 1];
  if (!next || next === '$' || /\s/.test(next)) {
    return false;
  }

  return true;
}

function findSingleLineDollarClose(src: string, from: number): number {
  for (let index = from; index < src.length; index += 1) {
    const char = src[index];
    if (char === '\n') {
      return -1;
    }

    if (char === '$' && src.charCodeAt(index - 1) !== backslashCode && src[index + 1] !== '$') {
      return index;
    }
  }

  return -1;
}

function findMultilineInlineClose(src: string, start: number): { close: number } | undefined {
  const lineEnd = src.indexOf('\n', start);
  if (lineEnd < 0 || src.slice(start + 1, lineEnd).trim() !== '') {
    return undefined;
  }

  let lineStart = lineEnd + 1;
  while (lineStart < src.length) {
    const nextLineEnd = src.indexOf('\n', lineStart);
    const currentLineEnd = nextLineEnd < 0 ? src.length : nextLineEnd;
    const line = src.slice(lineStart, currentLineEnd);
    const firstNonSpace = line.search(/\S/);
    if (firstNonSpace >= 0 && line[firstNonSpace] === '$' && line[firstNonSpace + 1] !== '$') {
      return { close: lineStart + firstNonSpace };
    }

    if (nextLineEnd < 0) {
      break;
    }
    lineStart = nextLineEnd + 1;
  }

  return undefined;
}

function findEscapedClose(src: string, from: number, marker: ')' | ']'): number {
  for (let index = from; index < src.length - 1; index += 1) {
    if (src.charCodeAt(index) === backslashCode && src[index + 1] === marker) {
      return index;
    }
  }

  return -1;
}

function protectInlineMathPipes(line: string, placeholder: string): string {
  let result = '';
  let position = 0;

  while (position < line.length) {
    if (line[position] === '`') {
      const marker = line.slice(position).match(/^`+/)?.[0] ?? '`';
      const close = line.indexOf(marker, position + marker.length);
      if (close >= 0) {
        result += line.slice(position, close + marker.length);
        position = close + marker.length;
        continue;
      }
    }

    const parenMath = line[position] === '\\' && line[position + 1] === '(';
    const bracketMath = line[position] === '\\' && line[position + 1] === '[';
    if (parenMath || bracketMath) {
      const marker = parenMath ? ')' : ']';
      const close = findEscapedClose(line, position + 2, marker);
      if (close >= 0) {
        result += line.slice(position, position + 2);
        result += line.slice(position + 2, close).replaceAll('|', placeholder);
        result += line.slice(close, close + 2);
        position = close + 2;
        continue;
      }
    }

    if (
      line.charCodeAt(position) === dollarCode &&
      (position === 0 || line.charCodeAt(position - 1) !== backslashCode) &&
      line[position + 1] !== '$' &&
      canOpenSingleLineDollar(line, position)
    ) {
      const close = findSingleLineDollarClose(line, position + 1);
      if (close >= 0) {
        result += line[position];
        result += line.slice(position + 1, close).replaceAll('|', placeholder);
        result += line[close];
        position = close + 1;
        continue;
      }
    }

    result += line[position];
    position += 1;
  }

  return result;
}

function isTableDelimiterLine(line: string): boolean {
  const normalized = stripBlockQuotePrefix(line).trim();
  return /^\|?\s*:?-+:?\s*(?:\|\s*:?-+:?\s*)+\|?$/.test(normalized);
}

function isTableRowLine(line: string): boolean {
  const normalized = stripBlockQuotePrefix(line);
  return normalized.trim().length > 0 && normalized.includes('|');
}

function stripBlockQuotePrefix(line: string): string {
  let result = line;
  while (/^\s{0,3}>\s?/.test(result)) {
    result = result.replace(/^\s{0,3}>\s?/, '');
  }
  return result;
}

function isFenceLine(line: string): boolean {
  return /^\s{0,3}(?:`{3,}|~{3,})/.test(line);
}

function findUnusedPrivateUseCharacter(value: string): string {
  for (let codePoint = 0xe000; codePoint <= 0xf8ff; codePoint += 1) {
    const candidate = String.fromCharCode(codePoint);
    if (!value.includes(candidate)) {
      return candidate;
    }
  }

  throw new Error('Unable to reserve a temporary character for table math parsing.');
}

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
