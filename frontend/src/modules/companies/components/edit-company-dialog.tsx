'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ImageUpload } from '@/components/ui/image-upload';
import { useToast } from '@/hooks/use-toast';
import { updateCompany } from '@/services/companyService';
import type { Company } from '../types';
import { CompanyMark } from './company-mark';
import { useI18n } from '@/context/i18n-context';

export function EditCompanyDialog({
  company,
  open,
  onOpenChange,
  onSaved,
}: {
  company: Company | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: (company: Company) => void;
}) {
  const [form, setForm] = React.useState({
    name: '', website: '', address: '', logoUrl: undefined as string | undefined,
    legalName: '', taxNumber: '', registrationNumber: '', phone: '', email: '', city: '', country: '', taxDetails: '',
  });
  const [saving, setSaving] = React.useState(false);
  const { toast } = useToast();
  const { t } = useI18n();

  React.useEffect(() => {
    if (company) {
      setForm({
        name: company.name,
        website: company.website || '',
        address: company.address || '',
        logoUrl: company.logoUrl,
        legalName: company.legalName || '',
        taxNumber: company.taxNumber || '',
        registrationNumber: company.registrationNumber || '',
        phone: company.phone || '',
        email: company.email || '',
        city: company.city || '',
        country: company.country || '',
        taxDetails: company.taxDetails || '',
      });
    }
  }, [company]);

  const save = async () => {
    if (!company || form.name.trim().length < 2) return;
    setSaving(true);
    try {
      const updated = await updateCompany(company.id, {
        name: form.name.trim(),
        website: form.website.trim(),
        address: form.address.trim(),
        logoUrl: form.logoUrl || '',
        legalName: form.legalName.trim(),
        taxNumber: form.taxNumber.trim(),
        registrationNumber: form.registrationNumber.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        city: form.city.trim(),
        country: form.country.trim(),
        taxDetails: form.taxDetails.trim(),
      });
      onSaved(updated);
      onOpenChange(false);
      toast({ title: t('companyEdit.updated') });
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('companyEdit.updateFailed'), description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('companyEdit.title')}</DialogTitle>
          <DialogDescription>{t('companyEdit.description')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3">
            <CompanyMark company={{ name: form.name || 'Company', logoUrl: form.logoUrl }} className="h-14 w-14" />
            <ImageUpload value={form.logoUrl} onChange={(logoUrl) => setForm((current) => ({ ...current, logoUrl }))} label={t('companyEdit.uploadLogo')} />
          </div>
          <div className="space-y-1"><Label>{t('companyEdit.name')}</Label><Input value={form.name} onChange={(e) => setForm((current) => ({ ...current, name: e.target.value }))} /></div>
          <div className="space-y-1"><Label>{t('companyEdit.website')}</Label><Input value={form.website} onChange={(e) => setForm((current) => ({ ...current, website: e.target.value }))} /></div>
          <div className="space-y-1"><Label>{t('companyEdit.address')}</Label><Input value={form.address} onChange={(e) => setForm((current) => ({ ...current, address: e.target.value }))} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>{t('companyEdit.legalName', 'Legal name')}</Label><Input value={form.legalName} onChange={(e) => setForm((c) => ({ ...c, legalName: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('companyEdit.taxNumber', 'Tax / VAT number')}</Label><Input value={form.taxNumber} onChange={(e) => setForm((c) => ({ ...c, taxNumber: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('companyEdit.registrationNumber', 'Registration number')}</Label><Input value={form.registrationNumber} onChange={(e) => setForm((c) => ({ ...c, registrationNumber: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('companyEdit.phone', 'Phone')}</Label><Input value={form.phone} onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('companyEdit.email', 'Email')}</Label><Input value={form.email} onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('companyEdit.city', 'City')}</Label><Input value={form.city} onChange={(e) => setForm((c) => ({ ...c, city: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('companyEdit.country', 'Country')}</Label><Input value={form.country} onChange={(e) => setForm((c) => ({ ...c, country: e.target.value }))} /></div>
          </div>
          <div className="space-y-1"><Label>{t('companyEdit.taxDetails', 'Tax details')}</Label><Input value={form.taxDetails} onChange={(e) => setForm((c) => ({ ...c, taxDetails: e.target.value }))} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button disabled={saving || form.name.trim().length < 2} onClick={save}>{saving ? t('companyEdit.saving') : t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
