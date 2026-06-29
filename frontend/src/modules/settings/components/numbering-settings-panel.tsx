'use client';

import * as React from 'react';
import { format } from 'date-fns';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import { supportedCurrencies, normalizeCurrencyCode, currencyLabel } from '@/lib/currency';
import type {
  CompanyFinanceSettings,
  CompanyNumberingSetting,
  NumberingEntityType,
} from '@/modules/finance/types';
import {
  getCompanyFinanceSettings,
  getCompanyNumberingSettings,
  updateCompanyFinanceSettings,
  updateCompanyNumberingSetting,
} from '@/services/financeService';
import { LockKeyhole, Save } from 'lucide-react';
import { useI18n } from '@/context/i18n-context';

const entityLabels: Record<NumberingEntityType, string> = {
  client: 'Clients',
  supplier: 'Suppliers',
  inventory_item: 'Inventory Items / SKU',
  purchase_order: 'Purchase Orders',
  sales_order: 'Sales Orders',
  sales_invoice: 'Sales Invoices',
  vendor_invoice: 'Vendor Invoices',
};

const months = [
  ['1', 'January'],
  ['2', 'February'],
  ['3', 'March'],
  ['4', 'April'],
  ['5', 'May'],
  ['6', 'June'],
  ['7', 'July'],
  ['8', 'August'],
  ['9', 'September'],
  ['10', 'October'],
  ['11', 'November'],
  ['12', 'December'],
];

type EditableSetting = CompanyNumberingSetting & {
  draftPrefix: string;
  draftPadLength: string;
  draftNextNumber: string;
  saving?: boolean;
};

