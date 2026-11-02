'use client';

import * as React from 'react';
import { AccessRoute } from '@/modules/authz/components/access-route';
import { PeoplePage } from '@/modules/authz/components/people-page';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useCompanyScope } from '@/context/company-scope-context';
import { useI18n } from '@/context/i18n-context';
import { usePermissions } from '@/context/permissions-context';
import { GroupPeoplePanel } from '@/modules/groups/components/group-people';

/** People of this company; in a group, also everyone across the group, once. */
export default function PeopleRoute() {
  const { isGroup } = useCompanyScope();
  const canManage = usePermissions().can('people.manage');
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  if (!isGroup || !canManage) return <AccessRoute permission="people.view_roles"><PeoplePage /></AccessRoute>;
  return (
    <AccessRoute permission="people.view_roles">
      <Tabs defaultValue="group" className="mx-auto w-full max-w-5xl">
        <TabsList className="mb-4">
          <TabsTrigger value="group">{tr('Whole group', 'المجموعة كاملة')}</TabsTrigger>
          <TabsTrigger value="company">{tr('This company', 'هذه الشركة')}</TabsTrigger>
        </TabsList>
        <TabsContent value="group"><GroupPeoplePanel /></TabsContent>
        <TabsContent value="company"><PeoplePage /></TabsContent>
      </Tabs>
    </AccessRoute>
  );
}
