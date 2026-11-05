import type { UserRole } from '../types';

/** How far a company lets the assistant go (Settings → Assistant). */
export interface AssistantSettings {
  enabled: boolean;
  /** Roles that may use it; Admin always may, so nobody locks themselves out. */
  roles: UserRole[];
  /** Areas it may change (it reads under the person's own permissions); null = every area. */
  changeAreas: string[] | null;
  /** Most changes proposed at once (1–25). */
  maxChanges: number;
  /** Learn from confirmed changes and 👍 (learned examples). */
  learn: boolean;
}

export const ASSISTANT_ROLES: UserRole[] = ['Admin', 'Manager', 'Accountant', 'Employee'];

export const DEFAULT_ASSISTANT_SETTINGS: AssistantSettings = {
  enabled: true, roles: [...ASSISTANT_ROLES], changeAreas: null, maxChanges: 25, learn: true,
};

/** Settings from a request (or stored JSON), checked; missing fields take the defaults. */
/** `stored`: settings read back from the database keep their meaning when an area has since gone (it is dropped, not an error). */
export function parseAssistantSettings(input: unknown, areas: string[], stored = false): AssistantSettings {
  const o = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const d = DEFAULT_ASSISTANT_SETTINGS;
  const roles = o.roles === undefined ? d.roles : Array.isArray(o.roles) ? o.roles.map(String) : null;
  if (!roles || roles.some((r) => !ASSISTANT_ROLES.includes(r as UserRole))) throw new Error(`roles must be some of ${ASSISTANT_ROLES.join(', ')}`);
  const withAdmin = ASSISTANT_ROLES.filter((r) => r === 'Admin' || roles.includes(r));
  let changeAreas: string[] | null = d.changeAreas;
  if (o.changeAreas !== undefined && o.changeAreas !== null) {
    if (!Array.isArray(o.changeAreas)) throw new Error('changeAreas must be a list of areas, or null for all');
    const unknown = o.changeAreas.map(String).filter((a) => !areas.includes(a));
    if (unknown.length && !stored) throw new Error(`unknown area ${unknown.join(', ')}`);
    changeAreas = [...new Set(o.changeAreas.map(String).filter((a) => areas.includes(a)))].sort();
  }
  const maxChanges = o.maxChanges === undefined ? d.maxChanges : Number(o.maxChanges);
  if (!Number.isInteger(maxChanges) || maxChanges < 1 || maxChanges > 25) throw new Error('maxChanges must be a whole number from 1 to 25');
  return {
    enabled: o.enabled === undefined ? d.enabled : o.enabled === true,
    roles: withAdmin,
    changeAreas,
    maxChanges,
    learn: o.learn === undefined ? d.learn : o.learn === true,
  };
}

/** Whether a person with this role in the company may use the assistant there. */
export function mayUseAssistant(s: AssistantSettings, role: UserRole | undefined, superAdmin: boolean): boolean {
  if (!s.enabled) return false;
  return superAdmin || role === 'Admin' || (role !== undefined && s.roles.includes(role));
}
