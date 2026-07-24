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
  /** Server-rendered rendition: document → PDF, exotic image → PNG, … */
  render: (transferId: string, fileId: number) =>
    `/api/transfer/${transferId}/render/${fileId}`,
  /** Archive structure as JSON. */
  archive: (transferId: string, fileId: number) =>
    `/api/transfer/${transferId}/archive/${fileId}`,
  /** Raw bytes for an in-page viewer; name carries the extension it sniffs. */
  asset: (transferId: string, fileId: number, name: string) =>
    `/api/transfer/${transferId}/asset/${fileId}/${encodeURIComponent(name)}`,
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
