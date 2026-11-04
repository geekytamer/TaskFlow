'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { quickAddInfluencers, type QuickAddResult } from '@/services/contactService';
import { AlertTriangle, CheckCircle2, UserCheck } from 'lucide-react';

/**
 * Paste profile links or @handles, one influencer per line: each line becomes
 * a record, and a handle already on one answers with that record instead.
 */
export function QuickAddPanel({
  companyId,
  onAdded,
  onOpen,
}: {
  companyId: string;
  onAdded: () => void | Promise<void>;
  /** Opens a record from the results (to fill in its details, or to see the existing one). */
  onOpen: (contactId: string) => void;
}) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [text, setText] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [results, setResults] = React.useState<QuickAddResult[] | null>(null);
  const [fetching, setFetching] = React.useState(false);
  const reloadTimer = React.useRef<number | undefined>(undefined);
  React.useEffect(() => () => window.clearTimeout(reloadTimer.current), []);

  const lines = text.split('\n').filter((l) => l.trim()).length;

  const submit = async () => {
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await quickAddInfluencers(companyId, text);
      setResults(res.results);
      setFetching(res.fetching);
      // Keep only the lines that need another look, so a fix and a second paste is quick.
      setText(res.results.filter((r) => r.status === 'invalid').map((r) => r.line).join('\n'));
      if (res.results.some((r) => r.status === 'created')) await onAdded();
      // The directory fetch runs in the background; show its figures once it has had time to land.
      if (res.fetching) {
        window.clearTimeout(reloadTimer.current);
        reloadTimer.current = window.setTimeout(() => { void onAdded(); }, 8000);
      }
    } catch (error) {
      toast({ variant: 'destructive', title: tr('Could not add', 'تعذّرت الإضافة'), description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  const count = (status: QuickAddResult['status']) => results?.filter((r) => r.status === status).length ?? 0;

  return (
    <div className="space-y-3">
      <Textarea
        dir="auto"
        rows={6}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={tr(
          'instagram.com/muscat.eats\n@salalah.travels\nAhmed Al Balushi @ahmed.om tiktok.com/@ahmed.om',
          'instagram.com/muscat.eats\n@salalah.travels\nأحمد البلوشي @ahmed.om tiktok.com/@ahmed.om',
        )}
        aria-label={tr('Profile links or handles', 'روابط الحسابات أو المعرّفات')}
      />
      <p className="text-xs text-muted-foreground">
        {tr(
          'One influencer per line. Links on the same line are one person’s accounts; words beside them are the name. A bare handle means Instagram.',
          'كل سطر مؤثر واحد. الروابط في نفس السطر حسابات نفس الشخص، والكلام اللي جنبها هو الاسم. المعرّف بدون رابط يعني إنستغرام.',
        )}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{lines > 100 ? tr('At most 100 lines at a time.', 'بحد أقصى 100 سطر في المرة.') : null}</span>
        <Button onClick={submit} disabled={busy || !text.trim() || lines > 100}>
          {busy ? tr('Adding…', 'جارٍ الإضافة…') : lines > 1 ? tr(`Add ${lines}`, `أضف ${lines}`) : tr('Add', 'أضف')}
        </Button>
      </div>

      {results && (
        <div className="space-y-2 rounded-md border p-3 text-sm" aria-live="polite">
          <p className="font-medium">
            {[
              count('created') ? tr(`${count('created')} added`, `أُضيف ${count('created')}`) : '',
              count('existing') ? tr(`${count('existing')} already here`, `${count('existing')} موجود مسبقاً`) : '',
              count('invalid') ? tr(`${count('invalid')} not recognised`, `${count('invalid')} غير مفهوم`) : '',
            ].filter(Boolean).join(' · ')}
          </p>
          {fetching && (
            <p className="text-xs text-muted-foreground">
              {tr('Instagram followers and names are being fetched and will appear on the records shortly.', 'جاري جلب المتابعين والأسماء من إنستغرام، وبتظهر في السجلات بعد شوي.')}
            </p>
          )}
          <ul className="max-h-60 divide-y overflow-y-auto">
            {results.map((r, i) => (
              <li key={i} className="flex items-center justify-between gap-2 py-1.5">
                <span className="flex min-w-0 items-center gap-2">
                  {r.status === 'created' ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                    : r.status === 'existing' ? <UserCheck className="h-4 w-4 shrink-0 text-muted-foreground" />
                      : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />}
                  <span className="min-w-0 truncate">
                    {r.contact ? r.contact.name : <span dir="ltr">{r.line}</span>}
                    {r.status === 'existing' && <span className="text-muted-foreground"> · {tr('already on the list', 'موجود في القائمة')}</span>}
                    {r.status === 'invalid' && <span className="text-muted-foreground"> · {tr('not a profile link or handle', 'مو رابط حساب ولا معرّف')}</span>}
                  </span>
                </span>
                {r.contact && (
                  <Button size="sm" variant="ghost" className="h-7 shrink-0 text-xs" onClick={() => onOpen(r.contact!.id)}>
                    {r.status === 'created' ? tr('Add details', 'أكمل البيانات') : tr('Open', 'افتح')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
