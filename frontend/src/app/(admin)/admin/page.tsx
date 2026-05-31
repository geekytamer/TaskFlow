'use client';

import { AdminPage } from '@/modules/admin/components/admin-page';

// Auth + role + chrome are handled by app/(admin)/layout.tsx.
export default function AdminRoute() {
  return <AdminPage />;
}
