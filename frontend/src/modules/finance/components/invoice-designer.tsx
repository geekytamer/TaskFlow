'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/context/i18n-context';
import { updateInvoiceTemplate } from '@/services/financeService';
import type { InvoiceTemplate, Invoice, Client, InvoiceColumn } from '../types';
import type { Company } from '@/modules/companies/types';
import { DocRenderer } from '../doc/doc-renderer';
import { templateToDoc } from '../doc/template-to-doc';
import { invoicePresets } from '../doc/presets';
import { TOKEN_GROUPS } from '../doc/tokens';
import type {
  Block,
  BlockStyle,
  ContainerBlock,
  DetailsBlock,
  ImageBlock,
  InvoiceDoc,
  TotalsBlock,
} from '../doc/types';
import { cloneInvoiceDoc, countBlocks, isInvoiceDoc, validateInvoiceDoc } from '../doc/validation';
import {
  ArrowLeft,
  Banknote,
  Calculator,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Copy,
  FileText,
  FolderTree,
  Heading1,
  Image as ImageIcon,
  ListTree,
  Minus,
  MoveVertical,
  PenLine,
  QrCode,
  Redo2,
  RotateCcw,
  Square,
  Table2,
  Trash2,
  Type,
  Undo2,
  Upload,
  X,
} from 'lucide-react';

const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

// Embedded images live inside the document JSON, which is validated with a
// ~2,000,000-character cap per field. A base64 data URL is ~1.34× the file
// size, so ~1.4 MB keeps it comfortably under the cap (and the 4 MB API limit).
const MAX_IMAGE_BYTES = 1_400_000;

const DEFAULT_COLUMNS: InvoiceColumn[] = [
  { id: 'description', key: 'description', label: 'Description', visible: true, width: 55, align: 'left' },
  { id: 'quantity', key: 'quantity', label: 'Qty', visible: true, width: 15, align: 'right' },
  { id: 'unitPrice', key: 'unitPrice', label: 'Unit', visible: true, width: 15, align: 'right' },
  { id: 'amount', key: 'amount', label: 'Amount', visible: true, width: 15, align: 'right' },
];

const BLOCK_DEFAULTS: Record<string, () => Block> = {
  container: () => ({ id: makeId(), type: 'container', layout: 'stack', gap: 12, children: [] }),
  heading: () => ({ id: makeId(), type: 'heading', level: 2, content: 'Heading' }),
  text: () => ({ id: makeId(), type: 'text', content: 'Text - use {{invoice.number}} tokens.' }),
  image: () => ({ id: makeId(), type: 'image', binding: 'logo', height: 56 }),
  divider: () => ({ id: makeId(), type: 'divider', style: { margin: { top: 12, bottom: 12 } } }),
  spacer: () => ({ id: makeId(), type: 'spacer', height: 24 }),
  shape: () => ({ id: makeId(), type: 'shape', height: 8 }),
  lineItems: () => ({ id: makeId(), type: 'lineItems', style: { margin: { top: 16 } } }),
  totals: () => ({
    id: makeId(),
    type: 'totals',
    showSubtotal: true,
    showTax: true,
    showTotal: true,
    style: { margin: { top: 16 } },
  }),
  details: () => ({
    id: makeId(),
    type: 'details',
    title: 'Bill To',
    fields: [
      { label: '', value: '{{client.name}}' },
      { label: '', value: '{{client.address}}' },
    ],
  }),
  payment: () => ({ id: makeId(), type: 'payment', title: 'Payment', style: { margin: { top: 24 } } }),
  signature: () => ({ id: makeId(), type: 'signature', style: { margin: { top: 32 } } }),
  qr: () => ({ id: makeId(), type: 'qr', style: { align: 'center', margin: { top: 24 } } }),
  pageBreak: () => ({ id: makeId(), type: 'pageBreak' }),
};

const PALETTE: { type: string; label: string; icon: React.ElementType }[] = [
  { type: 'container', label: 'Group', icon: FolderTree },
  { type: 'heading', label: 'Heading', icon: Heading1 },
  { type: 'text', label: 'Text', icon: Type },
  { type: 'image', label: 'Image', icon: ImageIcon },
  { type: 'details', label: 'Details', icon: ListTree },
  { type: 'lineItems', label: 'Line items', icon: Table2 },
  { type: 'totals', label: 'Totals', icon: Calculator },
  { type: 'payment', label: 'Payment', icon: Banknote },
  { type: 'signature', label: 'Signature', icon: PenLine },
  { type: 'qr', label: 'QR code', icon: QrCode },
  { type: 'divider', label: 'Divider', icon: Minus },
  { type: 'spacer', label: 'Spacer', icon: MoveVertical },
  { type: 'shape', label: 'Color band', icon: Square },
  { type: 'pageBreak', label: 'Page break', icon: FileText },
];

const sampleInvoice = {
  id: 'preview',
  invoiceNumber: 'INV-0042',
  companyId: 'preview',
  clientId: 'preview',
  issueDate: new Date(),
  dueDate: new Date(Date.now() + 30 * 86400000),
  status: 'Sent',
  currency: 'USD',
  taxRate: 5,
  total: 2362.5,
  notes: 'Thank you for your business.',
  lineItems: [
    { itemType: 'Manual', sku: 'A-1', description: 'Design & build', quantity: 1, unitPrice: 1500, amount: 1500 },
    { itemType: 'Manual', sku: 'A-2', description: 'Support retainer', quantity: 3, unitPrice: 250, amount: 750 },
  ],
} as unknown as Invoice;
const sampleClient = {
  id: 'preview',
  name: 'Acme Trading LLC',
  address: 'Business Bay\nDubai, UAE',
  email: 'pay@acme.example',
} as unknown as Client;

interface InvoiceDesignerProps {
  template: InvoiceTemplate;
  company?: Company | null;
  onClose: () => void;
  onSaved: () => void;
}

