'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import type { CampaignDeliverable } from '@/services/crmService';
import {
  getCampaignPortalBrief,
  getDeliverablePortalBrief,
  saveCampaignPortalBrief,
  saveDeliverablePortalBrief,
} from '@/services/portalAccessService';

/**
 * What influencers read in their portal about this campaign. Written here on
 * purpose, so the campaign's internal notes never reach them.
 */
export function CampaignPortalTab({ companyId, campaignId, deliverables }: { companyId: string; campaignId: string; deliverables: CampaignDeliverable[] }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [brief, setBrief] = React.useState('');
  const [requireClient, setRequireClient] = React.useState(false);
  const [itemBriefs, setItemBriefs] = React.useState<Record<string, string>>({});
  const [loaded, setLoaded] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const visible = deliverables.filter((d) => d.status !== 'Cancelled');
  const id = React.useId();

  React.useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    Promise.all([
      getCampaignPortalBrief(companyId, campaignId),
      ...visible.map((d) => getDeliverablePortalBrief(companyId, d.id)),
    ]).then(([campaign, ...items]) => {
      if (cancelled) return;
      const c = campaign as Awaited<ReturnType<typeof getCampaignPortalBrief>>;
      setBrief(c.influencerBrief ?? '');
      setRequireClient(c.requireClientApproval);
      setItemBriefs(Object.fromEntries((items as Array<{ deliverableId: string; brief: string | null }>).map((i) => [i.deliverableId, i.brief ?? ''])));
      setLoaded(true);
    }).catch(() => { if (!cancelled) setLoaded(true); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, campaignId, visible.map((d) => d.id).join(',')]);

  const save = async () => {
    setBusy(true);
    try {
      await saveCampaignPortalBrief(companyId, campaignId, { influencerBrief: brief, requireClientApproval: requireClient });
      await Promise.all(visible.map((d) => saveDeliverablePortalBrief(companyId, d.id, itemBriefs[d.id] ?? '')));
      toast({ title: tr('Portal brief saved', 'تم حفظ توجيهات البوابة') });
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : tr('Could not save', 'تعذّر الحفظ'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  if (!loaded) return <p className="py-4 text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {tr(
          'Influencers see this brief in their portal once they accept the campaign. Internal notes are never shown to them.',
          'يرى المؤثرون هذه التوجيهات في بوابتهم بعد قبول الحملة. لا تظهر لهم الملاحظات الداخلية أبدًا.',
        )}
      </p>
      <div className="space-y-1.5">
        <Label htmlFor={`${id}-brief`}>{tr('Brief for influencers', 'توجيهات للمؤثرين')}</Label>
        <Textarea id={`${id}-brief`} dir="auto" rows={5} maxLength={5000} value={brief} onChange={(e) => setBrief(e.target.value)} />
      </div>
      <div className="flex items-center justify-between gap-4 rounded-md border p-3">
        <div>
          <Label htmlFor={`${id}-client`}>{tr('Client approves content', 'العميل يعتمد المحتوى')}</Label>
          <p className="text-xs text-muted-foreground">
            {tr('After your team approves a submission, the client must approve it too.', 'بعد اعتماد فريقك للمحتوى، يجب أن يعتمده العميل أيضًا.')}
          </p>
        </div>
        <Switch id={`${id}-client`} checked={requireClient} onCheckedChange={setRequireClient} />
      </div>
      {visible.length > 0 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">{tr('Per deliverable', 'لكل محتوى')}</p>
          {visible.map((d) => (
            <div key={d.id} className="space-y-1.5">
              <Label htmlFor={`${id}-${d.id}`} className="text-xs">{d.title}{d.platform ? ` · ${d.platform}` : ''}</Label>
              <Textarea
                id={`${id}-${d.id}`}
                dir="auto"
                rows={2}
                maxLength={5000}
                value={itemBriefs[d.id] ?? ''}
                onChange={(e) => setItemBriefs((current) => ({ ...current, [d.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
      )}
      <div className="flex justify-end">
        <Button type="button" onClick={save} disabled={busy}>{tr('Save portal brief', 'حفظ توجيهات البوابة')}</Button>
      </div>
    </div>
  );
}
