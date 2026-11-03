'use client';

/** "While I'm away": hand my approvals to a colleague for a date range. */
import * as React from 'react';
import { UserRoundCog } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { getUsersByCompany } from '@/services/userService';
import { getMyDelegation, setMyDelegation, type Delegation } from '@/services/approvalService';

export function DelegationCard() {
  const { selectedCompany, currentUser } = useCompany();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [current, setCurrent] = React.useState<Delegation | null>(null);
  const [people, setPeople] = React.useState<Array<{ id: string; name: string }>>([]);
  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState<Delegation>({ toUserId: '', startsAt: '', endsAt: '' });

  React.useEffect(() => { getMyDelegation().then(setCurrent).catch(() => setCurrent(null)); }, []);
  React.useEffect(() => {
    if (!selectedCompany) return;
    getUsersByCompany(selectedCompany.id).then((list) => setPeople(list.filter((u) => u.id !== currentUser?.id))).catch(() => setPeople([]));
  }, [selectedCompany, currentUser]);

  const nameOf = (id: string) => people.find((p) => p.id === id)?.name ?? tr('a colleague', 'زميل');
  const save = async (d: Delegation | null) => {
    try {
      setCurrent(await setMyDelegation(d));
      setEditing(false);
      toast({ title: d ? tr('Your approvals are handed over', 'تم تسليم موافقاتك') : tr('Your approvals are back with you', 'عادت موافقاتك إليك') });
    } catch (e) {
      toast({ variant: 'destructive', title: tr('Not saved', 'لم يُحفظ'), description: (e as Error).message });
    }
  };

  if (!editing) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <UserRoundCog className="h-4 w-4" aria-hidden="true" />
        {current
          ? tr(`${nameOf(current.toUserId)} decides for you ${current.startsAt} – ${current.endsAt}.`, `${nameOf(current.toUserId)} يقرر عنك من ${current.startsAt} إلى ${current.endsAt}.`)
          : tr('Away? Hand your approvals to a colleague.', 'مسافر؟ سلّم موافقاتك لزميل.')}
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setForm(current ?? { toUserId: people[0]?.id ?? '', startsAt: '', endsAt: '' }); setEditing(true); }}>
          {current ? tr('Change', 'تغيير') : tr('Set up', 'إعداد')}
        </Button>
        {current && <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => save(null)}>{tr('End', 'إنهاء')}</Button>}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border p-3">
      <Select value={form.toUserId} onValueChange={(v) => setForm((f) => ({ ...f, toUserId: v }))}>
        <SelectTrigger className="w-44" aria-label={tr('Colleague', 'الزميل')}><SelectValue placeholder={tr('Colleague', 'الزميل')} /></SelectTrigger>
        <SelectContent>{people.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
      </Select>
      <Input type="date" className="w-40" aria-label={tr('From', 'من')} value={form.startsAt} onChange={(e) => setForm((f) => ({ ...f, startsAt: e.target.value }))} />
      <Input type="date" className="w-40" aria-label={tr('To', 'إلى')} value={form.endsAt} onChange={(e) => setForm((f) => ({ ...f, endsAt: e.target.value }))} />
      <Button size="sm" disabled={!form.toUserId || !form.startsAt || !form.endsAt} onClick={() => save(form)}>{tr('Save', 'حفظ')}</Button>
      <Button size="sm" variant="outline" onClick={() => setEditing(false)}>{tr('Cancel', 'إلغاء')}</Button>
    </div>
  );
}
