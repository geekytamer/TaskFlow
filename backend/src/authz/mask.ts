/**
 * Sensitive fields (catalogue SENSITIVE_FIELDS): which properties of which
 * records each switch covers, and the two questions asked of them.
 *
 *   - mask(): a copy of the row without the properties the person may not
 *     see. Every path a covered property leaves through (list, detail, echo
 *     after a write, CSV export, file) passes its rows through here first.
 *   - canEditField(): may the person write the field. A write that would
 *     change a field without edit is refused with 403 { permission:
 *     'field:<key>' } (server.ts requireFieldEdits).
 *
 * One table (FIELD_MAP) says what each switch covers. Which Effective is
 * passed is the caller's choice (Ruling D): under legacy and shadow the role's
 * template (effectiveLegacy), under v2 the real one; nothing here branches on
 * the engine.
 *
 * Two things beside the role answer, both kept from today's rules:
 *   - self: a person always sees their own salary, ID numbers and bank details
 *     (their employee record, their payslip). Callers say when a row is the
 *     viewer's own (`self`); only SELF_FIELDS honour it.
 *   - module lock: the legacy rules were asked only while their module was on
 *     (PAYROLL_PAY_READ → payroll, CONTACTS_PRICING_READ → contacts), and
 *     only on the paths that asked them. Those paths pass `moduleOn`; there a
 *     field whose module the company switched off is hidden from everyone
 *     (self excepted), as before. Other paths pass none and never lock.
 */
import { SENSITIVE_FIELDS } from './catalogue';
import type { Effective } from './evaluate';

export type SensitiveField = 'salary' | 'personal_ids' | 'bank_details' | 'cost_prices' | 'rate_cards' | 'client_terms';

/** Entity → property → the sensitive field that hides it. */
export const FIELD_MAP = {
  /** HR employee record (GET /employees, /employees/:id, PUT echo). */
  employee: {
    basicSalary: 'salary', allowances: 'salary', deductions: 'salary',
    bankName: 'bank_details', iban: 'bank_details', bankCode: 'bank_details',
    idType: 'personal_ids', idNumber: 'personal_ids',
  },
  /** One payslip inside a payroll run. */
  payslip: { basic: 'salary', allowances: 'salary', deductions: 'salary', net: 'salary' },
  /** One employee's line of the end-of-service gratuity report. */
  gratuity_line: { monthlyWage: 'salary', dailyWage: 'salary', entitlement: 'salary' },
  /** CRM contact: an influencer's rate card. */
  contact: { rateCardAmount: 'rate_cards' },
  /** An influencer's requested profile change (its `changes` object). */
  influencer_change: { rateCardAmount: 'rate_cards' },
  /** An influencer's portal price range around the client price. */
  price_range: { belowPercent: 'rate_cards', abovePercent: 'rate_cards' },
  /** A client's portal pricing profile. */
  pricing_profile: { mode: 'client_terms', markupPercent: 'client_terms' },
  /** Finance client: credit terms. */
  client: { creditLimit: 'client_terms' },
  /** Inventory item, lot and stock movement: what the stock cost. */
  item: { unitCost: 'cost_prices' },
  lot: { unitCost: 'cost_prices' },
  stock_movement: { unitCost: 'cost_prices' },
} as const satisfies Record<string, Record<string, SensitiveField>>;

export type MaskEntity = keyof typeof FIELD_MAP;

/**
 * Activity events (activity_events.metadata) echo record properties. By the
 * event's entityType: which metadata keys are which sensitive field — the
 * record's own FIELD_MAP properties plus keys only events carry. A test scans
 * every createActivityEvent call for sensitive-looking metadata keys and
 * fails when one is not listed here.
 */
export const ACTIVITY_METADATA: Readonly<Record<string, Readonly<Record<string, SensitiveField>>>> = {
  inventory_item: { ...FIELD_MAP.item },
  employee: { ...FIELD_MAP.employee },
  payroll_run: { ...FIELD_MAP.payslip },
  contact: { ...FIELD_MAP.contact },
  client: { ...FIELD_MAP.client },
  /** Cost of the goods put back in stock on a customer return. */
  customer_return: { restockedCost: 'cost_prices' },
};

/** Fields a person always sees on their own records. */
export const SELF_FIELDS: ReadonlySet<SensitiveField> = new Set(['salary', 'personal_ids', 'bank_details']);

/** The module a field's legacy rule was asked under (null: none). */
export const FIELD_MODULES: Readonly<Record<SensitiveField, string | null>> = {
  salary: 'payroll',
  personal_ids: 'payroll',
  bank_details: 'payroll',
  rate_cards: 'contacts',
  client_terms: 'contacts',
  cost_prices: null,
};

