/**
 * pm2 processes for the Peak portals. One build of portal/, two processes,
 * chosen by PORTAL_AUDIENCE at runtime. Both bind loopback: nginx is the only
 * way in, and the backend's /portal-api is never routed by nginx.
 *
 *   cd portal && npm ci && npm run build
 *   pm2 startOrReload deploy/portal/ecosystem.portal.cjs --update-env
 */
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const API_URL = process.env.PORTAL_API_URL || 'http://127.0.0.1:4005';

const portal = (name, audience, port) => ({
  name,
  cwd: path.join(ROOT, 'portal'),
  script: 'node_modules/next/dist/bin/next',
  args: `start -p ${port} -H 127.0.0.1`,
  env: { NODE_ENV: 'production', PORTAL_AUDIENCE: audience, PORTAL_API_URL: API_URL },
});

module.exports = {
  apps: [
    portal('peak-portal-client', 'client', 9003),
    portal('peak-portal-influencer', 'influencer', 9004),
  ],
};
