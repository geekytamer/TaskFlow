'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { useLiveRefresh } from '@/lib/live';
import { getTeamUnread } from '@/services/teamChatService';
import { usePermissions } from '@/context/permissions-context';

/** Unread staff-chat messages in the selected company; follows new messages live. */
export function useTeamUnread(wanted = true) {
  const { selectedCompany } = useCompany();
  // Staff chats live in the Inbox, so a company without the Inbox has none.
  const { moduleOn } = usePermissions();
  const enabled = wanted && moduleOn('inbox');
  const companyId = selectedCompany?.id;
  const [count, setCount] = React.useState(0);

  const refresh = React.useCallback(async () => {
    if (!companyId || !enabled) { setCount(0); return; }
    setCount(await getTeamUnread(companyId).catch(() => 0));
  }, [companyId, enabled]);

  React.useEffect(() => {
    void refresh();
    const id = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(id);
  }, [refresh]);
  useLiveRefresh(['team-chat'], refresh, enabled);

  return count;
}
