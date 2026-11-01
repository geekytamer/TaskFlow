'use client';

import { FlexiRoute } from '@/modules/flexi/components/flexi-route';
import { FlexiSettingsPage } from '@/modules/flexi/components/flexi-settings';

export default function Page() {
  return <FlexiRoute><FlexiSettingsPage /></FlexiRoute>;
}
