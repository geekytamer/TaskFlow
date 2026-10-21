'use client';

import { useParams } from 'next/navigation';
import { AccessRoute } from '@/modules/authz/components/access-route';
import { TemplatePage } from '@/modules/authz/components/template-page';

export default function GroupTemplateRoute() {
  const { groupId, key } = useParams<{ groupId: string; key: string }>();
  return (
    <AccessRoute>
      <TemplatePage groupId={decodeURIComponent(groupId)} templateKey={decodeURIComponent(key)} />
    </AccessRoute>
  );
}
