import { UsersPage } from '@/modules/users/components/users-page';

export default function UsersRoute() {
  // In a real app, you'd check user role here to conditionally render.
  // const { user } = useAuth();
  // if (user.role !== 'Admin') return <p>Access Denied</p>;

  return <UsersPage />;
}
