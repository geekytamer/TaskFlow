'use client';

import { FlexiRoute } from '@/modules/flexi/components/flexi-route';
import { FlexiAccountsPage } from '@/modules/flexi/components/flexi-accounts';

export default function Page() {
  return <FlexiRoute><FlexiAccountsPage /></FlexiRoute>;
}
