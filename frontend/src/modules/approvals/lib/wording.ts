/** How approvals read, in either language (approvers, the list chip, the trail). */
import type { Approver, ApprovalStatusRow, Need, TrailEntry } from '@/services/approvalService';

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
