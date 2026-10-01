'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { listSubmissions, reviewSubmission, type DeliverableSubmission } from '@/services/portalAccessService';

/** Safe to put in an href: only http(s). The link came from outside the company. */
const safeHref = (value: string) => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
};

/**
 * The influencer's latest version of one deliverable, and staff's decision on
 * it. A comment sent with "Ask for changes" is shown to the influencer.
 */
export function SubmissionReview({ companyId, deliverableId, status, onChanged }: {
  companyId: string;
  deliverableId: string;
  status: string;
  onChanged?: () => void;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [items, setItems] = React.useState<DeliverableSubmission[] | null>(null);
  const [comment, setComment] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const id = React.useId();

  const load = React.useCallback(async () => {
    try {
      setItems(await listSubmissions(companyId, deliverableId));
    } catch {
      setItems([]);
    }
  }, [companyId, deliverableId]);

  React.useEffect(() => { void load(); }, [load, status]);

  if (!items || items.length === 0) return null;
  const latest = items[0];
  const href = safeHref(latest.contentUrl);
  const canReview = status === 'Submitted' && (latest.staffDecision === null || (latest.staffDecision === 'approved' && latest.clientReview?.decision !== 'approved'));

  const decide = async (decision: 'approved' | 'changes_requested') => {
    setBusy(true);
    try {
      await reviewSubmission(companyId, deliverableId, latest.id, decision === 'approved' ? { decision } : { decision, comment });
      setComment('');
      await load();
      onChanged?.();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : tr('Could not save', 'تعذّر الحفظ'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const decisionLabel = (d: DeliverableSubmission['staffDecision']) =>
    d === 'approved' ? tr('Approved by the team', 'اعتمده الفريق') : d === 'changes_requested' ? tr('Changes requested', 'مطلوب تعديلات') : tr('Waiting for review', 'بانتظار المراجعة');

  return (
    <div className="space-y-2 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {tr('Version', 'النسخة')} {latest.version} · {latest.submittedBy ?? '-'} · {new Date(latest.submittedAt).toLocaleString(language === 'ar' ? 'ar-u-nu-latn' : 'en')}
        </span>
        <Badge variant={latest.staffDecision === null ? 'default' : 'secondary'}>{decisionLabel(latest.staffDecision)}</Badge>
      </div>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="break-all font-medium underline underline-offset-4" dir="ltr">{latest.contentUrl}</a>
      ) : (
        <span className="break-all text-muted-foreground" dir="ltr">{latest.contentUrl}</span>
      )}
      {latest.caption && <p dir="auto" className="whitespace-pre-line text-muted-foreground">{latest.caption}</p>}
      {latest.staffComment && <p dir="auto" className="text-muted-foreground">{tr('Your comment', 'تعليقكم')}: {latest.staffComment}</p>}
      {latest.clientReview && (
        <p dir="auto">
          <span className="font-medium">{latest.clientReview.decision === 'approved' ? tr('Client approved', 'اعتمده العميل') : tr('Client asked for changes', 'طلب العميل تعديلات')}</span>
          {latest.clientReview.comment && <span className="text-muted-foreground">: {latest.clientReview.comment}</span>}
        </p>
      )}
      {canReview && (
        <div className="space-y-2 pt-1">
          <label htmlFor={`${id}-comment`} className="block text-xs text-muted-foreground">
            {tr('Comment for the influencer (needed to ask for changes)', 'تعليق للمؤثر (مطلوب لطلب تعديلات)')}
          </label>
          <Input id={`${id}-comment`} dir="auto" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" size="sm" variant="outline" disabled={busy || comment.trim().length < 3} onClick={() => decide('changes_requested')}>
              {tr('Ask for changes', 'طلب تعديلات')}
            </Button>
            {latest.staffDecision === null && (
              <Button type="button" size="sm" disabled={busy} onClick={() => decide('approved')}>{tr('Approve', 'اعتماد')}</Button>
            )}
          </div>
        </div>
      )}
      {items.length > 1 && (
        <details>
          <summary className="cursor-pointer text-xs text-muted-foreground">{tr('Earlier versions', 'نسخ سابقة')} ({items.length - 1})</summary>
          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
            {items.slice(1).map((s) => (
              <li key={s.id} dir="auto">
                {tr('Version', 'النسخة')} {s.version}: {decisionLabel(s.staffDecision)}{s.staffComment ? `: ${s.staffComment}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
