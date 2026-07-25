import { describe, expect, it, vi } from 'vitest';
import { exportPdfThenNotify } from '../src/exportLifecycle';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('export lifecycle', () => {
  it('reports success while the completion notification is still open', async () => {
    const dismissed = deferred();
    const statuses: string[] = [];
    let notificationFinished = false;
    const writePdf = vi.fn(async () => undefined);
    const notifyCompleted = vi.fn(async () => {
      await dismissed.promise;
      notificationFinished = true;
    });
    const onNotificationError = vi.fn();

    const command = (async () => {
      statuses.push('running');
      await exportPdfThenNotify(writePdf, notifyCompleted, onNotificationError);
      statuses.push('success');
    })();

    await new Promise<void>((resolve) => setImmediate(resolve));
    try {
      expect(writePdf).toHaveBeenCalledOnce();
      expect(notifyCompleted).toHaveBeenCalledOnce();
      expect(notificationFinished).toBe(false);
      expect(statuses).toEqual(['running', 'success']);
      expect(onNotificationError).not.toHaveBeenCalled();
    } finally {
      dismissed.resolve();
      await command;
    }
  });

  it('propagates PDF write failures without showing a completion notification', async () => {
    const failure = new Error('write failed');
    const notifyCompleted = vi.fn(async () => undefined);

    await expect(
      exportPdfThenNotify(
        async () => Promise.reject(failure),
        notifyCompleted,
        vi.fn()
      )
    ).rejects.toBe(failure);
    expect(notifyCompleted).not.toHaveBeenCalled();
  });
});
