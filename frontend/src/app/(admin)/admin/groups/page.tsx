'use client';

import { AdminGroupFrame } from '@/modules/admin/components/admin-group-frame';
import { GroupPage } from '@/modules/authz/components/group-page';

// The company-side Group page, for the platform administrator (?group=<id> picks the group).
export default function AdminGroupRoute() {
  return <AdminGroupFrame><GroupPage /></AdminGroupFrame>;
}
