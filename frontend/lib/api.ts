/** Every browser facing URL for a transfer, in one place. */
export const api = {
  info: (transferId: string) => `/api/transfer/${transferId}`,
  downloadAll: (transferId: string) => `/api/transfer/${transferId}/download`,
  downloadFolder: (transferId: string, path: string) =>
    `/api/transfer/${transferId}/download?path=${encodeURIComponent(path)}`,
  downloadFile: (transferId: string, fileId: number) =>
    `/api/transfer/${transferId}/file/${fileId}`,
  preview: (transferId: string, fileId: number) =>
    `/api/transfer/${transferId}/preview/${fileId}`,
};

/** Starts a browser download without navigating away from the page. */
export function triggerDownload(url: string): void {
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener';
  link.download = '';
  document.body.appendChild(link);
  link.click();
  link.remove();
}
