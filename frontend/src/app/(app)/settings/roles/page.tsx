'use client';

import { AccessRoute } from '@/modules/authz/components/access-route';
import { RolesPage } from '@/modules/authz/components/roles-page';

export default function RolesRoute() {
  return <AccessRoute permission="people.view_roles"><RolesPage /></AccessRoute>;
}
