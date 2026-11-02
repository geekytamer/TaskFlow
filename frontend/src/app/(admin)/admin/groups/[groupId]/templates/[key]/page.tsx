'use client';

import { useParams } from 'next/navigation';
import { AdminGroupFrame } from '@/modules/admin/components/admin-group-frame';
import { TemplatePage } from '@/modules/authz/components/template-page';

export default function AdminGroupTemplateRoute() {
  const { groupId, key } = useParams<{ groupId: string; key: string }>();
  return (
    // The template page has its own back link to the Group page.
    <AdminGroupFrame back={false}>
      <TemplatePage groupId={decodeURIComponent(groupId)} templateKey={decodeURIComponent(key)} />
    </AdminGroupFrame>
  );
}
