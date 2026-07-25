import { beamerPaginationReadyGlobal } from './beamerPagination';

export interface PreviewHtmlOptions {
  cspSource: string;
  nonce: string;
}

export function preparePreviewHtml(html: string, options: PreviewHtmlOptions): string {
  const csp = [
    "default-src 'none'",
    `img-src ${options.cspSource} data: http: https:`,
    `style-src ${options.cspSource} 'unsafe-inline'`,
    `script-src ${options.cspSource} 'nonce-${options.nonce}'`,
    `font-src ${options.cspSource} data:`,
  ].join('; ');
  const previewKind = html.includes('markdown2pdf-theme-beamer') ? 'beamer' : 'document';
  const previewStyle = `<style id="markdown2pdf-preview-style">
    html.markdown2pdf-preview {
      width: 100%;
      min-height: 100%;
      background: var(--vscode-editor-background, #e7e9ed) !important;
    }
    html.markdown2pdf-preview body {
      width: auto;
      min-height: 100vh;
      padding: 28px;
      background: var(--vscode-editor-background, #e7e9ed) !important;
    }
    html.markdown2pdf-preview-document .markdown2pdf-document {
      width: min(100%, 210mm);
      max-width: 210mm;
      min-height: 297mm;
      margin: 0 auto;
      padding: 18mm;
      background: #ffffff;
      box-shadow: 0 2px 14px rgba(0, 0, 0, 0.18);
    }
    html.markdown2pdf-preview-beamer body {
      position: relative;
      width: 128mm;
      min-height: 96mm;
      margin: 28px auto;
      padding: 0 8.7mm 8.4mm;
      background: #ffffff !important;
      box-shadow: 0 2px 14px rgba(0, 0, 0, 0.18);
    }
    html.markdown2pdf-preview-beamer .markdown2pdf-document {
      width: auto;
      max-width: none;
      margin: 0;
      padding: 0;
      background: transparent;
      box-shadow: none;
    }
    html.markdown2pdf-preview-beamer .markdown2pdf-beamer-footer {
      position: absolute;
    }
    html.markdown2pdf-preview-beamer-ready body {
      position: static;
      width: auto;
      min-height: 100vh;
      margin: 0;
      padding: 28px;
      overflow-x: hidden;
      background: var(--vscode-editor-background, #e7e9ed) !important;
      box-shadow: none;
    }
    html.markdown2pdf-preview-beamer-ready .markdown2pdf-document {
      display: flex;
      width: 100%;
      max-width: none;
      margin: 0;
      padding: 0;
      flex-direction: column;
      align-items: center;
      gap: 28px;
      background: transparent;
      box-shadow: none;
    }
    html.markdown2pdf-preview-beamer-ready body > .markdown2pdf-beamer-footer {
      display: none;
    }
    html.markdown2pdf-preview-beamer-ready .markdown2pdf-preview-slide {
      position: relative;
      width: 128mm;
      height: 96mm;
      flex: 0 0 auto;
      overflow: hidden;
      background: #ffffff;
      box-shadow: 0 2px 14px rgba(0, 0, 0, 0.18);
    }
    html.markdown2pdf-preview-beamer-ready .markdown2pdf-preview-slide.markdown2pdf-beamer-frame {
      height: 96mm;
      padding-right: 8.7mm;
      padding-bottom: 16.8mm;
      padding-left: 8.7mm;
      break-before: auto;
      page-break-before: auto;
    }
    html.markdown2pdf-preview-beamer-ready .markdown2pdf-preview-slide.markdown2pdf-toc {
      min-height: 96mm;
      margin: 0;
      padding: 0 8.7mm 8.4mm;
      break-after: auto;
      page-break-after: auto;
    }
    html.markdown2pdf-preview-beamer-ready .markdown2pdf-preview-slide > .markdown2pdf-beamer-nav {
      left: 0;
      right: 0;
    }
    html.markdown2pdf-preview-beamer-ready .markdown2pdf-preview-slide > .markdown2pdf-beamer-footer {
      display: block;
      position: absolute;
    }
    @media (max-width: 720px) {
      html.markdown2pdf-preview-document body {
        padding: 0;
      }
      html.markdown2pdf-preview-document .markdown2pdf-document {
        min-height: 100vh;
        min-width: 0;
        padding: 24px 18px;
        overflow-wrap: anywhere;
        box-shadow: none;
      }
      html.markdown2pdf-preview-document .markdown2pdf-document table {
        display: block;
        max-width: 100%;
        overflow-x: auto;
      }
      html.markdown2pdf-preview-beamer-ready body {
        padding: 12px;
      }
      html.markdown2pdf-preview-beamer-ready .markdown2pdf-document {
        gap: 16px;
      }
    }
    @media (max-width: 220px) {
      html.markdown2pdf-preview-document .markdown2pdf-document .math-inline {
        display: inline-block;
        max-width: 100%;
        overflow-x: auto;
        overflow-y: hidden;
        vertical-align: middle;
      }
    }
  </style>`;
  const previewScript = `<script>
    (() => {
      const vscode = acquireVsCodeApi();
      const previousState = vscode.getState() || {};
      let saveTimer;
      let slideResizeObserver;

      const layoutBeamerSlides = () => {
        const root = document.querySelector('.markdown2pdf-theme-beamer');
        if (!root || root.dataset.previewSlidesReady === 'true') {
          return;
        }

        const footer = document.querySelector('body > .markdown2pdf-beamer-footer');
        const slides = Array.from(root.children).filter((child) =>
          child.matches('.markdown2pdf-toc, .markdown2pdf-beamer-frame')
        );
        for (const slide of slides) {
          slide.classList.add('markdown2pdf-preview-slide');
          if (footer) {
            slide.append(footer.cloneNode(true));
          }
        }

        root.dataset.previewSlidesReady = 'true';
        document.documentElement.classList.add('markdown2pdf-preview-beamer-ready');
        if (slides.length === 0) {
          return;
        }

        const resizeSlides = () => {
          const availableWidth = root.clientWidth;
          if (availableWidth <= 0) {
            return;
          }

          for (const slide of slides) {
            const naturalWidth = slide.offsetWidth;
            const scale = Math.min(1, availableWidth / naturalWidth);
            slide.style.zoom = scale < 1 ? String(scale) : '';
          }
        };

        resizeSlides();
        window.addEventListener('resize', resizeSlides, { passive: true });
        if (typeof ResizeObserver === 'function') {
          slideResizeObserver = new ResizeObserver(resizeSlides);
          slideResizeObserver.observe(root);
        }
      };

      const saveScroll = () => {
        const scrollRange = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
        vscode.setState({
          scrollRatio: scrollRange > 0 ? window.scrollY / scrollRange : 0
        });
      };

      window.addEventListener('scroll', () => {
        window.clearTimeout(saveTimer);
        saveTimer = window.setTimeout(saveScroll, 80);
      }, { passive: true });
      window.addEventListener('beforeunload', saveScroll);

      const restoreScroll = async () => {
        try {
          if (window.MathJax && window.MathJax.startup && window.MathJax.startup.promise) {
            await window.MathJax.startup.promise;
          }
        } catch {
          // The rendered source remains useful even when MathJax reports an error.
        }

        const paginationReady = window['${beamerPaginationReadyGlobal}'];
        if (paginationReady && typeof paginationReady.then === 'function') {
          try {
            await paginationReady;
          } catch {
            // Keep the preview usable if automatic pagination cannot finish.
          }
        }

        layoutBeamerSlides();

        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            const scrollRange = Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
            const ratio = Number.isFinite(previousState.scrollRatio) ? previousState.scrollRatio : 0;
            window.scrollTo(0, Math.max(0, Math.min(1, ratio)) * scrollRange);
          });
        });
      };

      void restoreScroll();
    })();
  </script>`;

  let prepared = html.replace(
    /<meta http-equiv="Content-Security-Policy" content="[^"]*">/i,
    `<meta http-equiv="Content-Security-Policy" content="${escapeHtmlAttribute(csp)}">`
  );
  prepared = prepared.replace(
    '<html>',
    `<html class="markdown2pdf-preview markdown2pdf-preview-${previewKind}">`
  );
  prepared = prepared.replace('</head>', `${previewStyle}\n</head>`);
  prepared = prepared.replace('</body>', `${previewScript}\n</body>`);
  return prepared.replace(
    /<script(?![^>]*\bnonce=)([^>]*)>/gi,
    `<script nonce="${escapeHtmlAttribute(options.nonce)}"$1>`
  );
}

function escapeHtmlAttribute(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
