import { redirect } from 'next/navigation';

/** The old permission-groups screen moved: roles are edited under Settings → Roles. */
export default function PermissionsRedirect() {
  redirect('/settings/roles');
}
