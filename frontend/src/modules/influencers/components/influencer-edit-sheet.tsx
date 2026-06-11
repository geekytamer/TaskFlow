'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { CreatableCombobox } from '@/components/ui/creatable-combobox';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import {
  updateContact,
  influencerPlatforms,
  type Contact,
  type InfluencerAccount,
} from '@/services/contactService';
import { Plus, Trash2 } from 'lucide-react';

const AVAILABILITY = ['Available', 'Partially Available', 'Unavailable'] as const;

const makeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `acct-${Date.now()}-${Math.round(performance.now())}`;

type ProfileForm = {
  influencerPlatform: string;
  influencerHandle: string;
  influencerNiche: string;
  followerCount: string;
  engagementRate: string;
  rateCardAmount: string;
  location: string;
  availabilityStatus: string;
};

const toForm = (c: Contact): ProfileForm => ({
  influencerPlatform: c.influencerPlatform ?? '',
  influencerHandle: c.influencerHandle ?? '',
  influencerNiche: c.influencerNiche ?? '',
  followerCount: c.followerCount?.toString() ?? '',
  engagementRate: c.engagementRate?.toString() ?? '',
  rateCardAmount: c.rateCardAmount?.toString() ?? '',
  location: c.location ?? '',
  availabilityStatus: c.availabilityStatus ?? '',
});

