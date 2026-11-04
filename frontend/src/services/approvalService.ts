import { apiFetch } from '@/lib/api-client';

/** Approvals (spec 2026-11-03-approvals-design). */
export type ApprovalDocType =
  | 'purchase_order' | 'expense' | 'vendor_bill' | 'vendor_payment' | 'invoice' | 'credit_note'
  | 'quotation' | 'payroll_run' | 'document' | 'purchase_requisition' | 'leave_request';
/** The document types a policy can be set for (wave 1 and wave 2), in the order Settings lists them. */
export const POLICY_DOC_TYPES: ApprovalDocType[] = [
  'purchase_requisition', 'purchase_order', 'vendor_bill', 'vendor_payment', 'expense',
  'quotation', 'invoice', 'credit_note', 'payroll_run', 'leave_request', 'document',
];
/** Leave is measured in days, not money: its bands are numbers of days. */
export const amountIsDays = (t: ApprovalDocType) => t === 'leave_request';
export type ApproverRole = 'Manager' | 'Accountant' | 'Admin';
export type Approver =
  | { kind: 'role'; id: ApproverRole; label?: string }
  | { kind: 'team'; id: string; label?: string }
  | { kind: 'user'; id: string; label?: string }
  | { kind: 'manager'; label?: string };
export type Need = 'any' | 'all';
export type ApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected' | 'changes_requested';

/** What a step can route on besides amount; mirrors backend CONDITION_FIELDS. */
export type ConditionField = 'supplier' | 'client' | 'category' | 'project' | 'department' | 'leaveType' | 'template';
export interface StepCondition { field: ConditionField; op: 'is' | 'is_not'; values: string[] }
export const CONDITION_FIELDS: Record<ApprovalDocType, ConditionField[]> = {
  purchase_order: ['supplier'], vendor_bill: ['supplier'], vendor_payment: ['supplier'],
  expense: ['category', 'project'], invoice: ['client'], quotation: ['client'], credit_note: ['client'],
  purchase_requisition: ['department', 'supplier'], leave_request: ['leaveType'], document: ['template'], payroll_run: [],
};
/** Typed text (matched ignoring case); the others are this company's records. A group sign-off takes only these. */
export const TEXT_FIELDS: ConditionField[] = ['category', 'department'];

export interface PolicyStep {
  approvers: Approver[]; need: Need; minAmount: number | null; maxAmount: number | null;
  /** Besides the amount band, every condition must hold. */
  conditions?: StepCondition[];
  /** On a group company: also for every company below, after their own steps (group sign-off). */
  alsoBelow?: boolean;
}
export interface ApprovalPolicy {
  steps: PolicyStep[]; allowSelf: boolean; reminderHours: number; escalateHours: number;
  /** Set when this company uses its group's policy. */
  inheritedFrom: { id: string; name: string } | null;
  /** This company has companies below: its steps can be their group sign-off. */
  hasCompaniesBelow?: boolean;
  /** What each group above adds after this company's own steps, nearest first. */
  groupSignOff?: Array<{ companyId: string; name: string; steps: PolicyStep[] }>;
}
export interface ApprovalTeam { id: string; companyId: string; name: string; members: Array<{ kind: 'role' | 'user'; value: string }> }

export interface RequestStep {
  level: number; status: 'pending' | 'approved' | 'rejected'; need: Need; minAmount: number;
  /** Whose people decide it: the document's company, or the group signing off. */
  ownerCompanyId?: string;
  approvers: Array<Approver & { label: string }>; stuck: boolean;
  decidedByName: string | null; decidedAt: string | null; note: string | null;
}
export interface ApprovalItem {
  docType: ApprovalDocType; docId: string; companyId: string; status: ApprovalStatus;
  number: string; amount: number; party: string | null; date: string;
  level?: number; levels: number; steps: RequestStep[]; requesterId: string | null;
  onBehalfOf?: string | null; canDecide: boolean; canReassign?: boolean;
}
export type ApprovalBox = 'waiting' | 'mine' | 'decided' | 'open';

