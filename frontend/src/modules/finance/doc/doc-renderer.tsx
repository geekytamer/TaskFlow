'use client';

import * as React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { Company } from '@/modules/companies/types';
import type { Client, Invoice, InvoiceTemplate, InvoiceColumn } from '../types';
import { CurrencyAmount } from '@/lib/currency';
import { publicInvoiceUrl } from '@/services/publicService';
import type {
  Block,
  BlockStyle,
  DetailsBlock,
  ImageBlock,
  InvoiceDoc,
  LineItemsBlock,
  PaymentBlock,
  QrBlock,
  TextBlock,
  TotalsBlock,
} from './types';
import { resolveTokens, type DocDataContext } from './tokens';
import { docStrings, isRtlLocale, type DocStrings } from './strings';

const DEFAULT_COLUMNS: InvoiceColumn[] = [
  { id: 'description', key: 'description', label: 'Description', visible: true, width: 55, align: 'left' },
  { id: 'quantity', key: 'quantity', label: 'Qty', visible: true, width: 15, align: 'right' },
  { id: 'unitPrice', key: 'unitPrice', label: 'Unit', visible: true, width: 15, align: 'right' },
  { id: 'amount', key: 'amount', label: 'Amount', visible: true, width: 15, align: 'right' },
];

interface DocRendererProps {
  doc: InvoiceDoc;
  invoice: Invoice;
  client?: Client | null;
  company?: Company | null;
  template?: InvoiceTemplate;
  /** Designer-only: make top-level blocks selectable and drag-reorderable on the canvas. */
  editable?: boolean;
  selectedId?: string | null;
  onSelectBlock?: (id: string) => void;
  onReorderBlock?: (draggedId: string, targetId: string, place: 'before' | 'after') => void;
}

function px(n?: number) { return n === undefined ? undefined : `${n}px`; }

const useIsomorphicLayoutEffect = typeof window === 'undefined'
  ? React.useEffect
  : React.useLayoutEffect;

/** Mirror physical left/right alignment for RTL documents; center/undefined unchanged. */
function swapAlign(align?: 'left' | 'center' | 'right', isRtl?: boolean): 'left' | 'center' | 'right' | undefined {
  if (!isRtl || !align || align === 'center') return align;
  return align === 'left' ? 'right' : 'left';
}

function styleToCss(style?: BlockStyle, isRtl?: boolean): React.CSSProperties {
  if (!style) return {};
  const css: React.CSSProperties = {};
  if (style.margin) {
    // Longhand (not the `margin` shorthand) so a full-bleed override can replace
    // just the horizontal margins without clobbering top/bottom.
    css.marginTop = `${style.margin.top ?? 0}px`;
    css.marginRight = `${style.margin.right ?? 0}px`;
    css.marginBottom = `${style.margin.bottom ?? 0}px`;
    css.marginLeft = `${style.margin.left ?? 0}px`;
  }
  if (style.padding) css.padding = `${style.padding.top ?? 0}px ${style.padding.right ?? 0}px ${style.padding.bottom ?? 0}px ${style.padding.left ?? 0}px`;
  if (style.background) css.background = style.background;
  if (style.backgroundImage) {
    css.backgroundImage = `url("${style.backgroundImage}")`;
    css.backgroundSize = style.backgroundSize ?? 'cover';
    css.backgroundPosition = 'center';
    css.backgroundRepeat = 'no-repeat';
  }
  if (style.borderRadius !== undefined) css.borderRadius = px(style.borderRadius);
  if (style.border?.width) {
    const b = `${style.border.width}px ${style.border.style ?? 'solid'} ${style.border.color ?? '#e5e7eb'}`;
    const sides = style.border.sides;
    if (!sides) css.border = b;
    else {
      if (sides.includes('top')) css.borderTop = b;
      if (sides.includes('right')) css.borderRight = b;
      if (sides.includes('bottom')) css.borderBottom = b;
      if (sides.includes('left')) css.borderLeft = b;
    }
  }
  if (style.align) css.textAlign = swapAlign(style.align, isRtl);
  if (style.width) css.width = style.width;
  if (style.color) css.color = style.color;
  if (style.fontFamily) css.fontFamily = style.fontFamily;
  if (style.fontSize) css.fontSize = px(style.fontSize);
  if (style.fontWeight) css.fontWeight = style.fontWeight;
  if (style.lineHeight) css.lineHeight = String(style.lineHeight);
  if (style.italic) css.fontStyle = 'italic';
  if (style.uppercase) css.textTransform = 'uppercase';
  return css;
}

