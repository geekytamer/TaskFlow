'use client';

import * as React from 'react';
import { Lock, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomFieldsForm } from '@/components/ui/custom-fields-form';
import { useI18n } from '@/context/i18n-context';
import { usePermissions } from '@/context/permissions-context';
import { useToast } from '@/hooks/use-toast';
import { getCustomFieldDefinitions, type CustomFieldDefinition } from '@/services/customFieldService';
import { addContactRole, removeContactRole, updateContact, type Contact } from '@/services/contactService';
import {
  contactPriorities,
  leadSources,
  leadStatuses,
  patchContactCrm,
  type ContactPriority,
  type LeadSource,
  type LeadStatus,
} from '@/services/crmService';
import type { User as UserType } from '@/modules/users/types';
import { displayName } from '@/lib/display-name';
import { ContactFormFields, buildContactPayload, contactToForm, type ContactForm } from './contact-form-fields';

const NONE = '__none__';

const SOURCE_AR: Record<string, string> = {
  Instagram: 'إنستغرام', TikTok: 'تيك توك', WhatsApp: 'واتساب', Referral: 'ترشيح', Website: 'الموقع',
  Campaign: 'حملة', 'Former Client': 'عميل سابق', Other: 'أخرى',
};

interface CrmForm {
  leadStatus: string;
  leadSource: string;
  priority: string;
  ownerUserId: string;
  nextFollowupDate: string;
  nextFollowupNote: string;
  visibility: 'Public' | 'Private';
}

const crmOf = (c: Contact): CrmForm => ({
  leadStatus: c.leadStatus ?? '',
  leadSource: c.leadSource ?? '',
  priority: c.priority ?? '',
  ownerUserId: c.ownerUserId ?? '',
  nextFollowupDate: c.nextFollowupDate ? new Date(c.nextFollowupDate).toISOString().slice(0, 10) : '',
  nextFollowupNote: c.nextFollowupNote ?? '',
  visibility: c.visibility ?? 'Public',
});

/**
 * Everything about a contact in one window: identity (management), follow-up
 * and status (anyone who may edit the contact), extra fields. Emptied fields
 * are sent as null so they clear.
 */
