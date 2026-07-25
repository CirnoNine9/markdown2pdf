export const markdownSurfaceContextKey = 'markdown2pdf.hasFocusedMarkdownSurface';

export function resolveMarkdownSurfaceVisibility(
  activeTabVisibility: boolean | undefined,
  activeEditorVisibility: boolean
): boolean {
  return activeTabVisibility ?? activeEditorVisibility;
}

export class MarkdownSurfaceVisibilityController {
  private requestedVisibility?: boolean;
  private hideTimer?: ReturnType<typeof setTimeout>;
  private disposed = false;

  constructor(
    private readonly applyVisibility: (visible: boolean) => void,
    private readonly hideDelayMs = 50
  ) {}

  update(visible: boolean): void {
    if (this.disposed) {
      return;
    }

    if (visible) {
      this.cancelPendingHide();
      this.apply(true);
      return;
    }

    if (this.hideTimer) {
      return;
    }
    this.hideTimer = setTimeout(() => {
      this.hideTimer = undefined;
      this.apply(false);
    }, this.hideDelayMs);
  }

  dispose(): void {
    this.disposed = true;
    this.cancelPendingHide();
  }

  private apply(visible: boolean): void {
    if (this.requestedVisibility === visible) {
      return;
    }
    this.requestedVisibility = visible;
    this.applyVisibility(visible);
  }

  private cancelPendingHide(): void {
    if (this.hideTimer) {
      clearTimeout(this.hideTimer);
      this.hideTimer = undefined;
    }
  }
}
