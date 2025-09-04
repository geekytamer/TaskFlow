'use client';

import * as React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { seedDatabaseFlow } from '@/ai/flows/seed-database';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { createUserWithId } from '@/services/userService';
import { placeholderUsers } from '@/lib/placeholder-data';
import { Database, UserPlus, Copy } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function SettingsPage() {
  const { toast } = useToast();
  const [isSeeding, setIsSeeding] = React.useState(false);
  const [isCreatingAdmin, setIsCreatingAdmin] = React.useState(false);
  const [adminPassword, setAdminPassword] = React.useState('');

  const handleCreateAdmin = async () => {
    setIsCreatingAdmin(true);
    const adminEmail = 'admin@taskflow.com';
    const password = Math.random().toString(36).slice(-8);

    try {
      // 1. Create user in Firebase Auth
      const userCredential = await createUserWithEmailAndPassword(auth, adminEmail, password);
      const adminUid = userCredential.user.uid;

      // 2. Prepare user data for Firestore, using the new UID
      const adminData = placeholderUsers.find(u => u.email === 'alex.j@innovatecorp.com');
      if (!adminData) {
          throw new Error("Default admin user data not found in placeholders.");
      }
      
      const firestoreUserData = {
          name: 'Admin User',
          email: adminEmail,
          role: 'Admin' as const,
          companyId: adminData.companyId,
          positionId: adminData.positionId,
          avatar: `https://i.pravatar.cc/150?u=${adminEmail}`
      };

      // 3. Create user document in Firestore with the correct UID
      await createUserWithId(adminUid, firestoreUserData);
      
      setAdminPassword(password);
      toast({
        title: 'Admin User Created',
        description: 'The admin user has been created in Firebase Authentication and Firestore.',
      });
    } catch (error: any) {
      console.error(error);
      let description = 'Could not create admin user. Check the console for errors.';
      if (error.code === 'auth/email-already-in-use') {
          description = 'The email admin@taskflow.com already exists. You can proceed to seed the database.'
      }
      toast({
        variant: 'destructive',
        title: 'Admin Creation Failed',
        description,
      });
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  const handleSeedDatabase = () => {
    setIsSeeding(true);
    // Asynchronously trigger the flow without awaiting it
    seedDatabaseFlow().then(result => {
        if (result?.success) {
            toast({
                title: 'Database Seeding Completed',
                description: 'Your database has been populated with placeholder data.',
            });
        } else {
             toast({
                variant: 'destructive',
                title: 'Seeding Failed',
                description: result?.message || 'The seeding process failed to complete. Check the console for errors.',
            });
        }
    }).catch(error => {
        console.error(error);
        toast({
            variant: 'destructive',
            title: 'Seeding Failed to Start',
            description: 'Could not start the seeding process. Check the console for errors.',
        });
    }).finally(() => {
        setIsSeeding(false);
    });

    // Provide immediate feedback to the user
    toast({
        title: 'Database Seeding Started',
        description: 'Your database is being populated in the background. This may take a moment.',
    });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(adminPassword);
    toast({
        title: 'Copied!',
        description: 'Password copied to clipboard.',
    });
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">Settings</h1>
        <p className="text-muted-foreground">
          Manage your application settings and data.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Database Management</CardTitle>
          <CardDescription>
            Use the following actions to manage your application data. It is recommended to first create an admin user, then seed the database.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start gap-4">
            <Button onClick={handleCreateAdmin} variant="outline" disabled={isCreatingAdmin}>
              <UserPlus className="mr-2 h-4 w-4" />
              {isCreatingAdmin ? 'Creating Admin...' : '1. Create Admin User'}
            </Button>
            <p className="text-sm text-muted-foreground pt-2">
                Creates a new user with email `admin@taskflow.com` and a random password.
            </p>
          </div>
           {adminPassword && (
              <div className="flex items-end gap-2 pl-10">
                <div className="grid w-full max-w-sm items-center gap-1.5">
                    <Label htmlFor="password">New Admin Password (save this!)</Label>
                    <Input id="password" type="text" readOnly value={adminPassword} />
                </div>
                <Button variant="outline" size="icon" onClick={copyToClipboard}>
                    <Copy className="h-4 w-4" />
                </Button>
              </div>
            )}
          <div className="flex items-start gap-4">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="outline" disabled={isSeeding}>
                  <Database className="mr-2 h-4 w-4" />
                  {isSeeding ? 'Seeding...' : '2. Seed Database'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will wipe all current data in your Firestore collections
                    (companies, positions, users, projects, tasks, comments) and
                    replace it with the default placeholder data. This action cannot
                    be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSeedDatabase}>
                    Continue
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
             <p className="text-sm text-muted-foreground pt-2">
                Populates your database with the initial set of placeholder data.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
