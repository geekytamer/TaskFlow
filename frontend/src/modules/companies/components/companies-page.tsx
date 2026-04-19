'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CompanyTable } from './company-table';
import { PositionTable } from './position-table';
import { useI18n } from '@/context/i18n-context';

export function CompaniesPage() {
  const { t } = useI18n();

  return (
    <div className="flex h-full flex-col">
      <div className="pb-4">
        <h1 className="text-3xl font-bold font-headline">{t('companies.title')}</h1>
        <p className="text-muted-foreground">
          {t('companies.subtitle')}
        </p>
      </div>
      <Tabs defaultValue="companies">
        <TabsList className="mb-4">
          <TabsTrigger value="companies">{t('companies.tabCompanies')}</TabsTrigger>
          <TabsTrigger value="positions">{t('companies.tabPositions')}</TabsTrigger>
        </TabsList>
        <TabsContent value="companies">
          <CompanyTable />
        </TabsContent>
        <TabsContent value="positions">
          <PositionTable />
        </TabsContent>
      </Tabs>
    </div>
  );
}
