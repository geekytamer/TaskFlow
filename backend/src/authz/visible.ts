/**
 * One read filter: which records of a scoped area a person may see, as a SQL
 * fragment applied in the WHERE clause (never a post-filter), so lists,
 * searches, exports, counts and pagination all see the same set.
 *
 *   - company / group scope: every record of the company (except what an area
 *     keeps private even from them: private tasks).
 *   - team: the owner is me or in my manager line (eff.team), or the record is
 *     shared with me (record_shares), or the area's always-visible extras.
 *   - own: the owner is me, or it is shared with me, or the extras.
 *   - no grant at all: the area's `noGrant` — 'own' where today's code showed
 *     a person their own records without asking for the permission (the route
 *     gate already decided they may be here), 'none' where it showed nothing.
 *
 * The area rules live in ONE table (AREAS). A single-record check
 * (`visibleRecord`) runs the same fragment against one id, so a detail page
 * can never disagree with its list.
 *
 * Which Effective to pass is the caller's choice (Ruling D): under the legacy
 * and shadow engines the role's template (effectiveLegacy), under v2 the real
 * one (effective). The filter itself never branches on the engine.
 */
import type { Scope } from './catalogue';
import type { Effective } from './evaluate';
import { scopeOf } from './can';

export interface VisibleSql {
  sql: string;
  params: unknown[];
}

export interface VisibleOptions {
  /** Table alias the fragment refers to (default: the area's table name). */
  alias?: string;
  /** Column holding the owner (default: the area's). */
  ownerColumn?: string;
  /** record_shares.area that counts as visibility (default: the area's). */
  sharesArea?: string;
  /**
   * Platform super admin acting for support: sees private tasks (today's
   * canViewTask exception). Nothing else.
   */
  platformSupport?: boolean;
}

/** Who a person reaches below company scope. */
interface Reach {
  /** Company or group scope. */
  all: boolean;
  /** Owners whose records I reach: me (own) or my team line (team). */
  people: string[];
  me: string;
  companyId: string;
}

interface AreaRule {
  /** The permission whose scope decides. */
  key: string;
  table: string;
  /** Primary key column used by visibleRecord. */
  idColumn: string;
  ownerColumn: string;
  sharesArea: string;
  noGrant: 'own' | 'none';
  /** The fragment, given the table alias, the owner column, the share clause and the reach. */
  build(a: string, owner: string, shared: VisibleSql, reach: Reach, ctx: BuildContext): VisibleSql;
}

interface BuildContext {
  eff: Effective;
  options: VisibleOptions;
}

const placeholders = (values: readonly unknown[]) => values.map(() => '?').join(', ');

/** `col IN (people)`; an empty list never matches. */
const ownedBy = (column: string, people: readonly string[]): VisibleSql =>
  people.length === 0 ? { sql: '0', params: [] } : { sql: `${column} IN (${placeholders(people)})`, params: [...people] };

/** A JSON array column holding any of `people`. */
const jsonHasAny = (column: string, people: readonly string[]): VisibleSql =>
  people.length === 0
    ? { sql: '0', params: [] }
    : { sql: `EXISTS (SELECT 1 FROM json_each(COALESCE(${column}, '[]')) WHERE json_each.value IN (${placeholders(people)}))`, params: [...people] };

const anyOf = (...parts: VisibleSql[]): VisibleSql => ({
  sql: `(${parts.map((p) => p.sql).join(' OR ')})`,
  params: parts.flatMap((p) => p.params),
});

const allOf = (...parts: VisibleSql[]): VisibleSql => ({
  sql: `(${parts.map((p) => p.sql).join(' AND ')})`,
  params: parts.flatMap((p) => p.params),
});

const EVERYTHING: VisibleSql = { sql: '1=1', params: [] };
const NOTHING: VisibleSql = { sql: '0', params: [] };

/** Owner (or shared with me) — the default rule of an owned record. */
const ownerOrShared = (a: string, owner: string, shared: VisibleSql, reach: Reach): VisibleSql =>
  reach.all ? EVERYTHING : anyOf(ownedBy(`${a}.${owner}`, reach.people), shared);

/** Contacts (and inbox conversations): non-private ones to anyone with the area; private by reach or share. */
const contactRule = (a: string, owner: string, shared: VisibleSql, reach: Reach): VisibleSql =>
  reach.all ? EVERYTHING : anyOf({ sql: `${a}.visibility <> 'Private'`, params: [] }, ownedBy(`${a}.${owner}`, reach.people), shared);