export type TrailKind = 'started' | 'skipped' | 'noted' | 'approved' | 'rejected' | 'changes_requested' | 'reminded' | 'escalated' | 'restarted' | 'reassigned';
export interface TrailEntry { level: number | null; kind: TrailKind; userId: string | null; userName: string | null; onBehalfOf: string | null; note: string | null; at: string }
/** One document's request, as its reader sees it. */
export interface ApprovalView {
  docType: ApprovalDocType; docId: string; companyId: string; number: string; amount: number; party: string | null;
  status: ApprovalStatus; requesterId: string | null; steps: RequestStep[]; trail: TrailEntry[];
  canDecide: boolean; canReassign: boolean;
}
/** Where one document stands, for the chip on its list. */
export interface ApprovalStatusRow { docId: string; status: ApprovalStatus; level: number | null; levels: number; need: Need | null; approvers: Array<Approver & { label: string }>; stuck: boolean }

export const getApprovalStatuses = (companyId: string, docType: ApprovalDocType) =>
  apiFetch<ApprovalStatusRow[]>(`/companies/${companyId}/approvals/status?docType=${docType}`);
export const getApprovalView = (docType: ApprovalDocType, docId: string) => apiFetch<ApprovalView>(`/approvals/${docType}/${docId}/view`);
export const reassignApproval = (docType: ApprovalDocType, docId: string, toUserId: string, reason: string) =>
  apiFetch<unknown>(`/approvals/${docType}/${docId}/reassign`, { method: 'POST', body: JSON.stringify({ toUserId, reason }) });

/** A credit note or payment waiting for approval before it posts. */
export interface ApprovalHold {
  id: string; companyId: string; docType: 'credit_note' | 'vendor_payment'; targetId: string | null;
  amount: number; label: string; party: string | null; status: 'pending' | 'approved' | 'failed' | 'rejected' | 'withdrawn';
  resultId: string | null; error: string | null; note: string | null; requesterId: string | null; createdAt: string;
}
/** What a recording answers when it was held for approval (HTTP 202). */
export interface HeldAnswer { held: true; hold: ApprovalHold }
export const isHeld = (x: unknown): x is HeldAnswer => Boolean(x && typeof x === 'object' && (x as { held?: unknown }).held === true);
export const getApprovalHolds = (companyId: string, filter: { docType?: ApprovalHold['docType']; targetId?: string; status?: ApprovalHold['status'] } = {}) => {
  const q = new URLSearchParams(Object.entries(filter).filter(([, v]) => v) as Array<[string, string]>).toString();
  return apiFetch<ApprovalHold[]>(`/companies/${companyId}/approval-holds${q ? `?${q}` : ''}`);
};
export const withdrawApprovalHold = (id: string) => apiFetch<ApprovalHold>(`/approval-holds/${id}/withdraw`, { method: 'POST' });

export const getApprovals = (companyId: string, box: ApprovalBox = 'waiting') =>
  apiFetch<ApprovalItem[]>(`/companies/${companyId}/approvals?box=${box}`);
export const decideApproval = (docType: ApprovalDocType, docId: string, decision: 'approve' | 'reject' | 'send_back', note?: string) =>
  apiFetch<unknown>(`/approvals/${docType}/${docId}/decision`, { method: 'POST', body: JSON.stringify({ decision, note }) });

export const getApprovalPolicies = (companyId: string) =>
  apiFetch<Record<ApprovalDocType, ApprovalPolicy>>(`/companies/${companyId}/approvals/policies`);
export const saveApprovalPolicy = (companyId: string, docType: ApprovalDocType, policy: Pick<ApprovalPolicy, 'steps' | 'allowSelf' | 'reminderHours' | 'escalateHours'>) =>
  apiFetch<unknown>(`/companies/${companyId}/approvals/policies/${docType}`, {
    method: 'PUT',
    body: JSON.stringify({ ...policy, steps: policy.steps.map((s) => ({ ...s, approvers: s.approvers.map(({ label: _label, ...a }) => a) })) }),
  });

