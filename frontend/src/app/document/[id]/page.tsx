'use client';

import * as React from 'react';
import { useParams } from 'next/navigation';
import { getPublicDocument } from '@/services/documentService';
import type { DocBlock, DocumentModel, Letterhead } from '@/modules/documents/types';
import { resolveTokens, type TokenContext } from '@/modules/documents/tokens';

function renderBlock(block: DocBlock, ctx: TokenContext, key: number) {
  switch (block.type) {
    case 'heading': {
      const s = block.style || {};
      return (
        <div key={key} style={{ fontSize: (s.fontSize ?? 20), fontWeight: s.fontWeight ?? 700, fontStyle: s.italic ? 'italic' : undefined, textAlign: s.align ?? 'left', color: s.color || '#111', marginTop: s.marginTop ?? 0, marginBottom: s.marginBottom ?? 8, lineHeight: 1.4, whiteSpace: 'pre-wrap' }}>
          {resolveTokens(block.text, ctx)}
        </div>
      );
    }
    case 'text': {
      const s = block.style || {};
      return (
        <div key={key} style={{ fontSize: (s.fontSize ?? 13), fontWeight: s.fontWeight ?? 400, fontStyle: s.italic ? 'italic' : undefined, textAlign: s.align ?? 'left', color: s.color || '#1a1a1a', marginTop: s.marginTop ?? 0, marginBottom: s.marginBottom ?? 10, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
          {resolveTokens(block.text, ctx)}
        </div>
      );
    }
    case 'image':
      return (
        <div key={key} style={{ textAlign: block.align ?? 'left', margin: '8px 0' }}>
          {block.url && <img src={block.url} alt="" style={{ maxWidth: block.width ? `${block.width}px` : '100%' }} />}
        </div>
      );
    case 'divider':
      return <hr key={key} style={{ border: 0, borderTop: '1px solid #ccc', margin: '12px 0' }} />;
    case 'spacer':
      return <div key={key} style={{ height: block.height ?? 24 }} />;
    default:
      return null;
  }
}

export default function DocumentPrintPage() {
  const params = useParams();
  const id = String(params?.id || '');
  const [data, setData] = React.useState<{ title: string; doc: DocumentModel | null; letterhead: Letterhead | null; context: TokenContext } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    getPublicDocument(id)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((e) => { if (!cancelled) setError(e?.message || 'Failed to load document.'); });
    return () => { cancelled = true; };
  }, [id]);

  const box = data?.letterhead?.contentBox || { top: 40, right: 20, bottom: 30, left: 20 };
  const bg = data?.letterhead?.firstPage?.imageUrl;
  const pageSize = data?.letterhead?.pageSize === 'Letter' ? 'Letter' : 'A4';

  if (error) return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>{error}</div>;

  return (
    <>
      {/*
        Per-page letterhead + auto-flow pagination for the server PDF:
        - @page margins = the content-box safe area, applied to EVERY printed page.
        - a position:fixed full-bleed letterhead repeats on every page behind the margins.
        preferCSSPageSize is set by the Chromium renderer, so these @page rules win.
      */}
      <style>{`
        @page { size: ${pageSize}; margin: ${box.top}mm ${box.right}mm ${box.bottom}mm ${box.left}mm; }
        html, body { margin: 0; padding: 0; background: #fff; }
        .doc-letterhead { position: fixed; top: 0; left: 0; width: 100%; height: 100%; object-fit: cover; z-index: 0; }
        .doc-content { position: relative; z-index: 1; font-family: 'Helvetica Neue', Arial, sans-serif; color: #1a1a1a; }
        @media screen {
          body { background: #eef1f4; }
          .doc-page { width: 210mm; min-height: 297mm; margin: 16px auto; background: #fff; box-shadow: 0 8px 24px rgba(0,0,0,.12); position: relative; overflow: hidden; }
          .doc-content-screen { position: absolute; top: ${box.top}mm; left: ${box.left}mm; right: ${box.right}mm; bottom: ${box.bottom}mm; }
        }
      `}</style>

      {data && (
        <div data-document-rendered="true">
          {/* Print flow (auto-paginates; letterhead is fixed + repeats). */}
          <div className="print-only">
            {bg && <img className="doc-letterhead" src={bg} alt="" />}
            <div className="doc-content">
              {(data.doc?.blocks || []).map((b, i) => renderBlock(b, data.context, i))}
            </div>
          </div>

          {/* Screen preview (single framed A4 page). */}
          <div className="doc-page screen-only">
            {bg && <img src={bg} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />}
            <div className="doc-content-screen">
              {(data.doc?.blocks || []).map((b, i) => renderBlock(b, data.context, i))}
            </div>
          </div>

          <style>{`
            @media screen { .print-only { display: none; } }
            @media print { .screen-only { display: none; } }
          `}</style>
        </div>
      )}
    </>
  );
}
