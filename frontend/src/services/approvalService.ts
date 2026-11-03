import { apiFetch } from '@/lib/api-client';

/** Approvals (spec 2026-11-03-approvals-design). */
export type ApprovalDocType =
  | 'purchase_order' | 'expense' | 'vendor_bill' | 'vendor_payment' | 'invoice' | 'credit_note'
  | 'quotation' | 'payroll_run' | 'document' | 'purchase_requisition' | 'leave_request';
/** The document types a policy can be set for today (wave 1). */
export const POLICY_DOC_TYPES: ApprovalDocType[] = ['purchase_order', 'expense', 'vendor_bill', 'invoice', 'quotation', 'payroll_run', 'document'];
export type ApproverRole = 'Manager' | 'Accountant' | 'Admin';
export type Approver =
  | { kind: 'role'; id: ApproverRole; label?: string }
  | { kind: 'team'; id: string; label?: string }
  | { kind: 'user'; id: string; label?: string }
  | { kind: 'manager'; label?: string };
export type Need = 'any' | 'all';
export type ApprovalStatus = 'not_required' | 'pending' | 'approved' | 'rejected' | 'changes_requested';

export interface PolicyStep { approvers: Approver[]; need: Need; minAmount: number | null; maxAmount: number | null }
export interface ApprovalPolicy {
  steps: PolicyStep[]; allowSelf: boolean; reminderHours: number; escalateHours: number;
  /** Set when this company uses its group's policy. */
  inheritedFrom: { id: string; name: string } | null;
}
export interface ApprovalTeam { id: string; companyId: string; name: string; members: Array<{ kind: 'role' | 'user'; value: string }> }

export interface RequestStep {
  level: number; status: 'pending' | 'approved' | 'rejected'; need: Need; minAmount: number;
  approvers: Array<Approver & { label: string }>; stuck: boolean;
  decidedByName: string | null; decidedAt: string | null; note: string | null;
}
export interface ApprovalItem {
  docType: ApprovalDocType; docId: string; companyId: string; status: ApprovalStatus;
  number: string; amount: number; party: string | null; date: string;
  level?: number; levels: number; steps: RequestStep[]; requesterId: string | null;
  onBehalfOf?: string | null; canDecide: boolean;
}
export type ApprovalBox = 'waiting' | 'mine' | 'decided';

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
  vendor_bill: tr('Approved before it is paid', 'تُعتمد قبل الدفع'), vendor_payment: '', invoice: tr('Approved before it is sent', 'تُعتمد قبل الإرسال'),
  credit_note: '', quotation: tr('Approved before it is sent or converted', 'يُعتمد قبل الإرسال أو التحويل'),
  payroll_run: tr('Approved before it is approved for payment', 'يُعتمد قبل اعتماده للدفع'), document: tr('Approved before it is finalised', 'يُعتمد قبل اعتماده نهائيًا'),
  purchase_requisition: '', leave_request: '',
}[t]);

export const roleLabel = (r: string, tr: (en: string, ar: string) => string) =>
  ({ Admin: tr('Admin', 'مدير النظام'), Manager: tr('Manager', 'مدير'), Accountant: tr('Accountant', 'محاسب'), Employee: tr('Employee', 'موظف') } as Record<string, string>)[r] ?? r;

/** Where to open a document from the inbox. */
export const docLink = (t: ApprovalDocType): string => ({
  purchase_order: '/purchases', expense: '/finance?tab=expenses', vendor_bill: '/finance?tab=payables', vendor_payment: '/finance?tab=payables',
  invoice: '/finance?tab=invoices', credit_note: '/finance?tab=invoices', quotation: '/sales?tab=quotations', payroll_run: '/hr/payroll',
  document: '/documents', purchase_requisition: '/purchases/requisitions', leave_request: '/hr/leave',
}[t]);
