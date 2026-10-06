import { apiFetch } from '@/lib/api-client';

export type ApprovalDocType = 'purchase_order' | 'expense';
export type ApproverRole = 'Manager' | 'Accountant' | 'Admin';
export interface ApprovalRule { id: string; docType: ApprovalDocType; minAmount: number; approverRole: ApproverRole }
export interface ApprovalStep { level: number; minAmount: number; approverRole: ApproverRole; status: 'pending' | 'approved' | 'rejected'; decidedByName: string | null; decidedAt: string | null; note: string | null }
export interface WaitingApproval {
  docType: ApprovalDocType; docId: string; level: number; levels: number; approverRole: ApproverRole; canDecide: boolean;
  number: string; amount: number; party: string | null; date: string;
}

export const getApprovalRules = (companyId: string) => apiFetch<ApprovalRule[]>(`/companies/${companyId}/approvals/rules`);
export const setApprovalRules = (companyId: string, docType: ApprovalDocType, rules: Array<{ minAmount: number; approverRole: ApproverRole }>) =>
  apiFetch<ApprovalRule[]>(`/companies/${companyId}/approvals/rules`, { method: 'PUT', body: JSON.stringify({ docType, rules }) });
export const getWaitingApprovals = (companyId: string) => apiFetch<WaitingApproval[]>(`/companies/${companyId}/approvals`);
export const getApprovalSteps = (docType: ApprovalDocType, docId: string) => apiFetch<ApprovalStep[]>(`/approvals/${docType}/${docId}`);
export const decideApproval = (docType: ApprovalDocType, docId: string, decision: 'approve' | 'reject', note?: string) =>
  apiFetch<unknown>(`/approvals/${docType}/${docId}/decision`, { method: 'POST', body: JSON.stringify({ decision, note }) });
