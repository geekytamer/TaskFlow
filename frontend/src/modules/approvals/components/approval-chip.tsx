'use client';

/**
 * The approval chip on a document's row: where it stands in a few words;
 * opening it shows the steps and history, with the decision for whoever may.
 * Nothing shows when the document needs no approval.
 */
import * as React from 'react';
import { AlertTriangle, CheckCircle2, Clock, RotateCcw, XCircle } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useI18n } from '@/context/i18n-context';
import type { ApprovalDocType, ApprovalStatusRow } from '@/services/approvalService';
import { chipText } from '../lib/wording';
import { ApprovalPanel } from './approval-panel';

const tone: Record<string, string> = {
  pending: 'border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300',
  stuck: 'border-destructive/40 bg-destructive/10 text-destructive',
  approved: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
  rejected: 'border-destructive/40 bg-destructive/10 text-destructive',
  changes_requested: 'border-orange-500/40 bg-orange-500/10 text-orange-800 dark:text-orange-300',
};

export function ApprovalChip({ docType, row, onChanged, className = '' }: { docType: ApprovalDocType; row?: ApprovalStatusRow; onChanged?: () => void; className?: string }) {
  const { language } = useI18n();
  const tr = React.useCallback((en: string, ar: string) => (language === 'ar' ? ar : en), [language]);
  const [open, setOpen] = React.useState(false);
  if (!row || row.status === 'not_required') return null;
  const key = row.status === 'pending' && row.stuck ? 'stuck' : row.status;
  const Icon = key === 'approved' ? CheckCircle2 : key === 'rejected' ? XCircle : key === 'changes_requested' ? RotateCcw : key === 'stuck' ? AlertTriangle : Clock;
  const text = chipText(row, tr);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          className={`inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${tone[key]} ${className}`}
          aria-label={`${tr('Approval', 'الموافقة')}: ${text}`}
        >
          <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="truncate" dir="auto">{text}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(24rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto" align="start" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-3 text-sm font-semibold">{tr('Approval', 'الموافقة')}</h3>
        {open && <ApprovalPanel docType={docType} docId={row.docId} onChanged={() => { onChanged?.(); }} />}
      </PopoverContent>
    </Popover>
  );
}
