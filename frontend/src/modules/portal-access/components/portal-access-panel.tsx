'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useI18n } from '@/context/i18n-context';
import { useToast } from '@/hooks/use-toast';
import type { Contact } from '@/services/contactService';
import {
  invitePortalUser,
  listPortalUsers,
  reinvitePortalUser,
  setPortalUserDisabled,
  type PortalAudience,
  type PortalInviteResult,
  type PortalRole,
  type PortalUser,
} from '@/services/portalAccessService';
import { Copy, RefreshCw, UserPlus } from 'lucide-react';
import { PortalPricingSection } from './portal-pricing-section';

export function PortalAccessPanel({ contact, audience }: { contact: Contact; audience: PortalAudience }) {
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const { toast } = useToast();
  const [users, setUsers] = React.useState<PortalUser[] | null>(null);
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [role, setRole] = React.useState<PortalRole>('client_admin');
  const [busy, setBusy] = React.useState(false);
  const [issued, setIssued] = React.useState<PortalInviteResult | null>(null);

  const load = React.useCallback(async () => {
    try {
      setUsers(await listPortalUsers(contact.companyId, { audience, contactId: contact.id }));
    } catch {
      setUsers([]);
    }
  }, [audience, contact.companyId, contact.id]);

  React.useEffect(() => {
    setUsers(null);
    setIssued(null);
    setOpen(false);
    void load();
  }, [load]);

  const startInvite = () => {
    setName(audience === 'client' ? contact.contactPerson ?? '' : contact.name);
    setEmail(contact.email ?? '');
    setRole(users && users.length > 0 ? 'client_member' : 'client_admin');
    setOpen(true);
  };

  const report = (result: PortalInviteResult) => {
    setIssued(result);
    toast({
      title: result.emailSent ? tr('Invitation emailed', 'تم إرسال الدعوة بالبريد') : tr('Email not sent', 'لم يُرسل البريد'),
      description: result.emailSent ? result.user.email : tr('Share the link below yourself.', 'شارك الرابط أدناه بنفسك.'),
    });
  };

  const invite = async () => {
    setBusy(true);
    try {
      const result = await invitePortalUser(contact.companyId, {
        audience, contactId: contact.id, email, name, role: audience === 'client' ? role : undefined,
      });
      report(result);
      setOpen(false);
      await load();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : tr('Could not invite', 'تعذّرت الدعوة'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const act = async (fn: () => Promise<PortalUser | PortalInviteResult>) => {
    setBusy(true);
    try {
      const result = await fn();
      if ('inviteLink' in result) report(result);
      await load();
    } catch (error) {
      toast({ title: error instanceof Error ? error.message : tr('Something went wrong', 'حدث خطأ'), variant: 'destructive' });
    } finally {
      setBusy(false);
    }
  };

  const copy = async (link: string) => {
    try {
      await navigator.clipboard.writeText(link);
      toast({ title: tr('Link copied', 'تم نسخ الرابط') });
    } catch {
      toast({ title: tr('Copy failed. Select the link and copy it by hand.', 'تعذّر النسخ. حدّد الرابط وانسخه يدويًا.'), variant: 'destructive' });
    }
  };

  const statusLabel = (status: PortalUser['status']) =>
    ({ invited: tr('Invited', 'مدعو'), active: tr('Active', 'نشط'), disabled: tr('Disabled', 'معطّل') })[status];
  const roleLabel = (r: PortalRole) =>
    ({ client_admin: tr('Administrator', 'مسؤول'), client_member: tr('Member', 'عضو'), influencer: tr('Influencer', 'مؤثر') })[r];

  return (
    <section className="space-y-3 border-t pt-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">{tr('Portal access', 'الوصول إلى البوابة')}</h3>
          <p className="text-xs text-muted-foreground">
            {audience === 'client'
              ? tr('People at this client who can sign in to the client portal.', 'أشخاص من هذا العميل يمكنهم الدخول إلى بوابة العملاء.')
              : tr('Lets this influencer sign in to the influencer portal.', 'يتيح لهذا المؤثر الدخول إلى بوابة المؤثرين.')}
          </p>
        </div>
        {!open && (
          <Button type="button" size="sm" variant="outline" onClick={startInvite} disabled={busy}>
            <UserPlus className="me-1 h-4 w-4" />
            {tr('Invite', 'دعوة')}
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-3 rounded-md border p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label className="text-xs">{tr('Name', 'الاسم')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label className="text-xs">{tr('Email', 'البريد الإلكتروني')}</Label>
              <Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
          {audience === 'client' && (
            <div className="max-w-xs">
              <Label className="text-xs">{tr('Role', 'الدور')}</Label>
              <Select value={role} onValueChange={(v) => setRole(v as PortalRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="client_admin">{roleLabel('client_admin')}</SelectItem>
                  <SelectItem value="client_member">{roleLabel('client_member')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>{tr('Cancel', 'إلغاء')}</Button>
            <Button type="button" size="sm" onClick={invite} disabled={busy || !name.trim() || !email.trim()}>
              {tr('Send invitation', 'إرسال الدعوة')}
            </Button>
          </div>
        </div>
      )}

      {issued && (
        <div className="space-y-2 rounded-md border border-dashed p-3">
          <p className="text-xs text-muted-foreground">
            {issued.emailSent
              ? tr('The invitation was emailed. The link also works if you send it yourself:', 'أُرسلت الدعوة بالبريد. الرابط يعمل أيضًا إن أرسلته بنفسك:')
              : tr('Email is not configured, so nothing was sent. Share this link with the person:', 'لم يُضبط البريد، لذلك لم يُرسل شيء. شارك هذا الرابط مع الشخص:')}
          </p>
          <div className="flex items-center gap-2">
            <Input readOnly dir="ltr" value={issued.inviteLink} onFocus={(e) => e.currentTarget.select()} className="text-xs" />
            <Button type="button" size="sm" variant="outline" onClick={() => copy(issued.inviteLink)} aria-label={tr('Copy link', 'نسخ الرابط')}>
              <Copy className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{tr('Single use. Expires in 7 days.', 'يُستخدم مرة واحدة وينتهي خلال 7 أيام.')}</p>
        </div>
      )}

      {users === null ? (
        <p className="text-xs text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>
      ) : users.length === 0 ? (
        <p className="text-xs text-muted-foreground">{tr('No one has portal access yet.', 'لا أحد لديه وصول إلى البوابة بعد.')}</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {users.map((user) => (
            <li key={user.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{user.name}</p>
                <p className="truncate text-xs text-muted-foreground" dir="ltr">{user.email}</p>
              </div>
              <div className="flex items-center gap-2">
                {audience === 'client' && <Badge variant="outline">{roleLabel(user.role)}</Badge>}
                <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>{statusLabel(user.status)}</Badge>
                {user.status !== 'disabled' && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    aria-label={tr('Send a new link. Also resets the password.', 'إرسال رابط جديد. يعيد تعيين كلمة المرور أيضًا.')}
                    title={tr('Send a new link. Also resets the password.', 'إرسال رابط جديد. يعيد تعيين كلمة المرور أيضًا.')}
                    onClick={() => act(() => reinvitePortalUser(contact.companyId, user.id))}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                )}
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => act(() => setPortalUserDisabled(contact.companyId, user.id, user.status !== 'disabled'))}
                >
                  {user.status === 'disabled' ? tr('Enable', 'تفعيل') : tr('Disable', 'تعطيل')}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {audience === 'client' && <PortalPricingSection contact={contact} />}
    </section>
  );
}