function isVisible(block: Block, ctx: DocDataContext, template?: InvoiceTemplate): boolean {
  switch (block.visibleWhen) {
    case 'hasNotes': return Boolean(ctx.invoice.notes);
    case 'hasBankAccounts': return (template?.bankAccounts ?? []).length > 0;
    case 'hasLogo': return Boolean(template?.logoUrl);
    case 'hasStamp': return Boolean(template?.stampUrl);
    case 'hasSignature': return Boolean(template?.signatureUrl);
    default: return true;
  }
}

export interface PreviewBlockMeasurement {
  height: number;
  rowHeights?: number[];
}

export interface PreviewContentEntry {
  block: Block;
  lineItemStart?: number;
  lineItemEnd?: number;
}

export function paginatePreviewContent(
  blocks: Block[],
  measurements: PreviewBlockMeasurement[],
  pageContentHeight: number,
): PreviewContentEntry[][] {
  const pages: PreviewContentEntry[][] = [[]];
  let currentHeight = 0;

  blocks.forEach((block, index) => {
    if (block.type === 'pageBreak') {
      pages.push([]);
      currentHeight = 0;
      return;
    }

    const measurement = measurements[index] ?? { height: 0 };
    const rowHeights = block.type === 'lineItems' ? measurement.rowHeights : undefined;

    if (rowHeights?.length) {
      const rowTotal = rowHeights.reduce((sum, height) => sum + height, 0);
      const tableOverhead = Math.max(0, measurement.height - rowTotal);
      let rowStart = 0;

      while (rowStart < rowHeights.length) {
        let availableHeight = pageContentHeight - currentHeight;
        const currentPage = pages[pages.length - 1];
        if (currentPage.length > 0 && tableOverhead + rowHeights[rowStart] > availableHeight) {
          pages.push([]);
          currentHeight = 0;
          availableHeight = pageContentHeight;
        }

        let rowEnd = rowStart;
        let segmentHeight = tableOverhead;
        while (
          rowEnd < rowHeights.length
          && (segmentHeight + rowHeights[rowEnd] <= availableHeight || rowEnd === rowStart)
        ) {
          segmentHeight += rowHeights[rowEnd];
          rowEnd += 1;
        }

        pages[pages.length - 1].push({
          block,
          lineItemStart: rowStart,
          lineItemEnd: rowEnd,
        });
        currentHeight += segmentHeight;
        rowStart = rowEnd;

        if (rowStart < rowHeights.length) {
          pages.push([]);
          currentHeight = 0;
        }
      }
      return;
    }

    const currentPage = pages[pages.length - 1];
    if (currentPage.length > 0 && currentHeight + measurement.height > pageContentHeight) {
      pages.push([]);
      currentHeight = 0;
    }

    pages[pages.length - 1].push({ block });
    currentHeight += measurement.height;
  });

  return pages;
}

export function paginatePreviewBlocks(
  blocks: Block[],
  blockHeights: number[],
  pageContentHeight: number,
): Block[][] {
  return paginatePreviewContent(
    blocks,
    blockHeights.map((height) => ({ height })),
    pageContentHeight,
  ).map((page) => page.map((entry) => entry.block));
}

