'use client';

import * as React from 'react';
import { useI18n } from '@/context/i18n-context';
import { getStoredToken, setForbiddenHandler } from '@/lib/api-client';
import { labelsFromCatalogue, refusalSentence, type CatalogueLabels } from '@/lib/forbidden-message';
import { showRefusalToast } from '@/hooks/use-toast';
import { fetchCatalogue } from '@/services/permissionService';

/**
 * A refused action (403 FORBIDDEN, and the other coded refusals) shows one
 * translated sentence naming what was missing and who to ask, built from the
 * catalogue label of the refused permission. Registered once by the app; api-client calls it.
 */
export function ForbiddenBridge() {
  const { language } = useI18n();
  const labels = React.useRef<CatalogueLabels | null>(null);
  const [token, setToken] = React.useState<string | null>(null);

  React.useEffect(() => {
    const read = () => setToken(getStoredToken());
    read();
    window.addEventListener('taskflow-token-changed', read);
    return () => window.removeEventListener('taskflow-token-changed', read);
  }, []);

  React.useEffect(() => {
    if (!token) return;
    let active = true;
    fetchCatalogue()
      .then((catalogue) => {
        if (active) labels.current = labelsFromCatalogue(catalogue);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token]);

  React.useEffect(() => {
    const lang = language === 'ar' ? 'ar' : 'en';
    setForbiddenHandler({
      describe: (body) => refusalSentence(body, labels.current, lang),
      notify: (sentence) => {
        showRefusalToast({
          variant: 'destructive',
          title: lang === 'ar' ? 'غير مسموح' : 'Not allowed',
          description: sentence,
        });
      },
    });
    return () => setForbiddenHandler(null);
  }, [language]);

  return null;
}
