import { v4 as uuid } from 'uuid';
import { HttpError } from './http';
import { payoutMethods, type PayoutAccount, type PayoutMethod } from './types';

export const MAX_PAYOUT_ACCOUNTS = 5;

const text = (value: unknown, field: string, max: number): string | undefined => {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new HttpError(400, `${field} must be text.`);
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > max) throw new HttpError(400, `${field} must be at most ${max} characters.`);
  return trimmed;
};

/** "om 12 0180 0000" → "OM1201800000": the form banks print and match on. */
const compactCode = (value: string | undefined) => value?.replace(/\s+/g, '').toUpperCase() || undefined;

/**
 * The accounts a contact is paid to, from a request body. Keeps the ids of
 * accounts the contact already had (by id), gives new ones an id, and leaves
 * exactly one default when there is any account at all.
 */
export function parsePayoutAccounts(raw: unknown, existing: readonly PayoutAccount[] = []): PayoutAccount[] {
  if (!Array.isArray(raw)) throw new HttpError(400, 'payoutAccounts must be a list.');
  if (raw.length > MAX_PAYOUT_ACCOUNTS) throw new HttpError(400, `payoutAccounts must be a list of up to ${MAX_PAYOUT_ACCOUNTS}.`);
  const known = new Set(existing.map((a) => a.id));
  const accounts = raw.map((item, index): PayoutAccount => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new HttpError(400, `payoutAccounts[${index}] must be an object.`);
    const a = item as Record<string, unknown>;
    const method = (a.method ?? 'Bank transfer') as PayoutMethod;
    if (!payoutMethods.includes(method)) throw new HttpError(400, `payoutAccounts[${index}].method is not a known method.`);
    const id = typeof a.id === 'string' && known.has(a.id) ? a.id : uuid();
    const account: PayoutAccount = {
      id,
      method,
      accountHolder: text(a.accountHolder, 'accountHolder', 120),
      bankName: text(a.bankName, 'bankName', 120),
      accountNumber: compactCode(text(a.accountNumber, 'accountNumber', 40)),
      iban: compactCode(text(a.iban, 'iban', 40)),
      swift: compactCode(text(a.swift, 'swift', 15)),
      currency: compactCode(text(a.currency, 'currency', 3)),
      walletNumber: text(a.walletNumber, 'walletNumber', 40),
      notes: text(a.notes, 'notes', 500),
      isDefault: a.isDefault === true,
    };
    if (account.iban && !/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(account.iban)) {
      throw new HttpError(400, `payoutAccounts[${index}].iban is not a valid IBAN.`);
    }
    if (account.swift && !/^[A-Z0-9]{8}([A-Z0-9]{3})?$/.test(account.swift)) {
      throw new HttpError(400, `payoutAccounts[${index}].swift must be 8 or 11 letters and digits.`);
    }
    if (method === 'Bank transfer' && !account.accountNumber && !account.iban) {
      throw new HttpError(400, `payoutAccounts[${index}]: a bank transfer needs an account number or an IBAN.`);
    }
    if (method === 'Wallet' && !account.walletNumber) {
      throw new HttpError(400, `payoutAccounts[${index}]: a wallet payment needs the wallet number.`);
    }
    // No empty keys stored.
    for (const key of Object.keys(account) as Array<keyof PayoutAccount>) {
      if (account[key] === undefined) delete account[key];
    }
    return account;
  });
  if (accounts.length > 0) {
    const firstDefault = accounts.findIndex((a) => a.isDefault);
    const pick = firstDefault < 0 ? 0 : firstDefault;
    accounts.forEach((a, i) => { a.isDefault = i === pick; });
  }
  return accounts;
}