export function ContactEditDialog({
  contact,
  open,
  onOpenChange,
  users,
  onSaved,
}: {
  contact: Contact;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  users: UserType[];
  onSaved: (updated: Contact) => void;
}) {
  const { t, language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const { can } = usePermissions();
  const canManage = can('contacts.manage');
  const [form, setForm] = React.useState<ContactForm>(() => contactToForm(contact));
  const [crm, setCrm] = React.useState<CrmForm>(() => crmOf(contact));
  const [defs, setDefs] = React.useState<CustomFieldDefinition[]>([]);
  const [custom, setCustom] = React.useState<Record<string, unknown>>(contact.customFields ?? {});
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setForm(contactToForm(contact));
    setCrm(crmOf(contact));
    setCustom(contact.customFields ?? {});
    let active = true;
    getCustomFieldDefinitions(contact.companyId, 'contact')
      .then((d) => { if (active) setDefs(d); })
      .catch(() => { if (active) setDefs([]); });
    return () => { active = false; };
  }, [open, contact]);

  const save = async () => {
    if (canManage && !form.name.trim() && !form.nameAr.trim() && !form.nameEn.trim()) return;
    setSaving(true);
    try {
      let updated: Contact = contact;
      if (canManage) {
        // Names (both languages) and kind from the shared form; roles go through their own routes below.
        const { roles: _roles, customFields: _custom, ...base } = buildContactPayload(form);
        updated = await updateContact(contact.id, {
          ...base,
          // An emptied field is sent as null: the server clears it.
          legalName: form.legalName.trim() || null,
          contactPerson: form.contactPerson.trim() || null,
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          taxNumber: form.taxNumber.trim() || null,
          notes: form.notes.trim() || null,
          ...(defs.length ? { customFields: custom } : {}),
        });
        const before = contact.roles ?? [];
        for (const role of form.roles.filter((r) => !before.includes(r))) updated = await addContactRole(contact.id, role);
        for (const role of before.filter((r) => !form.roles.includes(r))) updated = await removeContactRole(contact.id, role);
      }
      const crmUpdated = await patchContactCrm(contact.id, {
        leadStatus: (crm.leadStatus || null) as LeadStatus | null,
        leadSource: (crm.leadSource || null) as LeadSource | null,
        priority: (crm.priority || null) as ContactPriority | null,
        ownerUserId: crm.ownerUserId || null,
        // The saved name stays when the owner is not in the list (left the company, another company's user).
        ownerName: crm.ownerUserId
          ? users.find((u) => u.id === crm.ownerUserId)?.name ?? (crm.ownerUserId === contact.ownerUserId ? contact.ownerName ?? null : null)
          : null,
        nextFollowupDate: crm.nextFollowupDate ? new Date(crm.nextFollowupDate) : null,
        nextFollowupNote: crm.nextFollowupNote.trim() || null,
        visibility: crm.visibility,
      });
      onSaved({ ...updated, ...crmUpdated, roles: updated.roles ?? crmUpdated.roles });
      onOpenChange(false);
      toast({ title: t('contacts.updated') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Could not save', 'تعذّر الحفظ'),
        description: error?.status === 403
          ? tr('Your role cannot change this contact.', 'دورك لا يسمح بتعديل هذه الجهة.')
          : tr('Check the details and try again.', 'تحقق من البيانات وحاول مرة أخرى.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const select = (
    label: string,
    value: string,
    options: readonly string[],
    labelOf: (v: string) => string,
    onChange: (v: string) => void,
  ) => (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? '' : v)}>
        <SelectTrigger className="h-9"><SelectValue placeholder="—" /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>—</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{labelOf(o)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tr('Edit', 'تعديل')} · {contact.name}</DialogTitle>
        </DialogHeader>

        {canManage && (
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">{tr('Details', 'البيانات')}</h3>
            <ContactFormFields form={form} setForm={setForm} />
          </section>
        )}

        <section className="space-y-3 border-t pt-4">
          <h3 className="text-sm font-semibold">{tr('Follow-up and status', 'المتابعة والحالة')}</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {select(t('crm.leadStatus'), crm.leadStatus, leadStatuses, (s) => t(`crm.status${s.replace('-', '')}`), (v) => setCrm((f) => ({ ...f, leadStatus: v })))}
            {select(t('crm.priority'), crm.priority, contactPriorities, (p) => t(`crm.priority${p}`), (v) => setCrm((f) => ({ ...f, priority: v })))}
            {select(t('crm.leadSource'), crm.leadSource, leadSources, (s) => (language === 'ar' ? SOURCE_AR[s] ?? s : s), (v) => setCrm((f) => ({ ...f, leadSource: v })))}
            {select(
              t('crm.owner'),
              crm.ownerUserId,
              // The current owner is offered even when not in the company's list, so it never shows blank.
              [...users.map((u) => u.id), ...(contact.ownerUserId && !users.some((u) => u.id === contact.ownerUserId) ? [contact.ownerUserId] : [])],
              (id) => displayName(users.find((u) => u.id === id), language) || (id === contact.ownerUserId ? contact.ownerName ?? id : id),
              (v) => setCrm((f) => ({ ...f, ownerUserId: v })),
            )}
            <div className="space-y-1">
              <Label className="text-xs">{t('crm.nextFollowup')}</Label>
              <Input type="date" className="h-9" value={crm.nextFollowupDate} onChange={(e) => setCrm((f) => ({ ...f, nextFollowupDate: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">{t('crm.followupNote')}</Label>
              <Input className="h-9" value={crm.nextFollowupNote} onChange={(e) => setCrm((f) => ({ ...f, nextFollowupNote: e.target.value }))} placeholder={t('crm.nextActionPlaceholder')} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('crm.visibility')}</Label>
            <div className="flex gap-2">
              {(['Public', 'Private'] as const).map((v) => (
                <Button
                  key={v}
                  type="button"
                  size="sm"
                  variant={crm.visibility === v ? 'secondary' : 'outline'}
                  className="h-8 gap-1.5"
                  onClick={() => setCrm((f) => ({ ...f, visibility: v }))}
                >
                  {v === 'Private' ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                  {t(`crm.visibility${v}`)}
                </Button>
              ))}
            </div>
          </div>
        </section>

        {canManage && defs.length > 0 && (
          <section className="space-y-3 border-t pt-4">
            <h3 className="text-sm font-semibold">{tr('More fields', 'حقول إضافية')}</h3>
            <CustomFieldsForm definitions={defs} values={custom} onChange={setCustom} />
          </section>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button onClick={save} disabled={saving}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
