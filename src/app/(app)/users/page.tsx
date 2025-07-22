import { UserTable } from '@/components/users/user-table';
import { Button } from '@/components/ui/button';
import { PlusCircle } from 'lucide-react';

export default function UsersPage() {
  // In a real app, you'd check user role here to conditionally render.
  // const { user } = useAuth();
  // if (user.role !== 'Admin') return <p>Access Denied</p>;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between pb-4">
        <div>
          <h1 className="text-3xl font-bold font-headline">User Management</h1>
          <p className="text-muted-foreground">
            Add, edit, and manage users for your company.
          </p>
        </div>
        <Button>
          <PlusCircle className="mr-2 h-4 w-4" />
          Add User
        </Button>
      </div>
      <UserTable />
    </div>
  );
}
