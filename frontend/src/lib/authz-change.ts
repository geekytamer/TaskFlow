/** What a data change event carries (lib/api-client.ts). */
interface ChangeDetail { method?: string; path?: string }

/** Changes this app makes that can move someone's permissions. */
const AUTHZ_PATH = /\/(roles|people|users|permission-groups|groups|holding-groups|implications)(\/|$|\?)|^\/companies\/[^/]+(\?|$)/;

/** Live topics (backend live/hub.ts topicsFromPath) of those same changes. */
export const AUTHZ_TOPICS: ReadonlySet<string> = new Set(['authz', 'roles', 'people', 'users', 'permission-groups', 'groups', 'implications', 'company']);

export function isAuthzChange(detail: ChangeDetail | null | undefined): boolean {
  return Boolean(detail?.path && AUTHZ_PATH.test(detail.path));
}
