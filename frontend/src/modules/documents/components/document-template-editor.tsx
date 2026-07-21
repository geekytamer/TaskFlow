'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import {
  createDocumentTemplate, updateDocumentTemplate,
} from '@/services/documentService';
import {
  type DocumentTemplate, type DocumentType, type DocumentDataSource,
  type DocBlock, type DocumentModel, type Letterhead, type DocumentManualField,
  defaultLetterhead, emptyDocument,
} from '@/modules/documents/types';
import { SOURCE_TOKENS, COMPANY_TOKENS, GENERAL_TOKENS } from '@/modules/documents/tokens';
import { DocumentRenderer } from '@/modules/documents/document-renderer';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ArrowLeft, Plus, Trash2, ChevronUp, ChevronDown, Type, Heading, Image as ImageIcon, Minus, MoveVertical, Braces, Upload } from 'lucide-react';

const DOC_TYPES: DocumentType[] = ['letter', 'memo', 'quote', 'certificate', 'statement', 'custom'];
const DATA_SOURCES: DocumentDataSource[] = ['none', 'client', 'invoice', 'contact', 'delivery_note', 'opportunity', 'sales_order'];

let seq = 0;
const nid = () => `b${Date.now().toString(36)}${seq++}`;

function newBlock(type: DocBlock['type']): DocBlock {
  switch (type) {
    case 'heading': return { id: nid(), type: 'heading', text: 'Heading' };
    case 'text': return { id: nid(), type: 'text', text: 'Body text — use {{ }} to insert a field.' };
    case 'image': return { id: nid(), type: 'image', url: '', width: 160, align: 'left' };
    case 'divider': return { id: nid(), type: 'divider' };
    case 'spacer': return { id: nid(), type: 'spacer', height: 24 };
  }
}

