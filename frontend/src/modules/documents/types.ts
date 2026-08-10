// General document builder — model shared by the editor, renderer, and services.
import type { InvoiceTemplate, TemplateDocumentType } from '@/modules/finance/types';

export type DocumentType = 'letter' | 'memo' | 'quote' | 'certificate' | 'statement' | 'custom';

export type DocumentDataSource =
  | 'none'
  | 'client'
  | 'invoice'
  | 'contact'
  | 'delivery_note'
  | 'opportunity'
  | 'sales_order';

export interface DocumentManualField {
  key: string;
  label: string;
}

export type DocAlign = 'left' | 'center' | 'right';

export interface DocBlockStyle {
  fontSize?: number;
  fontWeight?: number;
  italic?: boolean;
  align?: DocAlign;
  color?: string;
  marginTop?: number;
  marginBottom?: number;
}

export interface DocTableBlock {
  id: string;
  type: 'table';
  columns: string[];
  rows: string[][];
  striped?: boolean;
}

export type DocBlock =
  | { id: string; type: 'heading'; text: string; style?: DocBlockStyle }
  | { id: string; type: 'text'; text: string; style?: DocBlockStyle }
  | { id: string; type: 'image'; url: string; width?: number; align?: DocAlign }
  | { id: string; type: 'divider' }
  | { id: string; type: 'spacer'; height?: number }
  | DocTableBlock;

export interface DocumentModel {
  version: 1;
  blocks: DocBlock[];
}

export interface LetterheadBox {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface Letterhead {
  firstPage?: { imageUrl?: string; sourcePdfUrl?: string };
  continuation?: { imageUrl?: string; sourcePdfUrl?: string } | null;
  contentBox: LetterheadBox; // mm
  pageSize: 'A4' | 'Letter';
}

export interface DocumentTemplate {
  id: string;
  companyId: string;
  name: string;
  type: DocumentType;
  dataSource: DocumentDataSource;
  letterhead?: Letterhead;
  doc?: DocumentModel;
  manualFields: DocumentManualField[];
  createdAt: string;
  updatedAt: string;
}

export type DocumentStatus = 'draft' | 'final';

export interface DocumentInstance {
  id: string;
  companyId: string;
  templateId: string;
  templateName?: string;
  templateType?: TemplateDocumentType;
  templateSnapshot?: InvoiceTemplate;
  title: string;
  recordType?: DocumentDataSource;
  recordId?: string;
  fieldValues: Record<string, string>;
  docSnapshot?: DocumentModel;
  letterheadSnapshot?: Letterhead;
  status: DocumentStatus;
  createdAt: string;
  updatedAt: string;
}

export const DEFAULT_CONTENT_BOX: LetterheadBox = { top: 45, right: 20, bottom: 30, left: 20 };

export function emptyDocument(): DocumentModel {
  return { version: 1, blocks: [] };
}

export function defaultLetterhead(): Letterhead {
  return { contentBox: { ...DEFAULT_CONTENT_BOX }, pageSize: 'A4', continuation: null };
}