function blockSummary(block: Block): string {
  switch (block.type) {
    case 'heading':
      return `Heading - "${block.content}"`;
    case 'text':
      return `Text - "${block.content.slice(0, 28)}${block.content.length > 28 ? '...' : ''}"`;
    case 'image':
      return `Image (${block.binding || 'custom'})`;
    case 'details':
      return `Details - ${block.title || 'fields'}`;
    case 'container':
      return `Group (${block.layout}, ${block.children.length})`;
    default:
      return block.type.charAt(0).toUpperCase() + block.type.slice(1);
  }
}

function findBlock(blocks: Block[], id: string | null): Block | undefined {
  if (!id) return undefined;
  for (const block of blocks) {
    if (block.id === id) return block;
    if (block.type === 'container') {
      const found = findBlock(block.children, id);
      if (found) return found;
    }
  }
  return undefined;
}

function updateBlockInTree(blocks: Block[], id: string, patch: Partial<Block>): Block[] {
  return blocks.map((block) => {
    if (block.id === id) return { ...block, ...patch } as Block;
    if (block.type === 'container') {
      return { ...block, children: updateBlockInTree(block.children, id, patch) };
    }
    return block;
  });
}

function removeBlockFromTree(blocks: Block[], id: string): Block[] {
  return blocks
    .filter((block) => block.id !== id)
    .map((block) =>
      block.type === 'container'
        ? { ...block, children: removeBlockFromTree(block.children, id) }
        : block,
    );
}

function moveBlockInTree(blocks: Block[], id: string, direction: -1 | 1): Block[] {
  const index = blocks.findIndex((block) => block.id === id);
  if (index >= 0) {
    const target = index + direction;
    if (target < 0 || target >= blocks.length) return blocks;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    return next;
  }
  return blocks.map((block) =>
    block.type === 'container'
      ? { ...block, children: moveBlockInTree(block.children, id, direction) }
      : block,
  );
}

function cloneBlockWithIds(block: Block): Block {
  const cloned = JSON.parse(JSON.stringify(block)) as Block;
  const assignIds = (item: Block): Block => {
    if (item.type === 'container') {
      return { ...item, id: makeId(), children: item.children.map(assignIds) };
    }
    return { ...item, id: makeId() };
  };
  return assignIds(cloned);
}

function duplicateBlockInTree(blocks: Block[], id: string): Block[] {
  const index = blocks.findIndex((block) => block.id === id);
  if (index >= 0) {
    const next = [...blocks];
    next.splice(index + 1, 0, cloneBlockWithIds(blocks[index]));
    return next;
  }
  return blocks.map((block) =>
    block.type === 'container'
      ? { ...block, children: duplicateBlockInTree(block.children, id) }
      : block,
  );
}

/**
 * Move `draggedId` to sit before/after `targetId` within the SAME parent.
 * Cross-parent drops are ignored so the flow layout stays predictable.
 */
function reorderBlockInTree(
  blocks: Block[],
  draggedId: string,
  targetId: string,
  place: 'before' | 'after',
): Block[] {
  const di = blocks.findIndex((b) => b.id === draggedId);
  const ti = blocks.findIndex((b) => b.id === targetId);
  if (di >= 0 && ti >= 0) {
    if (draggedId === targetId) return blocks;
    const next = [...blocks];
    const [dragged] = next.splice(di, 1);
    let insertAt = next.findIndex((b) => b.id === targetId);
    if (place === 'after') insertAt += 1;
    next.splice(insertAt, 0, dragged);
    return next;
  }
  return blocks.map((block) =>
    block.type === 'container'
      ? { ...block, children: reorderBlockInTree(block.children, draggedId, targetId, place) }
      : block,
  );
}

