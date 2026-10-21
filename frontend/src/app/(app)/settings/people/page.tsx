'use client';

import { AccessRoute } from '@/modules/authz/components/access-route';
import { PeoplePage } from '@/modules/authz/components/people-page';

export default function PeopleRoute() {
  return <AccessRoute permission="people.view_roles"><PeoplePage /></AccessRoute>;
}