/** The reach a person has with `key` in a company, or null for none. */
function reachOf(eff: Effective, key: string, companyId: string, noGrant: 'own' | 'none'): Reach | null {
  const scope: Scope | null = scopeOf(eff, key, companyId);
  if (scope === null && noGrant === 'none') return null;
  const effective: Scope = scope ?? 'own';
  if (effective === 'company' || effective === 'group') return { all: true, people: [], me: eff.userId, companyId };
  const people = effective === 'team' ? [...eff.team(companyId)] : [eff.userId];
  if (!people.includes(eff.userId)) people.push(eff.userId);
  return { all: false, people, me: eff.userId, companyId };
}

const sharedWithMe = (a: string, idColumn: string, area: string, reach: Reach): VisibleSql => ({
  sql: `${a}.${idColumn} IN (SELECT recordId FROM record_shares WHERE companyId = ? AND area = ? AND userId = ?)`,
  params: [reach.companyId, area, reach.me],
});

/** Projects reached at the projects.view scope (used by tasks' project cascade). */
function projectsClause(eff: Effective, companyId: string, alias: string): VisibleSql {
  return visible(eff, 'projects', companyId, { alias });
}

export const AREAS = {
  /** Contacts: non-private ones to anyone with the area; private ones by scope, owner or share. */
  contacts: {
    key: 'contacts.view', table: 'contacts', idColumn: 'id', ownerColumn: 'ownerUserId', sharesArea: 'contacts', noGrant: 'own',
    build: contactRule,
  },
  /** Inbox conversations follow their contact, at the inbox.view scope. */
  inbox: {
    key: 'inbox.view', table: 'contacts', idColumn: 'id', ownerColumn: 'ownerUserId', sharesArea: 'contacts', noGrant: 'own',
    build: contactRule,
  },
  opportunities: {
    key: 'crm.view', table: 'opportunities', idColumn: 'id', ownerColumn: 'ownerUserId', sharesArea: 'crm', noGrant: 'own',
    build: ownerOrShared,
  },
  /** A proposal is seen with its opportunity (or when shared itself). */
  proposals: {
    key: 'crm.view', table: 'crm_proposals', idColumn: 'id', ownerColumn: 'opportunityId', sharesArea: 'crm', noGrant: 'own',
    build: (a, _owner, shared, reach, ctx) => {
      if (reach.all) return EVERYTHING;
      const opp = visible(ctx.eff, 'opportunities', reach.companyId, { alias: 'vo' });
      return anyOf(
        { sql: `${a}.opportunityId IN (SELECT vo.id FROM opportunities vo WHERE vo.companyId = ? AND ${opp.sql})`, params: [reach.companyId, ...opp.params] },
        shared,
      );
    },
  },
  /** Follow-ups: owner, or invited as an assignee, or shared. */
  followups: {
    key: 'crm.view', table: 'follow_ups', idColumn: 'id', ownerColumn: 'ownerUserId', sharesArea: 'crm', noGrant: 'own',
    build: (a, owner, shared, reach) => {
      if (reach.all) return EVERYTHING;
      const assignee = ownedBy('fa.userId', reach.people);
      return anyOf(
        ownedBy(`${a}.${owner}`, reach.people),
        { sql: `${a}.id IN (SELECT fa.followUpId FROM follow_up_assignees fa WHERE ${assignee.sql})`, params: assignee.params },
        shared,
      );
    },
  },
  vendor_requests: {
    key: 'crm.view', table: 'vendor_requests', idColumn: 'id', ownerColumn: 'requestedByUserId', sharesArea: 'crm', noGrant: 'own',
    build: ownerOrShared,
  },
  campaigns: {
    key: 'campaigns.view', table: 'crm_campaigns', idColumn: 'id', ownerColumn: 'ownerUserId', sharesArea: 'campaigns', noGrant: 'own',
    build: ownerOrShared,
  },
  commissions: {
    key: 'commissions.view', table: 'commissions', idColumn: 'id', ownerColumn: 'userId', sharesArea: 'commissions', noGrant: 'own',
    build: ownerOrShared,
  },
  /** Projects: Public, or a member of my reach, or shared; company scope every one. */
  projects: {
    key: 'projects.view', table: 'projects', idColumn: 'id', ownerColumn: 'memberIds', sharesArea: 'projects', noGrant: 'none',
    build: (a, owner, shared, reach) =>
      reach.all ? EVERYTHING : anyOf({ sql: `${a}.visibility = 'Public'`, params: [] }, jsonHasAny(`${a}.${owner}`, reach.people), shared),
  },
  /**
   * Tasks: assigned within my reach, or in a project I can see, or shared;
   * company scope every one. A private task is only ever its owner's and its
   * assignees' (or shared with me), whatever the scope — and always theirs.
   */
  tasks: {
    key: 'tasks.view', table: 'tasks', idColumn: 'id', ownerColumn: 'assignedUserIds', sharesArea: 'tasks', noGrant: 'own',
    build: (a, owner, shared, reach, ctx) => {
      const privateMine = ctx.options.platformSupport
        ? EVERYTHING
        : anyOf({ sql: `${a}.ownerId = ?`, params: [reach.me] }, jsonHasAny(`${a}.${owner}`, [reach.me]), shared);
      let open: VisibleSql = EVERYTHING;
      if (!reach.all) {
        const project = projectsClause(ctx.eff, reach.companyId, 'vp');
        open = anyOf(
          jsonHasAny(`${a}.${owner}`, reach.people),
          { sql: `${a}.projectId IN (SELECT vp.id FROM projects vp WHERE vp.companyId = ? AND ${project.sql})`, params: [reach.companyId, ...project.params] },
          shared,
        );
      }
      return anyOf(
        allOf({ sql: `${a}.isPrivate = 0`, params: [] }, open),
        allOf({ sql: `${a}.isPrivate <> 0`, params: [] }, privateMine),
      );
    },
  },
  /**
   * WhatsApp chats (rows carrying a chatId): shared chats to anyone with the
   * area; a private chat to its owner (in my reach) or when shared with me.
   */
  whatsapp_chats: {
    key: 'whatsapp.view', table: 'whatsapp_chat_settings', idColumn: 'chatId', ownerColumn: 'ownerUserId', sharesArea: 'whatsapp', noGrant: 'own',
    build: (a, owner, _shared, reach) => {
      if (reach.all) return EVERYTHING;
      const own = ownedBy(`ws.${owner}`, reach.people);
      return {
        sql: `NOT EXISTS (SELECT 1 FROM whatsapp_chat_settings ws WHERE ws.companyId = ? AND ws.chatId = ${a}.chatId AND ws.visibility = 'private'`
          // An owner-less private chat is nobody's: COALESCE keeps NULL from opening it.
          + ` AND NOT COALESCE(${own.sql}, 0) AND ws.chatId NOT IN (SELECT recordId FROM record_shares WHERE companyId = ? AND area = 'whatsapp' AND userId = ?))`,
        params: [reach.companyId, ...own.params, reach.companyId, reach.me],
      };
    },
  },
} satisfies Record<string, AreaRule>;

