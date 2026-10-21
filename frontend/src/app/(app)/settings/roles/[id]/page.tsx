'use client';

import { useParams } from 'next/navigation';
import { AccessRoute } from '@/modules/authz/components/access-route';
import { RoleEditorPage } from '@/modules/authz/components/role-editor';

export default function RoleRoute() {
  const { id } = useParams<{ id: string }>();
  return <AccessRoute permission="people.view_roles"><RoleEditorPage roleId={decodeURIComponent(id)} /></AccessRoute>;
}
