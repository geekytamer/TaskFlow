import bcrypt from 'bcryptjs';

const ROUNDS = 10;
const BCRYPT_RE = /^\$2[aby]\$\d{2}\$/;

/** True if the stored value is already a bcrypt hash (vs. a legacy plaintext password). */
export function isHashed(value: string | null | undefined): boolean {
  return typeof value === 'string' && BCRYPT_RE.test(value);
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, ROUNDS);
}

/**
 * Verify a plaintext password against the stored value. Handles both bcrypt
 * hashes and legacy plaintext (pre-hashing) records — callers should re-hash a
 * legacy password on successful login so it upgrades transparently.
 */
export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  if (isHashed(stored)) {
    try {
      return bcrypt.compareSync(plain, stored);
    } catch {
      return false;
    }
  }
  return plain === stored;
}