export type VisibleArea = keyof typeof AREAS;

/**
 * The WHERE fragment for the records of `area` in `companyId` that `eff`'s
 * person may see. The caller still restricts to the company itself.
 */
export function visible(eff: Effective, area: VisibleArea, companyId: string, options: VisibleOptions = {}): VisibleSql {
  const rule: AreaRule = AREAS[area];
  const reach = reachOf(eff, rule.key, companyId, rule.noGrant);
  if (!reach) return NOTHING;
  const alias = options.alias ?? rule.table;
  const owner = options.ownerColumn ?? rule.ownerColumn;
  const shared = sharedWithMe(alias, rule.idColumn, options.sharesArea ?? rule.sharesArea, reach);
  return rule.build(alias, owner, shared, reach, { eff, options });
}

/**
 * The same rule for one record: a query returning a row only when the record
 * with `id` is in the company and visible. Run it with store.visibleRow().
 */
export function visibleRecord(eff: Effective, area: VisibleArea, companyId: string, id: string, options: VisibleOptions = {}): VisibleSql {
  const rule: AreaRule = AREAS[area];
  const alias = 'r';
  const filter = visible(eff, area, companyId, { ...options, alias });
  // A WhatsApp chat need not have a settings row: test the chat id itself.
  if (area === 'whatsapp_chats') {
    return { sql: `SELECT 1 FROM (SELECT ? AS chatId) r WHERE ${filter.sql}`, params: [id, ...filter.params] };
  }
  return {
    sql: `SELECT 1 FROM ${rule.table} ${alias} WHERE ${alias}.${rule.idColumn} = ? AND ${alias}.companyId = ? AND ${filter.sql} LIMIT 1`,
    params: [id, companyId, ...filter.params],
  };
}

/** The permission key whose scope decides an area (for explanations and tests). */
export function visibleKey(area: VisibleArea): string {
  return AREAS[area].key;
}
