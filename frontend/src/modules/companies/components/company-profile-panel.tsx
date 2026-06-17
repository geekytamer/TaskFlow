'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import { getCompanyById, updateCompany } from '@/services/companyService';
import type { Company } from '@/modules/companies/types';

type Form = {
  name: string; legalName: string; taxNumber: string; registrationNumber: string;
  phone: string; email: string; website: string; address: string; city: string;
  country: string; taxDetails: string;
};

const fromCompany = (c?: Company | null): Form => ({
  name: c?.name ?? '', legalName: c?.legalName ?? '', taxNumber: c?.taxNumber ?? '',
  registrationNumber: c?.registrationNumber ?? '', phone: c?.phone ?? '', email: c?.email ?? '',
  website: c?.website ?? '', address: c?.address ?? '', city: c?.city ?? '',
  country: c?.country ?? '', taxDetails: c?.taxDetails ?? '',
});

export function CompanyProfilePanel() {
  const { selectedCompany, refreshCompanies } = useCompany() as any;
  const { language } = useI18n();
  const { toast } = useToast();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);

  const [form, setForm] = React.useState<Form>(fromCompany());
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!selectedCompany) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    getCompanyById(selectedCompany.id)
      .then((c) => { if (!cancelled) setForm(fromCompany(c)); })
      .catch(() => { if (!cancelled) setForm(fromCompany(selectedCompany)); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [selectedCompany]);

  const set = (key: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((p) => ({ ...p, [key]: e.target.value }));

  const handleSave = async () => {
    if (!selectedCompany || !form.name.trim()) return;
    setSaving(true);
    try {
      await updateCompany(selectedCompany.id, {
        name: form.name.trim(),
        legalName: form.legalName.trim(),
        taxNumber: form.taxNumber.trim(),
        registrationNumber: form.registrationNumber.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        website: form.website.trim(),
        address: form.address.trim(),
        city: form.city.trim(),
        country: form.country.trim(),
        taxDetails: form.taxDetails.trim(),
      });
      await refreshCompanies?.();
      toast({ title: tr('Company details saved', 'تم حفظ بيانات الشركة') });
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not save', 'تعذر الحفظ'), description: error?.message });
    } finally {
      setSaving(false);
    }
  };

  if (!selectedCompany) {
    return <p className="text-muted-foreground">{tr('Select a company first.', 'اختر شركة أولاً.')}</p>;
  }

  const field = (label: string, key: keyof Form, type = 'text') => (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Input type={type} value={form[key]} onChange={set(key)} disabled={loading} />
    </div>
  );

  return (
    <div className="flex h-full flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">{tr('Company Profile', 'ملف الشركة')}</h1>
        <p className="text-muted-foreground">{tr('Legal, tax, and contact details shown on your documents.', 'البيانات القانونية والضريبية ومعلومات الاتصال التي تظهر على مستنداتك.')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{tr('Identity', 'الهوية')}</CardTitle>
          <CardDescription>{tr('How your company is named and registered.', 'كيف تُسمّى شركتك وتُسجّل.')}</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {field(tr('Display name', 'الاسم المعروض') + ' *', 'name')}
          {field(tr('Legal name', 'الاسم القانوني'), 'legalName')}
          {field(tr('Tax / VAT number', 'الرقم الضريبي'), 'taxNumber')}
          {field(tr('Registration number', 'رقم السجل التجاري'), 'registrationNumber')}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr('Contact', 'الاتصال')}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          {field(tr('Phone', 'الهاتف'), 'phone')}
          {field(tr('Email', 'البريد الإلكتروني'), 'email', 'email')}
          {field(tr('Website', 'الموقع الإلكتروني'), 'website')}
          {field(tr('City', 'المدينة'), 'city')}
          {field(tr('Country', 'الدولة'), 'country')}
          <div className="space-y-1 sm:col-span-2">
            <Label>{tr('Address', 'العنوان')}</Label>
            <Textarea value={form.address} onChange={set('address')} disabled={loading} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{tr('Tax details', 'التفاصيل الضريبية')}</CardTitle>
          <CardDescription>{tr('Free-form notes printed on invoices and other documents (e.g. VAT scheme).', 'ملاحظات حرة تُطبع على الفواتير والمستندات الأخرى (مثل النظام الضريبي).')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Textarea rows={3} value={form.taxDetails} onChange={set('taxDetails')} disabled={loading} />
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving || loading || !form.name.trim()}>
          {saving ? tr('Saving…', 'جارٍ الحفظ…') : tr('Save changes', 'حفظ التغييرات')}
        </Button>
      </div>
    </div>
  );
}
