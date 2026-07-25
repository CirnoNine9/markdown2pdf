import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MarkdownSurfaceVisibilityController,
  resolveMarkdownSurfaceVisibility,
} from '../src/markdownSurfaceVisibility';

afterEach(() => {
  vi.useRealTimers();
});

describe('markdown surface visibility', () => {
  it('uses the active tab instead of a stale active editor reference', () => {
    expect(resolveMarkdownSurfaceVisibility(false, true)).toBe(false);
    expect(resolveMarkdownSurfaceVisibility(true, false)).toBe(true);
    expect(resolveMarkdownSurfaceVisibility(undefined, true)).toBe(true);
  });

  it('shows immediately for markdown and hides after leaving it', () => {
    vi.useFakeTimers();
    const applied: boolean[] = [];
    const controller = new MarkdownSurfaceVisibilityController((visible) => applied.push(visible));

    controller.update(true);
    controller.update(false);
    expect(applied).toEqual([true]);

    vi.advanceTimersByTime(49);
    expect(applied).toEqual([true]);
    vi.advanceTimersByTime(1);
    expect(applied).toEqual([true, false]);
  });

  it('does not hide between a markdown editor and its preview', () => {
    vi.useFakeTimers();
    const applied: boolean[] = [];
    const controller = new MarkdownSurfaceVisibilityController((visible) => applied.push(visible));

    controller.update(true);
    controller.update(false);
    controller.update(true);
    vi.advanceTimersByTime(100);

    expect(applied).toEqual([true]);
  });

  it('hides an initially active non-markdown editor', () => {
    vi.useFakeTimers();
    const applied: boolean[] = [];
    const controller = new MarkdownSurfaceVisibilityController((visible) => applied.push(visible));

    controller.update(false);
    vi.advanceTimersByTime(50);

    expect(applied).toEqual([false]);
  });

  it('ignores pending updates after disposal', () => {
    vi.useFakeTimers();
    const applied: boolean[] = [];
    const controller = new MarkdownSurfaceVisibilityController((visible) => applied.push(visible));

    controller.update(false);
    controller.dispose();
    vi.advanceTimersByTime(100);

    expect(applied).toEqual([]);
  });
});
