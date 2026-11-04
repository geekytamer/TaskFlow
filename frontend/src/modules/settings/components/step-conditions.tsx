'use client';

/**
 * "Only when…" on an approval step: supplier, client, category, project,
 * department, leave type or template (whatever the document records), each
 * "is one of" or "is not any of". Records come from the company's own lists;
 * category and department are typed text.
 */
import * as React from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getDocumentTemplates } from '@/services/documentService';
import { getClients, getInvoiceTemplates } from '@/services/financeService';
import { getLeaveTypes } from '@/services/hrService';
import { getSuppliers } from '@/services/operationsService';
import { getProjects } from '@/services/projectService';
import { CONDITION_FIELDS, TEXT_FIELDS, type ApprovalDocType, type ConditionField, type StepCondition } from '@/services/approvalService';
import { conditionFieldName, conditionText } from '@/modules/approvals/lib/wording';

type Tr = (en: string, ar: string) => string;
export type ConditionOptions = Partial<Record<ConditionField, Array<{ value: string; label: string }>>>;

/** The company's records a condition can name, loaded once per company (each list may fail on its own). */
export function useConditionOptions(companyId: string | undefined): ConditionOptions {
  const [options, setOptions] = React.useState<ConditionOptions>({});
  React.useEffect(() => {
    if (!companyId) return;
    let live = true;
    const safe = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    Promise.all([
      safe(getSuppliers(companyId)), safe(getClients(companyId)), safe(getProjects()), safe(getLeaveTypes(companyId)), safe(getDocumentTemplates(companyId)),
      // Documents are also made from the typed templates of the generic kinds.
      ...(['quote', 'letter', 'memo', 'certificate', 'statement', 'custom'] as const).map((k) => safe(getInvoiceTemplates(companyId, k))),
    ]).then(([suppliers, clients, projects, leaveTypes, templates, ...typed]) => {
      if (!live) return;
      const list = (rows: Array<{ id: string; name?: string; title?: string }>) => rows.map((r) => ({ value: r.id, label: r.name ?? r.title ?? r.id }));
      setOptions({
        supplier: list(suppliers), client: list(clients),
        project: list((projects as Array<{ id: string; name: string; companyId?: string }>).filter((p) => p.companyId === companyId)),
        leaveType: list(leaveTypes), template: list([...(templates as Array<{ id: string; name: string }>), ...(typed.flat() as Array<{ id: string; name: string }>)]),
      });
    });
    return () => { live = false; };
  }, [companyId]);
  return options;
}

/** Names a condition value: the record's name, or the typed text itself. */
export const conditionValueName = (options: ConditionOptions) => (field: ConditionField, value: string) =>
  options[field]?.find((o) => o.value === value)?.label ?? value;

