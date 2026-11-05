'use client';

import * as React from 'react';
import { Copy, Database, UserPlus } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/context/i18n-context';
import { createUserWithId } from '@/services/userService';
import { placeholderUsers } from '@/lib/placeholder-data';
import { runSeedDatabase } from '@/actions/seedActions';

/**
 * Database tools for setting up a development server: create the default
 * admin, fill the database with demo data. Settings shows them only on a
 * development build or to a platform super admin, never next to everyday settings.
 */
export function DeveloperToolsPanel() {
  const { toast } = useToast();
  const { t } = useI18n();
  const [isSeeding, setIsSeeding] = React.useState(false);
  const [isCreatingAdmin, setIsCreatingAdmin] = React.useState(false);
  const [adminPassword, setAdminPassword] = React.useState('');

  const handleCreateAdmin = async () => {
    setIsCreatingAdmin(true);
    const adminId = 'admin-placeholder-id';
    const password = Math.random().toString(36).slice(-8);
    try {
      const adminTemplate = placeholderUsers.find((u) => u.id === adminId);
      if (!adminTemplate) throw new Error('Default admin user template not found in placeholders.');
      // Omit the template's id: createUserWithId takes it separately.
      const { id: _templateId, ...template } = adminTemplate;
      await createUserWithId(adminId, { ...template, email: 'admin@taskflow.com', name: 'Admin User', avatar: undefined, password });
      setAdminPassword(password);
      toast({ title: t('settingsPage.adminCreated'), description: t('settingsPage.adminCreatedDesc') });
    } catch (error) {
      console.error(error);
      toast({ variant: 'destructive', title: t('settingsPage.adminCreationFailed'), description: (error as Error)?.message || t('settingsPage.couldNotCreateAdmin') });
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  const handleSeedDatabase = () => {
    setIsSeeding(true);
    toast({ title: t('settingsPage.seedingStarted'), description: t('settingsPage.seedingStartedDesc') });
    runSeedDatabase()
      .then((result) => {
        if (result?.success) toast({ title: t('settingsPage.seedingCompleted'), description: t('settingsPage.seedingCompletedDesc') });
        else toast({ variant: 'destructive', title: t('settingsPage.seedingFailed'), description: result?.message || t('settingsPage.seedingFailedDesc') });
      })
      .catch((error) => {
        console.error(error);
        toast({ variant: 'destructive', title: t('settingsPage.seedingFailedToStart'), description: t('settingsPage.seedingFailedToStartDesc') });
      })
      .finally(() => setIsSeeding(false));
  };

  const copyToClipboard = () => {
    void navigator.clipboard.writeText(adminPassword);
    toast({ title: t('settingsPage.copied'), description: t('settingsPage.passwordCopied') });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settingsPage.dbManagement')}</CardTitle>
        <CardDescription>{t('settingsPage.dbManagementDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <Button onClick={handleCreateAdmin} variant="outline" disabled={isCreatingAdmin} className="shrink-0">
            <UserPlus className="me-2 h-4 w-4" />
            {isCreatingAdmin ? t('settingsPage.creatingAdmin') : t('settingsPage.createAdminBtn')}
          </Button>
          <p className="text-sm text-muted-foreground sm:pt-2">{t('settingsPage.createAdminHint')}</p>
        </div>
        {adminPassword ? (
          <div className="flex items-end gap-2">
            <div className="grid w-full max-w-sm items-center gap-1.5">
              <Label htmlFor="new-admin-password">{t('settingsPage.newAdminPasswordLabel')}</Label>
              <Input id="new-admin-password" type="text" readOnly value={adminPassword} dir="ltr" />
            </div>
            <Button variant="outline" size="icon" onClick={copyToClipboard} aria-label={t('settingsPage.copied')}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" disabled={isSeeding} className="shrink-0">
                <Database className="me-2 h-4 w-4" />
                {isSeeding ? t('settingsPage.seedingInProgress') : t('settingsPage.seedDbBtn')}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>{t('settingsPage.areYouSure')}</AlertDialogTitle>
                <AlertDialogDescription>{t('settingsPage.seedConfirm')}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                <AlertDialogAction onClick={handleSeedDatabase}>{t('common.continue')}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
          <p className="text-sm text-muted-foreground sm:pt-2">{t('settingsPage.seedDbHint')}</p>
        </div>
      </CardContent>
    </Card>
  );
}
