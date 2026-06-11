import puppeteer, { type Browser } from 'puppeteer';

/**
 * Server-side invoice PDF rendering.
 *
 * We drive a headless Chromium over the existing public invoice route
 * (`/invoice/:id`) so the PDF is pixel-identical to what a customer sees in the
 * browser — no second rendering implementation to keep in sync. A single
 * browser instance is reused across requests and relaunched if it dies.
 */

let browserPromise: Promise<Browser> | null = null;

function launch(): Promise<Browser> {
  // On servers, skip puppeteer's bundled Chromium download (PUPPETEER_SKIP_DOWNLOAD=true
  // at install time) and point this at the system browser instead.
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  return puppeteer.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
}

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) browserPromise = launch();
  let browser: Browser;
  try {
    browser = await browserPromise;
  } catch (err) {
    browserPromise = null;
    throw err;
  }
  if (!browser.connected) {
    browserPromise = launch();
    browser = await browserPromise;
  }
  return browser;
}

export interface InvoicePdfOptions {
  url: string;
  format?: 'A4' | 'Letter';
  landscape?: boolean;
  /** CSS margins (e.g. "12mm"). Defaults to none — the document controls its own padding. */
  margin?: { top: string; right: string; bottom: string; left: string };
}

async function renderOnce(opts: InvoicePdfOptions): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.goto(opts.url, { waitUntil: 'networkidle0', timeout: 30_000 });
    // The public page flips this marker on once the invoice has finished its
    // client-side fetch + render; fall back to networkidle if it never appears.
    await page
      .waitForSelector('[data-invoice-rendered="true"]', { timeout: 15_000 })
      .catch(() => undefined);
    await page.emulateMediaType('print');
    const pdf = await page.pdf({
      format: opts.format ?? 'A4',
      landscape: opts.landscape ?? false,
      printBackground: true,
      preferCSSPageSize: true,
      margin: opts.margin ?? { top: '0', right: '0', bottom: '0', left: '0' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close().catch(() => undefined);
  }
}

export async function renderInvoicePdf(opts: InvoicePdfOptions): Promise<Buffer> {
  try {
    return await renderOnce(opts);
  } catch (err) {
    // The browser may have crashed between requests; drop it and try once more.
    browserPromise = null;
    return renderOnce(opts);
  }
}

export async function closePdfBrowser(): Promise<void> {
  const pending = browserPromise;
  browserPromise = null;
  if (!pending) return;
  const browser = await pending.catch(() => null);
  if (browser) await browser.close().catch(() => undefined);
}
