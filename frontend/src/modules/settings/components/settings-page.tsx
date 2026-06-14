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
import { createUserWithId } from '@/services/userService';
import { placeholderUsers } from '@/lib/placeholder-data';
import { Database, UserPlus, Copy } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { runSeedDatabase } from '@/actions/seedActions';
import { useI18n } from '@/context/i18n-context';
import { NumberingSettingsPanel } from './numbering-settings-panel';
import { CustomFieldsPanel } from './custom-fields-panel';
import { WhatsappSettingsPanel } from './whatsapp-settings-panel';
import { PositionTable } from '@/modules/companies/components/position-table';
import { useCompany } from '@/context/company-context';

export function SettingsPage() {
  const { toast } = useToast();
  const { t } = useI18n();
  const { selectedCompany } = useCompany();
  const [isSeeding, setIsSeeding] = React.useState(false);
  const [isCreatingAdmin, setIsCreatingAdmin] = React.useState(false);
  const [adminPassword, setAdminPassword] = React.useState('');

  const handleCreateAdmin = async () => {
    setIsCreatingAdmin(true);
    const adminEmail = 'admin@taskflow.com';
    const password = Math.random().toString(36).slice(-8);
    const adminId = 'admin-placeholder-id';

    try {
      const adminTemplate = placeholderUsers.find(u => u.id === 'admin-placeholder-id');
      if (!adminTemplate) {
          throw new Error("Default admin user template not found in placeholders.");
      }
      
      const firestoreUserData = {
          ...adminTemplate,
          id: adminId,
          email: adminEmail,
          name: 'Admin User',
          avatar: undefined
      };

      await createUserWithId(adminId, { ...firestoreUserData, password });
      
      setAdminPassword(password);
      toast({
        title: t('settingsPage.adminCreated'),
        description: t('settingsPage.adminCreatedDesc'),
      });
    } catch (error: any) {
      console.error(error);
      let description = error?.message || t('settingsPage.couldNotCreateAdmin');
      toast({
        variant: 'destructive',
        title: t('settingsPage.adminCreationFailed'),
        description,
      });
    } finally {
      setIsCreatingAdmin(false);
    }
  };

  const handleSeedDatabase = () => {
    setIsSeeding(true);
    // Provide immediate feedback to the user
    toast({
      title: t('settingsPage.seedingStarted'),
      description: t('settingsPage.seedingStartedDesc'),
    });

    // Asynchronously trigger the server action
    runSeedDatabase()
      .then(result => {
        if (result?.success) {
          toast({
            title: t('settingsPage.seedingCompleted'),
            description: t('settingsPage.seedingCompletedDesc'),
          });
        } else {
          toast({
            variant: 'destructive',
            title: t('settingsPage.seedingFailed'),
            description: result?.message || t('settingsPage.seedingFailedDesc'),
          });
        }
      })
      .catch(error => {
        console.error(error);
        toast({
          variant: 'destructive',
          title: t('settingsPage.seedingFailedToStart'),
          description: t('settingsPage.seedingFailedToStartDesc'),
        });
      })
      .finally(() => {
        setIsSeeding(false);
      });
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(adminPassword);
    toast({
        title: t('settingsPage.copied'),
        description: t('settingsPage.passwordCopied'),
    });
  }

  return (
    <div className="flex h-full flex-col gap-6">
      <div>
        <h1 className="text-3xl font-bold font-headline">{t('settings.title')}</h1>
        <p className="text-muted-foreground">
          {t('settings.subtitle')}
        </p>
      </div>

      <NumberingSettingsPanel />

      {selectedCompany && <CustomFieldsPanel />}

      {selectedCompany && (
        <Card>
          <CardHeader>
            <CardTitle>{t('settingsPage.positionsTitle')}</CardTitle>
            <CardDescription>
              {t('settingsPage.positionsDesc').replace('{company}', selectedCompany.name)}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <PositionTable companyId={selectedCompany.id} />
          </CardContent>
        </Card>
      )}

      <WhatsappSettingsPanel />

      <Card>
        <CardHeader>
          <CardTitle>{t('settingsPage.dbManagement')}</CardTitle>
          <CardDescription>
            {t('settingsPage.dbManagementDesc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-start gap-4">
            <Button onClick={handleCreateAdmin} variant="outline" disabled={isCreatingAdmin}>
              <UserPlus className="me-2 h-4 w-4" />
              {isCreatingAdmin ? t('settingsPage.creatingAdmin') : t('settingsPage.createAdminBtn')}
            </Button>
            <p className="text-sm text-muted-foreground pt-2">
                {t('settingsPage.createAdminHint')}
            </p>
          </div>
           {adminPassword && (
              <div className="flex items-end gap-2 ps-10">
                <div className="grid w-full max-w-sm items-center gap-1.5">
                    <Label htmlFor="password">{t('settingsPage.newAdminPasswordLabel')}</Label>
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
                  <Database className="me-2 h-4 w-4" />
                  {isSeeding ? t('settingsPage.seedingInProgress') : t('settingsPage.seedDbBtn')}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>{t('settingsPage.areYouSure')}</AlertDialogTitle>
                  <AlertDialogDescription>
                    {t('settingsPage.seedConfirm')}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSeedDatabase}>
                    {t('common.continue')}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
             <p className="text-sm text-muted-foreground pt-2">
                {t('settingsPage.seedDbHint')}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