export function NumberingSettingsPanel() {
  const { selectedCompany, currentRole } = useCompany();
  const { toast } = useToast();
  const { t, language } = useI18n();
  const tr = React.useCallback((en: string, ar: string) => (language === 'ar' ? ar : en), [language]);
  const entityLabelKeys: Record<NumberingEntityType, string> = {
    client: 'settingsPage.entityClients',
    supplier: 'settingsPage.entitySuppliers',
    inventory_item: 'settingsPage.entityInventoryItems',
    purchase_order: 'settingsPage.entityPurchaseOrders',
    sales_order: 'settingsPage.entitySalesOrders',
    sales_invoice: 'settingsPage.entitySalesInvoices',
    vendor_invoice: 'settingsPage.entityVendorInvoices',
  };
  const [settings, setSettings] = React.useState<EditableSetting[]>([]);
  const [financeSettings, setFinanceSettings] = React.useState<CompanyFinanceSettings | null>(null);
  const [lockedThroughDate, setLockedThroughDate] = React.useState('');
  const [fiscalYearStartMonth, setFiscalYearStartMonth] = React.useState('1');
  const [currencyCode, setCurrencyCode] = React.useState('USD');
  const [poApprovalThreshold, setPoApprovalThreshold] = React.useState('0');
  const [loading, setLoading] = React.useState(true);
  const [savingFinance, setSavingFinance] = React.useState(false);

  const canEdit = currentRole === 'Admin' || currentRole === 'Manager';

  const load = React.useCallback(async () => {
    if (!selectedCompany) {
      setSettings([]);
      setFinanceSettings(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [numberingData, financeData] = await Promise.all([
        getCompanyNumberingSettings(selectedCompany.id),
        getCompanyFinanceSettings(selectedCompany.id),
      ]);
      setSettings(
        numberingData.map((setting) => ({
          ...setting,
          draftPrefix: setting.prefix,
          draftPadLength: String(setting.padLength),
          draftNextNumber: String(setting.nextNumber),
        })),
      );
      setFinanceSettings(financeData);
      setFiscalYearStartMonth(String(financeData?.fiscalYearStartMonth || 1));
      setCurrencyCode(normalizeCurrencyCode(financeData?.currencyCode));
      setPoApprovalThreshold(String(financeData?.poApprovalThreshold ?? 0));
      setLockedThroughDate(
        financeData?.lockedThroughDate ? format(financeData.lockedThroughDate, 'yyyy-MM-dd') : '',
      );
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('settingsPage.settingsUnavailable'),
        description: error?.message || t('settingsPage.couldNotLoadNumbering'),
      });
    } finally {
      setLoading(false);
    }
  }, [selectedCompany, toast]);

  React.useEffect(() => {
    load();
  }, [load]);

  const updateDraft = (
    entityType: NumberingEntityType,
    patch: Partial<Pick<EditableSetting, 'draftPrefix' | 'draftPadLength' | 'draftNextNumber'>>,
  ) => {
    setSettings((prev) =>
      prev.map((setting) => (setting.entityType === entityType ? { ...setting, ...patch } : setting)),
    );
  };

  const saveNumbering = async (setting: EditableSetting) => {
    if (!selectedCompany) return;
    setSettings((prev) =>
      prev.map((entry) =>
        entry.entityType === setting.entityType ? { ...entry, saving: true } : entry,
      ),
    );
    try {
      const updated = await updateCompanyNumberingSetting(selectedCompany.id, setting.entityType, {
        prefix: setting.draftPrefix,
        padLength: Number(setting.draftPadLength),
        nextNumber: Number(setting.draftNextNumber),
      });
      setSettings((prev) =>
        prev.map((entry) =>
          entry.entityType === setting.entityType
            ? {
                ...updated,
                draftPrefix: updated.prefix,
                draftPadLength: String(updated.padLength),
                draftNextNumber: String(updated.nextNumber),
                saving: false,
              }
            : entry,
        ),
      );
      toast({ title: t('settingsPage.numberingUpdated'), description: `${entityLabels[setting.entityType]} now starts from ${updated.sample}.` });
    } catch (error: any) {
      setSettings((prev) =>
        prev.map((entry) =>
          entry.entityType === setting.entityType ? { ...entry, saving: false } : entry,
        ),
      );
      toast({
        variant: 'destructive',
        title: t('settingsPage.numberingUpdateFailed'),
        description: error?.message || t('settingsPage.couldNotUpdateNumbering'),
      });
    }
  };

  const saveFinanceSettings = async () => {
    if (!selectedCompany) return;
    setSavingFinance(true);
    try {
      const updated = await updateCompanyFinanceSettings(selectedCompany.id, {
        fiscalYearStartMonth: Number(fiscalYearStartMonth),
        lockedThroughDate: lockedThroughDate ? new Date(lockedThroughDate) : null,
        currencyCode,
        poApprovalThreshold: Math.max(0, Number(poApprovalThreshold) || 0),
      });
      setFinanceSettings(updated);
      toast({ title: t('settingsPage.financeUpdated') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: t('settingsPage.financeUpdateFailed'),
        description: error?.message || t('settingsPage.couldNotUpdateFinance'),
      });
    } finally {
      setSavingFinance(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-5 w-56" /></CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-10 w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  if (!selectedCompany) {
    return (
      <Card>
        <CardContent className="flex h-32 items-center justify-center text-sm text-muted-foreground">
          {t('settingsPage.selectCompanyToManage')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {!canEdit && (
        <Alert>
          <LockKeyhole className="h-4 w-4" />
          <AlertTitle>{t('settingsPage.viewOnly')}</AlertTitle>
          <AlertDescription>{t('settingsPage.viewOnlyDesc')}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('settingsPage.companyNumbering')}</CardTitle>
          <CardDescription>
            {t('settingsPage.companyNumberingDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('settingsPage.colDocument')}</TableHead>
                  <TableHead>{t('settingsPage.colPrefix')}</TableHead>
                  <TableHead>{t('settingsPage.colPadding')}</TableHead>
                  <TableHead>{t('settingsPage.colNextNumber')}</TableHead>
                  <TableHead>{t('settingsPage.colPreview')}</TableHead>
                  <TableHead className="text-end">{t('settingsPage.colAction')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {settings.map((setting) => (
                  <TableRow key={setting.entityType}>
                    <TableCell className="font-medium">{t(entityLabelKeys[setting.entityType])}</TableCell>
                    <TableCell>
                      <Input
                        value={setting.draftPrefix}
                        onChange={(event) => updateDraft(setting.entityType, { draftPrefix: event.target.value })}
                        disabled={!canEdit}
                        className="w-28"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        max={12}
                        value={setting.draftPadLength}
                        onChange={(event) => updateDraft(setting.entityType, { draftPadLength: event.target.value })}
                        disabled={!canEdit}
                        className="w-24"
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min={1}
                        value={setting.draftNextNumber}
                        onChange={(event) => updateDraft(setting.entityType, { draftNextNumber: event.target.value })}
                        disabled={!canEdit}
                        className="w-28"
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {setting.draftPrefix}
                      {String(Number(setting.draftNextNumber || 1)).padStart(Number(setting.draftPadLength || 1), '0')}
                    </TableCell>
                    <TableCell className="text-end">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!canEdit || setting.saving}
                        onClick={() => saveNumbering(setting)}
                      >
                        <Save className="me-2 h-4 w-4" />
                        {setting.saving ? t('settingsPage.saving') : t('common.save')}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('settingsPage.financeControls')}</CardTitle>
          <CardDescription>
            {t('settingsPage.financeControlsDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-[220px_220px_220px_220px_auto]">
          <div className="space-y-1">
            <Label>{t('settingsPage.platformCurrency')}</Label>
            <Select
              value={currencyCode}
              onValueChange={setCurrencyCode}
              disabled={!canEdit}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {supportedCurrencies.map((currency) => (
                  <SelectItem key={currency.code} value={currency.code}>
                    {currency.code} - {currencyLabel(currency, language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t('settingsPage.fiscalYearStarts')}</Label>
            <Select
              value={fiscalYearStartMonth}
              onValueChange={setFiscalYearStartMonth}
              disabled={!canEdit}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>{t('settingsPage.lockedThroughDate')}</Label>
            <Input
              type="date"
              value={lockedThroughDate}
              onChange={(event) => setLockedThroughDate(event.target.value)}
              disabled={!canEdit}
            />
          </div>
          <div className="space-y-1">
            <Label>{tr('PO approval threshold', 'حد اعتماد أمر الشراء')}</Label>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={poApprovalThreshold}
              onChange={(event) => setPoApprovalThreshold(event.target.value)}
              disabled={!canEdit}
            />
            <p className="text-xs text-muted-foreground">
              {tr('Orders at or above this need approval. 0 disables.', 'الأوامر بهذا المبلغ أو أكثر تتطلب اعتماداً. 0 لتعطيله.')}
            </p>
          </div>
          <div className="flex items-end">
            <Button onClick={saveFinanceSettings} disabled={!canEdit || savingFinance}>
              {savingFinance ? t('settingsPage.saving') : t('settingsPage.saveFinanceControls')}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground md:col-span-5">
            {t('settingsPage.currencyLabel')}: {financeSettings?.currencyCode || 'USD'}. {t('settingsPage.omrNote')}
          </p>
          <p className="text-sm text-muted-foreground md:col-span-5">
            {t('settingsPage.currentLock')}:{' '}
            {financeSettings?.lockedThroughDate
              ? t('settingsPage.lockBlocked').replace('{date}', format(financeSettings.lockedThroughDate, 'MMM d, yyyy'))
              : t('settingsPage.noLockSet')}
            .
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