export function StepConditions({ docType, conditions, onChange, canEdit, groupStep, groupHasBelow = false, options, tr }: {
  docType: ApprovalDocType; conditions: StepCondition[]; onChange: (next: StepCondition[]) => void; groupHasBelow?: boolean;
  canEdit: boolean; groupStep: boolean; options: ConditionOptions; tr: Tr;
}) {
  // A group sign-off runs for other companies' documents: only typed-text fields mean the same there.
  const fields = CONDITION_FIELDS[docType].filter((f) => !groupStep || TEXT_FIELDS.includes(f));
  const [draft, setDraft] = React.useState<Record<number, string>>({});
  if (!canEdit) {
    const text = conditionText(conditions, conditionValueName(options), tr);
    return text ? <p className="mt-2 text-xs text-muted-foreground" dir="auto">{text}</p> : null;
  }
  if (!fields.length) return null;
  const set = (i: number, c: StepCondition) => onChange(conditions.map((x, j) => (j === i ? c : x)));
  const addText = (i: number, c: StepCondition) => {
    const v = (draft[i] ?? '').trim();
    if (!v || c.values.some((x) => x.toLowerCase() === v.toLowerCase())) return;
    set(i, { ...c, values: [...c.values, v] });
    setDraft((d) => ({ ...d, [i]: '' }));
  };
  return (
    <div className="mt-2 space-y-2">
      {conditions.map((c, i) => (
        <div key={i} className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 p-2 text-xs">
          <span className="text-muted-foreground">{i === 0 ? tr('Only when', 'فقط عندما يكون') : tr('and', 'و')}</span>
          <Select value={c.field} onValueChange={(v) => set(i, { field: v as ConditionField, op: c.op, values: [] })}>
            <SelectTrigger className="h-7 w-auto text-xs" aria-label={tr('Field', 'الحقل')}><SelectValue /></SelectTrigger>
            <SelectContent>{fields.map((f) => <SelectItem key={f} value={f}>{conditionFieldName(f, tr)}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={c.op} onValueChange={(v) => set(i, { ...c, op: v as StepCondition['op'] })}>
            <SelectTrigger className="h-7 w-auto text-xs" aria-label={tr('Is or is not', 'يكون أو لا يكون')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="is">{tr('is one of', 'أحد')}</SelectItem>
              <SelectItem value="is_not">{tr('is not any of', 'ليس أيًا من')}</SelectItem>
            </SelectContent>
          </Select>
          <div className="min-w-48 flex-1">
            {TEXT_FIELDS.includes(c.field) ? (
              <div className="flex flex-wrap items-center gap-1">
                {c.values.map((v) => (
                  <span key={v} className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5" dir="auto">
                    {v}
                    <button type="button" aria-label={tr(`Remove ${v}`, `إزالة ${v}`)} onClick={() => set(i, { ...c, values: c.values.filter((x) => x !== v) })}><X className="h-3 w-3" /></button>
                  </span>
                ))}
                <Input
                  className="h-7 w-40 text-xs" dir="auto"
                  placeholder={c.field === 'category' ? tr('Type a category, Enter', 'اكتب فئة ثم Enter') : tr('Type a department, Enter', 'اكتب قسمًا ثم Enter')}
                  aria-label={conditionFieldName(c.field, tr)}
                  value={draft[i] ?? ''}
                  onChange={(e) => setDraft((d) => ({ ...d, [i]: e.target.value }))}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addText(i, c); } }}
                  onBlur={() => addText(i, c)}
                />
              </div>
            ) : (
              <MultiSelect
                items={options[c.field] ?? []} selected={c.values} onChange={(values) => set(i, { ...c, values })}
                placeholder={tr('Choose…', 'اختر…')}
              />
            )}
          </div>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={tr('Remove condition', 'حذف الشرط')} onClick={() => onChange(conditions.filter((_, j) => j !== i))}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}
      {groupHasBelow && conditions.some((c) => !TEXT_FIELDS.includes(c.field)) && (
        <p className="text-xs text-muted-foreground">
          {tr('Companies below that use this policy have their own suppliers, clients and projects, so a step "is one of" these never applies to them and "is not any of" always does.',
            'الشركات التابعة التي تستخدم هذه السياسة لها مورّدوها وعملاؤها ومشاريعها، لذا خطوة "أحد" هذه لا تنطبق عليها أبدًا و"ليس أيًا من" تنطبق دائمًا.')}
        </p>
      )}
      {conditions.length < 5 && (
        <Button
          type="button" size="sm" variant="ghost" className="h-7 gap-1 px-2 text-xs text-muted-foreground"
          onClick={() => onChange([...conditions, { field: fields.find((f) => !conditions.some((c) => c.field === f)) ?? fields[0], op: 'is', values: [] }])}
        >
          <Filter className="h-3 w-3" aria-hidden="true" />{conditions.length ? tr('Add another condition', 'إضافة شرط آخر') : `${tr('Only when…', 'فقط عندما…')} (${fields.map((f) => conditionFieldName(f, tr).replace(/^the /, '')).join(tr(', ', '، '))})`}
        </Button>
      )}
    </div>
  );
}
