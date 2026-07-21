'use client';

import * as React from 'react';
import type { DocBlock, DocumentModel, Letterhead } from './types';
import { resolveTokens, type TokenContext } from './tokens';

// A4 at 96dpi ≈ 794 × 1123 px. mm → px factor for margins.
const A4 = { w: 794, h: 1123 };
const LETTER = { w: 816, h: 1056 };
const MM_PX = 96 / 25.4;

function blockStyle(b: Extract<DocBlock, { type: 'heading' | 'text' }>): React.CSSProperties {
  const s = b.style || {};
  return {
    fontSize: s.fontSize ?? (b.type === 'heading' ? 20 : 13),
    fontWeight: s.fontWeight ?? (b.type === 'heading' ? 700 : 400),
    fontStyle: s.italic ? 'italic' : undefined,
    textAlign: s.align ?? 'left',
    color: s.color || '#1a1a1a',
    marginTop: s.marginTop ?? 0,
    marginBottom: s.marginBottom ?? (b.type === 'heading' ? 8 : 10),
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  };
}

function Block({ block, ctx }: { block: DocBlock; ctx: TokenContext }) {
  switch (block.type) {
    case 'heading':
      return <div style={blockStyle(block)}>{resolveTokens(block.text, ctx)}</div>;
    case 'text':
      return <div style={blockStyle(block)}>{resolveTokens(block.text, ctx)}</div>;
    case 'image':
      return (
        <div style={{ textAlign: block.align ?? 'left', margin: '8px 0' }}>
          {block.url && <img src={block.url} alt="" style={{ maxWidth: block.width ? `${block.width}px` : '100%' }} />}
        </div>
      );
    case 'divider':
      return <hr style={{ border: 0, borderTop: '1px solid #d0d0d0', margin: '12px 0' }} />;
    case 'spacer':
      return <div style={{ height: block.height ?? 24 }} />;
    default:
      return null;
  }
}

/**
 * Renders one page of a document: the letterhead background with content
 * flowing inside the safe content box. Pagination is approximate on screen;
 * the server PDF step is authoritative (Phase 2).
 */
export function DocumentRenderer({
  doc, letterhead, ctx, scale = 1, className,
}: {
  doc: DocumentModel | undefined;
  letterhead: Letterhead | undefined;
  ctx: TokenContext;
  scale?: number;
  className?: string;
}) {
  const page = letterhead?.pageSize === 'Letter' ? LETTER : A4;
  const box = letterhead?.contentBox || { top: 40, right: 20, bottom: 30, left: 20 };
  const bg = letterhead?.firstPage?.imageUrl;

  return (
    <div
      className={className}
      style={{
        width: page.w * scale,
        height: page.h * scale,
        position: 'relative',
        background: '#fff',
        boxShadow: '0 1px 3px rgba(0,0,0,.12), 0 8px 24px rgba(0,0,0,.08)',
        overflow: 'hidden',
      }}
    >
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: page.w, height: page.h, position: 'relative' }}>
        {bg && (
          <img
            src={bg}
            alt=""
            style={{ position: 'absolute', inset: 0, width: page.w, height: page.h, objectFit: 'cover' }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            top: box.top * MM_PX,
            left: box.left * MM_PX,
            right: box.right * MM_PX,
            bottom: box.bottom * MM_PX,
            overflow: 'hidden',
          }}
        >
          {(doc?.blocks || []).map((b) => <Block key={b.id} block={b} ctx={ctx} />)}
        </div>
      </div>
    </div>
  );
}