export function DocumentTemplateEditor({
  template, onBack, onSaved,
}: {
  template: DocumentTemplate | null;
  onBack: () => void;
  onSaved: () => void;
}) {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);

  const [name, setName] = React.useState(template?.name ?? '');
  const [type, setType] = React.useState<DocumentType>(template?.type ?? 'letter');
  const [dataSource, setDataSource] = React.useState<DocumentDataSource>(template?.dataSource ?? 'none');
  const [manualFields, setManualFields] = React.useState<DocumentManualField[]>(template?.manualFields ?? []);
  const [letterhead, setLetterhead] = React.useState<Letterhead>(template?.letterhead ?? defaultLetterhead());
  const [doc, setDoc] = React.useState<DocumentModel>(template?.doc ?? emptyDocument());
  const [saving, setSaving] = React.useState(false);

  const blocks = doc.blocks;
  const setBlocks = (b: DocBlock[]) => setDoc((d) => ({ ...d, blocks: b }));
  const patchBlock = (id: string, patch: Partial<DocBlock>) =>
    setBlocks(blocks.map((b) => (b.id === id ? ({ ...b, ...patch } as DocBlock) : b)));
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= blocks.length) return;
    const next = [...blocks];
    [next[i], next[j]] = [next[j], next[i]];
    setBlocks(next);
  };

  const [focusedId, setFocusedId] = React.useState<string | null>(null);
  const insertToken = (token: string) => {
    const target = focusedId ?? [...blocks].reverse().find((b) => b.type === 'text' || b.type === 'heading')?.id;
    if (!target) {
      toast({ variant: 'destructive', title: tr('Add a text block first', 'أضف كتلة نص أولاً') });
      return;
    }
    const b = blocks.find((x) => x.id === target);
    if (b && (b.type === 'text' || b.type === 'heading')) patchBlock(target, { text: `${b.text}{{${token}}}` } as any);
  };

  const readFileAsDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Could not read file.'));
      reader.readAsDataURL(file);
    });

  const uploadLetterhead = async (file: File | null) => {
    if (!file) return;
    try {
      const dataUrl = await readFileAsDataUrl(file);
      let imageUrl = dataUrl;
      let sourcePdfUrl: string | undefined;
      if (dataUrl.startsWith('data:application/pdf')) {
        sourcePdfUrl = dataUrl;
        const { rasterizePdfFirstPage } = await import('@/lib/pdf-raster');
        imageUrl = await rasterizePdfFirstPage(dataUrl);
      }
      setLetterhead((lh) => ({ ...lh, firstPage: { imageUrl, sourcePdfUrl } }));
      toast({ title: tr('Letterhead set', 'تم تعيين الترويسة') });
    } catch (e: any) {
      toast({ variant: 'destructive', title: tr('Upload failed', 'فشل الرفع'), description: e?.message });
    }
  };

  const save = async () => {
    if (!selectedCompany) return;
    if (!name.trim()) { toast({ variant: 'destructive', title: tr('Name is required', 'الاسم مطلوب') }); return; }
    setSaving(true);
    const payload = { name: name.trim(), type, dataSource, letterhead, doc, manualFields: manualFields.filter((f) => f.key.trim() && f.label.trim()) };
    try {
      if (template) await updateDocumentTemplate(template.id, payload);
      else await createDocumentTemplate(selectedCompany.id, payload);
      toast({ title: tr('Template saved', 'تم حفظ القالب') });
      onSaved();
    } catch (e: any) {
      toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message });
    } finally { setSaving(false); }
  };

  // Preview context: show token labels as sample text so the design reads well.
  const previewCtx = React.useMemo(() => {
    const ctx: Record<string, string> = { 'company.name': selectedCompany?.name || 'Your Company', today: new Date().toLocaleDateString() };
    SOURCE_TOKENS[dataSource].forEach((t) => { ctx[t.token] = `[${t.label}]`; });
    manualFields.forEach((f) => { ctx[f.key] = `[${f.label}]`; });
    return ctx;
  }, [dataSource, manualFields, selectedCompany]);

  const box = letterhead.contentBox;
  const setBox = (k: keyof typeof box, v: number) => setLetterhead((lh) => ({ ...lh, contentBox: { ...lh.contentBox, [k]: v } }));

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="me-2 h-4 w-4" />{tr('Back', 'رجوع')}</Button>
          <h3 className="text-lg font-semibold">{template ? tr('Edit template', 'تعديل القالب') : tr('New template', 'قالب جديد')}</h3>
        </div>
        <Button onClick={save} disabled={saving}>{saving ? tr('Saving…', 'جارٍ الحفظ…') : tr('Save template', 'حفظ القالب')}</Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_460px]">
        {/* Left: settings + blocks */}
        <div className="flex flex-col gap-4">
          <div className="grid gap-3 sm:grid-cols-2 rounded-lg border bg-card p-4">
            <div className="grid gap-1.5 sm:col-span-2">
              <Label className="text-xs">{tr('Name', 'الاسم')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('e.g. Payment reminder', 'مثال: تذكير بالدفع')} />
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">{tr('Type', 'النوع')}</Label>
              <Select value={type} onValueChange={(v) => setType(v as DocumentType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DOC_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label className="text-xs">{tr('Merge data from', 'دمج البيانات من')}</Label>
              <Select value={dataSource} onValueChange={(v) => setDataSource(v as DocumentDataSource)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{DATA_SOURCES.map((s) => <SelectItem key={s} value={s}>{s === 'none' ? tr('No record', 'بدون سجل') : s}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>

          {/* Letterhead */}
          <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-semibold">{tr('Letterhead', 'الترويسة')}</Label>
              <label>
                <input type="file" accept="application/pdf,image/*" className="hidden" onChange={(e) => uploadLetterhead(e.target.files?.[0] ?? null)} />
                <Button variant="outline" size="sm" asChild><span><Upload className="me-2 h-3.5 w-3.5" />{letterhead.firstPage?.imageUrl ? tr('Replace', 'استبدال') : tr('Upload PDF/image', 'رفع PDF/صورة')}</span></Button>
              </label>
            </div>
            <p className="text-xs text-muted-foreground">{tr('Content box margins (mm) — the safe area between the printed header and footer.', 'هوامش صندوق المحتوى (مم) — المنطقة الآمنة بين الترويسة والتذييل.')}</p>
            <div className="grid grid-cols-4 gap-2">
              {(['top', 'right', 'bottom', 'left'] as const).map((k) => (
                <div key={k} className="grid gap-1">
                  <Label className="text-[10px] uppercase text-muted-foreground">{k}</Label>
                  <Input type="number" value={box[k]} onChange={(e) => setBox(k, Number(e.target.value))} />
                </div>
              ))}
            </div>
          </div>

          {/* Manual fields */}
          <div className="rounded-lg border bg-card p-4 flex flex-col gap-2">
            <Label className="text-sm font-semibold">{tr('Manual fields', 'حقول يدوية')}</Label>
            <p className="text-xs text-muted-foreground">{tr('Fill-in blanks entered when creating a document, e.g. {{ref}}.', 'حقول تُملأ عند إنشاء المستند، مثل {{ref}}.')}</p>
            {manualFields.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input className="w-32" placeholder={tr('key', 'المفتاح')} value={f.key} onChange={(e) => setManualFields((p) => p.map((x, j) => j === i ? { ...x, key: e.target.value.replace(/[^\w]/g, '') } : x))} />
                <Input className="flex-1" placeholder={tr('Label', 'التسمية')} value={f.label} onChange={(e) => setManualFields((p) => p.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                <Button variant="ghost" size="icon" onClick={() => setManualFields((p) => p.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="self-start" onClick={() => setManualFields((p) => [...p, { key: '', label: '' }])}><Plus className="me-2 h-3.5 w-3.5" />{tr('Add field', 'إضافة حقل')}</Button>
          </div>

          {/* Blocks */}
          <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-sm font-semibold">{tr('Content', 'المحتوى')}</Label>
              <div className="flex items-center gap-1">
                <Button variant="outline" size="sm" onClick={() => setBlocks([...blocks, newBlock('heading')])}><Heading className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="sm" onClick={() => setBlocks([...blocks, newBlock('text')])}><Type className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="sm" onClick={() => setBlocks([...blocks, newBlock('image')])}><ImageIcon className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="sm" onClick={() => setBlocks([...blocks, newBlock('divider')])}><Minus className="h-3.5 w-3.5" /></Button>
                <Button variant="outline" size="sm" onClick={() => setBlocks([...blocks, newBlock('spacer')])}><MoveVertical className="h-3.5 w-3.5" /></Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild><Button variant="secondary" size="sm"><Braces className="me-1 h-3.5 w-3.5" />{tr('Field', 'حقل')}</Button></DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="max-h-80 overflow-y-auto">
                    {dataSource !== 'none' && <>
                      <DropdownMenuLabel>{dataSource}</DropdownMenuLabel>
                      {SOURCE_TOKENS[dataSource].map((t) => <DropdownMenuItem key={t.token} onClick={() => insertToken(t.token)}>{t.label}</DropdownMenuItem>)}
                      <DropdownMenuSeparator />
                    </>}
                    {manualFields.filter((f) => f.key).length > 0 && <>
                      <DropdownMenuLabel>{tr('Manual', 'يدوي')}</DropdownMenuLabel>
                      {manualFields.filter((f) => f.key).map((f) => <DropdownMenuItem key={f.key} onClick={() => insertToken(f.key)}>{f.label || f.key}</DropdownMenuItem>)}
                      <DropdownMenuSeparator />
                    </>}
                    <DropdownMenuLabel>{tr('Company', 'الشركة')}</DropdownMenuLabel>
                    {COMPANY_TOKENS.map((t) => <DropdownMenuItem key={t.token} onClick={() => insertToken(t.token)}>{t.label}</DropdownMenuItem>)}
                    <DropdownMenuSeparator />
                    {GENERAL_TOKENS.map((t) => <DropdownMenuItem key={t.token} onClick={() => insertToken(t.token)}>{t.label}</DropdownMenuItem>)}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {blocks.length === 0 && <p className="text-sm text-muted-foreground py-4 text-center">{tr('Add content blocks above.', 'أضف كتل المحتوى بالأعلى.')}</p>}
            {blocks.map((b, i) => (
              <div key={b.id} className="rounded-md border p-2 flex items-start gap-2">
                <div className="flex flex-col gap-1 pt-1">
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(i, -1)}><ChevronUp className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => move(i, 1)}><ChevronDown className="h-3.5 w-3.5" /></Button>
                </div>
                <div className="flex-1">
                  {(b.type === 'heading' || b.type === 'text') && (
                    <Textarea rows={b.type === 'heading' ? 1 : 3} value={b.text} onFocus={() => setFocusedId(b.id)}
                      onChange={(e) => patchBlock(b.id, { text: e.target.value } as any)} className="text-sm" />
                  )}
                  {b.type === 'image' && (
                    <div className="flex items-center gap-2">
                      <Input placeholder={tr('Image URL or data URL', 'رابط الصورة')} value={b.url} onChange={(e) => patchBlock(b.id, { url: e.target.value } as any)} />
                      <Input type="number" className="w-24" value={b.width ?? 160} onChange={(e) => patchBlock(b.id, { width: Number(e.target.value) } as any)} />
                    </div>
                  )}
                  {b.type === 'divider' && <p className="text-xs text-muted-foreground">{tr('Divider line', 'خط فاصل')}</p>}
                  {b.type === 'spacer' && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground">{tr('Spacer height', 'ارتفاع الفراغ')}</span>
                      <Input type="number" className="w-24" value={b.height ?? 24} onChange={(e) => patchBlock(b.id, { height: Number(e.target.value) } as any)} />
                    </div>
                  )}
                </div>
                <Button variant="ghost" size="icon" onClick={() => setBlocks(blocks.filter((x) => x.id !== b.id))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        </div>

        {/* Right: live preview */}
        <div className="lg:sticky lg:top-4 self-start">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{tr('Preview', 'معاينة')}</p>
          <DocumentRenderer doc={doc} letterhead={letterhead} ctx={previewCtx} scale={0.56} />
        </div>
      </div>
    </div>
  );
}
