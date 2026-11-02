'use client';

import { AccessRoute } from '@/modules/authz/components/access-route';
import { GroupPage } from '@/modules/authz/components/group-page';

export default function GroupRoute() {
  return <AccessRoute><GroupPage /></AccessRoute>;
}
