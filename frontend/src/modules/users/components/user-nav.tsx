'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { logout } from '@/services/authService';
import { useCompany } from '@/context/company-context';
import { Skeleton } from '@/components/ui/skeleton';
import { useI18n } from '@/context/i18n-context';
import { ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ImageUpload } from '@/components/ui/image-upload';
import { updateCurrentUser } from '@/services/authService';
import { useToast } from '@/hooks/use-toast';

export function UserNav() {
  const router = useRouter();
  const { currentUser: user, loading } = useCompany();
  const { t } = useI18n();
  const { toast } = useToast();
  const [profileOpen, setProfileOpen] = React.useState(false);
  const [profileName, setProfileName] = React.useState('');
  const [profileAvatar, setProfileAvatar] = React.useState<string | undefined>();
  const [savingProfile, setSavingProfile] = React.useState(false);

  const handleLogout = async () => {
    await logout();
    router.push('/login');
  };
  
  if (loading) {
     return <Skeleton className="h-10 w-full" />
  }

  if (!user) {
    return null;
  }

  const openProfile = () => {
    setProfileName(user.name);
    setProfileAvatar(user.avatar);
    setProfileOpen(true);
  };

  const saveProfile = async () => {
    if (profileName.trim().length < 2) return;
    setSavingProfile(true);
    try {
      await updateCurrentUser({ name: profileName.trim(), avatar: profileAvatar || '' });
      setProfileOpen(false);
      toast({ title: t('profile.updated') });
    } catch (error: any) {
      toast({ variant: 'destructive', title: t('profile.updateFailed'), description: error?.message });
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative h-10 w-full justify-start gap-2 px-2"
        >
          <Avatar className="h-8 w-8">
            <AvatarImage src={user.avatar} alt={user.name} />
            <AvatarFallback>{user.name.charAt(0)}</AvatarFallback>
          </Avatar>
          <div className="text-start group-data-[collapsible=icon]:hidden">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56" align="end" forceMount>
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium leading-none">{user.name}</p>
            <p className="text-xs leading-none text-muted-foreground">
              {user.email}
            </p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={openProfile}>{t('user.profile')}</DropdownMenuItem>
          <DropdownMenuItem>{t('user.settings')}</DropdownMenuItem>
        </DropdownMenuGroup>
        {user.isSuperAdmin && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push('/admin')}>
              <ShieldCheck className="me-2 h-4 w-4 text-amber-600" />
              {t('user.adminPanel')}
            </DropdownMenuItem>
          </>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleLogout}>{t('user.logout')}</DropdownMenuItem>
      </DropdownMenuContent>
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('user.profile')}</DialogTitle>
            <DialogDescription>{t('profile.description')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex items-center gap-3">
              <Avatar className="h-16 w-16">
                <AvatarImage src={profileAvatar} alt={profileName} />
                <AvatarFallback>{profileName.trim().charAt(0).toUpperCase() || 'U'}</AvatarFallback>
              </Avatar>
              <ImageUpload
                value={profileAvatar}
                onChange={setProfileAvatar}
                label={t('profile.uploadPhoto')}
              />
            </div>
            <div className="space-y-1">
              <Label>{t('profile.name')}</Label>
              <Input value={profileName} onChange={(event) => setProfileName(event.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>{t('profile.email')}</Label>
              <Input value={user.email} disabled />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProfileOpen(false)}>{t('common.cancel')}</Button>
            <Button disabled={savingProfile || profileName.trim().length < 2} onClick={saveProfile}>
              {savingProfile ? t('companyEdit.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DropdownMenu>
  );
}
