'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import {
  getRecipes, createRecipe, updateRecipe, deleteRecipe,
  getWorkOrders, createWorkOrder, updateWorkOrder, completeWorkOrder, cancelWorkOrder, deleteWorkOrder,
  getInventoryItems,
  type Recipe, type WorkOrder, type WorkOrderStatus,
} from '@/services/operationsService';
import type { InventoryItem } from '@/modules/operations/types';
import { SectionPageShell } from '@/modules/operations/components/section-page-shell';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger, SheetFooter,
} from '@/components/ui/sheet';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Factory, FlaskConical, CheckCircle2, Ban, Pencil } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';

function num(n: number) {
  return n.toLocaleString(undefined, { maximumFractionDigits: 3 });
}
function money(n: number) {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ---------------- Recipes ---------------- */

/** Creates a recipe, or edits one when `recipe` is given (then it opens from the row's edit button). */
function RecipeSheet({ items, onCreated, recipe, open: openProp, onOpenChange }: {
  items: InventoryItem[]; onCreated: () => void; recipe?: Recipe; open?: boolean; onOpenChange?: (open: boolean) => void;
}) {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [openState, setOpenState] = React.useState(false);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => { if (onOpenChange) onOpenChange(v); else setOpenState(v); };
  const [name, setName] = React.useState('');
  const [outputItemId, setOutputItemId] = React.useState('');
  const [outputQty, setOutputQty] = React.useState('');
  const [components, setComponents] = React.useState([{ componentItemId: '', quantity: '' }]);
  const [saving, setSaving] = React.useState(false);

  // Editing starts from the recipe as it is now.
  React.useEffect(() => {
    if (!recipe || !open) return;
    setName(recipe.name);
    setOutputItemId(recipe.outputItemId);
    setOutputQty(String(recipe.outputQuantity));
    setComponents(recipe.components.map((c) => ({ componentItemId: c.componentItemId, quantity: String(c.quantity) })));
  }, [recipe, open]);

  const submit = async () => {
    if (!selectedCompany) return;
    const clean = components
      .filter((c) => c.componentItemId && Number(c.quantity) > 0)
      .map((c) => ({ componentItemId: c.componentItemId, quantity: Number(c.quantity) }));
    if (!name.trim() || !outputItemId || !(Number(outputQty) > 0) || clean.length === 0) {
      toast({ variant: 'destructive', title: tr('Missing details', 'تفاصيل ناقصة'), description: tr('Add a name, output item + quantity, and components.', 'أضف اسماً، وصنف المخرجات والكمية، والمكوّنات.') });
      return;
    }
    setSaving(true);
    try {
      const data = { name: name.trim(), outputItemId, outputQuantity: Number(outputQty), components: clean };
      if (recipe) await updateRecipe(recipe.id, data);
      else await createRecipe(selectedCompany.id, data);
      toast({ title: recipe ? tr('Recipe updated', 'تم تحديث الوصفة') : tr('Recipe created', 'تم إنشاء الوصفة') });
      setOpen(false); setName(''); setOutputItemId(''); setOutputQty(''); setComponents([{ componentItemId: '', quantity: '' }]);
      onCreated();
    } catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
    finally { setSaving(false); }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {!recipe && <SheetTrigger asChild><Button><Plus className="me-2 h-4 w-4" />{tr('New recipe', 'وصفة جديدة')}</Button></SheetTrigger>}
      <SheetContent className="w-full sm:max-w-lg flex flex-col">
        <SheetHeader>
          <SheetTitle>{recipe ? tr(`Edit ${recipe.name}`, `تعديل ${recipe.name}`) : tr('New recipe (bill of materials)', 'وصفة جديدة (قائمة المكوّنات)')}</SheetTitle>
          {recipe && <p className="text-sm text-muted-foreground">{tr('Open work orders use the new components when they complete; completed ones keep what they used.', 'تستخدم أوامر العمل المفتوحة المكوّنات الجديدة عند إكمالها؛ وتحتفظ المكتملة بما استخدمته.')}</p>}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-4 flex flex-col gap-4">
          <div className="grid gap-2">
            <Label>{tr('Name', 'الاسم')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={tr('e.g. French Fries', 'مثال: بطاطس مقلية')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label>{tr('Produces', 'ينتج')}</Label>
              <Select value={outputItemId} onValueChange={setOutputItemId}>
                <SelectTrigger><SelectValue placeholder={tr('Finished good', 'المنتج النهائي')} /></SelectTrigger>
                <SelectContent>{items.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>{tr('Output / batch', 'المخرجات / دفعة')}</Label>
              <Input type="number" value={outputQty} onChange={(e) => setOutputQty(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <Label>{tr('Components per batch', 'المكوّنات لكل دفعة')}</Label>
            {components.map((c, i) => (
              <div key={i} className="flex items-center gap-2">
                <Select value={c.componentItemId} onValueChange={(v) => setComponents((p) => p.map((x, j) => j === i ? { ...x, componentItemId: v } : x))}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder={tr('Component', 'المكوّن')} /></SelectTrigger>
                  <SelectContent>{items.filter((i2) => i2.id !== outputItemId).map((i2) => <SelectItem key={i2.id} value={i2.id}>{i2.name}</SelectItem>)}</SelectContent>
                </Select>
                <Input type="number" className="w-24" placeholder={tr('Qty', 'الكمية')} value={c.quantity}
                  onChange={(e) => setComponents((p) => p.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))} />
                <Button variant="ghost" size="icon" disabled={components.length === 1} onClick={() => setComponents((p) => p.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="self-start" onClick={() => setComponents((p) => [...p, { componentItemId: '', quantity: '' }])}>
              <Plus className="me-2 h-3.5 w-3.5" />{tr('Add component', 'إضافة مكوّن')}
            </Button>
          </div>
        </div>
        <SheetFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{tr('Cancel', 'إلغاء')}</Button>
          <Button onClick={submit} disabled={saving}>{recipe ? tr('Save', 'حفظ') : tr('Create', 'إنشاء')}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function RecipesTab({ items, recipes, reload }: { items: InventoryItem[]; recipes: Recipe[]; reload: () => void }) {
  const { language } = useI18n();
  const { toast } = useToast();
  const confirm = useConfirm();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const itemName = (id: string) => items.find((i) => i.id === id)?.name ?? '—';
  const [editing, setEditing] = React.useState<Recipe | null>(null);

  const remove = async (id: string) => {
    const ok = await confirm({ title: tr('Delete recipe?', 'حذف الوصفة؟'), confirmText: tr('Delete', 'حذف') });
    if (!ok) return;
    try { await deleteRecipe(id); reload(); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end"><RecipeSheet items={items} onCreated={reload} /></div>
      {editing && <RecipeSheet items={items} recipe={editing} open onOpenChange={(v) => { if (!v) setEditing(null); }} onCreated={() => { setEditing(null); reload(); }} />}
      {recipes.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <FlaskConical className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{tr('No recipes yet.', 'لا توجد وصفات بعد.')}</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{tr('Recipe', 'الوصفة')}</TableHead>
              <TableHead>{tr('Produces', 'ينتج')}</TableHead>
              <TableHead>{tr('Components', 'المكوّنات')}</TableHead>
              <TableHead className="text-end">{tr('Actions', 'إجراءات')}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {recipes.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{num(r.outputQuantity)} × {itemName(r.outputItemId)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.components.map((c) => <Badge key={c.id} variant="outline">{num(c.quantity)} {itemName(c.componentItemId)}</Badge>)}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-end">
                    <Button variant="ghost" size="icon" onClick={() => setEditing(r)} aria-label={tr('Edit', 'تعديل')}><Pencil className="h-4 w-4" /></Button>
                    <Button variant="ghost" size="icon" onClick={() => remove(r.id)} aria-label={tr('Delete', 'حذف')}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

/* ---------------- Work orders ---------------- */

const statusVariant: Record<WorkOrderStatus, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  planned: 'secondary', in_progress: 'secondary', completed: 'default', cancelled: 'outline',
};

function WorkOrdersTab({ recipes, workOrders, reload }: { recipes: Recipe[]; workOrders: WorkOrder[]; reload: () => void }) {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const { toast } = useToast();
  const confirm = useConfirm();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const [recipeId, setRecipeId] = React.useState('');
  const [batches, setBatches] = React.useState('1');
  const [creating, setCreating] = React.useState(false);
  const [editingWo, setEditingWo] = React.useState<WorkOrder | null>(null);
  const [woForm, setWoForm] = React.useState({ batches: '', notes: '' });
  const [savingWo, setSavingWo] = React.useState(false);

  const saveWo = async () => {
    if (!editingWo || !(Number(woForm.batches) > 0)) return;
    setSavingWo(true);
    try {
      await updateWorkOrder(editingWo.id, { batches: Number(woForm.batches), notes: woForm.notes });
      toast({ title: tr('Work order updated', 'تم تحديث أمر العمل') });
      setEditingWo(null);
      reload();
    } catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
    finally { setSavingWo(false); }
  };

  const create = async () => {
    if (!selectedCompany || !recipeId || !(Number(batches) > 0)) {
      toast({ variant: 'destructive', title: tr('Pick a recipe and batches', 'اختر وصفة وعدد الدفعات') });
      return;
    }
    setCreating(true);
    try { await createWorkOrder(selectedCompany.id, { recipeId, batches: Number(batches) }); reload(); setRecipeId(''); setBatches('1'); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
    finally { setCreating(false); }
  };

  const complete = async (wo: WorkOrder) => {
    const input = window.prompt(tr('Actual quantity produced:', 'الكمية الفعلية المنتَجة:'), String(wo.expectedQuantity));
    if (input === null) return;
    const qty = Number(input);
    if (!(qty > 0)) { toast({ variant: 'destructive', title: tr('Enter a valid quantity', 'أدخل كمية صحيحة') }); return; }
    try { await completeWorkOrder(wo.id, qty); toast({ title: tr('Work order completed', 'تم إكمال أمر العمل') }); reload(); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
  };

  const cancel = async (id: string) => {
    try { await cancelWorkOrder(id); reload(); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
  };

  const remove = async (id: string) => {
    const ok = await confirm({ title: tr('Delete work order?', 'حذف أمر العمل؟'), confirmText: tr('Delete', 'حذف') });
    if (!ok) return;
    try { await deleteWorkOrder(id); reload(); }
    catch (e: any) { toast({ variant: 'destructive', title: tr('Error', 'خطأ'), description: e?.message }); }
  };

  const yieldPct = (wo: WorkOrder) => wo.expectedQuantity > 0 ? Math.round((wo.producedQuantity / wo.expectedQuantity) * 100) : 0;
  const unitCost = (wo: WorkOrder) => wo.producedQuantity > 0 ? wo.materialCost / wo.producedQuantity : 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border bg-card p-4">
        <div className="grid gap-1.5">
          <Label className="text-xs">{tr('Recipe', 'الوصفة')}</Label>
          <Select value={recipeId} onValueChange={setRecipeId}>
            <SelectTrigger className="w-56"><SelectValue placeholder={tr('Select recipe', 'اختر وصفة')} /></SelectTrigger>
            <SelectContent>{recipes.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label className="text-xs">{tr('Batches', 'عدد الدفعات')}</Label>
          <Input type="number" className="w-28" value={batches} onChange={(e) => setBatches(e.target.value)} />
        </div>
        <Button data-tutorial="mfg-create-wo" onClick={create} disabled={creating || recipes.length === 0}>
          <Plus className="me-2 h-4 w-4" />{tr('Create work order', 'إنشاء أمر عمل')}
        </Button>
        {recipes.length === 0 && <p className="text-xs text-muted-foreground">{tr('Add a recipe first.', 'أضف وصفة أولاً.')}</p>}
      </div>

      {workOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-16 text-center">
          <Factory className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">{tr('No work orders yet.', 'لا توجد أوامر عمل بعد.')}</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader><TableRow>
              <TableHead>{tr('Reference', 'المرجع')}</TableHead>
              <TableHead>{tr('Recipe', 'الوصفة')}</TableHead>
              <TableHead className="text-end">{tr('Expected', 'المتوقع')}</TableHead>
              <TableHead className="text-end">{tr('Produced', 'المنتَج')}</TableHead>
              <TableHead className="text-end">{tr('Yield', 'العائد')}</TableHead>
              <TableHead className="text-end">{tr('Unit cost', 'تكلفة الوحدة')}</TableHead>
              <TableHead>{tr('Status', 'الحالة')}</TableHead>
              <TableHead className="text-end">{tr('Actions', 'إجراءات')}</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {workOrders.map((wo) => (
                <TableRow key={wo.id}>
                  <TableCell className="font-medium">{wo.reference}</TableCell>
                  <TableCell>{wo.recipeName}</TableCell>
                  <TableCell className="text-end tabular-nums">{num(wo.expectedQuantity)}</TableCell>
                  <TableCell className="text-end tabular-nums">{wo.status === 'completed' ? num(wo.producedQuantity) : '—'}</TableCell>
                  <TableCell className={cn('text-end tabular-nums', wo.status === 'completed' && (yieldPct(wo) >= 100 ? 'text-emerald-600' : yieldPct(wo) >= 90 ? 'text-amber-600' : 'text-red-600'))}>
                    {wo.status === 'completed' ? `${yieldPct(wo)}%` : '—'}
                  </TableCell>
                  <TableCell className="text-end tabular-nums">{wo.status === 'completed' ? money(unitCost(wo)) : '—'}</TableCell>
                  <TableCell><Badge variant={statusVariant[wo.status]}>{wo.status}</Badge></TableCell>
                  <TableCell className="text-end">
                    {(wo.status === 'planned' || wo.status === 'in_progress') && (
                      <>
                        {wo.status === 'planned' && (
                          <Button variant="ghost" size="icon" title={tr('Edit', 'تعديل')} aria-label={tr('Edit', 'تعديل')}
                            onClick={() => { setEditingWo(wo); setWoForm({ batches: String(wo.batches), notes: wo.notes ?? '' }); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" onClick={() => complete(wo)}><CheckCircle2 className="me-1 h-4 w-4" />{tr('Complete', 'إكمال')}</Button>
                        <Button variant="ghost" size="icon" onClick={() => cancel(wo.id)} title={tr('Cancel', 'إلغاء')}><Ban className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="icon" onClick={() => remove(wo.id)}><Trash2 className="h-4 w-4" /></Button>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={Boolean(editingWo)} onOpenChange={(v) => { if (!v) setEditingWo(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{tr(`Edit ${editingWo?.reference ?? ''}`, `تعديل ${editingWo?.reference ?? ''}`)}</DialogTitle>
            <DialogDescription>{tr('A planned order can change its batches; expected output follows the recipe.', 'يمكن لأمر مخطط تغيير عدد الدفعات؛ ويتبع الناتج المتوقع الوصفة.')}</DialogDescription>
          </DialogHeader>
          <form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); void saveWo(); }}>
            <div className="grid gap-1.5">
              <Label htmlFor="wo-batches">{tr('Batches', 'عدد الدفعات')}</Label>
              <Input id="wo-batches" type="number" min={1} value={woForm.batches} onChange={(e) => setWoForm((f) => ({ ...f, batches: e.target.value }))} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="wo-notes">{tr('Notes', 'ملاحظات')}</Label>
              <Textarea id="wo-notes" value={woForm.notes} onChange={(e) => setWoForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditingWo(null)}>{tr('Cancel', 'إلغاء')}</Button>
              <Button type="submit" disabled={savingWo || !(Number(woForm.batches) > 0)}>{tr('Save', 'حفظ')}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function ManufacturingPage() {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const companyId = selectedCompany?.id;

  const [items, setItems] = React.useState<InventoryItem[]>([]);
  const [recipes, setRecipes] = React.useState<Recipe[]>([]);
  const [workOrders, setWorkOrders] = React.useState<WorkOrder[]>([]);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const [i, r, w] = await Promise.all([getInventoryItems(companyId), getRecipes(companyId), getWorkOrders(companyId)]);
      setItems(i.filter((x) => x.tracksInventory));
      setRecipes(r);
      setWorkOrders(w);
    } catch { setItems([]); setRecipes([]); setWorkOrders([]); }
    finally { setLoading(false); }
  }, [companyId]);

  React.useEffect(() => { load(); }, [load]);

  return (
    <SectionPageShell
      title={tr('Manufacturing', 'التصنيع')}
      description={tr('Recipes (bill of materials) and work orders — consumption, yield, and production cost.',
                      'الوصفات (قوائم المكوّنات) وأوامر العمل — الاستهلاك والعائد وتكلفة الإنتاج.')}
    >
      {loading ? (
        <Skeleton className="h-64 w-full rounded-lg" />
      ) : (
        <Tabs defaultValue="work-orders" className="space-y-4">
          <TabsList>
            <TabsTrigger value="work-orders"><Factory className="me-2 h-4 w-4" />{tr('Work Orders', 'أوامر العمل')}</TabsTrigger>
            <TabsTrigger value="recipes"><FlaskConical className="me-2 h-4 w-4" />{tr('Recipes', 'الوصفات')}</TabsTrigger>
          </TabsList>
          <TabsContent value="work-orders"><WorkOrdersTab recipes={recipes} workOrders={workOrders} reload={load} /></TabsContent>
          <TabsContent value="recipes"><RecipesTab items={items} recipes={recipes} reload={load} /></TabsContent>
        </Tabs>
      )}
    </SectionPageShell>
  );
}
