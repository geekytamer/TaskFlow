'use client';

/**
 * One document's approval, in place: its steps, the full trail, and (for
 * whoever may) approve / reject / send back, or hand the step to someone else.
 */
import * as React from 'react';
import { AlertTriangle, CheckCircle2, CircleDashed, Loader2, UserRoundCog, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useCompanyScope } from '@/context/company-scope-context';
import { useI18n } from '@/context/i18n-context';
import { displayName } from '@/lib/display-name';
import { useToast } from '@/hooks/use-toast';
import { getUsersByCompany } from '@/services/userService';
import { decideApproval, getApprovalView, reassignApproval, type ApprovalDocType, type ApprovalView } from '@/services/approvalService';
import { approverText, trailText } from '../lib/wording';

export function ApprovalPanel({ docType, docId, onChanged }: { docType: ApprovalDocType; docId: string; onChanged?: () => void }) {
  const { language } = useI18n();
  const tr = React.useCallback((en: string, ar: string) => (language === 'ar' ? ar : en), [language]);
  const { currentUser } = useCompany();
  const { companyName } = useCompanyScope();
  const { toast } = useToast();
  const when = React.useMemo(() => new Intl.DateTimeFormat(language === 'ar' ? 'ar-OM' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }), [language]);
  const [view, setView] = React.useState<ApprovalView | null>(null);
  const [failed, setFailed] = React.useState<string | null>(null);
  const [note, setNote] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [handing, setHanding] = React.useState(false);
  const [people, setPeople] = React.useState<Array<{ id: string; name: string; nameAr?: string; nameEn?: string }>>([]);
  const [toUserId, setToUserId] = React.useState('');
  const [reason, setReason] = React.useState('');

  const load = React.useCallback(() => {
    getApprovalView(docType, docId).then((v) => { setView(v); setFailed(null); }).catch((e: Error) => setFailed(e.message));
  }, [docType, docId]);
  React.useEffect(load, [load]);

  const current = view?.steps.find((s) => s.status === 'pending');
  React.useEffect(() => {
    if (!handing || !view) return;
    getUsersByCompany(current?.ownerCompanyId ?? view.companyId)
      .then((list) => setPeople(list.filter((u) => u.id !== view.requesterId && u.id !== currentUser?.id)))
      .catch(() => setPeople([]));
  }, [handing, view, current?.ownerCompanyId, currentUser?.id]);

  const decide = async (decision: 'approve' | 'reject' | 'send_back') => {
    if (decision !== 'approve' && !note.trim()) {
      toast({ variant: 'destructive', title: decision === 'reject' ? tr('Say why it is rejected', 'اذكر سبب الرفض') : tr('Say what needs changing', 'اذكر ما يحتاج إلى تغيير') });
      return;
    }
    setBusy(true);
    try {
      await decideApproval(docType, docId, decision, note.trim() || undefined);
      toast({ title: decision === 'approve' ? tr('Approved', 'تمت الموافقة') : decision === 'reject' ? tr('Rejected', 'تم الرفض') : tr('Sent back for changes', 'أُعيد للتعديل') });
      setNote('');
      load();
      onChanged?.();
    } catch (e) {
      toast({ variant: 'destructive', title: tr('Could not record the decision', 'تعذّر تسجيل القرار'), description: (e as Error).message });
    } finally { setBusy(false); }
  };

  const handOn = async () => {
    if (!toUserId || !reason.trim()) {
      toast({ variant: 'destructive', title: tr('Choose who takes it and say why', 'اختر من يتولاها واذكر السبب') });
      return;
    }
    setBusy(true);
    try {
      await reassignApproval(docType, docId, toUserId, reason.trim());
      toast({ title: tr('Handed on. They have been told.', 'تم التسليم وأُبلغ الشخص.') });
      setHanding(false); setReason(''); setToUserId('');
      load();
      onChanged?.();
    } catch (e) {
      toast({ variant: 'destructive', title: tr('Not handed on', 'لم يتم التسليم'), description: (e as Error).message });
    } finally { setBusy(false); }
  };

  if (failed) return <p className="text-sm text-destructive" role="alert">{failed}</p>;
  if (!view) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{tr('Loading…', 'جارٍ التحميل…')}</p>;

  const nameOf = (id: string) => view.trail.find((t) => t.userId === id)?.userName ?? tr('a colleague', 'زميل');
  return (
    <div className="space-y-4 text-sm">
      <section aria-label={tr('Steps', 'الخطوات')}>
        <ol className="space-y-1.5">
          {view.steps.map((s) => (
            <li key={s.level} className={`flex items-start gap-2 rounded-md px-2 py-1.5 ${s === current ? 'bg-amber-500/10 ring-1 ring-amber-500/40' : ''}`}>
              <span className="mt-0.5 shrink-0">
                {s.status === 'approved' ? <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-label={tr('Approved', 'معتمد')} />
                  : s.status === 'rejected' ? <XCircle className="h-4 w-4 text-destructive" aria-label={tr('Rejected', 'مرفوض')} />
                  : <CircleDashed className="h-4 w-4 text-muted-foreground" aria-label={tr('Waiting', 'قيد الانتظار')} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium" dir="auto">{approverText(s.approvers, s.need, tr)}</span>
                {s.ownerCompanyId && s.ownerCompanyId !== view.companyId && (
                  <span className="text-muted-foreground"> · {tr('sign-off by', 'اعتماد')} {companyName(s.ownerCompanyId) !== s.ownerCompanyId ? companyName(s.ownerCompanyId) : tr('the group', 'المجموعة')}</span>
                )}
                {s.decidedByName && <span className="block text-xs text-muted-foreground" dir="auto">{s.decidedByName}{s.decidedAt ? ` · ${when.format(new Date(s.decidedAt))}` : ''}</span>}
                {s.stuck && (
                  <span className="mt-0.5 flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />{tr('Nobody who can open this company can decide it.', 'لا يوجد من يستطيع البت فيها.')}
                  </span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </section>

      {view.canDecide && (
        <section className="space-y-2" aria-label={tr('Your decision', 'قرارك')}>
          <Label htmlFor={`note-${docId}`} className="text-xs text-muted-foreground">{tr('Note (needed to reject or send back)', 'ملاحظة (مطلوبة للرفض أو الإعادة)')}</Label>
          <Textarea id={`note-${docId}`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} dir="auto" />
          <div className="flex flex-wrap justify-end gap-2">
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={busy} onClick={() => decide('reject')}>{tr('Reject', 'رفض')}</Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => decide('send_back')}>{tr('Send back', 'إعادة للتعديل')}</Button>
            <Button size="sm" disabled={busy} onClick={() => decide('approve')}>{tr('Approve', 'موافقة')}</Button>
          </div>
        </section>
      )}

      {view.canReassign && !handing && (
        <Button size="sm" variant={current?.stuck ? 'default' : 'outline'} className="w-full" onClick={() => setHanding(true)}>
          <UserRoundCog className="me-1.5 h-4 w-4" aria-hidden="true" />{tr('Hand this step to someone else', 'سلّم هذه الخطوة لشخص آخر')}
        </Button>
      )}
      {handing && (
        <section className="space-y-2 rounded-md border p-3" aria-label={tr('Hand on', 'تسليم')}>
          <Label className="text-xs">{tr('Who decides it now', 'من يقرر الآن')}</Label>
          <Select value={toUserId} onValueChange={setToUserId}>
            <SelectTrigger aria-label={tr('Who decides it now', 'من يقرر الآن')}><SelectValue placeholder={tr('Choose a person', 'اختر شخصًا')} /></SelectTrigger>
            <SelectContent>{people.map((p) => <SelectItem key={p.id} value={p.id}>{displayName(p, language)}</SelectItem>)}</SelectContent>
          </Select>
          <Label htmlFor={`reason-${docId}`} className="text-xs">{tr('Why (kept in the history)', 'السبب (يُحفظ في السجل)')}</Label>
          <Textarea id={`reason-${docId}`} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={tr('e.g. Sara is on leave until the 20th', 'مثال: سارة في إجازة حتى يوم 20')} dir="auto" />
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={() => setHanding(false)} disabled={busy}>{tr('Cancel', 'إلغاء')}</Button>
            <Button size="sm" onClick={handOn} disabled={busy}>{tr('Hand on', 'تسليم')}</Button>
          </div>
        </section>
      )}

      <section aria-label={tr('History', 'السجل')}>
        <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{tr('History', 'السجل')}</h4>
        <ol className="space-y-1.5 border-s ps-3">
          {view.trail.map((t, i) => (
            <li key={i} className="text-xs">
              <span dir="auto">{trailText(t, tr, nameOf)}</span>
              <span className="text-muted-foreground"> · {when.format(new Date(t.at))}</span>
              {t.note && <span className="mt-0.5 block text-muted-foreground" dir="auto">“{t.note}”</span>}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