export function InvoiceDesigner({ template, company, onClose, onSaved }: InvoiceDesignerProps) {
  const { toast } = useToast();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const paletteLabel = (type: string, fallback: string) => {
    switch (type) {
      case 'container': return tr('Group', 'مجموعة');
      case 'heading': return tr('Heading', 'عنوان');
      case 'text': return tr('Text', 'نص');
      case 'image': return tr('Image', 'صورة');
      case 'details': return tr('Details', 'تفاصيل');
      case 'lineItems': return tr('Line items', 'بنود');
      case 'totals': return tr('Totals', 'الإجماليات');
      case 'payment': return tr('Payment', 'الدفع');
      case 'signature': return tr('Signature', 'التوقيع');
      case 'qr': return tr('QR code', 'رمز QR');
      case 'divider': return tr('Divider', 'فاصل');
      case 'spacer': return tr('Spacer', 'مسافة');
      case 'shape': return tr('Color band', 'شريط لوني');
      case 'pageBreak': return tr('Page break', 'فاصل صفحة');
      default: return fallback;
    }
  };
  const initialDoc = React.useMemo(
    () => isInvoiceDoc(template.doc) ? template.doc : templateToDoc(template),
    [template],
  );
  const [doc, setDoc] = React.useState<InvoiceDoc>(() => cloneInvoiceDoc(initialDoc));
  const [selectedId, setSelectedId] = React.useState<string | null>(doc.body[0]?.id ?? null);
  const [history, setHistory] = React.useState<InvoiceDoc[]>([]);
  const [future, setFuture] = React.useState<InvoiceDoc[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [collapsedIds, setCollapsedIds] = React.useState<Set<string>>(new Set());
  const toggleCollapsed = (id: string) =>
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const savedSnapshot = React.useRef(JSON.stringify(initialDoc));
  const dirty = JSON.stringify(doc) !== savedSnapshot.current;
  const errors = React.useMemo(() => validateInvoiceDoc(doc), [doc]);
  const selected = findBlock(doc.body, selectedId);

  React.useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const commit = React.useCallback((updater: (current: InvoiceDoc) => InvoiceDoc) => {
    const next = updater(doc);
    if (JSON.stringify(next) === JSON.stringify(doc)) return;
    setHistory((items) => [...items.slice(-49), cloneInvoiceDoc(doc)]);
    setFuture([]);
    setDoc(next);
  }, [doc]);

  const updateBlock = (id: string, patch: Partial<Block>) => {
    commit((current) => ({ ...current, body: updateBlockInTree(current.body, id, patch) }));
  };

  const updateStyle = (id: string, patch: BlockStyle) => {
    const current = findBlock(doc.body, id)?.style;
    updateBlock(id, {
      style: {
        ...current,
        ...patch,
        margin: patch.margin ? { ...current?.margin, ...patch.margin } : current?.margin,
        padding: patch.padding ? { ...current?.padding, ...patch.padding } : current?.padding,
        border: patch.border ? { ...current?.border, ...patch.border } : current?.border,
      },
    } as Partial<Block>);
  };

  const addBlock = (type: string) => {
    const block = BLOCK_DEFAULTS[type]?.();
    if (!block) return;
    commit((current) => {
      const selectedBlock = findBlock(current.body, selectedId);
      if (selectedBlock?.type === 'container') {
        return {
          ...current,
          body: updateBlockInTree(current.body, selectedBlock.id, {
            children: [...selectedBlock.children, block],
          } as Partial<ContainerBlock>),
        };
      }
      return { ...current, body: [...current.body, block] };
    });
    setSelectedId(block.id);
  };

  const removeBlock = (id: string) => {
    commit((current) => ({ ...current, body: removeBlockFromTree(current.body, id) }));
    if (selectedId === id) setSelectedId(null);
  };

  const reorder = (draggedId: string, targetId: string, place: 'before' | 'after') => {
    commit((current) => ({
      ...current,
      body: reorderBlockInTree(current.body, draggedId, targetId, place),
    }));
    setSelectedId(draggedId);
  };

  const applyPreset = (presetId: string) => {
    const preset = invoicePresets.find((p) => p.id === presetId);
    if (!preset) return;
    if (dirty && !window.confirm(tr(`Replace the current design with the "${preset.name}" preset?`, `هل تريد استبدال التصميم الحالي بالقالب الجاهز "${preset.name}"؟`))) return;
    commit(() => preset.build({ ...template, doc: undefined }));
    setSelectedId(null);
  };

  const undo = () => {
    if (history.length === 0) return;
    const previous = history[history.length - 1];
    setFuture((items) => [cloneInvoiceDoc(doc), ...items].slice(0, 50));
    setHistory((items) => items.slice(0, -1));
    setDoc(cloneInvoiceDoc(previous));
  };

  const redo = () => {
    if (future.length === 0) return;
    const next = future[0];
    setHistory((items) => [...items.slice(-49), cloneInvoiceDoc(doc)]);
    setFuture((items) => items.slice(1));
    setDoc(cloneInvoiceDoc(next));
  };

  const close = () => {
    if (dirty && !window.confirm(tr('Discard your unsaved invoice design changes?', 'هل تريد تجاهل تغييرات تصميم الفاتورة غير المحفوظة؟'))) return;
    onClose();
  };

  const reset = () => {
    if (!window.confirm(tr('Reset this design to the template settings?', 'هل تريد إعادة ضبط هذا التصميم إلى إعدادات القالب؟'))) return;
    commit(() => templateToDoc({ ...template, doc: undefined }));
    setSelectedId(null);
  };

  const save = async () => {
    const validationErrors = validateInvoiceDoc(doc);
    if (validationErrors.length > 0) {
      toast({
        variant: 'destructive',
        title: tr('Design is invalid', 'التصميم غير صالح'),
        description: validationErrors[0],
      });
      return;
    }
    setSaving(true);
    try {
      await updateInvoiceTemplate(template.id, { doc });
      savedSnapshot.current = JSON.stringify(doc);
      setHistory([]);
      setFuture([]);
      toast({ title: tr('Design saved', 'تم حفظ التصميم') });
      onSaved();
    } catch (error: unknown) {
      toast({
        variant: 'destructive',
        title: tr('Save failed', 'فشل الحفظ'),
        description: error instanceof Error ? error.message : tr('Could not save the invoice design.', 'تعذر حفظ تصميم الفاتورة.'),
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[640px] flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={close}>
          <ArrowLeft className="me-1 h-4 w-4" />
          {tr('Back to settings', 'العودة إلى الإعدادات')}
        </Button>
        <div className="text-sm font-medium">
          {tr('Designing', 'تصميم')}: {template.name}
          {dirty && <span className="ms-2 text-amber-600">{tr('Unsaved changes', 'تغييرات غير محفوظة')}</span>}
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" onClick={undo} disabled={history.length === 0} title={tr('Undo', 'تراجع')}>
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={redo} disabled={future.length === 0} title={tr('Redo', 'إعادة')}>
            <Redo2 className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={reset}>
            <RotateCcw className="me-1 h-4 w-4" />
            {tr('Reset', 'إعادة ضبط')}
          </Button>
          <Button size="sm" onClick={save} disabled={saving || errors.length > 0 || !dirty}>
            {saving ? tr('Saving...', 'جارٍ الحفظ...') : tr('Save design', 'حفظ التصميم')}
          </Button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
          {errors[0]} {errors.length > 1 ? tr(`(${errors.length - 1} more)`, `(${errors.length - 1} أخرى)`) : ''}
        </div>
      )}

      <div className="grid flex-1 gap-3 overflow-hidden lg:grid-cols-[190px_300px_1fr]">
        <div className="overflow-y-auto rounded-lg border p-2">
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr('Start from a preset', 'ابدأ من قالب جاهز')}</p>
          <div className="grid gap-1.5">
            {invoicePresets.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className="rounded-md border p-2 text-left hover:bg-muted"
                title={preset.description}
              >
                <span className="block text-[12px] font-medium">{preset.name}</span>
                <span className="block text-[10px] leading-tight text-muted-foreground">{preset.description}</span>
              </button>
            ))}
          </div>

          <p className="mt-3 px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr('Add block', 'إضافة عنصر')}</p>
          <div className="grid grid-cols-2 gap-1.5">
            {PALETTE.map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() => addBlock(item.type)}
                className="flex flex-col items-center gap-1 rounded-md border p-2 text-[11px] hover:bg-muted"
                title={selected?.type === 'container' ? tr(`Add ${item.label} inside selected group`, `إضافة ${paletteLabel(item.type, item.label)} داخل المجموعة المحددة`) : tr(`Add ${item.label}`, `إضافة ${paletteLabel(item.type, item.label)}`)}
              >
                <item.icon className="h-4 w-4 text-muted-foreground" />
                {paletteLabel(item.type, item.label)}
              </button>
            ))}
          </div>
          <p className="mt-3 px-1 text-[11px] text-muted-foreground">
            {tr('Select a group before adding to place the new block inside it.', 'حدد مجموعة قبل الإضافة لوضع العنصر الجديد داخلها.')}
          </p>
        </div>

        <div className="overflow-y-auto rounded-lg border p-2">
          <div className="flex items-center justify-between px-1 pb-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tr('Layout', 'التخطيط')}</p>
            <span className="text-[11px] text-muted-foreground">{countBlocks(doc.body)} {tr('blocks', 'عنصر')}</span>
          </div>
          <BlockTree
            blocks={doc.body}
            selectedId={selectedId}
            onSelect={setSelectedId}
            collapsedIds={collapsedIds}
            onToggleCollapsed={toggleCollapsed}
            onMove={(id, direction) => commit((current) => ({
              ...current,
              body: moveBlockInTree(current.body, id, direction),
            }))}
            onDuplicate={(id) => commit((current) => ({
              ...current,
              body: duplicateBlockInTree(current.body, id),
            }))}
            onRemove={removeBlock}
            onReorder={reorder}
          />
          {doc.body.length === 0 && <p className="px-1 text-xs text-muted-foreground">{tr('Add blocks from the left.', 'أضف عناصر من القائمة الجانبية.')}</p>}
        </div>

        <div className="grid gap-3 overflow-hidden xl:grid-cols-[minmax(520px,1fr)_320px]">
          <div className="overflow-auto rounded-lg border bg-muted/30 p-4">
            <div className="mx-auto w-fit max-w-full bg-white shadow-sm">
              <DocRenderer
                doc={doc}
                invoice={sampleInvoice}
                client={sampleClient}
                company={company}
                template={template}
                editable
                selectedId={selectedId}
                onSelectBlock={setSelectedId}
                onReorderBlock={reorder}
              />
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              {tr('Click a block to edit it · drag to reorder', 'انقر على عنصر لتعديله · اسحب لإعادة الترتيب')}
            </p>
          </div>
          <div className="overflow-y-auto rounded-lg border p-3">
            <DocumentProperties doc={doc} onChange={(patch) => commit((current) => ({ ...current, ...patch }))} />
            <div className="my-4 border-t" />
            {!selected ? (
              <p className="text-xs text-muted-foreground">{tr('Select a block to edit its content and style.', 'حدد عنصرًا لتعديل محتواه وتنسيقه.')}</p>
            ) : (
              <BlockProperties
                block={selected}
                templateColumns={template.columns}
                onChange={(patch) => updateBlock(selected.id, patch)}
                onStyle={(style) => updateStyle(selected.id, style)}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BlockTree({
  blocks,
  selectedId,
  onSelect,
  collapsedIds,
  onToggleCollapsed,
  onMove,
  onDuplicate,
  onRemove,
  onReorder,
  depth = 0,
}: {
  blocks: Block[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  collapsedIds: Set<string>;
  onToggleCollapsed: (id: string) => void;
  onMove: (id: string, direction: -1 | 1) => void;
  onDuplicate: (id: string) => void;
  onRemove: (id: string) => void;
  onReorder: (draggedId: string, targetId: string, place: 'before' | 'after') => void;
  depth?: number;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  return (
    <div className={depth ? 'mt-1 space-y-1 border-s ps-2' : 'space-y-1.5'}>
      {blocks.map((block, index) => (
        <div key={block.id}>
          <div
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', block.id);
              e.dataTransfer.effectAllowed = 'move';
              e.stopPropagation();
            }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              const draggedId = e.dataTransfer.getData('text/plain');
              if (!draggedId || draggedId === block.id) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const place = e.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
              onReorder(draggedId, block.id, place);
            }}
            className={`flex items-center gap-1 rounded-md border p-1.5 text-xs ${
              selectedId === block.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
            }`}
          >
            {block.type === 'container' && block.children.length > 0 ? (
              <button
                type="button"
                title={collapsedIds.has(block.id) ? tr('Expand group', 'توسيع المجموعة') : tr('Collapse group', 'طي المجموعة')}
                aria-label={collapsedIds.has(block.id) ? tr('Expand group', 'توسيع المجموعة') : tr('Collapse group', 'طي المجموعة')}
                aria-expanded={!collapsedIds.has(block.id)}
                className="shrink-0 text-muted-foreground"
                onClick={() => onToggleCollapsed(block.id)}
              >
                {collapsedIds.has(block.id) ? <ChevronRight className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <button type="button" className="min-w-0 flex-1 cursor-grab truncate text-left" onClick={() => onSelect(block.id)}>
              {blockSummary(block)}
              {block.type === 'container' && block.children.length > 0 ? (
                <span className="ms-1 text-muted-foreground">({block.children.length})</span>
              ) : null}
            </button>
            <button type="button" title={tr('Move up', 'تحريك لأعلى')} aria-label={tr('Move block up', 'تحريك العنصر لأعلى')} disabled={index === 0} onClick={() => onMove(block.id, -1)}>
              <ChevronUp className="h-3.5 w-3.5" />
            </button>
            <button type="button" title={tr('Move down', 'تحريك لأسفل')} aria-label={tr('Move block down', 'تحريك العنصر لأسفل')} disabled={index === blocks.length - 1} onClick={() => onMove(block.id, 1)}>
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button type="button" title={tr('Duplicate', 'تكرار')} aria-label={tr('Duplicate block', 'تكرار العنصر')} onClick={() => onDuplicate(block.id)}>
              <Copy className="h-3.5 w-3.5" />
            </button>
            <button type="button" title={tr('Delete', 'حذف')} aria-label={tr('Delete block', 'حذف العنصر')} className="text-muted-foreground hover:text-destructive" onClick={() => onRemove(block.id)}>
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </div>
          {block.type === 'container' && block.children.length > 0 && !collapsedIds.has(block.id) && (
            <BlockTree
              blocks={block.children}
              selectedId={selectedId}
              onSelect={onSelect}
              collapsedIds={collapsedIds}
              onToggleCollapsed={onToggleCollapsed}
              onMove={onMove}
              onDuplicate={onDuplicate}
              onReorder={onReorder}
              onRemove={onRemove}
              depth={depth + 1}
            />
          )}
        </div>
      ))}
    </div>
  );
}

function DocumentProperties({
  doc,
  onChange,
}: {
  doc: InvoiceDoc;
  onChange: (patch: Partial<InvoiceDoc>) => void;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const updateMargin = (side: 'top' | 'right' | 'bottom' | 'left', value: number) => {
    onChange({ page: { ...doc.page, margin: { ...doc.page.margin, [side]: value } } });
  };
  return (
    <details open>
      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {tr('Document', 'المستند')}
      </summary>
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <Field label={tr('Page size', 'حجم الصفحة')}>
            <Select value={doc.page.size} onValueChange={(size) => onChange({ page: { ...doc.page, size: size as InvoiceDoc['page']['size'] } })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="A4">A4</SelectItem>
                <SelectItem value="Letter">Letter</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={tr('Orientation', 'الاتجاه')}>
            <Select value={doc.page.orientation} onValueChange={(orientation) => onChange({ page: { ...doc.page, orientation: orientation as InvoiceDoc['page']['orientation'] } })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="portrait">{tr('Portrait', 'عمودي')}</SelectItem>
                <SelectItem value="landscape">{tr('Landscape', 'أفقي')}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
        <div>
          <Label className="text-xs">{tr('Page margins (mm)', 'هوامش الصفحة (مم)')}</Label>
          <div className="mt-1 grid grid-cols-4 gap-1">
            {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
              <Input
                key={side}
                className="h-8 px-2"
                type="number"
                min={0}
                max={50}
                aria-label={`${side} ${tr('page margin', 'هامش الصفحة')}`}
                title={side}
                value={doc.page.margin[side] ?? 0}
                onChange={(event) => updateMargin(side, Number(event.target.value))}
              />
            ))}
          </div>
        </div>
        <Field label={tr('Font family', 'نوع الخط')}>
          <Input
            className="h-8"
            value={doc.theme.fontFamily}
            onChange={(event) => onChange({ theme: { ...doc.theme, fontFamily: event.target.value } })}
            placeholder="inherit"
          />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <ColorField label={tr('Primary', 'أساسي')} value={doc.theme.primaryColor} onChange={(primaryColor) => onChange({ theme: { ...doc.theme, primaryColor } })} />
          <ColorField label={tr('Accent', 'مميز')} value={doc.theme.accentColor} onChange={(accentColor) => onChange({ theme: { ...doc.theme, accentColor } })} />
          <ColorField label={tr('Text', 'النص')} value={doc.theme.textColor} onChange={(textColor) => onChange({ theme: { ...doc.theme, textColor } })} />
        </div>
      </div>
    </details>
  );
}

function BlockProperties({
  block,
  templateColumns,
  onChange,
  onStyle,
}: {
  block: Block;
  templateColumns?: InvoiceColumn[];
  onChange: (patch: Partial<Block>) => void;
  onStyle: (style: BlockStyle) => void;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const style = block.style || {};
  const setNumber = (value: string) => (value === '' ? undefined : Number(value));

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{block.type}</div>

      {(block.type === 'text' || block.type === 'heading') && (
        <Field label={tr('Content', 'المحتوى')}>
          <Textarea
            rows={3}
            value={block.content}
            onChange={(event) => onChange({ content: event.target.value } as Partial<Block>)}
          />
          <details className="mt-1 text-[11px] text-muted-foreground">
            <summary className="cursor-pointer">{tr('Data tokens', 'رموز البيانات')}</summary>
            <div className="mt-1 space-y-1">
              {TOKEN_GROUPS.map((group) => (
                <div key={group.group}>
                  <span className="font-medium">{group.group}:</span>{' '}
                  {group.tokens.map((token) => `{{${token.token}}}`).join(', ')}
                </div>
              ))}
            </div>
          </details>
        </Field>
      )}

      {block.type === 'heading' && (
        <Field label={tr('Level', 'المستوى')}>
          <Select value={String(block.level)} onValueChange={(value) => onChange({ level: Number(value) } as Partial<Block>)}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {[1, 2, 3].map((level) => <SelectItem key={level} value={String(level)}>H{level}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      )}

      {block.type === 'container' && (
        <div className="grid grid-cols-2 gap-2">
          <Field label={tr('Layout', 'التخطيط')}>
            <Select value={block.layout} onValueChange={(layout) => onChange({ layout } as Partial<ContainerBlock>)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="stack">{tr('Stack', 'عمودي')}</SelectItem>
                <SelectItem value="row">{tr('Row', 'صف')}</SelectItem>
                <SelectItem value="grid">{tr('Grid', 'شبكة')}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={tr('Gap', 'المسافة')}>
            <Input className="h-8" type="number" min={0} max={200} value={block.gap ?? 16} onChange={(event) => onChange({ gap: Number(event.target.value) } as Partial<ContainerBlock>)} />
          </Field>
          {block.layout === 'grid' && (
            <Field label={tr('Columns', 'الأعمدة')}>
              <Input className="h-8" type="number" min={1} max={6} value={block.columns ?? 2} onChange={(event) => onChange({ columns: Number(event.target.value) } as Partial<ContainerBlock>)} />
            </Field>
          )}
        </div>
      )}

      {block.type === 'image' && (
        <ImageProperties block={block} onChange={onChange} />
      )}

      {(block.type === 'spacer' || block.type === 'shape') && (
        <Field label={tr('Height (px)', 'الارتفاع (بكسل)')}>
          <Input className="h-8" type="number" min={block.type === 'spacer' ? 0 : 1} max={2000} value={block.height ?? 24} onChange={(event) => onChange({ height: Number(event.target.value) } as Partial<Block>)} />
        </Field>
      )}

      {block.type === 'details' && (
        <DetailsProperties block={block} onChange={onChange} />
      )}

      {block.type === 'lineItems' && (
        <ColumnsProperties block={block} templateColumns={templateColumns} onChange={onChange} />
      )}

      {block.type === 'totals' && (
        <div className="space-y-2">
          {([
            ['showSubtotal', tr('Show subtotal', 'إظهار المجموع الفرعي')],
            ['showTax', tr('Show tax', 'إظهار الضريبة')],
            ['showTotal', tr('Show total', 'إظهار الإجمالي')],
          ] as const).map(([key, label]) => (
            <Checkbox
              key={key}
              label={label}
              checked={block[key] !== false}
              onChange={(checked) => onChange({ [key]: checked } as Partial<TotalsBlock>)}
            />
          ))}
        </div>
      )}

      {block.type === 'payment' && (
        <Field label={tr('Title', 'العنوان')}>
          <Input className="h-8" value={block.title ?? ''} onChange={(event) => onChange({ title: event.target.value } as Partial<Block>)} />
        </Field>
      )}

      {block.type === 'qr' && (
        <Field label={tr('Caption', 'التسمية التوضيحية')}>
          <Input className="h-8" value={block.caption ?? ''} onChange={(event) => onChange({ caption: event.target.value } as Partial<Block>)} placeholder={tr('Scan to view & download', 'امسح للعرض والتنزيل')} />
        </Field>
      )}

      <div className="space-y-3 border-t pt-3">
        <Field label={tr('Show when', 'إظهار عند')}>
          <Select value={block.visibleWhen ?? 'always'} onValueChange={(visibleWhen) => onChange({ visibleWhen } as Partial<Block>)}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="always">{tr('Always', 'دائمًا')}</SelectItem>
              <SelectItem value="hasNotes">{tr('Invoice has notes', 'الفاتورة بها ملاحظات')}</SelectItem>
              <SelectItem value="hasBankAccounts">{tr('Bank accounts exist', 'توجد حسابات بنكية')}</SelectItem>
              <SelectItem value="hasLogo">{tr('Logo exists', 'يوجد شعار')}</SelectItem>
              <SelectItem value="hasStamp">{tr('Stamp exists', 'يوجد ختم')}</SelectItem>
              <SelectItem value="hasSignature">{tr('Signature exists', 'يوجد توقيع')}</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field label={tr('Align', 'المحاذاة')}>
            <Select value={style.align ?? 'left'} onValueChange={(align) => onStyle({ align: align as BlockStyle['align'] })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">{tr('Left', 'يسار')}</SelectItem>
                <SelectItem value="center">{tr('Center', 'وسط')}</SelectItem>
                <SelectItem value="right">{tr('Right', 'يمين')}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={tr('Width', 'العرض')}>
            <Input className="h-8" value={style.width ?? ''} placeholder="100%" onChange={(event) => onStyle({ width: event.target.value || undefined })} />
          </Field>
          <Field label={tr('Font size', 'حجم الخط')}>
            <Input className="h-8" type="number" min={1} max={500} value={style.fontSize ?? ''} onChange={(event) => onStyle({ fontSize: setNumber(event.target.value) })} />
          </Field>
          <Field label={tr('Line height', 'ارتفاع السطر')}>
            <Input className="h-8" type="number" min={0} max={20} step={0.1} value={style.lineHeight ?? ''} onChange={(event) => onStyle({ lineHeight: setNumber(event.target.value) })} />
          </Field>
        </div>

        <Field label={tr('Font family', 'نوع الخط')}>
          <Input className="h-8" value={style.fontFamily ?? ''} placeholder={tr('Use document font', 'استخدام خط المستند')} onChange={(event) => onStyle({ fontFamily: event.target.value || undefined })} />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <ColorField label={tr('Text color', 'لون النص')} value={style.color ?? '#0f172a'} onChange={(color) => onStyle({ color })} />
          <ColorField label={tr('Background', 'الخلفية')} value={style.background ?? '#ffffff'} onChange={(background) => onStyle({ background })} />
        </div>

        <Field label={tr('Background image', 'صورة الخلفية')}>
          <div className="space-y-2">
            <ImageUploadButton label={tr('Upload background', 'رفع خلفية')} onUploaded={(dataUrl) => onStyle({ backgroundImage: dataUrl })} />
            {style.backgroundImage ? (
              <>
                <ImagePreview src={style.backgroundImage} onClear={() => onStyle({ backgroundImage: undefined })} />
                <Select value={style.backgroundSize ?? 'cover'} onValueChange={(size) => onStyle({ backgroundSize: size as NonNullable<BlockStyle['backgroundSize']> })}>
                  <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cover">{tr('Cover (fill)', 'تغطية (ملء)')}</SelectItem>
                    <SelectItem value="contain">{tr('Contain (fit)', 'احتواء (ملاءمة)')}</SelectItem>
                    <SelectItem value="auto">{tr('Original size', 'الحجم الأصلي')}</SelectItem>
                  </SelectContent>
                </Select>
              </>
            ) : null}
          </div>
        </Field>

        <SpacingProperties label={tr('Margin', 'الهامش الخارجي')} value={style.margin} onChange={(margin) => onStyle({ margin })} />
        <SpacingProperties label={tr('Padding', 'الهامش الداخلي')} value={style.padding} onChange={(padding) => onStyle({ padding })} />

        <div className="grid grid-cols-2 gap-2">
          <Field label={tr('Border width', 'عرض الحد')}>
            <Input className="h-8" type="number" min={0} max={20} value={style.border?.width ?? ''} onChange={(event) => onStyle({ border: { ...style.border, width: setNumber(event.target.value) } })} />
          </Field>
          <ColorField label={tr('Border color', 'لون الحد')} value={style.border?.color ?? '#e5e7eb'} onChange={(color) => onStyle({ border: { ...style.border, color } })} />
          <Field label={tr('Border style', 'نمط الحد')}>
            <Select value={style.border?.style ?? 'solid'} onValueChange={(borderStyle) => onStyle({ border: { ...style.border, style: borderStyle as NonNullable<BlockStyle['border']>['style'] } })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">{tr('Solid', 'متصل')}</SelectItem>
                <SelectItem value="dashed">{tr('Dashed', 'متقطع')}</SelectItem>
                <SelectItem value="dotted">{tr('Dotted', 'منقّط')}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label={tr('Corner radius', 'استدارة الزوايا')}>
            <Input className="h-8" type="number" min={0} max={500} value={style.borderRadius ?? ''} onChange={(event) => onStyle({ borderRadius: setNumber(event.target.value) })} />
          </Field>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <Checkbox label={tr('Bold', 'عريض')} checked={(style.fontWeight ?? 400) >= 600} onChange={(checked) => onStyle({ fontWeight: checked ? 700 : 400 })} />
          <Checkbox label={tr('Italic', 'مائل')} checked={style.italic === true} onChange={(italic) => onStyle({ italic })} />
          <Checkbox label={tr('Uppercase', 'أحرف كبيرة')} checked={style.uppercase === true} onChange={(uppercase) => onStyle({ uppercase })} />
        </div>

        <Checkbox
          label={tr('Full width (ignore page margins)', 'عرض كامل (تجاهل هوامش الصفحة)')}
          checked={style.fullBleed === true}
          onChange={(fullBleed) => onStyle({ fullBleed })}
        />
        {style.fullBleed ? (
          <p className="text-[11px] leading-tight text-muted-foreground">
            {tr('Spans the whole sheet edge to edge. Best on top-level bands, header/footer images, and color bars.', 'يمتد على كامل الصفحة من حافة إلى حافة. الأفضل للأشرطة العلوية وصور الرأس/التذييل وأشرطة الألوان.')}
          </p>
        ) : null}
      </div>
    </div>
  );
}

function ImageUploadButton({ label, onUploaded }: { label: string; onUploaded: (dataUrl: string) => void }) {
  const { toast } = useToast();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const handleFile = (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      toast({ variant: 'destructive', title: tr('Image too large', 'الصورة كبيرة جدًا'), description: tr('Please use an image under 1.4 MB.', 'يرجى استخدام صورة أقل من 1.4 ميجابايت.') });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onUploaded(String(reader.result));
    reader.onerror = () => toast({ variant: 'destructive', title: tr('Could not read the image', 'تعذر قراءة الصورة') });
    reader.readAsDataURL(file);
  };
  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(event) => {
          handleFile(event.target.files?.[0] ?? null);
          event.target.value = '';
        }}
      />
      <Button type="button" variant="outline" size="sm" className="h-8 w-full gap-1" onClick={() => inputRef.current?.click()}>
        <Upload className="h-3.5 w-3.5" /> {label}
      </Button>
    </>
  );
}

/** Small thumbnail preview for an uploaded/linked image, with a clear button. */
function ImagePreview({ src, onClear }: { src: string; onClear: () => void }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  return (
    <div className="flex items-center gap-2 rounded-md border bg-muted/30 p-1.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-9 w-9 rounded object-contain" />
      <span className="flex-1 truncate text-[11px] text-muted-foreground">
        {src.startsWith('data:') ? tr('Uploaded image', 'صورة مرفوعة') : src}
      </span>
      <Button type="button" variant="ghost" size="sm" className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive" onClick={onClear} aria-label={tr('Remove image', 'إزالة الصورة')}>
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function ImageProperties({ block, onChange }: { block: ImageBlock; onChange: (patch: Partial<Block>) => void }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const source = block.binding ? `binding:${block.binding}` : 'custom';
  return (
    <div className="space-y-2">
      <Field label={tr('Source', 'المصدر')}>
        <Select
          value={source}
          onValueChange={(value) => {
            if (value === 'custom') onChange({ binding: undefined } as Partial<ImageBlock>);
            else onChange({ binding: value.replace('binding:', '') as ImageBlock['binding'], src: undefined } as Partial<ImageBlock>);
          }}
        >
          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
          <SelectContent>
            {['logo', 'stamp', 'signature', 'header', 'footer'].map((binding) => (
              <SelectItem key={binding} value={`binding:${binding}`}>{binding}</SelectItem>
            ))}
            <SelectItem value="custom">{tr('Custom URL/data URL', 'رابط مخصص / رابط بيانات')}</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      {!block.binding && (
        <Field label={tr('Image', 'الصورة')}>
          <div className="space-y-2">
            <ImageUploadButton label={tr('Upload image', 'رفع صورة')} onUploaded={(dataUrl) => onChange({ src: dataUrl } as Partial<ImageBlock>)} />
            {block.src ? (
              <ImagePreview src={block.src} onClear={() => onChange({ src: undefined } as Partial<ImageBlock>)} />
            ) : null}
            <Textarea rows={2} placeholder={tr('…or paste an image URL / data URL', '…أو الصق رابط صورة / رابط بيانات')} value={block.src ?? ''} onChange={(event) => onChange({ src: event.target.value } as Partial<ImageBlock>)} />
          </div>
        </Field>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label={tr('Height (px)', 'الارتفاع (بكسل)')}>
          <Input className="h-8" type="number" min={1} max={2000} value={block.height ?? 56} onChange={(event) => onChange({ height: Number(event.target.value) } as Partial<ImageBlock>)} />
        </Field>
        <Field label={tr('Fit', 'الملاءمة')}>
          <Select value={block.fit ?? 'contain'} onValueChange={(fit) => onChange({ fit } as Partial<ImageBlock>)}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="contain">{tr('Contain', 'احتواء')}</SelectItem>
              <SelectItem value="cover">{tr('Cover', 'تغطية')}</SelectItem>
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  );
}

function DetailsProperties({ block, onChange }: { block: DetailsBlock; onChange: (patch: Partial<Block>) => void }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const updateField = (index: number, patch: Partial<DetailsBlock['fields'][number]>) => {
    onChange({ fields: block.fields.map((field, itemIndex) => itemIndex === index ? { ...field, ...patch } : field) } as Partial<DetailsBlock>);
  };
  return (
    <div className="space-y-2">
      <Field label={tr('Title', 'العنوان')}>
        <Input className="h-8" value={block.title ?? ''} onChange={(event) => onChange({ title: event.target.value } as Partial<DetailsBlock>)} />
      </Field>
      <Label className="text-xs">{tr('Fields', 'الحقول')}</Label>
      {block.fields.map((field, index) => (
        <div key={index} className="grid grid-cols-[1fr_1.4fr_auto] gap-1">
          <Input className="h-8" value={field.label} placeholder={tr('Label', 'التسمية')} onChange={(event) => updateField(index, { label: event.target.value })} />
          <Input className="h-8" value={field.value} placeholder="{{client.name}}" onChange={(event) => updateField(index, { value: event.target.value })} />
          <Button type="button" variant="ghost" size="icon" onClick={() => onChange({ fields: block.fields.filter((_, itemIndex) => itemIndex !== index) } as Partial<DetailsBlock>)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange({ fields: [...block.fields, { label: '', value: '' }] } as Partial<DetailsBlock>)}>
        {tr('Add field', 'إضافة حقل')}
      </Button>
    </div>
  );
}

function ColumnsProperties({
  block,
  templateColumns,
  onChange,
}: {
  block: Extract<Block, { type: 'lineItems' }>;
  templateColumns?: InvoiceColumn[];
  onChange: (patch: Partial<Block>) => void;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const inherited = block.columns === undefined;
  const columns = block.columns ?? templateColumns ?? DEFAULT_COLUMNS;
  const setColumns = (next: InvoiceColumn[] | undefined) => onChange({ columns: next } as Partial<Block>);
  const updateColumn = (id: string, patch: Partial<InvoiceColumn>) => {
    setColumns(columns.map((column) => column.id === id ? { ...column, ...patch } : column));
  };
  return (
    <div className="space-y-2">
      <Checkbox
        label={tr('Use template columns', 'استخدام أعمدة القالب')}
        checked={inherited}
        onChange={(checked) => setColumns(checked ? undefined : JSON.parse(JSON.stringify(columns)))}
      />
      {!inherited && columns.map((column, index) => (
        <div key={column.id} className="rounded border p-2">
          <div className="flex items-center gap-1">
            <Input className="h-8 flex-1" value={column.label} onChange={(event) => updateColumn(column.id, { label: event.target.value })} />
            <Button type="button" variant="ghost" size="icon" disabled={index === 0} onClick={() => {
              const next = [...columns];
              [next[index - 1], next[index]] = [next[index], next[index - 1]];
              setColumns(next);
            }}><ChevronUp className="h-3.5 w-3.5" /></Button>
            <Button type="button" variant="ghost" size="icon" disabled={index === columns.length - 1} onClick={() => {
              const next = [...columns];
              [next[index + 1], next[index]] = [next[index], next[index + 1]];
              setColumns(next);
            }}><ChevronDown className="h-3.5 w-3.5" /></Button>
            <Button type="button" variant="ghost" size="icon" onClick={() => setColumns(columns.filter((item) => item.id !== column.id))}>
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
          <div className="mt-2 grid grid-cols-3 gap-1">
            <Checkbox label={tr('Visible', 'مرئي')} checked={column.visible} onChange={(visible) => updateColumn(column.id, { visible })} />
            <Input className="h-8" type="number" min={1} max={100} value={column.width ?? ''} placeholder={tr('Width %', 'العرض %')} onChange={(event) => updateColumn(column.id, { width: event.target.value ? Number(event.target.value) : undefined })} />
            <Select value={column.align ?? 'left'} onValueChange={(align) => updateColumn(column.id, { align: align as InvoiceColumn['align'] })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="left">{tr('Left', 'يسار')}</SelectItem>
                <SelectItem value="center">{tr('Center', 'وسط')}</SelectItem>
                <SelectItem value="right">{tr('Right', 'يمين')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      ))}
      {!inherited && (
        <Button type="button" variant="outline" size="sm" onClick={() => setColumns([
          ...columns,
          { id: makeId(), key: 'custom', label: 'Custom', visible: true, width: 15, align: 'left' },
        ])}>
          {tr('Add custom column', 'إضافة عمود مخصص')}
        </Button>
      )}
    </div>
  );
}

function SpacingProperties({
  label,
  value,
  onChange,
}: {
  label: string;
  value: BlockStyle['margin'];
  onChange: (value: NonNullable<BlockStyle['margin']>) => void;
}) {
  return (
    <div>
      <Label className="text-xs">{label} (px)</Label>
      <div className="mt-1 grid grid-cols-4 gap-1">
        {(['top', 'right', 'bottom', 'left'] as const).map((side) => (
          <Input
            key={side}
            className="h-8 px-2"
            type="number"
            min={-200}
            max={500}
            title={side}
            aria-label={`${label} ${side}`}
            value={value?.[side] ?? ''}
            onChange={(event) => onChange({ ...value, [side]: event.target.value === '' ? undefined : Number(event.target.value) })}
          />
        ))}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={label}>
      <Input className="h-8 p-1" type="color" value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 text-xs">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}
