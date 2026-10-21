/**
 * pm2 processes for the TaskFlow STAGING site, started by deploy-staging.sh:
 *   pm2 startOrReload deploy/staging/ecosystem.config.cjs --update-env
 *
 * Every process binds 127.0.0.1: nginx is the only way in. Production's own processes
 * (taskflow-backend, taskflow-frontend) are never touched — every name here
 * carries a staging prefix.
 */
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = '/var/lib/taskflow-staging';

// Must match deploy-staging.sh and nginx.conf.template.
const PORTS = { api: 4105, web: 3105 };

module.exports = {
  apps: [
    {
      name: 'taskflow-staging-api',
      cwd: path.join(ROOT, 'backend'), // dotenv reads .env from the cwd
      script: 'dist/index.js',
      // Also set here, not only in .env: dotenv never overrides a variable that
      // is already present, so a stray PORT in pm2's own environment would
      // otherwise win and collide with production.
      env: {
        PORT: String(PORTS.api),
        HOST: '127.0.0.1',
      },
    },
    {
      name: 'taskflow-staging-web',
      cwd: path.join(ROOT, 'frontend'),
      // `npm start` hardcodes a localstorage file that production's frontend
      // also uses, so start next directly with a staging-only path.
      script: 'node_modules/next/dist/bin/next',
      args: `start -p ${PORTS.web} -H 127.0.0.1`,
      env: {
        NODE_OPTIONS: `--localstorage-file=${DATA}/node-localstorage`,
      },
    },
  ],
};