export function InfluencerEditSheet({
  contact,
  niches,
  onOpenChange,
  onSaved,
}: {
  contact: Contact | null;
  /** Existing niches across the roster, surfaced as autocomplete suggestions. */
  niches: string[];
  onOpenChange: (open: boolean) => void;
  onSaved: (updated: Contact) => void;
}) {
  const { t } = useI18n();
  const { toast } = useToast();
  const [form, setForm] = React.useState<ProfileForm>(() =>
    contact ? toForm(contact) : toForm({} as Contact),
  );
  const [accounts, setAccounts] = React.useState<InfluencerAccount[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (contact) {
      setForm(toForm(contact));
      setAccounts(contact.influencerAccounts ?? []);
    }
  }, [contact]);

  const set = <K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const addAccount = () =>
    setAccounts((prev) => [...prev, { id: makeId(), platform: 'Instagram' }]);
  const updateAccount = (id: string, patch: Partial<InfluencerAccount>) =>
    setAccounts((prev) => prev.map((a) => (a.id === id ? { ...a, ...patch } : a)));
  const removeAccount = (id: string) =>
    setAccounts((prev) => prev.filter((a) => a.id !== id));

  const save = async () => {
    if (!contact) return;
    setSaving(true);
    try {
      const updated = await updateContact(contact.id, {
        influencerPlatform: form.influencerPlatform || undefined,
        influencerHandle: form.influencerHandle || undefined,
        influencerNiche: form.influencerNiche || undefined,
        followerCount: form.followerCount ? Number(form.followerCount) : undefined,
        engagementRate: form.engagementRate ? Number(form.engagementRate) : undefined,
        rateCardAmount: form.rateCardAmount ? Number(form.rateCardAmount) : undefined,
        location: form.location || undefined,
        availabilityStatus: form.availabilityStatus || undefined,
        influencerAccounts: accounts,
      });
      onSaved(updated);
      toast({ title: t('contacts.updated') });
      onOpenChange(false);
    } catch {
      toast({ title: t('common.error'), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={!!contact} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="border-b p-4">
          <SheetTitle>{contact?.name ?? t('crm.influencerProfile')}</SheetTitle>
        </SheetHeader>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{t('crm.platform')}</Label>
              <Select
                value={form.influencerPlatform || '__none__'}
                onValueChange={(v) => set('influencerPlatform', v === '__none__' ? '' : v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {influencerPlatforms.map((p) => (
                    <SelectItem key={p} value={p}>
                      {p}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t('crm.handle')}</Label>
              <Input
                className="h-8 text-sm"
                value={form.influencerHandle}
                placeholder="@username"
                onChange={(e) => set('influencerHandle', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">{t('crm.niche')}</Label>
              <CreatableCombobox
                className="h-8 text-sm"
                options={niches}
                value={form.influencerNiche}
                onValueChange={(v) => set('influencerNiche', v)}
                placeholder={t('influencers.nichePh')}
                searchPlaceholder={t('influencers.nicheSearchPh')}
                createLabel={t('influencers.createNiche')}
              />
            </div>
            <div>
              <Label className="text-xs">{t('crm.availability')}</Label>
              <Select
                value={form.availabilityStatus || '__none__'}
                onValueChange={(v) => set('availabilityStatus', v === '__none__' ? '' : v)}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue placeholder="—" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">—</SelectItem>
                  {AVAILABILITY.map((a) => (
                    <SelectItem key={a} value={a}>
                      {a}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t('crm.followerCount')}</Label>
              <Input
                type="number"
                className="h-8 text-sm"
                value={form.followerCount}
                placeholder="0"
                onChange={(e) => set('followerCount', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">{t('crm.engagementRate')} (%)</Label>
              <Input
                type="number"
                step="0.1"
                className="h-8 text-sm"
                value={form.engagementRate}
                placeholder="0.0"
                onChange={(e) => set('engagementRate', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">{t('crm.rateCard')}</Label>
              <Input
                type="number"
                className="h-8 text-sm"
                value={form.rateCardAmount}
                placeholder="0"
                onChange={(e) => set('rateCardAmount', e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">{t('crm.location')}</Label>
              <Input
                className="h-8 text-sm"
                value={form.location}
                placeholder="City, Country"
                onChange={(e) => set('location', e.target.value)}
              />
            </div>
          </div>

          {/* Per-platform social accounts */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t('crm.accountsTitle')}
              </p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1 text-xs"
                onClick={addAccount}
              >
                <Plus className="h-3 w-3" /> {t('crm.addAccount')}
              </Button>
            </div>
            {accounts.length === 0 && (
              <p className="text-xs text-muted-foreground">{t('crm.noAccounts')}</p>
            )}
            {accounts.map((acc) => (
              <div key={acc.id} className="space-y-2 rounded-lg border bg-muted/20 p-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">{t('crm.platform')}</Label>
                    <Select
                      value={acc.platform}
                      onValueChange={(v) =>
                        updateAccount(acc.id, { platform: v as InfluencerAccount['platform'] })
                      }
                    >
                      <SelectTrigger className="h-8 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {influencerPlatforms.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">{t('crm.handle')}</Label>
                    <Input
                      className="h-8 text-sm"
                      value={acc.handle ?? ''}
                      placeholder="@username"
                      onChange={(e) => updateAccount(acc.id, { handle: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label className="text-[11px] text-muted-foreground">{t('crm.accountUrl')}</Label>
                  <Input
                    className="h-8 text-sm"
                    value={acc.url ?? ''}
                    placeholder="https://…"
                    onChange={(e) => updateAccount(acc.id, { url: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px] text-muted-foreground">{t('crm.followers')}</Label>
                    <Input
                      type="number"
                      className="h-8 text-sm"
                      value={acc.followers ?? ''}
                      placeholder="0"
                      onChange={(e) =>
                        updateAccount(acc.id, {
                          followers: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">{t('crm.avgViews')}</Label>
                    <Input
                      type="number"
                      className="h-8 text-sm"
                      value={acc.avgViews ?? ''}
                      placeholder="0"
                      onChange={(e) =>
                        updateAccount(acc.id, {
                          avgViews: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">
                      {t('crm.engagementRate')} (%)
                    </Label>
                    <Input
                      type="number"
                      step="0.1"
                      className="h-8 text-sm"
                      value={acc.engagementRate ?? ''}
                      placeholder="0.0"
                      onChange={(e) =>
                        updateAccount(acc.id, {
                          engagementRate: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] text-muted-foreground">
                      {t('crm.estimatedAvg')}
                    </Label>
                    <Input
                      type="number"
                      className="h-8 text-sm"
                      value={acc.estimatedAvg ?? ''}
                      placeholder="0"
                      onChange={(e) =>
                        updateAccount(acc.id, {
                          estimatedAvg: e.target.value ? Number(e.target.value) : undefined,
                        })
                      }
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => removeAccount(acc.id)}
                  >
                    <Trash2 className="h-3 w-3" /> {t('common.delete')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t p-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={save} disabled={saving}>
            {t('common.save')}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
