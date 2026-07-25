import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { markdownSurfaceContextKey } from '../src/markdownSurfaceVisibility';

describe('extension manifest', () => {
  it('shows the activity view only for markdown editor and preview contexts', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), 'package.json'), 'utf8')
    ) as {
      contributes: {
        views: Record<string, Array<{ id: string; when?: string }>>;
      };
    };
    const view = Object.values(manifest.contributes.views)
      .flat()
      .find((candidate) => candidate.id === 'markdown2pdfActivityView');

    expect(view).toBeDefined();
    expect(view?.when).toBe(markdownSurfaceContextKey);
  });
});
