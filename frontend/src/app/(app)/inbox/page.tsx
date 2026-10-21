'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useI18n } from '@/context/i18n-context';
import { usePermissionOr, usePermissions } from '@/context/permissions-context';
import { useAuthGuard } from '@/hooks/use-auth-guard';
import { InboxPage } from '@/modules/conversations/components/inbox-page';
import { INBOX_PERMISSION } from '@/modules/conversations/lib/inbox';
import { TeamChatPage } from '@/modules/teamchat/components/team-chat-page';

/**
 * The inbox has two sides: client conversations (contacts:read) and staff
 * chats (every member). Someone without the first lands on the second.
 */
function InboxSides() {
  const params = useSearchParams();
  const { effectiveRole } = useAuthGuard();
  const { moduleOn } = usePermissions();
  const canClients = usePermissionOr(
    INBOX_PERMISSION.slice(0, INBOX_PERMISSION.indexOf(':')),
    INBOX_PERMISSION.slice(INBOX_PERMISSION.indexOf(':') + 1),
    Boolean(effectiveRole),
  ) && moduleOn('contacts');
  const team = params.get('tab') === 'team' || params.has('team') || !canClients;
  return team ? <TeamChatPage showClients={canClients} /> : <InboxPage />;
}

export default function InboxRoute() {
  const { user, loading } = useAuthGuard(['Admin', 'Manager', 'Employee', 'Accountant']);
  const { t } = useI18n();

  if (loading || !user) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }
  return (
    <React.Suspense fallback={null}>
      <InboxSides />
    </React.Suspense>
  );
}
