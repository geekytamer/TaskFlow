'use client';

import * as pdfjsLib from 'pdfjs-dist';

// Bundle the worker with the app so rasterization works offline.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

/**
 * Render the first page of a PDF (given as a data URL) to a PNG data URL.
 * Used to turn an uploaded letterhead PDF into a page-background image.
 */
export async function rasterizePdfFirstPage(dataUrl: string, targetWidthPx = 1240): Promise<string> {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.max(0.2, targetWidthPx / base.width) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported.');
    await page.render({ canvasContext: ctx, viewport }).promise;
    return canvas.toDataURL('image/png');
  } finally {
    void pdf.destroy();
  }
}
