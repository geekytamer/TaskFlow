// ── Invoice document model ────────────────────────────────────────────────
// The visual builder edits this JSON; the renderer draws it; the PDF service
// prints it. The look lives entirely in data so the engine stays generic.

import type { InvoiceColumn } from '../types';

export type DocAlign = 'left' | 'center' | 'right';

export interface BoxSpacing {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface BlockBorder {
  width?: number;
  color?: string;
  style?: 'solid' | 'dashed' | 'dotted';
  /** Which sides to draw; defaults to all when a width is set. */
  sides?: Array<'top' | 'right' | 'bottom' | 'left'>;
}

export interface BlockStyle {
  margin?: BoxSpacing;
  padding?: BoxSpacing;
  background?: string;
  border?: BlockBorder;
  borderRadius?: number;
  align?: DocAlign;
  /** Width as a CSS value, e.g. '100%' or '240px'. */
  width?: string;
  color?: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  italic?: boolean;
  uppercase?: boolean;
}

/** Condition that controls whether a block renders for a given invoice. */
export type VisibleWhen = 'always' | 'hasNotes' | 'hasBankAccounts' | 'hasLogo' | 'hasStamp' | 'hasSignature';

export interface BaseBlock {
  id: string;
  type: string;
  style?: BlockStyle;
  visibleWhen?: VisibleWhen;
}

export interface ContainerBlock extends BaseBlock {
  type: 'container';
  layout: 'stack' | 'row' | 'grid';
  columns?: number; // for grid
  gap?: number;
  children: Block[];
}

export interface TextBlock extends BaseBlock {
  type: 'text';
  /** May contain {{tokens}} resolved against invoice data. */
  content: string;
}

export interface HeadingBlock extends BaseBlock {
  type: 'heading';
  content: string;
  level: 1 | 2 | 3;
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  /** Static data URL, or a binding to a template/company asset. */
  src?: string;
  binding?: 'logo' | 'stamp' | 'signature' | 'header' | 'footer';
  fit?: 'contain' | 'cover';
  height?: number;
}

export interface DividerBlock extends BaseBlock {
  type: 'divider';
}

export interface SpacerBlock extends BaseBlock {
  type: 'spacer';
  height: number;
}

export interface ShapeBlock extends BaseBlock {
  type: 'shape';
  height?: number;
}

export interface LineItemsBlock extends BaseBlock {
  type: 'lineItems';
  columns?: InvoiceColumn[];
}

export interface TotalsBlock extends BaseBlock {
  type: 'totals';
  showSubtotal?: boolean;
  showTax?: boolean;
  showTotal?: boolean;
}

export interface DetailsField {
  label: string;
  /** A token like 'client.name' or a literal string. */
  value: string;
}

export interface DetailsBlock extends BaseBlock {
  type: 'details';
  title?: string;
  fields: DetailsField[];
}

export interface PaymentBlock extends BaseBlock {
  type: 'payment';
  title?: string;
}

export interface SignatureBlock extends BaseBlock {
  type: 'signature';
}

export interface QrBlock extends BaseBlock {
  type: 'qr';
  caption?: string;
}

export interface PageBreakBlock extends BaseBlock {
  type: 'pageBreak';
}

export type Block =
  | ContainerBlock
  | TextBlock
  | HeadingBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock
  | ShapeBlock
  | LineItemsBlock
  | TotalsBlock
  | DetailsBlock
  | PaymentBlock
  | SignatureBlock
  | QrBlock
  | PageBreakBlock;

export interface DocPageSetup {
  size: 'A4' | 'Letter';
  orientation: 'portrait' | 'landscape';
  margin: BoxSpacing; // mm
}

export interface DocTheme {
  fontFamily: string;
  primaryColor: string;
  accentColor: string;
  textColor: string;
}

export interface InvoiceDoc {
  version: 1;
  page: DocPageSetup;
  theme: DocTheme;
  /** Flowing blocks that paginate. */
  body: Block[];
  // overlay layer (repeating per-page elements) lands in P3.
}
