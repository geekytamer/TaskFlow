import type { Express, RequestHandler } from 'express';
import { MIN_PASSWORD_LENGTH, RESEND_GAP_MS, type PasswordTokenPurpose } from '../auth/password-tokens';
import { beyondPerson, permissionLabel } from '../authz/describe';
import { effective } from '../authz/evaluate';
import { appLink, type PasswordEmailSender } from '../email';
import { HttpError } from '../http';
import { verifyPassword } from '../password';
import { asRecord, requiredString } from '../validation';
import type { RouteContext } from './context';
import { handler, type AuthedRequest } from './shared';

export type PasswordLinkSender = (userId: string, purpose: PasswordTokenPurpose) => Promise<{ sent: boolean; link?: string }>;

/** Emails a fresh one-time link; hands it back only when the email could not go out. */
export function makePasswordLinkSender(
  store: RouteContext['store'],
  send: PasswordEmailSender,
  logger: RouteContext['logger'],
): PasswordLinkSender {
  return async (userId, purpose) => {
    const user = store.getUserById(userId);
    if (!user) throw new HttpError(404, 'User not found.');
    const token = store.passwordTokens.issue(user.id, purpose);
    const link = appLink(`/set-password?token=${encodeURIComponent(token)}`);
    const result = await send({ to: user.email, name: user.name, link, purpose }).catch((error) => ({ sent: false, error: String(error) }));
    if (!result.sent) logger.warn(`[password] ${purpose} email to ${user.id} not sent: ${result.error ?? 'unknown'}`);
    return result.sent ? { sent: true } : { sent: false, link };
  };
}

/**
 * Passwords: people set their own through one-time links (a new account's
 * invitation, an admin's reset, "forgot password"), and change their own with
 * the current one. Every change signs the person out of their other devices.
 */
export function registerPasswordRoutes(
  app: Express,
  ctx: Pick<RouteContext, 'store' | 'authMiddleware' | 'allowsRule' | 'logger' | 'permissionsEngine' | 'viewerOf'>,
  deps: { sendLink: PasswordLinkSender; limiter: RequestHandler },
) {
  const { store, authMiddleware, allowsRule, permissionsEngine: engine, viewerOf } = ctx;
  const sendLink = deps.sendLink;

  const newPassword = (value: unknown) => {
    const password = typeof value === 'string' ? value : '';
    if (password.length < MIN_PASSWORD_LENGTH) {
      throw new HttpError(400, `Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    return password;
  };

  app.post('/users/:id/password-reset', authMiddleware, handler(async (req, res) => {
    const target = store.getUserById(req.params.id);
    if (!target) throw new HttpError(404, 'User not found.');
    if (!req.user!.isSuperAdmin) {
      // Same rule as changing someone's sign-in details: their password covers every
      // company they work in, so only someone who manages all of them may reset it.
      if (target.isSuperAdmin) throw new HttpError(403, 'Only the super admin can reset this user.');
      const assignments = target.companyRoles?.length
        ? target.companyRoles
        : (target.companyIds ?? []).map((companyId) => ({ companyId, role: target.role }));
      if (assignments.length === 0 || !assignments.every((a) => allowsRule(req, a.companyId, 'USERS_WRITE'))) {
        throw new HttpError(403, 'Only someone who manages every company this person works in can reset their password.');
      }
      // The same line as adding or editing people: a manager handles employees; an
      // Admin, Manager or Accountant is reset only by a company admin. Otherwise a
      // manager could receive an admin's link (when email fails) and take the account.
      if (assignments.some((a) => a.role !== 'Employee' && !allowsRule(req, a.companyId, 'ADMINISTRATION'))) {
        throw new HttpError(403, 'Only a company admin can reset the password of an Admin, Manager or Accountant.');
      }
      // v2 also: no higher than me. In every company of theirs, the person may
      // hold nothing I don't (as the People API checks before changing roles),
      // so a custom role with more access is not reset by someone below it.
      // Legacy and shadow: the role rule above is today's whole answer.
      if (engine === 'v2') {
        const mine = viewerOf(req);
        const theirs = effective(store, target.id);
        for (const a of assignments) {
          const missing = beyondPerson(mine.byCompany.get(a.companyId), theirs.byCompany.get(a.companyId));
          if (missing.length) {
            throw new HttpError(
              403,
              `This person holds access you don't: ${missing.map((k) => permissionLabel(k).en).join('; ')}. Only someone with at least their access can reset their password.`,
              { code: 'HIGHER_THAN_YOU', permission: missing[0], missing },
            );
          }
        }
      }
    }
    res.json(await sendLink(target.id, 'reset'));
  }));

  app.post('/auth/forgot-password', deps.limiter, handler(async (req, res) => {
    const email = requiredString(asRecord(req.body, 'body').email, 'email', { min: 3 }).trim();
    const user = store.findUserByEmail(email);
    if (user) {
      const last = store.passwordTokens.lastOpenReset(user.id);
      if (!last || Date.now() - Date.parse(last) > RESEND_GAP_MS) await sendLink(user.id, 'reset');
    }
    // The same answer whether or not the address has an account.
    res.json({ success: true });
  }));

  app.get('/auth/password-token', deps.limiter, handler((req, res) => {
    const row = store.passwordTokens.valid(String(req.query.token ?? ''));
    if (!row) throw new HttpError(400, 'This link has expired or was already used.');
    const user = store.getUserById(row.userId);
    if (!user) throw new HttpError(400, 'This link has expired or was already used.');
    res.json({ purpose: row.purpose, name: user.name, email: user.email });
  }));

  app.post('/auth/set-password', deps.limiter, handler((req, res) => {
    const body = asRecord(req.body, 'body');
    const row = store.passwordTokens.valid(String(body.token ?? ''));
    if (!row) throw new HttpError(400, 'This link has expired or was already used.');
    const password = newPassword(body.password);
    store.passwordTokens.consume(row);
    store.updateUser(row.userId, { password });
    store.revokeUserTokens(row.userId);
    const token = store.issueToken(row.userId);
    res.json({ token, user: store.getUserById(row.userId) });
  }));

  app.put('/auth/password', authMiddleware, handler((req, res) => {
    const body = asRecord(req.body, 'body');
    const current = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const user = store.findUserByEmail(req.user!.email);
    if (!user || !verifyPassword(current, user.password)) throw new HttpError(400, 'The current password is not right.');
    const password = newPassword(body.newPassword);
    store.updateUser(user.id, { password });
    const here = (req.headers.authorization ?? '').replace('Bearer ', '').trim();
    store.revokeUserTokens(user.id, here);
    res.json({ success: true });
  }));
}
