/**
 * Two-language names (spec 2026-11-10-bilingual-names-design). A record keeps
 * `name` (always filled, read by every screen as before) plus optional
 * `nameAr` / `nameEn`. `name` stays on the side it was first written in.
 */
export type NameSide = 'ar' | 'en';

export interface Names {
  name: string;
  nameAr?: string;
  nameEn?: string;
}

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/;

/** Arabic when the text has any Arabic letter, English otherwise. */
export function scriptSide(text: string | undefined | null): NameSide {
  return text && ARABIC.test(text) ? 'ar' : 'en';
}

const clean = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(/\s+/g, ' ').trim();
  return text || undefined;
};

/**
 * The names to store. `input` may carry `name` alone (older callers: it lands on
 * the side its letters say), the two sides, or a mix. A side sent as null or ""
 * is cleared; a side left undefined keeps `existing`. Throws when nothing is left.
 */
export function resolveNames(
  input: { name?: unknown; nameAr?: unknown; nameEn?: unknown },
  existing?: Names,
): Names {
  let nameAr = input.nameAr === undefined ? existing?.nameAr : clean(input.nameAr);
  let nameEn = input.nameEn === undefined ? existing?.nameEn : clean(input.nameEn);
  const plain = clean(input.name);
  // A caller that sends only `name` (every screen not yet two-language) edits
  // the side that name is written in.
  if (plain && input.nameAr === undefined && input.nameEn === undefined) {
    if (scriptSide(plain) === 'ar') nameAr = plain;
    else nameEn = plain;
  }
  if (!nameAr && !nameEn) {
    if (plain) return { name: plain, ...(scriptSide(plain) === 'ar' ? { nameAr: plain } : { nameEn: plain }) };
    throw new Error('Enter the name in Arabic or English.');
  }
  // `name` keeps its side: an Arabic-first record stays Arabic where `name` is read raw.
  const side: NameSide = existing?.name ? scriptSide(existing.name) : (plain ? scriptSide(plain) : (nameAr ? 'ar' : 'en'));
  const name = (side === 'ar' ? nameAr ?? nameEn : nameEn ?? nameAr)!;
  return { name, nameAr, nameEn };
}

/** The display rule: the language's own name, then the other, then `name`. */
export function pickName(record: Partial<Names>, language: NameSide | undefined): string {
  if (language === 'ar') return record.nameAr || record.nameEn || record.name || '';
  if (language === 'en') return record.nameEn || record.nameAr || record.name || '';
  return record.name || record.nameAr || record.nameEn || '';
}
