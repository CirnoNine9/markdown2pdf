import MarkdownIt = require('markdown-it');

type StateBlock = MarkdownIt.StateBlock;
type StateInline = MarkdownIt.StateInline;
type RenderRule = MarkdownIt.Renderer.RenderRule;

const dollarCode = 0x24;
const backslashCode = 0x5c;

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

function isNumericMathBody(value: string): boolean {
  return /^\d+(?:[.,]\d+)?$/.test(value);
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

  if (trimmed !== open) {
    return false;
  }

  let nextLine = startLine + 1;
  while (nextLine < endLine) {
    if (getLine(state, nextLine).trim() === close) {
      break;
    }
    nextLine += 1;
  }

  if (nextLine >= endLine) {
    return false;
  }

  if (!silent) {
    const body = state.getLines(startLine + 1, nextLine, state.blkIndent, false).trim();
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

  if (/\d/.test(state.src[start + 1] ?? '')) {
    const close = findSingleLineDollarClose(state.src, start + 1);
    if (close < 0) {
      return false;
    }

    const rawBody = state.src.slice(start + 1, close);
    const body = rawBody.trim();
    const hasTexSignal = containsTexSignal(body);
    if (
      (rawBody !== body && !hasTexSignal) ||
      (!isNumericMathBody(body) && !hasTexSignal) ||
      !canCloseDollar(state.src, close, body)
    ) {
      return false;
    }

    if (!silent) {
      pushInlineToken(state, body, start + 1);
    }
    state.pos = close + 1;
    return true;
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
  if (!body || !canCloseDollar(state.src, close, body)) {
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
  if (!next || next === '$' || /\s|\d/.test(next)) {
    return false;
  }

  return true;
}

function canCloseDollar(src: string, pos: number, body: string): boolean {
  if (src.charCodeAt(pos - 1) === backslashCode) {
    return false;
  }

  if (/\s$/.test(body)) {
    return false;
  }

  const next = src[pos + 1];
  if (next && /\d/.test(next)) {
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
