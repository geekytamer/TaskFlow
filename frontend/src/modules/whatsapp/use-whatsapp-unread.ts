'use client';

import * as React from 'react';
import { useCompany } from '@/context/company-context';
import { usePermissions } from '@/context/permissions-context';
import { useLiveRefresh } from '@/lib/live';
import { getWhatsappChats } from '@/services/whatsappService';

/** Unread customer messages on WhatsApp, for badges; follows the live signal. */
export function useWhatsappUnread(): number {
  const { selectedCompany } = useCompany();
  const { can, moduleOn } = usePermissions();
  const allowed = can('whatsapp.view') && moduleOn('whatsapp');
  const [count, setCount] = React.useState(0);
  const companyId = selectedCompany?.id;
  const load = React.useCallback(() => {
    if (!companyId || !allowed) {
      setCount(0);
      return;
    }
    getWhatsappChats(companyId)
      .then((chats) => setCount(chats.reduce((sum, c) => sum + (c.unreadCount || 0), 0)))
      .catch(() => undefined);
  }, [companyId, allowed]);
  React.useEffect(() => {
    load();
    const id = window.setInterval(load, 60000);
    return () => window.clearInterval(id);
  }, [load]);
  useLiveRefresh(['whatsapp'], load, allowed);
  return count;
}
