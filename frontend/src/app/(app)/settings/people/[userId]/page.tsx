'use client';

import { useParams } from 'next/navigation';
import { AccessRoute } from '@/modules/authz/components/access-route';
import { PersonPage } from '@/modules/authz/components/person-page';

export default function PersonRoute() {
  const { userId } = useParams<{ userId: string }>();
  return <AccessRoute permission="people.view_roles"><PersonPage userId={decodeURIComponent(userId)} /></AccessRoute>;
}
