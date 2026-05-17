'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/context/i18n-context';
import {
  logActivity,
  activityCategories,
  type ActivityCategory,
  type CrmActivity,
} from '@/services/crmService';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contactId: string;
  contactName?: string;
  onLogged?: (activity: CrmActivity) => void;
}

export function LogActivityDialog({ open, onOpenChange, contactId, contactName, onLogged }: Props) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    category: 'Call' as ActivityCategory,
    summary: '',
    outcome: '',
    nextAction: '',
    nextActionDueDate: '',
    durationMinutes: '',
  });

  const reset = () => setForm({
    category: 'Call',
    summary: '',
    outcome: '',
    nextAction: '',
    nextActionDueDate: '',
    durationMinutes: '',
  });

  const handleSave = async () => {
    if (!form.summary.trim()) return;
    setSaving(true);
    try {
      const activity = await logActivity(contactId, {
        category: form.category,
        summary: form.summary.trim(),
        outcome: form.outcome.trim() || undefined,
        nextAction: form.nextAction.trim() || undefined,
        nextActionDueDate: form.nextActionDueDate ? new Date(form.nextActionDueDate) : undefined,
        durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
      });
      onLogged?.(activity);
      onOpenChange(false);
      reset();
      toast({ title: t('crm.activityLogged') });
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t('crm.logActivityTitle')}{contactName ? ` — ${contactName}` : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('crm.activityCategory')}</Label>
              <Select value={form.category} onValueChange={(v: ActivityCategory) => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {activityCategories.map(c => (
                    <SelectItem key={c} value={c}>{t(`crm.cat${c.replace(/\s+/g, '')}`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t('crm.duration')}</Label>
              <Input
                type="number"
                placeholder={t('crm.durationPlaceholder')}
                value={form.durationMinutes}
                onChange={e => setForm(f => ({ ...f, durationMinutes: e.target.value }))}
              />
            </div>
          </div>
          <div>
            <Label>{t('crm.activitySummary')} *</Label>
            <Textarea
              rows={2}
              placeholder={t('crm.activitySummaryPlaceholder')}
              value={form.summary}
              onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
            />
          </div>
          <div>
            <Label>{t('crm.outcome')}</Label>
            <Input
              placeholder={t('crm.outcomePlaceholder')}
              value={form.outcome}
              onChange={e => setForm(f => ({ ...f, outcome: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>{t('crm.nextAction')}</Label>
              <Input
                placeholder={t('crm.nextActionPlaceholder')}
                value={form.nextAction}
                onChange={e => setForm(f => ({ ...f, nextAction: e.target.value }))}
              />
            </div>
            <div>
              <Label>{t('crm.nextActionDue')}</Label>
              <Input
                type="date"
                value={form.nextActionDueDate}
                onChange={e => setForm(f => ({ ...f, nextActionDueDate: e.target.value }))}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={handleSave} disabled={saving || !form.summary.trim()}>{t('crm.logActivity')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
