'use client';

import * as pdfjsLib from 'pdfjs-dist';

// Bundle the worker with the app so rasterization works offline.
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

/** Width the page background is rendered at — enough for print, small on the wire. */
const TARGET_WIDTH_PX = 1240;

/**
 * Budget for the encoded data URL. Letterheads are stored inside the template
 * JSON, so an oversized one fails the whole save with a 413 rather than just
 * looking heavy.
 */
const MAX_ENCODED_BYTES = 1.5 * 1024 * 1024;

/**
 * Encode a canvas as JPEG, stepping quality down until it fits the budget.
 * JPEG rather than PNG: a page-sized letterhead is photographic, and lossless
 * PNG of an A4 sheet runs to several megabytes for no visible benefit.
 */
function encodeWithinBudget(canvas: HTMLCanvasElement): string {
  let out = canvas.toDataURL('image/jpeg', 0.85);
  for (const quality of [0.7, 0.55, 0.45]) {
    if (out.length <= MAX_ENCODED_BYTES) break;
    out = canvas.toDataURL('image/jpeg', quality);
  }
  return out;
}

/** A letterhead is a page background: flatten transparency onto white. */
function prepareCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.ceil(width));
  canvas.height = Math.max(1, Math.ceil(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported.');
  // JPEG has no alpha; without this, transparent areas encode as black.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

/**
 * Render the first page of a PDF (given as a data URL) to a JPEG data URL,
 * sized and compressed to work as a page background.
 */
export async function rasterizePdfFirstPage(
  dataUrl: string,
  targetWidthPx = TARGET_WIDTH_PX,
): Promise<string> {
  const base64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.max(0.2, targetWidthPx / base.width) });
    const { canvas, ctx } = prepareCanvas(viewport.width, viewport.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    return encodeWithinBudget(canvas);
  } finally {
    void pdf.destroy();
  }
}

/**
 * Downscale an uploaded image to the same page-background budget. A camera-sized
 * letterhead scan is otherwise stored at full resolution inside the template.
 */
export async function rasterizeImageToBackground(
  dataUrl: string,
  targetWidthPx = TARGET_WIDTH_PX,
): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('The image could not be read.'));
    el.src = dataUrl;
  });
  const scale = image.naturalWidth > 0 ? Math.min(1, targetWidthPx / image.naturalWidth) : 1;
  const { canvas, ctx } = prepareCanvas(image.naturalWidth * scale, image.naturalHeight * scale);
  ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
  return encodeWithinBudget(canvas);
}
