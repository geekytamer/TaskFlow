'use client';

import * as React from 'react';
import { DragDropContext, Droppable, Draggable, type DropResult } from '@hello-pangea/dnd';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { updateInvoiceTemplate } from '@/services/financeService';
import type { InvoiceTemplate, Invoice, Client } from '../types';
import type { Company } from '@/modules/companies/types';
import { DocRenderer } from '../doc/doc-renderer';
import { templateToDoc } from '../doc/template-to-doc';
import { TOKEN_GROUPS } from '../doc/tokens';
import type { Block, BlockStyle, InvoiceDoc } from '../doc/types';
import {
  ArrowLeft, GripVertical, Trash2, Type, Heading1, Image as ImageIcon, Minus, MoveVertical,
  Table2, Calculator, ListTree, Banknote, PenLine, QrCode, FileText, Square,
} from 'lucide-react';

const makeId = () =>
  (typeof crypto !== 'undefined' && 'randomUUID' in crypto) ? crypto.randomUUID() : `b-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const BLOCK_DEFAULTS: Record<string, () => Block> = {
  heading: () => ({ id: makeId(), type: 'heading', level: 2, content: 'Heading' }),
  text: () => ({ id: makeId(), type: 'text', content: 'Text — use {{invoice.number}} tokens.' }),
  image: () => ({ id: makeId(), type: 'image', binding: 'logo', height: 56 }),
  divider: () => ({ id: makeId(), type: 'divider', style: { margin: { top: 12, bottom: 12 } } }),
  spacer: () => ({ id: makeId(), type: 'spacer', height: 24 }),
  shape: () => ({ id: makeId(), type: 'shape', height: 8 }),
  lineItems: () => ({ id: makeId(), type: 'lineItems', style: { margin: { top: 16 } } }),
  totals: () => ({ id: makeId(), type: 'totals', style: { margin: { top: 16 } } }),
  details: () => ({ id: makeId(), type: 'details', title: 'Bill To', fields: [{ label: '', value: '{{client.name}}' }, { label: '', value: '{{client.address}}' }] }),
  payment: () => ({ id: makeId(), type: 'payment', style: { margin: { top: 24 } } }),
  signature: () => ({ id: makeId(), type: 'signature', style: { margin: { top: 32 } } }),
  qr: () => ({ id: makeId(), type: 'qr', style: { align: 'center', margin: { top: 24 } } }),
  pageBreak: () => ({ id: makeId(), type: 'pageBreak' }),
};

const PALETTE: { type: string; label: string; icon: React.ElementType }[] = [
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

const blockSummary = (b: Block): string => {
  switch (b.type) {
    case 'heading': return `Heading — “${b.content}”`;
    case 'text': return `Text — “${b.content.slice(0, 28)}${b.content.length > 28 ? '…' : ''}”`;
    case 'image': return `Image (${b.binding || 'custom'})`;
    case 'details': return `Details — ${b.title || 'fields'}`;
    case 'container': return `Group (${b.layout}, ${b.children.length})`;
    default: return b.type.charAt(0).toUpperCase() + b.type.slice(1);
  }
};

// Sample data so the preview shows a realistic invoice.
const sampleInvoice = {
  id: 'preview', invoiceNumber: 'INV-0042', companyId: 'p', clientId: 'p',
  issueDate: new Date(), dueDate: new Date(Date.now() + 30 * 86400000),
  status: 'Sent', currency: 'USD', taxRate: 5, total: 2257.5,
  lineItems: [
    { itemType: 'Manual', sku: 'A-1', description: 'Design & build', quantity: 1, unitPrice: 1500, amount: 1500 },
    { itemType: 'Manual', sku: 'A-2', description: 'Support retainer', quantity: 3, unitPrice: 250, amount: 750 },
  ],
} as unknown as Invoice;
const sampleClient = { id: 'p', name: 'Acme Trading LLC', address: 'Business Bay\nDubai, UAE', email: 'pay@acme.example' } as unknown as Client;

interface InvoiceDesignerProps {
  template: InvoiceTemplate;
  company?: Company | null;
  onClose: () => void;
  onSaved: () => void;
}

export function InvoiceDesigner({ template, company, onClose, onSaved }: InvoiceDesignerProps) {
  const { toast } = useToast();
  const [doc, setDoc] = React.useState<InvoiceDoc>(() => template.doc ?? templateToDoc(template));
  const [selectedId, setSelectedId] = React.useState<string | null>(doc.body[0]?.id ?? null);
  const [saving, setSaving] = React.useState(false);

  const body = doc.body;
  const findBlock = (id: string | null): Block | undefined => {
    if (!id) return undefined;
    const walk = (blocks: Block[]): Block | undefined => {
      for (const b of blocks) {
        if (b.id === id) return b;
        if (b.type === 'container') { const f = walk(b.children); if (f) return f; }
      }
      return undefined;
    };
    return walk(body);
  };
  const selected = findBlock(selectedId);

  const updateBlock = (id: string, patch: Partial<Block>) => {
    const walk = (blocks: Block[]): Block[] => blocks.map((b) => {
      if (b.id === id) return { ...b, ...patch } as Block;
      if (b.type === 'container') return { ...b, children: walk(b.children) };
      return b;
    });
    setDoc((d) => ({ ...d, body: walk(d.body) }));
  };
  const updateStyle = (id: string, patch: BlockStyle) => {
    const cur = findBlock(id);
    updateBlock(id, { style: { ...(cur?.style || {}), ...patch } } as Partial<Block>);
  };
  const addBlock = (type: string) => {
    const block = BLOCK_DEFAULTS[type]?.();
    if (!block) return;
    setDoc((d) => ({ ...d, body: [...d.body, block] }));
    setSelectedId(block.id);
  };
  const removeBlock = (id: string) => {
    setDoc((d) => ({ ...d, body: d.body.filter((b) => b.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  };
  const onDragEnd = (r: DropResult) => {
    if (!r.destination) return;
    setDoc((d) => {
      const next = [...d.body];
      const [moved] = next.splice(r.source.index, 1);
      next.splice(r.destination!.index, 0, moved);
      return { ...d, body: next };
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateInvoiceTemplate(template.id, { doc } as any);
      toast({ title: 'Design saved' });
      onSaved();
    } catch (e: any) {
      toast({ variant: 'destructive', title: 'Save failed', description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-9rem)] flex-col gap-3">
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={onClose}><ArrowLeft className="me-1 h-4 w-4" />Back to settings</Button>
        <div className="text-sm font-medium">Designing: {template.name}</div>
        <Button size="sm" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save design'}</Button>
      </div>

      <div className="grid flex-1 gap-3 overflow-hidden lg:grid-cols-[180px_260px_1fr]">
        {/* Palette */}
        <div className="overflow-y-auto rounded-lg border p-2">
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Add block</p>
          <div className="grid grid-cols-2 gap-1.5">
            {PALETTE.map((p) => (
              <button key={p.type} onClick={() => addBlock(p.type)}
                className="flex flex-col items-center gap-1 rounded-md border p-2 text-[11px] hover:bg-muted">
                <p.icon className="h-4 w-4 text-muted-foreground" />{p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Block list (reorder) */}
        <div className="overflow-y-auto rounded-lg border p-2">
          <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Layout</p>
          <DragDropContext onDragEnd={onDragEnd}>
            <Droppable droppableId="body">
              {(prov) => (
                <div ref={prov.innerRef} {...prov.droppableProps} className="space-y-1.5">
                  {body.map((b, i) => (
                    <Draggable key={b.id} draggableId={b.id} index={i}>
                      {(p) => (
                        <div ref={p.innerRef} {...p.draggableProps}
                          onClick={() => setSelectedId(b.id)}
                          className={`flex items-center gap-1.5 rounded-md border p-2 text-xs ${selectedId === b.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}>
                          <span {...p.dragHandleProps}><GripVertical className="h-3.5 w-3.5 text-muted-foreground" /></span>
                          <span className="flex-1 truncate">{blockSummary(b)}</span>
                          <button onClick={(e) => { e.stopPropagation(); removeBlock(b.id); }} className="text-muted-foreground hover:text-destructive">
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {prov.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
          {body.length === 0 && <p className="px-1 text-xs text-muted-foreground">Add blocks from the left.</p>}
        </div>

        {/* Preview + properties */}
        <div className="grid gap-3 overflow-hidden xl:grid-cols-[1fr_280px]">
          <div className="overflow-y-auto rounded-lg border bg-muted/30 p-4">
            <div className="mx-auto w-[760px] max-w-full bg-white shadow-sm">
              <DocRenderer doc={doc} invoice={sampleInvoice} client={sampleClient} company={company} template={template} />
            </div>
          </div>
          <div className="overflow-y-auto rounded-lg border p-3">
            {!selected ? (
              <p className="text-xs text-muted-foreground">Select a block to edit its content and style.</p>
            ) : (
              <BlockProperties block={selected} onChange={(patch) => updateBlock(selected.id, patch)} onStyle={(s) => updateStyle(selected.id, s)} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BlockProperties({ block, onChange, onStyle }: { block: Block; onChange: (p: Partial<Block>) => void; onStyle: (s: BlockStyle) => void }) {
  const style = block.style || {};
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{block.type}</div>

      {/* Content */}
      {(block.type === 'text' || block.type === 'heading') && (
        <div className="space-y-1">
          <Label className="text-xs">Content</Label>
          <Textarea rows={3} value={(block as any).content}
            onChange={(e) => onChange({ content: e.target.value } as Partial<Block>)} />
          <details className="text-[11px] text-muted-foreground">
            <summary className="cursor-pointer">Data tokens</summary>
            <div className="mt-1 space-y-1">
              {TOKEN_GROUPS.map((g) => (
                <div key={g.group}><span className="font-medium">{g.group}:</span> {g.tokens.map((t) => `{{${t.token}}}`).join(', ')}</div>
              ))}
            </div>
          </details>
        </div>
      )}
      {block.type === 'heading' && (
        <div className="space-y-1">
          <Label className="text-xs">Level</Label>
          <Select value={String((block as any).level)} onValueChange={(v) => onChange({ level: Number(v) } as Partial<Block>)}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>{[1, 2, 3].map((l) => <SelectItem key={l} value={String(l)}>H{l}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      )}
      {block.type === 'image' && (
        <div className="space-y-1">
          <Label className="text-xs">Source</Label>
          <Select value={(block as any).binding || 'logo'} onValueChange={(v) => onChange({ binding: v } as Partial<Block>)}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              {['logo', 'stamp', 'signature', 'header', 'footer'].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
            </SelectContent>
          </Select>
          <Label className="text-xs">Height (px)</Label>
          <Input className="h-8" type="number" value={(block as any).height ?? 56} onChange={(e) => onChange({ height: Number(e.target.value) } as Partial<Block>)} />
        </div>
      )}
      {block.type === 'spacer' && (
        <div className="space-y-1">
          <Label className="text-xs">Height (px)</Label>
          <Input className="h-8" type="number" value={(block as any).height ?? 24} onChange={(e) => onChange({ height: Number(e.target.value) } as Partial<Block>)} />
        </div>
      )}
      {block.type === 'qr' && (
        <div className="space-y-1">
          <Label className="text-xs">Caption</Label>
          <Input className="h-8" value={(block as any).caption ?? ''} onChange={(e) => onChange({ caption: e.target.value } as Partial<Block>)} placeholder="Scan to view & download" />
        </div>
      )}

      {/* Common style */}
      <div className="border-t pt-3 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Align</Label>
            <Select value={style.align ?? 'left'} onValueChange={(v) => onStyle({ align: v as BlockStyle['align'] })}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>{['left', 'center', 'right'].map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Font size</Label>
            <Input className="h-8" type="number" value={style.fontSize ?? ''} placeholder="14" onChange={(e) => onStyle({ fontSize: e.target.value ? Number(e.target.value) : undefined })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Text color</Label>
            <Input className="h-8 p-1" type="color" value={style.color ?? '#0f172a'} onChange={(e) => onStyle({ color: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Background</Label>
            <Input className="h-8 p-1" type="color" value={style.background ?? '#ffffff'} onChange={(e) => onStyle({ background: e.target.value })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Margin top</Label>
            <Input className="h-8" type="number" value={style.margin?.top ?? ''} placeholder="0" onChange={(e) => onStyle({ margin: { ...style.margin, top: Number(e.target.value) } })} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Margin bottom</Label>
            <Input className="h-8" type="number" value={style.margin?.bottom ?? ''} placeholder="0" onChange={(e) => onStyle({ margin: { ...style.margin, bottom: Number(e.target.value) } })} />
          </div>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input type="checkbox" checked={style.fontWeight === 700} onChange={(e) => onStyle({ fontWeight: e.target.checked ? 700 : 400 })} /> Bold
        </label>
      </div>
    </div>
  );
}
