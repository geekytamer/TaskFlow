/** How approvals read, in either language (approvers, the list chip, the trail). */
import type { Approver, ApprovalStatusRow, ConditionField, Need, StepCondition, TrailEntry } from '@/services/approvalService';

type Tr = (en: string, ar: string) => string;

const roleWords = (id: string, tr: Tr) =>
  ({ Admin: tr('an Admin', 'مدير النظام'), Manager: tr('a Manager', 'مدير'), Accountant: tr('an Accountant', 'محاسب') } as Record<string, string>)[id] ?? id;

/** One approver: roles and the manager are translated; teams and people keep their names. */
export function approverName(a: Approver & { label?: string }, tr: Tr): string {
  if (a.kind === 'role') return roleWords(a.id, tr);
  if (a.kind === 'manager') return tr("the requester's manager", 'مدير مقدّم الطلب');
  return a.label ?? (a.kind === 'team' ? tr('a team', 'فريق') : tr('a named person', 'شخص محدد'));
}

/** Everyone on a step: "Legal or Finance" (any of them), "Legal and Finance" (each of them). */
export function approverText(approvers: Array<Approver & { label?: string }>, need: Need | null, tr: Tr): string {
  const names = [...new Set(approvers.map((a) => approverName(a, tr)))];
  return names.join(need === 'all' ? tr(' and ', ' و') : tr(' or ', ' أو '));
}

/** The chip on a document's list: where it stands in a few words. */
export function chipText(row: ApprovalStatusRow, tr: Tr): string {
  if (row.status === 'approved') return tr('Approved', 'معتمد');
  if (row.status === 'rejected') return tr('Rejected', 'مرفوض');
  if (row.status === 'changes_requested') return tr('Changes requested', 'مطلوب تعديل');
  if (row.status !== 'pending') return '';
  const where = row.levels > 1 && row.level ? tr(` · ${row.level} of ${row.levels}`, ` · ${row.level} من ${row.levels}`) : '';
  if (row.stuck) return tr('Stuck: nobody can decide', 'متوقف: لا أحد للبت') + where;
  return tr(`Waiting for ${approverText(row.approvers, row.need, tr)}`, `بانتظار ${approverText(row.approvers, row.need, tr)}`) + where;
}

/** One line of the trail as a sentence. `nameOf` names the colleague someone stood in for. */
export function trailText(t: TrailEntry, tr: Tr, nameOf: (userId: string) => string): string {
  const who = t.userName ?? tr('Someone', 'شخص ما');
  const step = t.level ? tr(` step ${t.level}`, ` الخطوة ${t.level}`) : '';
  const forWhom = t.onBehalfOf ? tr(` for ${nameOf(t.onBehalfOf)}`, ` نيابة عن ${nameOf(t.onBehalfOf)}`) : '';
  switch (t.kind) {
    case 'started': return tr(`${who} asked for approval`, `طلب ${who} الموافقة`);
    case 'restarted': return t.userName ? tr(`${who}'s request started again after a change`, `بدأ طلب ${who} من جديد بعد تعديل`) : tr('Started again after a change', 'بدأ من جديد بعد تعديل');
    case 'approved': return tr(`${who} approved${step}${forWhom}`, `وافق ${who} على${step}${forWhom}`);
    case 'rejected': return tr(`${who} rejected${step}${forWhom}`, `رفض ${who}${step}${forWhom}`);
    case 'changes_requested': return tr(`${who} sent it back for changes${forWhom}`, `أعاده ${who} للتعديل${forWhom}`);
    case 'reassigned': return tr(`${who} handed${step} on`, `سلّم ${who}${step} لشخص آخر`);
    case 'reminded': return tr(`Reminder sent for${step}`, `تذكير ب${step.trim()}`);
    case 'escalated': return tr(`Escalated to Admins at${step}`, `صُعّد إلى مدراء النظام عند${step}`);
    case 'skipped': return tr('A step was left out', 'تم تخطي خطوة');
    case 'noted': return tr(`Note on${step}`, `ملاحظة على${step}`);
    default: return t.kind;
  }
}

/** A condition field's name in the reader's language. */
export function conditionFieldName(field: ConditionField, tr: Tr): string {
  return ({
    supplier: tr('the supplier', 'المورد'), client: tr('the client', 'العميل'), category: tr('the category', 'الفئة'),
    project: tr('the project', 'المشروع'), department: tr('the department', 'القسم'), leaveType: tr('the leave type', 'نوع الإجازة'),
    template: tr('the template', 'القالب'),
  } as Record<ConditionField, string>)[field];
}

/** A step's conditions as one sentence ("Only when the supplier is Globex or Initech"); '' when none. */
export function conditionText(conditions: StepCondition[] | undefined, name: (field: ConditionField, value: string) => string, tr: Tr): string {
  if (!conditions?.length) return '';
  const parts = conditions.map((c) => {
    const names = c.values.map((v) => name(c.field, v));
    if (c.op === 'is') return tr(`${conditionFieldName(c.field, tr)} is ${names.join(' or ')}`, `${conditionFieldName(c.field, tr)} ${names.join(' أو ')}`);
    // "is not" over several values reads as "none of", never an ambiguous "not A or B".
    const listed = names.join(tr(', ', '، '));
    return names.length > 1
      ? tr(`${conditionFieldName(c.field, tr)} is none of ${listed}`, `${conditionFieldName(c.field, tr)} ليس من ${listed}`)
      : tr(`${conditionFieldName(c.field, tr)} is not ${listed}`, `${conditionFieldName(c.field, tr)} ليس ${listed}`);
  });
  return tr(`Only when ${parts.join(', and ')}`, `فقط عندما يكون ${parts.join('، و')}`);
}
