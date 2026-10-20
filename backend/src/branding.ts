import { HttpError } from './http';
import type { CompanyBranding } from './types';

/**
 * A company's own look inside TaskFlow: its name and logo in place of the
 * product's, its colours, font, corner style and default light/dark mode.
 * Every field is optional; a company without a brand looks like TaskFlow.
 */
export const BRAND_FONTS = ['default', 'ibm-plex', 'tajawal', 'cairo', 'inter'] as const;
export const BRAND_RADII = ['sharp', 'soft', 'round'] as const;
export const BRAND_MODES = ['light', 'dark', 'system'] as const;

const HEX = /^#[0-9a-f]{6}$/i;

function pick<T extends string>(value: unknown, field: string, allowed: readonly T[]): T | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new HttpError(400, `branding.${field} must be one of: ${allowed.join(', ')}.`);
  }
  return value as T;
}

function colour(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  // Colours end up in CSS, so only plain #rrggbb ever gets through.
  if (typeof value !== 'string' || !HEX.test(value)) {
    throw new HttpError(400, `branding.${field} must be a colour like #f26a1b.`);
  }
  return value.toLowerCase();
}

/** Validates a brand from a request. `null` means "back to TaskFlow". */
export function parseBranding(input: unknown): CompanyBranding | null {
  if (input === null) return null;
  if (typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'branding must be an object.');
  }
  const body = input as Record<string, unknown>;
  let displayName: string | undefined;
  if (body.displayName !== undefined && body.displayName !== null) {
    if (typeof body.displayName !== 'string') throw new HttpError(400, 'branding.displayName must be text.');
    displayName = body.displayName.trim();
    if (displayName.length > 40) throw new HttpError(400, 'branding.displayName is limited to 40 characters.');
    if (!displayName) displayName = undefined;
  }
  const branding: CompanyBranding = {
    enabled: body.enabled === true,
    displayName,
    primaryColor: colour(body.primaryColor, 'primaryColor'),
    sidebarColor: colour(body.sidebarColor, 'sidebarColor'),
    font: pick(body.font, 'font', BRAND_FONTS),
    radius: pick(body.radius, 'radius', BRAND_RADII),
    defaultMode: pick(body.defaultMode, 'defaultMode', BRAND_MODES),
  };
  return Object.fromEntries(
    Object.entries(branding).filter(([, value]) => value !== undefined),
  ) as CompanyBranding;
}

/** Reads the stored column; anything unreadable is treated as no brand. */
export function readStoredBranding(raw: string | null | undefined): CompanyBranding | undefined {
  if (!raw) return undefined;
  try {
    return parseBranding(JSON.parse(raw)) ?? undefined;
  } catch {
    return undefined;
  }
}
