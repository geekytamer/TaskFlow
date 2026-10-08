/**
 * pm2 processes for the Peak portals and the public games lobby. One build of
 * portal/, three processes,
 * chosen by PORTAL_AUDIENCE at runtime. All bind loopback: nginx is the only
 * way in, and the backend's /portal-api is never routed by nginx.
 *
 *   cd portal && npm ci && npm run build
 *   PORTAL_API_URL=http://127.0.0.1:4105 pm2 startOrReload deploy/portal/ecosystem.portal.config.cjs --update-env
 */
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
// No default: a reload without it once pointed the staging-backed portals at
// production. Staging is http://127.0.0.1:4105, production http://127.0.0.1:4005.
const API_URL = process.env.PORTAL_API_URL;
if (!API_URL) throw new Error('Set PORTAL_API_URL: http://127.0.0.1:4105 for staging, http://127.0.0.1:4005 for production.');
// Peak's light-on-dark logo, shipped in portal/public/brand.
const LOGO_URL = process.env.PORTAL_LOGO_URL || '/brand/peak-logo-light.png';
const MARK_URL = process.env.PORTAL_MARK_URL || '/brand/peak-mark-light.png';

const portal = (name, audience, port) => ({
  name,
  cwd: path.join(ROOT, 'portal'),
  script: 'node_modules/next/dist/bin/next',
  args: `start -p ${port} -H 127.0.0.1`,
  env: { NODE_ENV: 'production', PORTAL_AUDIENCE: audience, PORTAL_API_URL: API_URL, PORTAL_LOGO_URL: LOGO_URL, PORTAL_MARK_URL: MARK_URL },
});

module.exports = {
  apps: [
    portal('peak-portal-client', 'client', 9003),
    portal('peak-portal-influencer', 'influencer', 9004),
    // No accounts: shows published public games only.
    portal('peak-games-lobby', 'lobby', 9005),
  ],
};