export const getApprovalTeams = (companyId: string) => apiFetch<ApprovalTeam[]>(`/companies/${companyId}/approvals/teams`);
export const saveApprovalTeam = (companyId: string, team: { id?: string; name: string; members: ApprovalTeam['members'] }) =>
  apiFetch<ApprovalTeam>(`/companies/${companyId}/approvals/teams`, { method: 'PUT', body: JSON.stringify(team) });
export const deleteApprovalTeam = (companyId: string, teamId: string) =>
  apiFetch<void>(`/companies/${companyId}/approvals/teams/${teamId}`, { method: 'DELETE' });

export interface Delegation { toUserId: string; startsAt: string; endsAt: string }
export const getMyDelegation = () => apiFetch<Delegation | null>('/me/approval-delegation');
export const setMyDelegation = (d: Delegation | null) =>
  apiFetch<Delegation | null>('/me/approval-delegation', { method: 'PUT', body: JSON.stringify(d ?? { toUserId: null }) });

/** How each kind of document reads. */
export const docTypeLabel = (t: ApprovalDocType, tr: (en: string, ar: string) => string): string => ({
  purchase_order: tr('Purchase order', 'أمر شراء'), expense: tr('Expense', 'مصروف'), vendor_bill: tr('Vendor bill', 'فاتورة مورد'),
  vendor_payment: tr('Payment', 'دفعة'), invoice: tr('Invoice', 'فاتورة'), credit_note: tr('Credit note', 'إشعار دائن'),
  quotation: tr('Quotation', 'عرض سعر'), payroll_run: tr('Payroll run', 'مسير رواتب'), document: tr('Document', 'مستند'),
  purchase_requisition: tr('Purchase requisition', 'طلب شراء داخلي'), leave_request: tr('Leave request', 'طلب إجازة'),
}[t]);

/** What waits for approval on each kind of document. */
export const docTypeGate = (t: ApprovalDocType, tr: (en: string, ar: string) => string): string => ({
  purchase_order: tr('Approved before it is ordered', 'يُعتمد قبل الطلب'), expense: tr('Approved before it is posted', 'يُعتمد قبل الترحيل'),
  vendor_bill: tr('Approved before it is paid', 'تُعتمد قبل الدفع'),
  vendor_payment: tr('Each payment approved before money goes out (after the bill\'s own approval)', 'تُعتمد كل دفعة قبل خروج المال (بعد اعتماد الفاتورة نفسها)'),
  invoice: tr('Approved before it is sent', 'تُعتمد قبل الإرسال'),
  credit_note: tr('Approved before it is recorded in the books', 'يُعتمد قبل تسجيله في الدفاتر'),
  quotation: tr('Approved before it is sent or converted', 'يُعتمد قبل الإرسال أو التحويل'),
  payroll_run: tr('Approved before it is approved for payment', 'يُعتمد قبل اعتماده للدفع'), document: tr('Approved before it is finalised', 'يُعتمد قبل اعتماده نهائيًا'),
  purchase_requisition: tr('Approved before it can become a purchase order', 'يُعتمد قبل أن يتحول إلى أمر شراء'),
  leave_request: tr('Approved before the leave is granted', 'تُعتمد قبل منح الإجازة'),
}[t]);

export const roleLabel = (r: string, tr: (en: string, ar: string) => string) =>
  ({ Admin: tr('Admin', 'مدير النظام'), Manager: tr('Manager', 'مدير'), Accountant: tr('Accountant', 'محاسب'), Employee: tr('Employee', 'موظف') } as Record<string, string>)[r] ?? r;

/** Where to open a document from the inbox. */
export const docLink = (t: ApprovalDocType): string => ({
  purchase_order: '/purchases', expense: '/finance?tab=expenses', vendor_bill: '/finance?tab=payables', vendor_payment: '/finance?tab=payables',
  invoice: '/finance?tab=invoices', credit_note: '/finance?tab=invoices', quotation: '/sales?tab=quotations', payroll_run: '/hr/payroll',
  document: '/documents', purchase_requisition: '/purchases/requisitions', leave_request: '/hr/leave',
}[t]);
