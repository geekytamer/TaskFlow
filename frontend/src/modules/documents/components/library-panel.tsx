'use client';

import * as React from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import {
  Download, Eye, File, FileImage, FilePlus2, FileSpreadsheet, FileText, FolderInput, Library, Search, Trash2, Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { usePermissions } from '@/context/permissions-context';
import { useToast } from '@/hooks/use-toast';
import { downloadDocumentPdf } from '@/services/documentService';
import {
  deleteRecordAttachment, downloadRecordAttachment, readFileAsDataUrl, viewRecordAttachment,
} from '@/services/financeService';
import { getLibrary, updateLibraryFile, uploadToLibrary, type LibraryItem } from '@/services/libraryService';

const MAX_BYTES = 20 * 1024 * 1024;

/** Where a file came from, as the filter offers it. */
const SOURCES: Array<{ value: string; en: string; ar: string }> = [
  { value: 'company', en: 'Uploaded to the library', ar: 'مرفوع للمكتبة' },
  { value: 'document', en: 'Created documents', ar: 'مستندات منشأة' },
  { value: 'task', en: 'Tasks', ar: 'المهام' },
  { value: 'project', en: 'Projects', ar: 'المشاريع' },
  { value: 'contact', en: 'Contacts', ar: 'جهات الاتصال' },
  { value: 'client', en: 'Clients', ar: 'العملاء' },
  { value: 'supplier', en: 'Suppliers', ar: 'الموردون' },
  { value: 'opportunity', en: 'Opportunities', ar: 'الفرص' },
  { value: 'quotation', en: 'Quotations', ar: 'عروض الأسعار' },
  { value: 'sales_order', en: 'Sales orders', ar: 'أوامر البيع' },
  { value: 'invoice', en: 'Invoices', ar: 'الفواتير' },
  { value: 'vendor_bill', en: 'Supplier bills', ar: 'فواتير الموردين' },
  { value: 'purchase_order', en: 'Purchase orders', ar: 'أوامر الشراء' },
  { value: 'inventory_item', en: 'Items', ar: 'الأصناف' },
  { value: 'employee', en: 'Employees', ar: 'الموظفون' },
  { value: 'campaign', en: 'Campaigns', ar: 'الحملات' },
];

const sizeLabel = (bytes?: number) => {
  if (bytes === undefined) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const FileIcon = ({ item }: { item: LibraryItem }) => {
  const type = item.mimeType ?? '';
  const name = item.name.toLowerCase();
  const className = 'h-4 w-4 shrink-0 text-muted-foreground';
  if (type.startsWith('image/')) return <FileImage className={className} aria-hidden />;
  if (type.includes('sheet') || type.includes('excel') || /\.(xlsx?|csv)$/.test(name)) return <FileSpreadsheet className={className} aria-hidden />;
  if (type === 'application/pdf' || type.includes('word') || /\.(pdf|docx?)$/.test(name)) return <FileText className={className} aria-hidden />;
  return <File className={className} aria-hidden />;
};

export function LibraryPanel({ onNewDocument }: { onNewDocument?: () => void } = {}) {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const confirm = useConfirm();
  const { can } = usePermissions();
  const canUpload = can('documents.create');
  const canEdit = can('documents.edit');
  const canDelete = can('documents.delete');
  const companyId = selectedCompany?.id;

  const [q, setQ] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [source, setSource] = React.useState('all');
  const [folder, setFolder] = React.useState('all');
  const [items, setItems] = React.useState<LibraryItem[]>([]);
  const [folders, setFolders] = React.useState<string[]>([]);
  const [truncated, setTruncated] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [uploadOpen, setUploadOpen] = React.useState(false);
  const [moving, setMoving] = React.useState<LibraryItem | null>(null);
  const requestRef = React.useRef(0);

  // Search as you type, without a request per key.
  React.useEffect(() => {
    const timer = setTimeout(() => setQuery(q), 250);
    return () => clearTimeout(timer);
  }, [q]);

  const load = React.useCallback(async () => {
    if (!companyId) return;
    const request = ++requestRef.current;
    setLoading(true);
    try {
      const page = await getLibrary(companyId, {
        q: query,
        source: source === 'all' ? undefined : source,
        folder: folder === 'all' ? undefined : folder,
      });
      if (request !== requestRef.current) return;
      setItems(page.items);
      setFolders(page.folders);
      setTruncated(page.truncated);
    } catch (error: any) {
      if (request !== requestRef.current) return;
      setItems([]);
      toast({ variant: 'destructive', title: tr('Library could not be loaded', 'تعذّر تحميل المكتبة'), description: error?.message });
    } finally {
      if (request === requestRef.current) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, query, source, folder, toast]);

  React.useEffect(() => { load(); }, [load]);

  const open = async (item: LibraryItem) => {
    try {
      if (item.kind === 'document') await downloadDocumentPdf(item.id, item.name);
      else if (item.hasContent) await viewRecordAttachment(item.id);
      else if (item.url) window.open(item.url, '_blank', 'noopener,noreferrer');
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not open the file', 'تعذّر فتح الملف'), description: error?.message });
    }
  };

  const download = async (item: LibraryItem) => {
    try {
      if (item.kind === 'document') await downloadDocumentPdf(item.id, item.name);
      else await downloadRecordAttachment(item.id, item.name);
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not download the file', 'تعذّر تنزيل الملف'), description: error?.message });
    }
  };

  const remove = async (item: LibraryItem) => {
    const ok = await confirm({
      title: tr('Delete this file?', 'حذف هذا الملف؟'),
      description: item.recordLabel
        ? tr(`It is also removed from ${item.recordLabel}.`, `سيُحذف أيضاً من ${item.recordLabel}.`)
        : undefined,
      confirmText: tr('Delete', 'حذف'),
    });
    if (!ok) return;
    try {
      await deleteRecordAttachment(item.id);
      load();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not delete the file', 'تعذّر حذف الملف'), description: error?.message });
    }
  };

  const sourceLabel = (item: LibraryItem) => {
    if (item.kind === 'document') return tr('Created document', 'مستند منشأ');
    const found = SOURCES.find((s) => s.value === item.entityType);
    if (item.entityType === 'company') return tr('Library', 'المكتبة');
    return found ? tr(found.en, found.ar) : item.entityType;
  };

  const filtered = query || source !== 'all' || folder !== 'all';

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="relative min-w-[14rem] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder={tr('Search by file, client, project or folder', 'ابحث باسم الملف أو العميل أو المشروع أو المجلد')}
            className="ps-9"
            aria-label={tr('Search the library', 'البحث في المكتبة')}
            dir="auto"
          />
        </div>
        <Select value={source} onValueChange={setSource}>
          <SelectTrigger className="w-48" aria-label={tr('From', 'المصدر')}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr('From anywhere', 'من كل مكان')}</SelectItem>
            {SOURCES.map((s) => <SelectItem key={s.value} value={s.value}>{tr(s.en, s.ar)}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={folder} onValueChange={setFolder}>
          <SelectTrigger className="w-44" aria-label={tr('Folder', 'المجلد')}><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{tr('All folders', 'كل المجلدات')}</SelectItem>
            {folders.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
          </SelectContent>
        </Select>
        {onNewDocument && (
          <Button variant="outline" onClick={onNewDocument}>
            <FilePlus2 className="me-2 h-4 w-4" aria-hidden />
            {tr('New document', 'مستند جديد')}
          </Button>
        )}
        {canUpload && (
          <Button onClick={() => setUploadOpen(true)}>
            <Upload className="me-2 h-4 w-4" aria-hidden />
            {tr('Upload', 'رفع ملف')}
          </Button>
        )}
      </div>

      {truncated && (
        <p className="text-xs text-muted-foreground">
          {tr('Showing the newest 500 files. Search or filter to find older ones.', 'تظهر أحدث ٥٠٠ ملف. ابحث أو استخدم الفلاتر للوصول للأقدم.')}
        </p>
      )}

      {loading && !items.length ? (
        <Skeleton className="h-48 w-full rounded-lg" />
      ) : !items.length ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <Library className="mx-auto mb-2 h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="font-medium">
            {filtered ? tr('No files match', 'لا توجد ملفات مطابقة') : tr('The library is empty', 'المكتبة فارغة')}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
            {filtered
              ? tr('Try another word or clear the filters.', 'جرّب كلمة أخرى أو امسح الفلاتر.')
              : tr(
                'Files attached to tasks, clients, invoices and projects show up here, along with documents you create. Upload company papers straight to the library.',
                'الملفات المرفقة على المهام والعملاء والفواتير والمشاريع تظهر هنا، مع المستندات اللي تنشئها. ارفع أوراق الشركة مباشرة للمكتبة.',
              )}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{tr('Name', 'الاسم')}</TableHead>
                <TableHead>{tr('From', 'المصدر')}</TableHead>
                <TableHead>{tr('Folder', 'المجلد')}</TableHead>
                <TableHead>{tr('Added by', 'أضافه')}</TableHead>
                <TableHead>{tr('Date', 'التاريخ')}</TableHead>
                <TableHead className="text-end">{tr('Size', 'الحجم')}</TableHead>
                <TableHead className="text-end">{tr('Actions', 'الإجراءات')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={`${item.kind}-${item.id}`}>
                  <TableCell>
                    <button
                      type="button"
                      onClick={() => open(item)}
                      className="flex max-w-[22rem] items-center gap-2 text-start font-medium hover:underline"
                    >
                      <FileIcon item={item} />
                      <bdi className="truncate">{item.name}</bdi>
                    </button>
                  </TableCell>
                  <TableCell>
                    <div className="text-xs text-muted-foreground">{sourceLabel(item)}</div>
                    {item.recordLabel && (item.route ? (
                      <Link href={item.route} className="text-sm hover:underline"><bdi>{item.recordLabel}</bdi></Link>
                    ) : (
                      <span className="text-sm"><bdi>{item.recordLabel}</bdi></span>
                    ))}
                  </TableCell>
                  <TableCell>{item.folder ? <Badge variant="secondary"><bdi>{item.folder}</bdi></Badge> : null}</TableCell>
                  <TableCell className="text-sm text-muted-foreground"><bdi>{item.uploadedByName ?? ''}</bdi></TableCell>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{format(item.createdAt, 'd MMM yyyy')}</TableCell>
                  <TableCell className="whitespace-nowrap text-end text-sm tabular-nums text-muted-foreground">{sizeLabel(item.sizeBytes)}</TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-1">
                      {(item.kind === 'document' || item.hasContent || item.url) && (
                        <Button size="icon" variant="ghost" onClick={() => open(item)} aria-label={tr('Open', 'فتح')} title={tr('Open', 'فتح')}>
                          <Eye className="h-4 w-4" aria-hidden />
                        </Button>
                      )}
                      {(item.kind === 'document' || item.hasContent) && (
                        <Button size="icon" variant="ghost" onClick={() => download(item)} aria-label={tr('Download', 'تنزيل')} title={tr('Download', 'تنزيل')}>
                          <Download className="h-4 w-4" aria-hidden />
                        </Button>
                      )}
                      {canEdit && item.kind === 'attachment' && (
                        <Button size="icon" variant="ghost" onClick={() => setMoving(item)} aria-label={tr('Rename or move to folder', 'إعادة التسمية أو النقل لمجلد')} title={tr('Rename or move to folder', 'إعادة التسمية أو النقل لمجلد')}>
                          <FolderInput className="h-4 w-4" aria-hidden />
                        </Button>
                      )}
                      {canDelete && item.kind === 'attachment' && (
                        <Button size="icon" variant="ghost" onClick={() => remove(item)} aria-label={tr('Delete', 'حذف')} title={tr('Delete', 'حذف')}>
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {companyId && (
        <UploadDialog
          open={uploadOpen}
          onOpenChange={setUploadOpen}
          companyId={companyId}
          folders={folders}
          defaultFolder={folder === 'all' ? '' : folder}
          onUploaded={load}
        />
      )}
      <MoveDialog item={moving} folders={folders} onClose={() => setMoving(null)} onSaved={load} />
    </div>
  );
}

function UploadDialog({
  open, onOpenChange, companyId, folders, defaultFolder, onUploaded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  folders: string[];
  defaultFolder: string;
  onUploaded: () => void;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [files, setFiles] = React.useState<File[]>([]);
  const [folder, setFolder] = React.useState(defaultFolder);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) { setFiles([]); setFolder(defaultFolder); }
  }, [open, defaultFolder]);

  const tooBig = files.filter((f) => f.size > MAX_BYTES);

  const submit = async () => {
    if (!files.length || tooBig.length) return;
    setSaving(true);
    try {
      for (const file of files) {
        await uploadToLibrary(companyId, {
          fileName: file.name,
          mimeType: file.type || undefined,
          sizeBytes: file.size,
          contentBase64: await readFileAsDataUrl(file),
          folder: folder.trim() || undefined,
        });
      }
      toast({ title: files.length === 1 ? tr('File uploaded', 'تم رفع الملف') : tr(`${files.length} files uploaded`, `تم رفع ${files.length} ملفات`) });
      onOpenChange(false);
      onUploaded();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Upload failed', 'فشل الرفع'), description: error?.message });
      onUploaded();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr('Upload to the library', 'رفع ملف للمكتبة')}</DialogTitle>
          <DialogDescription>
            {tr('Company papers, contracts, profiles — anything the team needs to find later. Up to 20 MB per file.', 'أوراق الشركة، العقود، البروفايلات — أي شيء يحتاجه الفريق لاحقاً. حتى ٢٠ ميغا للملف.')}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="library-files">{tr('Files', 'الملفات')}</Label>
            <Input id="library-files" type="file" multiple onChange={(event) => setFiles(Array.from(event.target.files ?? []))} />
            {tooBig.length > 0 && (
              <p className="text-xs text-destructive">
                {tr('Over 20 MB: ', 'أكبر من ٢٠ ميغا: ')}<bdi>{tooBig.map((f) => f.name).join('، ')}</bdi>
              </p>
            )}
          </div>
          <div className="space-y-1">
            <Label htmlFor="library-folder">{tr('Folder (optional)', 'المجلد (اختياري)')}</Label>
            <Input id="library-folder" list="library-folders" value={folder} onChange={(event) => setFolder(event.target.value)} placeholder={tr('e.g. Contracts', 'مثلاً: عقود')} dir="auto" maxLength={80} />
            <datalist id="library-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{tr('Cancel', 'إلغاء')}</Button>
          <Button onClick={submit} disabled={saving || !files.length || tooBig.length > 0}>
            {saving ? tr('Uploading…', 'جارٍ الرفع…') : tr('Upload', 'رفع')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MoveDialog({
  item, folders, onClose, onSaved,
}: {
  item: LibraryItem | null;
  folders: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [name, setName] = React.useState('');
  const [folder, setFolder] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (item) { setName(item.name); setFolder(item.folder ?? ''); }
  }, [item]);

  const save = async () => {
    if (!item || !name.trim()) return;
    setSaving(true);
    try {
      await updateLibraryFile(item.id, { fileName: name.trim(), folder: folder.trim() });
      onClose();
      onSaved();
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not save', 'تعذّر الحفظ'), description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={Boolean(item)} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr('Rename or move', 'إعادة التسمية أو النقل')}</DialogTitle>
          <DialogDescription>{tr('Leave the folder empty to take the file out of its folder.', 'اترك المجلد فارغاً لإخراج الملف من مجلده.')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="library-name">{tr('File name', 'اسم الملف')}</Label>
            <Input id="library-name" value={name} onChange={(event) => setName(event.target.value)} dir="auto" maxLength={200} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="library-move-folder">{tr('Folder', 'المجلد')}</Label>
            <Input id="library-move-folder" list="library-move-folders" value={folder} onChange={(event) => setFolder(event.target.value)} dir="auto" maxLength={80} />
            <datalist id="library-move-folders">{folders.map((f) => <option key={f} value={f} />)}</datalist>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{tr('Cancel', 'إلغاء')}</Button>
          <Button onClick={save} disabled={saving || !name.trim()}>{saving ? tr('Saving…', 'جارٍ الحفظ…') : tr('Save', 'حفظ')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
