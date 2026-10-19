/**
 * Lists every route an Express app answers: method + path, with the mount
 * paths of sub-routers (`app.use('/portal-api', router)`) prefixed.
 *
 * Used by the route registry test (test/authz-route-registry.test.js) to prove
 * every route is declared. Run directly to print the routes of a test-built
 * app: `npx tsx src/scripts/list-routes.ts`.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import type { Express } from 'express';
import { createServer } from '../server';
import { DataStore } from '../data/store';
import { FixtureMetaClient } from '../social/meta-client';

export interface ListedRoute { method: string; path: string }

interface Layer {
  route?: { path: string | string[]; methods: Record<string, boolean> };
  name?: string;
  handle?: { stack?: Layer[]; _router?: unknown };
  regexp?: RegExp & { fast_slash?: boolean };
}

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** The literal mount path of an `app.use(path, router)` layer ('' when mounted at the root). */
function mountPath(layer: Layer): string {
  const re = layer.regexp;
  if (!re || re.fast_slash) return '';
  // Express 4 compiles '/portal-api' to /^\/portal-api\/?(?=\/|$)/i.
  const match = /^\^((?:\\\/[^\\?(]+)+)\\\/\?\(\?=\\\/\|\$\)$/.exec(re.source);
  if (!match) throw new Error(`list-routes: cannot read the mount path of ${re.source}`);
  return match[1].replace(/\\\//g, '/');
}

/**
 * Walks a router stack. Anything that could route requests in a shape this
 * walker does not understand (a mounted sub-app, a router under another name,
 * `app.all`, a method outside METHODS) throws, so no route slips past the
 * completeness test unseen.
 */
function walk(stack: Layer[], prefix: string, out: ListedRoute[]): void {
  for (const layer of stack) {
    if (layer.route) {
      const paths = Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path];
      const methods = Object.keys(layer.route.methods).filter((m) => layer.route!.methods[m]);
      const unknown = methods.filter((m) => !METHODS.includes(m));
      if (unknown.length) throw new Error(`list-routes: ${paths.join(', ')} uses ${unknown.join(', ')}`);
      for (const p of paths) {
        if (typeof p !== 'string') throw new Error(`list-routes: non-string route path under ${prefix}`);
        for (const method of methods) out.push({ method: method.toUpperCase(), path: prefix + p });
      }
    } else if (layer.handle?._router) {
      throw new Error(`list-routes: a sub-app is mounted under ${prefix || '/'}; walk it explicitly`);
    } else if (layer.handle?.stack) {
      if (layer.name !== 'router') throw new Error(`list-routes: unknown layer ${layer.name} with a stack under ${prefix || '/'}`);
      walk(layer.handle.stack, prefix + mountPath(layer), out);
    }
  }
}

/**
 * Every method + path the app routes, in registration order. Duplicates are
 * kept (Express answers with the first; the test asserts there are none).
 */
export function listRoutes(app: Express): ListedRoute[] {
  const router = (app as unknown as { _router?: { stack: Layer[] } })._router;
  if (!router) return [];
  const out: ListedRoute[] = [];
  walk(router.stack, '', out);
  return out;
}

/**
 * An app with every optional router switched on (portal API, social, games,
 * Discover), on a throwaway database, so the listing is the full route set.
 */
export function buildRouteListingApp(dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-routes-'))): Express {
  const dbPath = path.join(dir, 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Route listing', website: '', address: '' });
  return createServer({
    store, dbPath, seedOnEmpty: false, allowSeedReset: false, authzEngine: 'legacy',
    logger: { info() {}, warn() {}, error() {} },
    portalCompanyId: company.id,
    sendPortalInvite: async () => ({ sent: true }),
    social: {
      client: new FixtureMetaClient(path.join(__dirname, '..', '..', 'test', 'fixtures', 'meta')),
      appSecret: 'listing', redirectUri: 'http://localhost/cb', portalReturnUrl: 'http://localhost/profile',
      webhookVerifyToken: 'listing',
    },
  }) as unknown as Express;
}

if (require.main === module) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'taskflow-routes-'));
  for (const r of listRoutes(buildRouteListingApp(dir))) process.stdout.write(`${r.method} ${r.path}\n`);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
}
