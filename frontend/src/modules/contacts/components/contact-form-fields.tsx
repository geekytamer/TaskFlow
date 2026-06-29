'use client';

import * as React from 'react';
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
import { useI18n } from '@/context/i18n-context';
import type { Contact, ContactRoleType } from '@/services/contactService';

export const ALL_ROLES: ContactRoleType[] = ['Lead', 'Client', 'Vendor', 'Influencer', 'Partner'];

export const ROLE_COLORS: Record<ContactRoleType, string> = {
  Lead: 'bg-yellow-100 text-yellow-800',
  Client: 'bg-blue-100 text-blue-800',
  Vendor: 'bg-purple-100 text-purple-800',
  Influencer: 'bg-pink-100 text-pink-800',
  Partner: 'bg-green-100 text-green-800',
};

export type ContactForm = {
  kind: 'Organization' | 'Person';
  name: string;
  legalName: string;
  contactPerson: string;
  email: string;
  phone: string;
  address: string;
  taxNumber: string;
  notes: string;
  roles: ContactRoleType[];
};

export const emptyContactForm = (overrides: Partial<ContactForm> = {}): ContactForm => ({
  kind: 'Organization',
  name: '',
  legalName: '',
  contactPerson: '',
  email: '',
  phone: '',
  address: '',
  taxNumber: '',
  notes: '',
  roles: [],
  ...overrides,
});

export const contactToForm = (c: Contact): ContactForm => ({
  kind: c.kind,
  name: c.name,
  legalName: c.legalName ?? '',
  contactPerson: c.contactPerson ?? '',
  email: c.email ?? '',
  phone: c.phone ?? '',
  address: c.address ?? '',
  taxNumber: c.taxNumber ?? '',
  notes: c.notes ?? '',
  roles: (c.roles as ContactRoleType[]) ?? [],
});

/** Build the createContact/updateContact payload from the shared form. */
export function buildContactPayload(
  form: ContactForm,
  options: { customFields?: Record<string, unknown>; lockedRole?: ContactRoleType } = {},
) {
  const { customFields, lockedRole } = options;
  return {
    kind: form.kind,
    name: form.name.trim(),
    legalName: form.legalName.trim() || undefined,
    contactPerson: form.contactPerson.trim() || undefined,
    email: form.email.trim() || undefined,
    phone: form.phone.trim() || undefined,
    address: form.address.trim() || undefined,
    taxNumber: form.taxNumber.trim() || undefined,
    notes: form.notes.trim() || undefined,
    roles: lockedRole ? [lockedRole] : form.roles.length > 0 ? form.roles : undefined,
    customFields:
      customFields && Object.keys(customFields).length > 0 ? customFields : undefined,
  };
}

/**
 * Canonical identity fields for a contact, shared by the Contacts page and every
 * role-specific page (Clients, Vendors, Influencers, Leads). When `lockedRole`
 * is set the role is implied by the page, so the role selector is hidden.
 */
export function ContactFormFields({
  form,
  setForm,
  lockedRole,
  hideRoles,
}: {
  form: ContactForm;
  setForm: React.Dispatch<React.SetStateAction<ContactForm>>;
  lockedRole?: ContactRoleType;
  /** Hide the role selector when the caller manages the role separately. */
  hideRoles?: boolean;
}) {
  const { t } = useI18n();
  const toggleRole = (role: ContactRoleType) =>
    setForm((f) => ({
      ...f,
      roles: f.roles.includes(role) ? f.roles.filter((r) => r !== role) : [...f.roles, role],
    }));
  return (
    <div className="space-y-4 py-2">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t('contacts.kind')}</Label>
          <Select value={form.kind} onValueChange={(v: 'Organization' | 'Person') => setForm((f) => ({ ...f, kind: v }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="Organization">{t('contacts.kindOrg')}</SelectItem>
              <SelectItem value="Person">{t('contacts.kindPerson')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>{t('contacts.name')} *</Label>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t('contacts.legalName')}</Label>
          <Input value={form.legalName} onChange={(e) => setForm((f) => ({ ...f, legalName: e.target.value }))} />
        </div>
        <div>
          <Label>{t('contacts.contactPerson')}</Label>
          <Input value={form.contactPerson} onChange={(e) => setForm((f) => ({ ...f, contactPerson: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t('contacts.email')}</Label>
          <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
        </div>
        <div>
          <Label>{t('contacts.phone')}</Label>
          <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>{t('contacts.address')}</Label>
          <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
        </div>
        <div>
          <Label>{t('contacts.taxNumber')}</Label>
          <Input value={form.taxNumber} onChange={(e) => setForm((f) => ({ ...f, taxNumber: e.target.value }))} />
        </div>
      </div>
      {!lockedRole && !hideRoles && (
        <div>
          <Label>{t('contacts.roles')}</Label>
          <div className="flex flex-wrap gap-2 mt-1">
            {ALL_ROLES.map((role) => (
              <button
                key={role}
                type="button"
                onClick={() => toggleRole(role)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-all ${
                  form.roles.includes(role)
                    ? ROLE_COLORS[role] + ' border-transparent'
                    : 'bg-transparent border-muted-foreground/30 text-muted-foreground hover:border-muted-foreground'
                }`}
              >
                {t(`contacts.role${role}`)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div>
        <Label>{t('contacts.notes')}</Label>
        <Textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2} />
      </div>
    </div>
  );
}
