'use client';

import * as React from 'react';
import { PlusCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { getApprovalRules, setApprovalRules, type ApprovalDocType, type ApprovalRule, type ApproverRole } from '@/services/approvalService';

type Tr = (en: string, ar: string) => string;
type Row = { minAmount: string; approverRole: ApproverRole };

export const approverRoleLabel = (r: ApproverRole, tr: Tr) => ({ Manager: tr('a Manager', 'مدير'), Accountant: tr('an Accountant', 'محاسب'), Admin: tr('an Admin', 'مدير عام') }[r]);

/**
 * Who signs off what: per document type, the amounts from which a role must
 * approve. Each level a document reaches is approved in turn, by different people.
 */
export function ApprovalRulesPanel({ canEdit }: { canEdit: boolean }) {
  const { selectedCompany } = useCompany();
  const { language } = useI18n();
  const tr: Tr = React.useCallback((en, ar) => (language === 'ar' ? ar : en), [language]);
  const { toast } = useToast();
  const [rules, setRules] = React.useState<ApprovalRule[] | null>(null);

  React.useEffect(() => {
    if (!selectedCompany) return;
    getApprovalRules(selectedCompany.id).then(setRules).catch(() => setRules([]));
  }, [selectedCompany]);

  if (!selectedCompany || rules === null) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr('Approvals', 'الموافقات')}</CardTitle>
        <CardDescription>{tr('From which amount a document needs sign-off, and by whom. A document needs every level it reaches, approved in order by different people. Purchase order rules replace the single threshold above.', 'من أي مبلغ يحتاج المستند إلى موافقة، ومن يوافق. يحتاج المستند إلى كل مستوى يبلغه، بالترتيب ومن أشخاص مختلفين. قواعد أوامر الشراء تحل محل الحد الواحد أعلاه.')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-6 lg:grid-cols-2">
        {(['purchase_order', 'expense'] as ApprovalDocType[]).map((docType) => (
          <RuleEditor key={docType} docType={docType} initial={rules.filter((r) => r.docType === docType)} canEdit={canEdit} tr={tr}
            onSave={async (rows) => {
              try {
                setRules(await setApprovalRules(selectedCompany.id, docType, rows));
                toast({ title: tr('Approval rules saved', 'تم حفظ قواعد الموافقة') });
              } catch (error: any) {
                toast({ variant: 'destructive', title: tr('Could not save', 'تعذّر الحفظ'), description: error?.message });
              }
            }} />
        ))}
      </CardContent>
    </Card>
  );
}

function RuleEditor({ docType, initial, canEdit, tr, onSave }: {
  docType: ApprovalDocType; initial: ApprovalRule[]; canEdit: boolean; tr: Tr;
  onSave: (rows: Array<{ minAmount: number; approverRole: ApproverRole }>) => Promise<void>;
}) {
  const [rows, setRows] = React.useState<Row[]>(initial.map((r) => ({ minAmount: String(r.minAmount), approverRole: r.approverRole })));
  const [saving, setSaving] = React.useState(false);
  const title = docType === 'purchase_order' ? tr('Purchase orders', 'أوامر الشراء') : tr('Expenses', 'المصروفات');
  const valid = rows.every((r) => Number(r.minAmount) > 0) && new Set(rows.map((r) => Number(r.minAmount))).size === rows.length;
  return (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {rows.length === 0 && <p className="text-sm text-muted-foreground">{docType === 'expense' ? tr('No approval needed: expenses post when recorded.', 'لا حاجة لموافقة: تُرحّل المصروفات عند تسجيلها.') : tr('No levels: the single threshold above applies.', 'لا مستويات: يطبق الحد الواحد أعلاه.')}</p>}
      {rows.map((r, i) => (
        <div key={i} className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{tr('From', 'من')}</span>
          <Input type="number" min={0} className="w-28" value={r.minAmount} disabled={!canEdit} aria-label={tr(`Level ${i + 1} amount`, `مبلغ المستوى ${i + 1}`)} onChange={(e) => setRows((x) => x.map((y, j) => (j === i ? { ...y, minAmount: e.target.value } : y)))} />
          <span className="text-muted-foreground">{tr('needs', 'يحتاج إلى')}</span>
          <Select value={r.approverRole} disabled={!canEdit} onValueChange={(v) => setRows((x) => x.map((y, j) => (j === i ? { ...y, approverRole: v as ApproverRole } : y)))}>
            <SelectTrigger className="w-36" aria-label={tr(`Level ${i + 1} approver`, `موافِق المستوى ${i + 1}`)}><SelectValue /></SelectTrigger>
            <SelectContent>{(['Manager', 'Accountant', 'Admin'] as ApproverRole[]).map((role) => <SelectItem key={role} value={role}>{approverRoleLabel(role, tr)}</SelectItem>)}</SelectContent>
          </Select>
          {canEdit && <Button variant="ghost" size="icon" aria-label={tr(`Remove level ${i + 1}`, `حذف المستوى ${i + 1}`)} onClick={() => setRows((x) => x.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>}
        </div>
      ))}
      {canEdit && (
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={rows.length >= 10} onClick={() => setRows((x) => [...x, { minAmount: '', approverRole: x.length ? 'Admin' : 'Manager' }])}><PlusCircle className="me-2 h-4 w-4" />{tr('Add level', 'إضافة مستوى')}</Button>
          <Button size="sm" disabled={!valid || saving} onClick={async () => { setSaving(true); try { await onSave(rows.map((r) => ({ minAmount: Number(r.minAmount), approverRole: r.approverRole }))); } finally { setSaving(false); } }}>{tr('Save', 'حفظ')}</Button>
        </div>
      )}
    </section>
  );
}
