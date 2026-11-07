import * as React from 'react';
import type { RichNode } from './types';

/**
 * Draws written text (the editor's JSON) as React elements. Only the node and
 * mark types the writer makes are drawn; anything else is dropped, and text is
 * always text — no HTML is ever injected, so a stored body cannot carry script.
 */

const ALIGNS = new Set(['left', 'center', 'right', 'justify']);

function alignStyle(node: RichNode): React.CSSProperties {
  const align = node.attrs?.textAlign;
  return typeof align === 'string' && ALIGNS.has(align) ? { textAlign: align as React.CSSProperties['textAlign'] } : {};
}

function withMarks(text: React.ReactNode, marks: RichNode['marks'], key: React.Key): React.ReactNode {
  let out = text;
  for (const mark of marks ?? []) {
    switch (mark.type) {
      case 'bold': out = <strong>{out}</strong>; break;
      case 'italic': out = <em>{out}</em>; break;
      case 'underline': out = <u>{out}</u>; break;
      case 'strike': out = <s>{out}</s>; break;
      default: break;
    }
  }
  return <React.Fragment key={key}>{out}</React.Fragment>;
}

const HEADING_SIZES: Record<number, number> = { 1: 26, 2: 19, 3: 15.5 };
const cellStyle: React.CSSProperties = { border: '1px solid #cbd5e1', padding: '6px 8px', verticalAlign: 'top' };

export function RichNodeView({
  node,
  resolve,
  primaryColor,
}: {
  node: RichNode;
  /** The value a field token prints as. */
  resolve: (token: string) => string;
  primaryColor: string;
}) {
  const draw = (n: RichNode, key: React.Key): React.ReactNode => {
    const children = () => (n.content ?? []).map((child, i) => draw(child, i));
    switch (n.type) {
      case 'text': return withMarks(n.text ?? '', n.marks, key);
      case 'token': return withMarks(resolve(String(n.attrs?.token ?? '')), n.marks, key);
      case 'hardBreak': return <br key={key} />;
      case 'paragraph':
        // An empty paragraph keeps its line, as in the editor.
        return <p key={key} style={{ margin: '0 0 8px', lineHeight: 1.7, minHeight: '1.7em', ...alignStyle(n) }}>{children()}</p>;
      case 'heading': {
        const level = Math.min(3, Math.max(1, Number(n.attrs?.level) || 2));
        return (
          <div key={key} role="heading" aria-level={level} style={{ fontSize: HEADING_SIZES[level], fontWeight: 700, color: primaryColor, margin: level === 1 ? '0 0 10px' : '14px 0 6px', lineHeight: 1.35, ...alignStyle(n) }}>
            {children()}
          </div>
        );
      }
      case 'bulletList': return <ul key={key} style={{ margin: '0 0 8px', paddingInlineStart: 22, listStyle: 'disc' }}>{children()}</ul>;
      case 'orderedList': return <ol key={key} start={Number(n.attrs?.start) || 1} style={{ margin: '0 0 8px', paddingInlineStart: 22, listStyle: 'decimal' }}>{children()}</ol>;
      case 'listItem': return <li key={key} style={{ lineHeight: 1.7 }}>{children()}</li>;
      case 'blockquote': return <blockquote key={key} style={{ margin: '0 0 8px', paddingInlineStart: 12, borderInlineStart: `3px solid ${primaryColor}`, color: '#475569' }}>{children()}</blockquote>;
      case 'horizontalRule': return <hr key={key} style={{ border: 0, borderTop: '1px solid #cbd5e1', margin: '12px 0' }} />;
      case 'table': return <table key={key} style={{ width: '100%', borderCollapse: 'collapse', margin: '4px 0 10px', fontSize: '0.95em' }}><tbody>{children()}</tbody></table>;
      case 'tableRow': return <tr key={key}>{children()}</tr>;
      case 'tableHeader': return <th key={key} colSpan={Number(n.attrs?.colspan) || 1} rowSpan={Number(n.attrs?.rowspan) || 1} style={{ ...cellStyle, background: '#f1f5f9', fontWeight: 600, textAlign: 'start' }}>{children()}</th>;
      case 'tableCell': return <td key={key} colSpan={Number(n.attrs?.colspan) || 1} rowSpan={Number(n.attrs?.rowspan) || 1} style={cellStyle}>{children()}</td>;
      default: return null;
    }
  };
  return <>{draw(node, 0)}</>;
}
