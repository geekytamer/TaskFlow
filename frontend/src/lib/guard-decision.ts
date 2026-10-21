/**
 * The page guard's decision (hooks/use-auth-guard.ts), pure so it can be tested.
 *
 * A page with a permission is never decided before the permissions for the
 * selected company are in: it reports `loading`. A failed load is not a
 * denial either: it keeps `loading` and reports `error`, and the app shows
 * "Couldn't load your permissions — Retry". Only a ready answer that lacks the
 * permission denies.
 */
export interface GuardInput {
  permission?: string;
  userLoading: boolean;
  companyLoading: boolean;
  hasCompany: boolean;
  /** undefined: outside the provider (the login screen). */
  permissions?: { ready: boolean; error: boolean; canAdmin: (key: string) => boolean };
}

export interface GuardDecision {
  loading: boolean;
  allowed: boolean;
  /** Turn the person away (toast + redirect). */
  denied: boolean;
  error: boolean;
}

export function guardDecision(input: GuardInput): GuardDecision {
  const { permission, userLoading, companyLoading, hasCompany, permissions } = input;
  const ready = Boolean(permissions?.ready);
  // canAdmin: can(), plus the surfaces the server opens to the platform super admin.
  const allows = Boolean(permission && permissions?.canAdmin(permission));
  // With no company there is nothing to wait for (and nothing is granted).
  const waiting = Boolean(permission) && !ready && hasCompany && permissions !== undefined;
  const settled = !userLoading && !companyLoading && !waiting;
  return {
    loading: userLoading || companyLoading || waiting,
    allowed: !permission || (settled && allows),
    denied: Boolean(permission) && settled && !allows,
    error: Boolean(permissions?.error),
  };
}
