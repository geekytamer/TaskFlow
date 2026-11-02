'use client';

import { useParams } from 'next/navigation';
import { FlexiRoute } from '@/modules/flexi/components/flexi-route';
import { FlexiAccountFilePage } from '@/modules/flexi/components/flexi-account-file';
import { firstCompanyWith, InRecordCompany } from '@/modules/groups/components/in-record-company';
import { getFlexiAccount } from '@/services/flexiService';

export default function Page() {
  const { contactId } = useParams<{ contactId: string }>();
  // In a group: the company that holds this account.
  return (
    <InRecordCompany resolve={(ids) => firstCompanyWith(ids, (id) => getFlexiAccount(id, contactId))}>
      <FlexiRoute><FlexiAccountFilePage /></FlexiRoute>
    </InRecordCompany>
  );
}
