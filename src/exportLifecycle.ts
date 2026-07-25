export async function exportPdfThenNotify(
  writePdf: () => PromiseLike<void>,
  notifyCompleted: () => PromiseLike<void>,
  onNotificationError: (error: unknown) => void
): Promise<void> {
  await writePdf();
  void Promise.resolve()
    .then(notifyCompleted)
    .catch(onNotificationError);
}
