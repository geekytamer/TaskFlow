'use client';

import * as React from 'react';
import { SettingsPage } from '@/modules/settings/components/settings-page';

export default function SettingsRoute() {
  // The authentication guard has been temporarily removed from this page
  // to allow for initial application setup. An admin user needs to be
  // created and the database needs to be seeded before login is possible.
  // After initial setup, you can add the useAuthGuard hook back to
  // protect this page.
  return <SettingsPage />;
}
