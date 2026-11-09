import { HttpError } from './http';

export const asRecord = (value: unknown, name: string): Record<string, any> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, `${name} must be an object.`);
  }
  return value as Record<string, any>;
};

export const requiredString = (
  value: unknown,
  name: string,
  options?: { min?: number },
): string => {
  if (typeof value !== 'string') {
    throw new HttpError(400, `${name} is required.`);
  }
  const normalized = value.trim();
  if (!normalized || (options?.min && normalized.length < options.min)) {
    throw new HttpError(400, `${name} is invalid.`);
  }
  return normalized;
};

export const optionalString = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string') {
    throw new HttpError(400, 'Invalid string value.');
  }
  const normalized = value.trim();
  return normalized || undefined;
};

/** A custom-fields map: a plain object of key → primitive value. */
export const optionalCustomFields = (value: unknown): Record<string, unknown> | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'customFields must be an object.');
  }
  return value as Record<string, unknown>;
};

export const requiredNumber = (value: unknown, name: string): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new HttpError(400, `${name} must be a valid number.`);
  }
  return parsed;
};

const blank = (value: unknown) => value === null || (typeof value === 'string' && !value.trim());

/**
 * A text field a form may empty: undefined when the body leaves it out (keep
 * it), null when it is sent empty (clear it), the trimmed text otherwise.
 */
export const clearableString = (body: Record<string, unknown>, key: string): string | null | undefined => {
  if (!(key in body) || body[key] === undefined) return undefined;
  return blank(body[key]) ? null : optionalString(body[key]);
};

/** As clearableString, for a number. */
export const clearableNumber = (body: Record<string, unknown>, key: string): number | null | undefined => {
  if (!(key in body) || body[key] === undefined) return undefined;
  return blank(body[key]) ? null : optionalNumber(body[key]);
};

export const optionalNumber = (value: unknown): number | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredNumber(value, 'value');
};

export const requiredDateInput = (value: unknown, name: string): string => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new HttpError(400, `${name} must be a valid date.`);
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new HttpError(400, `${name} must be a valid date.`);
  }
  return parsed.toISOString();
};

export const optionalDateInput = (value: unknown): string | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  return requiredDateInput(value, 'date');
};

export const requiredArray = <T = unknown>(value: unknown, name: string): T[] => {
  if (!Array.isArray(value)) {
    throw new HttpError(400, `${name} must be an array.`);
  }
  return value as T[];
};

export const stringArray = (value: unknown, name: string): string[] => {
  const items = requiredArray<unknown>(value, name);
  return items.map((item, index) => requiredString(item, `${name}[${index}]`));
};

export const optionalBoolean = (value: unknown): boolean | undefined => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new HttpError(400, 'Invalid boolean value.');
};

export const enumValue = <T extends string>(
  value: unknown,
  name: string,
  allowed: readonly T[],
): T => {
  const normalized = requiredString(value, name) as T;
  if (!allowed.includes(normalized)) {
    throw new HttpError(400, `${name} must be one of: ${allowed.join(', ')}.`);
  }
  return normalized;
};

/**
 * Two-language names (spec 2026-11-10-bilingual-names-design). `nameAr` /
 * `nameEn` pass through as sent ("" clears a side, absent leaves it); the
 * store works out `name`. `nameOf` lets a form that sends only the two sides
 * through the `name` checks routes already make.
 */
export const parseNameSides = (body: Record<string, unknown>): { nameAr?: string; nameEn?: string } => {
  const side = (value: unknown, label: string): string | undefined => {
    if (value === undefined) return undefined;
    if (value === null) return '';
    if (typeof value !== 'string') throw new HttpError(400, `${label} must be text.`);
    return value.replace(/\s+/g, ' ').trim().slice(0, 200);
  };
  return { nameAr: side(body.nameAr, 'nameAr'), nameEn: side(body.nameEn, 'nameEn') };
};

export const nameOf = (body: Record<string, unknown>): unknown => {
  if (typeof body.name === 'string' && body.name.trim()) return body.name;
  const ar = typeof body.nameAr === 'string' ? body.nameAr.trim() : '';
  const en = typeof body.nameEn === 'string' ? body.nameEn.trim() : '';
  return en || ar || body.name;
};