export function DocRenderer({
  doc,
  invoice,
  client,
  company,
  template,
  editable,
  selectedId,
  onSelectBlock,
  onReorderBlock,
}: DocRendererProps) {
  const subtotal = Number(invoice.lineItems.reduce((sum, item) => sum + item.amount, 0).toFixed(2));
  const taxRate = invoice.taxRate || 0;
  const taxAmount = Number((subtotal * (taxRate / 100)).toFixed(2));
  // Always derive the total from subtotal + tax so the document adds up. The
  // stored invoice.total is tax-inclusive and agrees with this; falling back to
  // it here would let a stale/net total contradict the lines above it.
  const total = Number((subtotal + taxAmount).toFixed(2));
  const docCurrency = invoice.currency || (doc.page as { currency?: string }).currency || 'USD';
  const money = (value: number) => <CurrencyAmount value={value} currencyCode={docCurrency} />;

  const ctx: DocDataContext = {
    invoice,
    client,
    company,
    subtotal,
    taxAmount,
    total,
    formatMoney: (v) => String(v),
    publicUrl: publicInvoiceUrl(invoice.id),
  };
  const theme = doc.theme;
  const isRtl = isRtlLocale();
  const s = docStrings();
  const portrait = doc.page.orientation === 'portrait';
  const pageWidth = doc.page.size === 'A4' ? (portrait ? 210 : 297) : (portrait ? 216 : 279);
  const pageHeight = doc.page.size === 'A4' ? (portrait ? 297 : 210) : (portrait ? 279 : 216);
  const pagePadding = `${doc.page.margin.top ?? 10}mm ${doc.page.margin.right ?? 10}mm ${doc.page.margin.bottom ?? 10}mm ${doc.page.margin.left ?? 10}mm`;

  const marginR = doc.page.margin.right ?? 10;
  const marginL = doc.page.margin.left ?? 10;

  // The root background is only for the single-sheet screen preview. Printing
  // uses a fixed image layer below so Chromium repeats it on every PDF page.
  const letterhead = template?.letterheadImageUrl;
  const letterheadStyle: React.CSSProperties = letterhead
    ? {
        backgroundImage: `url("${letterhead}")`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: '100% 100%',
        backgroundPosition: 'top center',
      }
    : {};

  const renderBlock = (
    block: Block,
    lineItemStart?: number,
    lineItemEnd?: number,
  ): React.ReactNode => {
    if (!isVisible(block, ctx, template)) return null;
    let base = styleToCss(block.style, isRtl);
    if (block.style?.fullBleed) {
      // Pull the block out past the page margins so it spans the full sheet width.
      base = {
        ...base,
        marginLeft: `-${marginL}mm`,
        marginRight: `-${marginR}mm`,
        width: `calc(100% + ${marginL + marginR}mm)`,
        maxWidth: 'none',
      };
    }

    switch (block.type) {
      case 'container': {
        const layoutCss: React.CSSProperties =
          block.layout === 'row'
            ? { display: 'flex', gap: px(block.gap ?? 16), alignItems: 'flex-start' }
            : block.layout === 'grid'
              ? { display: 'grid', gridTemplateColumns: `repeat(${block.columns ?? 2}, minmax(0,1fr))`, gap: px(block.gap ?? 16) }
              : { display: 'block' };
        return (
          <div key={block.id} style={{ ...layoutCss, ...base }}>
            {block.children.map((child) => (
              block.layout === 'row'
                ? <div key={child.id} style={{ flex: 1, minWidth: 0 }}>{renderBlock(child)}</div>
                : <React.Fragment key={child.id}>{renderBlock(child)}</React.Fragment>
            ))}
          </div>
        );
      }
      case 'text': {
        const t = block as TextBlock;
        return <div key={block.id} style={{ whiteSpace: 'pre-line', ...base }}>{resolveTokens(t.content, ctx)}</div>;
      }
      case 'heading': {
        const sizes = { 1: 28, 2: 20, 3: 16 } as const;
        return (
          <div key={block.id} style={{ fontSize: px(sizes[block.level] ?? 20), fontWeight: 700, color: theme.primaryColor, ...base }}>
            {resolveTokens(block.content, ctx)}
          </div>
        );
      }
      case 'image': {
        const img = block as ImageBlock;
        const src = img.binding === 'logo' ? template?.logoUrl
          : img.binding === 'stamp' ? template?.stampUrl
          : img.binding === 'signature' ? template?.signatureUrl
          : img.binding === 'header' ? template?.headerImageUrl
          : img.binding === 'footer' ? template?.footerImageUrl
          : img.src;
        if (!src) return null;
        return (
          <div key={block.id} style={{ textAlign: swapAlign(block.style?.align, isRtl) ?? (isRtl ? 'right' : 'left'), ...base }}>
            <img src={src} alt="" style={{ height: px(img.height ?? 56), width: img.fit === 'cover' ? '100%' : undefined, objectFit: img.fit ?? 'contain', display: 'inline-block', maxWidth: '100%' }} />
          </div>
        );
      }
      case 'divider':
        return <hr key={block.id} style={{ border: 0, borderTop: '1px solid #e5e7eb', ...base }} />;
      case 'spacer':
        return <div key={block.id} style={{ height: px(block.height), ...base }} />;
      case 'shape':
        return <div key={block.id} style={{ height: px(block.height ?? 8), background: block.style?.background ?? theme.primaryColor, ...base }} />;
      case 'pageBreak':
        return <div key={block.id} className="doc-page-break" />;
      case 'lineItems':
        return (
          <LineItemsView
            key={block.id}
            block={block as LineItemsBlock}
            ctx={ctx}
            theme={theme}
            money={money}
            template={template}
            style={base}
            lineItems={
              lineItemStart === undefined
                ? undefined
                : invoice.lineItems.slice(lineItemStart, lineItemEnd)
            }
            rowOffset={lineItemStart ?? 0}
          />
        );
      case 'totals':
        return <TotalsView key={block.id} block={block as TotalsBlock} ctx={ctx} theme={theme} money={money} style={base} s={s} />;
      case 'details':
        return <DetailsView key={block.id} block={block as DetailsBlock} ctx={ctx} theme={theme} style={base} />;
      case 'payment':
        return <PaymentView key={block.id} block={block as PaymentBlock} theme={theme} template={template} style={base} s={s} />;
      case 'signature':
        return template?.stampUrl || template?.signatureUrl ? (
          <div key={block.id} style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'flex-end', gap: 48, ...base }}>
            {template?.stampUrl && <img src={template.stampUrl} alt="" style={{ height: 96, width: 96, objectFit: 'contain' }} />}
            {template?.signatureUrl && (
              <div style={{ textAlign: 'center' }}>
                <img src={template.signatureUrl} alt="" style={{ height: 64, objectFit: 'contain', margin: '0 auto' }} />
                <div style={{ marginTop: 4, borderTop: '1px solid #cbd5e1', paddingTop: 4, fontSize: 12, color: '#64748b' }}>
                  {template?.signatureLabel || s.signature}
                </div>
              </div>
            )}
          </div>
        ) : null;
      case 'qr': {
        const q = block as QrBlock;
        const qrAlign = swapAlign(block.style?.align, isRtl);
        return (
          <div key={block.id} style={{ display: 'flex', justifyContent: qrAlign === 'right' ? 'flex-end' : qrAlign === 'left' ? 'flex-start' : 'center', ...base }}>
            <div style={{ textAlign: 'center' }}>
              <QRCodeSVG value={ctx.publicUrl} size={92} level="M" />
              <div style={{ marginTop: 4, fontSize: 10, color: '#94a3b8' }}>{q.caption ?? s.scan}</div>
            </div>
          </div>
        );
      }
      default:
        return null;
    }
  };

  const renderTopLevelBlock = (
    block: Block,
    isEditable: boolean,
    lineItemStart?: number,
    lineItemEnd?: number,
  ) => {
    const node = renderBlock(block, lineItemStart, lineItemEnd);
    if (!isEditable) return node;

    // Designer canvas: wrap each top-level block so it can be selected and
    // dragged to reorder. The drop point (before/after) follows the cursor.
    return (
      <div
        key={block.id}
        data-doc-block={block.id}
        draggable
        onClick={(e) => {
          e.stopPropagation();
          onSelectBlock?.(block.id);
        }}
        onDragStart={(e) => {
          e.dataTransfer.setData('text/plain', block.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const draggedId = e.dataTransfer.getData('text/plain');
          if (!draggedId || draggedId === block.id) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const place = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
          onReorderBlock?.(draggedId, block.id, place);
        }}
        style={{
          outline: selectedId === block.id ? '2px solid #6366f1' : '1px dashed transparent',
          outlineOffset: 2,
          cursor: 'grab',
          borderRadius: 4,
        }}
      >
        {node}
      </div>
    );
  };

  const renderWatermark = () => template?.watermarkEnabled && template?.watermarkText ? (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <span
        className="select-none text-8xl font-extrabold uppercase"
        style={{
          color: theme.primaryColor,
          opacity: template.watermarkOpacity ?? 0.12,
          transform: 'rotate(-30deg)',
        }}
      >
        {template.watermarkText}
      </span>
    </div>
  ) : null;

  const measurementRef = React.useRef<HTMLDivElement>(null);
  const [previewPages, setPreviewPages] = React.useState<PreviewContentEntry[][]>(
    () => paginatePreviewContent(doc.body, [], Number.POSITIVE_INFINITY),
  );

  useIsomorphicLayoutEffect(() => {
    const measurement = measurementRef.current;
    if (!measurement) return;

    let animationFrame = 0;
    const updatePagination = () => {
      const probe = measurement.querySelector<HTMLElement>('[data-doc-page-height-probe]');
      const measuredBlocks = measurement.querySelectorAll<HTMLElement>('[data-doc-measure-block]');
      if (!probe || measuredBlocks.length !== doc.body.length) return;

      const computed = window.getComputedStyle(measurement);
      const contentHeight = probe.getBoundingClientRect().height
        - Number.parseFloat(computed.paddingTop)
        - Number.parseFloat(computed.paddingBottom);
      const blockMeasurements = Array.from(measuredBlocks, (element) => ({
        height: element.getBoundingClientRect().height,
        rowHeights: Array.from(
          element.querySelectorAll<HTMLElement>('.doc-line-items tbody tr'),
          (row) => row.getBoundingClientRect().height,
        ),
      }));
      const nextPages = paginatePreviewContent(doc.body, blockMeasurements, contentHeight);
      const signature = (pages: PreviewContentEntry[][]) => pages
        .map((page) => page.map((entry) => (
          `${entry.block.id}:${entry.lineItemStart ?? ''}-${entry.lineItemEnd ?? ''}`
        )).join(','))
        .join('|');
      const nextSignature = signature(nextPages);

      setPreviewPages((currentPages) => {
        return signature(currentPages) === nextSignature ? currentPages : nextPages;
      });
    };
    const schedulePagination = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(updatePagination);
    };

    updatePagination();
    const observer = new ResizeObserver(schedulePagination);
    observer.observe(measurement);
    measurement.querySelectorAll('img').forEach((image) => image.addEventListener('load', schedulePagination));

    return () => {
      window.cancelAnimationFrame(animationFrame);
      observer.disconnect();
      measurement.querySelectorAll('img').forEach((image) => image.removeEventListener('load', schedulePagination));
    };
  }, [client, company, doc.body, invoice, pageHeight, pagePadding, pageWidth, template]);

  return (
    <div
      dir={isRtl ? 'rtl' : 'ltr'}
      className="doc-render mx-auto w-full text-slate-950"
      style={{
        fontFamily: theme.fontFamily,
        color: theme.textColor,
      }}
    >
      <style>{`
        .doc-letterhead-background { display: none; }
        .doc-render-content { position: relative; z-index: 1; }
        .doc-screen-pages { display: grid; gap: 16px; }
        .doc-print-flow { display: none; }
        @media print {
          @page { size: ${doc.page.size} ${doc.page.orientation}; margin: ${letterhead ? '0' : pagePadding}; }
          html, body { background: #fff !important; }
          [data-invoice-rendered=true],
          [data-delivery-rendered=true] { background: #fff !important; }
          .doc-screen-pages { display: none !important; }
          .doc-print-flow { display: block !important; width: 100% !important; max-width: none !important; min-height: auto !important; padding: 0 !important; background: #fff !important; }
          .doc-letterhead-background {
            display: block;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            object-fit: fill;
            z-index: 0;
          }
          .doc-render-content {
            padding: ${letterhead ? pagePadding : '0'};
            box-sizing: border-box;
            box-decoration-break: clone;
            -webkit-box-decoration-break: clone;
          }
          .doc-page-break { break-before: page; page-break-before: always; }
          .doc-line-items tr { break-inside: avoid; page-break-inside: avoid; }
          .doc-line-items thead { display: table-header-group; }
        }
      `}</style>
      <div className="doc-screen-pages">
        {previewPages.map((entries, pageIndex) => (
          <div
            key={`preview-page-${pageIndex}`}
            data-doc-preview-page={pageIndex + 1}
            className="invoice-print-area relative mx-auto w-full bg-white"
            style={{
              padding: pagePadding,
              width: `${pageWidth}mm`,
              minHeight: `${pageHeight}mm`,
              maxWidth: '100%',
              ...letterheadStyle,
            }}
          >
            {renderWatermark()}
            <div className="doc-render-content">
              {entries.map((entry, entryIndex) => (
                <React.Fragment
                  key={`${entry.block.id}-${entry.lineItemStart ?? 'full'}-${entryIndex}`}
                >
                  {renderTopLevelBlock(
                    entry.block,
                    Boolean(editable),
                    entry.lineItemStart,
                    entry.lineItemEnd,
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div
        ref={measurementRef}
        aria-hidden="true"
        style={{
          boxSizing: 'border-box',
          position: 'fixed',
          left: 0,
          top: 0,
          zIndex: -1,
          visibility: 'hidden',
          pointerEvents: 'none',
          padding: pagePadding,
          width: `${pageWidth}mm`,
          maxWidth: 'none',
        }}
      >
        <div
          data-doc-page-height-probe
          style={{ position: 'absolute', width: 0, height: `${pageHeight}mm` }}
        />
        {doc.body.map((block, index) => (
          <div
            key={`measure-${block.id}-${index}`}
            data-doc-measure-block={index}
            style={{ display: 'flow-root' }}
          >
            {renderBlock(block)}
          </div>
        ))}
      </div>
      <div className="invoice-print-area doc-print-flow relative">
        {letterhead ? (
          <img
            data-letterhead-background="true"
            className="doc-letterhead-background"
            src={letterhead}
            alt=""
            aria-hidden="true"
          />
        ) : null}
        {renderWatermark()}
        <div className="doc-render-content">
          {doc.body.map((block) => renderTopLevelBlock(block, false))}
        </div>
      </div>
    </div>
  );
}

// ── Sub-views ──────────────────────────────────────────────────────────────

const alignClass: Record<string, React.CSSProperties['textAlign']> = { left: 'left', center: 'center', right: 'right' };

function LineItemsView({ block, ctx, theme, money, template, style, lineItems, rowOffset = 0 }: {
  block: LineItemsBlock; ctx: DocDataContext; theme: InvoiceDoc['theme'];
  money: (v: number) => React.ReactNode; template?: InvoiceTemplate; style: React.CSSProperties;
  lineItems?: Invoice['lineItems']; rowOffset?: number;
}) {
  const rows = lineItems ?? ctx.invoice.lineItems;
  const columns = (block.columns?.length ? block.columns : (template?.columns?.length ? template!.columns : DEFAULT_COLUMNS)).filter((c) => c.visible);
  const cell = (col: InvoiceColumn, line: typeof ctx.invoice.lineItems[number]) => {
    switch (col.key) {
      case 'sku': return line.sku ?? '';
      case 'description': return line.description;
      case 'quantity': return line.quantity;
      case 'unitPrice': return money(line.unitPrice);
      case 'amount': return money(line.amount);
      case 'custom': return line.custom?.[col.id] ?? '';
      default: return '';
    }
  };
  const defaultAlign = (col: InvoiceColumn) => col.align || (col.key === 'description' || col.key === 'sku' ? 'left' : 'right');
  return (
    <table className="doc-line-items" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14, ...style }}>
      <colgroup>{columns.map((c) => <col key={c.id} style={c.width ? { width: `${c.width}%` } : undefined} />)}</colgroup>
      <thead>
        <tr style={{ background: theme.primaryColor, color: '#fff' }}>
          {columns.map((c) => <th key={c.id} style={{ padding: '12px 16px', textAlign: alignClass[defaultAlign(c)], fontWeight: 600 }}>{c.label}</th>)}
        </tr>
      </thead>
      <tbody>
        {rows.map((line, i) => (
          <tr key={rowOffset + i} style={{ background: (rowOffset + i) % 2 ? '#f8fafc' : '#fff' }}>
            {columns.map((c) => <td key={c.id} style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', textAlign: alignClass[defaultAlign(c)] }}>{cell(c, line)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function TotalsView({ block, ctx, theme, money, style, s }: { block: TotalsBlock; ctx: DocDataContext; theme: InvoiceDoc['theme']; money: (v: number) => React.ReactNode; style: React.CSSProperties; s: DocStrings }) {
  const taxRate = ctx.invoice.taxRate || 0;
  const showSubtotal = block.showSubtotal !== false;
  const showTax = block.showTax !== false;
  const showTotal = block.showTotal !== false;
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', ...style }}>
      <div style={{ width: '100%', maxWidth: 280, fontSize: 14 }}>
        {showSubtotal && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><span style={{ color: '#64748b' }}>{s.subtotal}</span><span>{money(ctx.subtotal)}</span></div>}
        {showTax && <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0' }}><span style={{ color: '#64748b' }}>{s.tax} {taxRate.toFixed(2)}%</span><span>{money(ctx.taxAmount)}</span></div>}
        {showTotal && <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: `1px solid ${theme.accentColor}`, paddingTop: 12, marginTop: 4, fontSize: 18, fontWeight: 700, color: theme.primaryColor }}><span>{s.total}</span><span>{money(ctx.total)}</span></div>}
      </div>
    </div>
  );
}

function DetailsView({ block, ctx, theme, style }: { block: DetailsBlock; ctx: DocDataContext; theme: InvoiceDoc['theme']; style: React.CSSProperties }) {
  return (
    <div style={style}>
      {block.title && <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', color: '#94a3b8' }}>{block.title}</div>}
      <div style={{ marginTop: 8, fontSize: 14 }}>
        {block.fields.map((f, i) => (
          <div key={i} style={{ marginTop: i ? 2 : 0 }}>
            {f.label && <span style={{ color: '#64748b' }}>{f.label}: </span>}
            <span style={{ fontWeight: f.label ? 500 : 600 }}>{resolveTokens(f.value, ctx)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PaymentView({ block, theme, template, style, s }: { block: PaymentBlock; theme: InvoiceDoc['theme']; template?: InvoiceTemplate; style: React.CSSProperties; s: DocStrings }) {
  const banks = (template?.bankAccounts ?? []).filter((b) => b.bankName || b.accountHolder || b.accountNumber || b.iban || b.swift);
  return (
    <div style={{ fontSize: 14, ...style }}>
      <div style={{ fontWeight: 600, color: theme.primaryColor }}>{block.title ?? s.payment}</div>
      {template?.paymentInstructions && <p style={{ marginTop: 8, color: '#475569' }}>{template.paymentInstructions}</p>}
      {banks.map((b) => (
        <div key={b.id} style={{ marginTop: 12, border: '1px solid #e2e8f0', borderRadius: 4, padding: 12 }}>
          {b.bankName && <div style={{ fontWeight: 500, color: '#334155' }}>{b.bankName}{b.currency ? ` · ${b.currency}` : ''}</div>}
          <div style={{ marginTop: 4, fontSize: 12, color: '#475569' }}>
            {b.accountHolder && <div><span style={{ color: '#94a3b8' }}>{s.accountHolder}: </span>{b.accountHolder}</div>}
            {b.accountNumber && <div><span style={{ color: '#94a3b8' }}>{s.accountNo}: </span>{b.accountNumber}</div>}
            {b.iban && <div><span style={{ color: '#94a3b8' }}>{s.iban}: </span>{b.iban}</div>}
            {b.swift && <div><span style={{ color: '#94a3b8' }}>{s.swift}: </span>{b.swift}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}
