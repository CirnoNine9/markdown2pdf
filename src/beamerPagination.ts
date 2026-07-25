export const beamerPaginationGlobal = 'markdown2pdfPaginateBeamer';
export const beamerPaginationReadyGlobal = 'markdown2pdfBeamerPaginationReady';

export async function paginateBeamerFramesInBrowser(): Promise<void> {
  const root = document.querySelector<HTMLElement>('.markdown2pdf-theme-beamer');
  if (!root) {
    return;
  }

  await waitForLayoutAssets();

  const frames = Array.from(
    root.querySelectorAll<HTMLElement>(':scope > .markdown2pdf-beamer-frame')
  );
  let cursor = 0;
  let splitCount = 0;

  while (cursor < frames.length && splitCount < 512) {
    const frame = frames[cursor];
    if (!frameOverflows(frame)) {
      cursor += 1;
      continue;
    }

    const continuation = splitOverflowingFrame(frame);
    if (continuation) {
      frame.after(continuation);
      frames.splice(cursor + 1, 0, continuation);
      splitCount += 1;
    }

    if (frameOverflows(frame)) {
      fitLastContentBlock(frame);
    }

    cursor += 1;
  }

  rebuildNavigation(root, frames);

  async function waitForLayoutAssets(): Promise<void> {
    if (document.fonts?.ready) {
      await document.fonts.ready;
    }

    await Promise.all(
      Array.from(document.images).map(
        (image) =>
          new Promise<void>((resolve) => {
            if (image.complete) {
              resolve();
              return;
            }
            image.addEventListener('load', () => resolve(), { once: true });
            image.addEventListener('error', () => resolve(), { once: true });
          })
      )
    );
  }

  function frameOverflows(frame: HTMLElement): boolean {
    const frameRect = frame.getBoundingClientRect();
    const paddingBottom = Number.parseFloat(getComputedStyle(frame).paddingBottom) || 0;
    const usableBottom = frame.clientHeight - paddingBottom + 0.75;

    return contentChildren(frame).some(
      (child) => child.getBoundingClientRect().bottom - frameRect.top > usableBottom
    );
  }

  function contentChildren(frame: HTMLElement): HTMLElement[] {
    return Array.from(frame.children).filter(
      (child): child is HTMLElement =>
        child instanceof HTMLElement && !child.classList.contains('markdown2pdf-beamer-nav')
    );
  }

  function bodyChildren(frame: HTMLElement): HTMLElement[] {
    return contentChildren(frame).filter((child) => !/^H[1-3]$/.test(child.tagName));
  }

  function splitOverflowingFrame(frame: HTMLElement): HTMLElement | undefined {
    const blocks = bodyChildren(frame);
    if (blocks.length > 1) {
      const continuation = createContinuationFrame(frame);

      while (blocks.length > 1 && frameOverflows(frame)) {
        const block = blocks.pop();
        if (!block) {
          break;
        }
        prependBodyBlock(continuation, block);
      }

      keepLabelWithFollowingBlock(frame, continuation);
      return bodyChildren(continuation).length > 0 ? continuation : undefined;
    }

    const block = blocks[0];
    if (!block) {
      return undefined;
    }

    if (block.matches('ul, ol')) {
      return splitList(frame, block as HTMLUListElement | HTMLOListElement);
    }
    if (block instanceof HTMLTableElement) {
      return splitTable(frame, block);
    }
    if (block instanceof HTMLPreElement) {
      return splitCodeBlock(frame, block);
    }
    if (block instanceof HTMLParagraphElement) {
      return splitParagraph(frame, block);
    }

    return undefined;
  }

  function createContinuationFrame(frame: HTMLElement): HTMLElement {
    const continuation = document.createElement('section');
    continuation.className = frame.className;
    continuation.classList.add('markdown2pdf-beamer-frame-continuation');

    for (const attribute of Array.from(frame.attributes)) {
      if (attribute.name.startsWith('data-beamer-')) {
        continuation.setAttribute(attribute.name, attribute.value);
      }
    }

    const navigation = Array.from(frame.children).find(
      (child) => child instanceof HTMLElement && child.classList.contains('markdown2pdf-beamer-nav')
    );
    if (navigation) {
      continuation.append(navigation.cloneNode(true));
    }

    for (const heading of contentChildren(frame).filter((child) => /^H[2-3]$/.test(child.tagName))) {
      const clone = heading.cloneNode(true) as HTMLElement;
      clone.removeAttribute('id');
      continuation.append(clone);
    }

    return continuation;
  }

  function prependBodyBlock(frame: HTMLElement, block: HTMLElement): void {
    frame.insertBefore(block, bodyChildren(frame)[0] ?? null);
  }

  function keepLabelWithFollowingBlock(frame: HTMLElement, continuation: HTMLElement): void {
    const currentBlocks = bodyChildren(frame);
    if (currentBlocks.length <= 1) {
      return;
    }

    const previous = currentBlocks.at(-1);
    const next = bodyChildren(continuation)[0];
    if (!previous || !next || !shouldKeepTogether(previous, next)) {
      return;
    }

    prependBodyBlock(continuation, previous);
  }

  function shouldKeepTogether(label: HTMLElement, content: HTMLElement): boolean {
    const isShortLabel =
      /^H[4-6]$/.test(label.tagName) ||
      (label.tagName === 'P' &&
        (label.textContent?.trim().length ?? 0) <= 120 &&
        /[:：]$/.test(label.textContent?.trim() ?? ''));
    const isLabeledContent = content.matches(
      'div.math-display, table, pre, figure, img, ul, ol, blockquote'
    );
    return isShortLabel && isLabeledContent;
  }

  function splitList(
    frame: HTMLElement,
    list: HTMLUListElement | HTMLOListElement
  ): HTMLElement | undefined {
    const items = Array.from(list.children).filter(
      (child): child is HTMLLIElement => child instanceof HTMLLIElement
    );
    if (items.length <= 1) {
      return undefined;
    }

    const continuation = createContinuationFrame(frame);
    const tail = list.cloneNode(false) as HTMLUListElement | HTMLOListElement;
    continuation.append(tail);

    while (items.length > 1 && frameOverflows(frame)) {
      const item = items.pop();
      if (!item) {
        break;
      }
      tail.prepend(item);
    }

    if (list instanceof HTMLOListElement && tail instanceof HTMLOListElement) {
      const originalStart = list.hasAttribute('start') ? list.start : 1;
      tail.start = originalStart + items.length;
    }

    return tail.children.length > 0 ? continuation : undefined;
  }

  function splitTable(frame: HTMLElement, table: HTMLTableElement): HTMLElement | undefined {
    const body = table.tBodies[0];
    const rows = body ? Array.from(body.rows) : [];
    if (!body || rows.length <= 1) {
      return undefined;
    }

    const continuation = createContinuationFrame(frame);
    const tailTable = table.cloneNode(false) as HTMLTableElement;
    for (const child of Array.from(table.children)) {
      if (['CAPTION', 'COLGROUP', 'THEAD'].includes(child.tagName)) {
        tailTable.append(child.cloneNode(true));
      }
    }
    const tailBody = body.cloneNode(false) as HTMLTableSectionElement;
    tailTable.append(tailBody);
    for (const child of Array.from(table.children)) {
      if (child.tagName === 'TFOOT') {
        tailTable.append(child.cloneNode(true));
      }
    }
    continuation.append(tailTable);

    while (rows.length > 1 && frameOverflows(frame)) {
      const row = rows.pop();
      if (!row) {
        break;
      }
      tailBody.prepend(row);
    }

    return tailBody.rows.length > 0 ? continuation : undefined;
  }

  function splitCodeBlock(frame: HTMLElement, pre: HTMLPreElement): HTMLElement | undefined {
    const code = pre.querySelector<HTMLElement>(':scope > code');
    const lines = code
      ? Array.from(code.children).filter(
          (child): child is HTMLElement =>
            child instanceof HTMLElement && child.classList.contains('line')
        )
      : [];
    if (!code || lines.length <= 1) {
      return undefined;
    }

    const continuation = createContinuationFrame(frame);
    const tailPre = pre.cloneNode(false) as HTMLPreElement;
    const tailCode = code.cloneNode(false) as HTMLElement;
    tailPre.append(tailCode);
    continuation.append(tailPre);
    const tailLines: HTMLElement[] = [];

    while (lines.length > 1 && frameOverflows(frame)) {
      const line = lines.pop();
      if (!line) {
        break;
      }
      tailLines.unshift(line);
      replaceCodeLines(code, lines);
      replaceCodeLines(tailCode, tailLines);
    }

    return tailLines.length > 0 ? continuation : undefined;
  }

  function splitParagraph(
    frame: HTMLElement,
    paragraph: HTMLParagraphElement
  ): HTMLElement | undefined {
    const continuation = createContinuationFrame(frame);
    const tail = paragraph.cloneNode(false) as HTMLParagraphElement;
    continuation.append(tail);

    while (paragraph.childNodes.length > 1 && frameOverflows(frame)) {
      const node = paragraph.lastChild;
      if (!node) {
        break;
      }
      tail.prepend(node);
    }

    if (frameOverflows(frame) && paragraph.lastChild instanceof Text) {
      const textNode = paragraph.lastChild;
      const characters = Array.from(textNode.data);
      let low = 1;
      let high = characters.length - 1;
      let best = 0;

      while (low <= high) {
        const middle = Math.floor((low + high) / 2);
        textNode.data = characters.slice(0, middle).join('');
        if (frameOverflows(frame)) {
          high = middle - 1;
        } else {
          best = middle;
          low = middle + 1;
        }
      }

      textNode.data = characters.slice(0, best || characters.length).join('');
      if (best > 0 && best < characters.length) {
        tail.prepend(document.createTextNode(characters.slice(best).join('')));
      }
    }

    return tail.textContent || tail.children.length > 0 ? continuation : undefined;
  }

  function replaceCodeLines(code: HTMLElement, lines: HTMLElement[]): void {
    const nodes: Node[] = [];
    lines.forEach((line, index) => {
      if (index > 0) {
        nodes.push(document.createTextNode('\n'));
      }
      nodes.push(line);
    });
    code.replaceChildren(...nodes);
  }

  function fitLastContentBlock(frame: HTMLElement): void {
    for (let attempt = 0; attempt < 4 && frameOverflows(frame); attempt += 1) {
      const candidate = bodyChildren(frame).at(-1) ?? contentChildren(frame).at(-1);
      if (!candidate) {
        return;
      }

      const frameRect = frame.getBoundingClientRect();
      const candidateRect = candidate.getBoundingClientRect();
      const paddingBottom = Number.parseFloat(getComputedStyle(frame).paddingBottom) || 0;
      const usableBottom = frame.clientHeight - paddingBottom - 1;
      const overflow = candidateRect.bottom - frameRect.top - usableBottom;
      const targetHeight = candidateRect.height - overflow - 1;
      if (targetHeight <= 0 || candidateRect.height <= 0) {
        return;
      }

      const currentZoom = Number.parseFloat(candidate.style.zoom) || 1;
      const nextZoom = Math.max(0.1, currentZoom * (targetHeight / candidateRect.height));
      if (nextZoom >= currentZoom) {
        return;
      }
      candidate.style.zoom = String(nextZoom);
      candidate.setAttribute('data-beamer-fitted', 'true');
    }
  }

  function rebuildNavigation(container: HTMLElement, allFrames: HTMLElement[]): void {
    const deckOrder = Array.from(
      new Map(
        allFrames.map((frame) => [
          frame.dataset.beamerDeckIndex ?? '0',
          frame.dataset.beamerDeckTitle ?? '',
        ])
      ).entries()
    ).slice(0, 8);

    const buildNavigation = (activeFrame?: HTMLElement): HTMLElement => {
      const nav = document.createElement('nav');
      nav.className = 'markdown2pdf-beamer-nav';
      nav.setAttribute('aria-hidden', 'true');
      nav.style.setProperty('--beamer-nav-count', String(Math.max(1, deckOrder.length)));

      for (const [deckIndex, deckTitle] of deckOrder) {
        const deckFrames = allFrames.filter(
          (frame) => (frame.dataset.beamerDeckIndex ?? '0') === deckIndex
        );
        const item = document.createElement('span');
        item.className = 'markdown2pdf-beamer-nav-item';

        const title = document.createElement('span');
        title.className = 'markdown2pdf-beamer-nav-title';
        title.textContent = deckTitle;
        item.append(title);

        const markerWrapper = document.createElement('span');
        markerWrapper.className = 'markdown2pdf-beamer-nav-markers';
        const markerCount = Math.max(1, deckFrames.length);
        const radius = 1.25;
        const step = 6.2;
        const width = radius * 2 + step * (markerCount - 1);
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'markdown2pdf-beamer-markers');
        svg.setAttribute('viewBox', `0 0 ${width} ${radius * 2}`);
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
        svg.style.width = `${Math.max(0.5, markerCount * 0.45)}mm`;

        deckFrames.forEach((frame, markerIndex) => {
          const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
          marker.setAttribute('class', 'markdown2pdf-beamer-marker');
          if (frame === activeFrame) {
            marker.classList.add('markdown2pdf-beamer-marker-active');
          }
          marker.setAttribute('cx', String(radius + markerIndex * step));
          marker.setAttribute('cy', String(radius));
          marker.setAttribute('r', String(radius));
          svg.append(marker);
        });

        markerWrapper.append(svg);
        item.append(markerWrapper);
        nav.append(item);
      }

      return nav;
    };

    for (const frame of allFrames) {
      frame.querySelector(':scope > .markdown2pdf-beamer-nav')?.replaceWith(buildNavigation(frame));
    }
    for (const tocNavigation of Array.from(
      container.querySelectorAll<HTMLElement>(
        ':scope > .markdown2pdf-toc > .markdown2pdf-beamer-nav'
      )
    )) {
      tocNavigation.replaceWith(buildNavigation());
    }
  }
}