// Every field of the catalogue is mapped, and only those.
{
  const known = new Set(SENSITIVE_FIELDS.map((f) => f.key));
  const used = new Set<string>(Object.keys(FIELD_MODULES));
  for (const props of Object.values(FIELD_MAP)) for (const f of Object.values(props)) used.add(f);
  if (known.size !== used.size || [...known].some((k) => !used.has(k))) {
    throw new Error('authz mask: FIELD_MAP / FIELD_MODULES out of step with SENSITIVE_FIELDS');
  }
}

export interface MaskOptions {
  /** The row is the viewer's own (their employee record, their payslip). */
  self?: boolean;
  /** Whether a module is on in the company (default: every module on). */
  moduleOn?: (module: string) => boolean;
}

/** May the person see `field` in the company? */
export function canViewField(eff: Effective, companyId: string, field: SensitiveField, options: MaskOptions = {}): boolean {
  if (options.self && SELF_FIELDS.has(field)) return true;
  const module = FIELD_MODULES[field];
  if (module && options.moduleOn && !options.moduleOn(module)) return false;
  return eff.byCompany.get(companyId)?.fields.get(field)?.view === true;
}

/** May the person change `field` in the company? */
export function canEditField(eff: Effective, companyId: string, field: SensitiveField): boolean {
  return eff.byCompany.get(companyId)?.fields.get(field)?.edit === true;
}

/** The fields of `entity` the person may not see. */
export function hiddenFields(eff: Effective, companyId: string, entity: MaskEntity, options: MaskOptions = {}): Set<SensitiveField> {
  const hidden = new Set<SensitiveField>();
  for (const field of new Set(Object.values(FIELD_MAP[entity]) as SensitiveField[])) {
    if (!canViewField(eff, companyId, field, options)) hidden.add(field);
  }
  return hidden;
}

/** An activity event without the metadata the person may not see (a copy). */
export function maskActivity<T extends { entityType: string; metadata?: Record<string, unknown> | null }>(
  eff: Effective, companyId: string, event: T, options: MaskOptions = {},
): T {
  const keys = ACTIVITY_METADATA[event.entityType];
  if (!keys || !event.metadata) return event;
  const hidden = Object.entries(keys).filter(([prop, field]) => prop in event.metadata! && !canViewField(eff, companyId, field, options));
  if (hidden.length === 0) return event;
  const metadata = { ...event.metadata };
  for (const [prop] of hidden) delete metadata[prop];
  return { ...event, metadata };
}

/**
 * The row without the properties the person may not see (a copy; the row
 * itself is never changed). Null and undefined pass through.
 */
export function mask<T>(eff: Effective, companyId: string, entity: MaskEntity, row: T, options: MaskOptions = {}): T {
  if (!row || typeof row !== 'object') return row;
  const hidden = hiddenFields(eff, companyId, entity, options);
  if (hidden.size === 0) return row;
  const copy: Record<string, unknown> = { ...(row as Record<string, unknown>) };
  for (const [prop, field] of Object.entries(FIELD_MAP[entity]) as Array<[string, SensitiveField]>) {
    if (hidden.has(field)) delete copy[prop];
  }
  return copy as T;
}

/** Is a property of `entity` hidden from the person? (CSV columns.) */
export function propHidden(eff: Effective, companyId: string, entity: MaskEntity, prop: string, options: MaskOptions = {}): boolean {
  const field = (FIELD_MAP[entity] as Record<string, SensitiveField>)[prop];
  return field !== undefined && !canViewField(eff, companyId, field, options);
}

const blank = (v: unknown) => v === undefined || v === null || v === '';
/** On a create, a form's defaults (0, '', null) set nothing. */
const unset = (v: unknown) => blank(v) || v === 0 || v === '0';
/** Same stored value: both blank, equal numbers ("12" = 12), or equal strings. */
const sameValue = (a: unknown, b: unknown): boolean => {
  if (blank(a) || blank(b)) return blank(a) && blank(b);
  const na = Number(a);
  const nb = Number(b);
  if (typeof a !== 'object' && typeof b !== 'object' && Number.isFinite(na) && Number.isFinite(nb)) return na === nb;
  return JSON.stringify(a) === JSON.stringify(b);
};

/**
 * The sensitive fields a write body changes: a mapped property present with a
 * value other than undefined (null and '' clear a field, which is a change).
 * Given the record as it stands, a property sent back unchanged is not a
 * change (an edit form re-sends what it showed). `'create'`: a new record,
 * where 0, '' and null (a form's defaults) set nothing.
 */
export function fieldsWritten(
  entity: MaskEntity,
  body: Record<string, unknown> | null | undefined,
  existing?: Record<string, unknown> | 'create' | null,
): SensitiveField[] {
  if (!body || typeof body !== 'object') return [];
  const out = new Set<SensitiveField>();
  for (const [prop, field] of Object.entries(FIELD_MAP[entity]) as Array<[string, SensitiveField]>) {
    if (!Object.prototype.hasOwnProperty.call(body, prop) || body[prop] === undefined) continue;
    if (existing === 'create' ? unset(body[prop]) : existing && sameValue(body[prop], existing[prop])) continue;
    out.add(field);
  }
  return [...out];
}
