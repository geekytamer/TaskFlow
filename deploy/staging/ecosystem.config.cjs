/**
 * pm2 processes for the TaskFlow STAGING site, started by deploy-staging.sh:
 *   pm2 startOrReload deploy/staging/ecosystem.config.cjs --update-env
 *
 * Every process binds 127.0.0.1: nginx is the only way in, and OpenFGA must
 * never be reachable from outside at all. Production's own processes
 * (taskflow-backend, taskflow-frontend) are never touched — every name here
 * carries a staging prefix.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const DATA = '/var/lib/taskflow-staging';

// Must match deploy-staging.sh and nginx.conf.template.
const PORTS = { api: 4105, web: 3105, fgaHttp: 8180, fgaGrpc: 8181 };

/** Reads one key from backend/.env, so the OpenFGA key has a single source. */
function backendEnv(key) {
  const file = path.join(ROOT, 'backend', '.env');
  const line = fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .find((l) => l.startsWith(`${key}=`));
  const value = line ? line.slice(key.length + 1).trim() : '';
  if (!value) throw new Error(`${key} is missing or empty in ${file}`);
  return value;
}

module.exports = {
  apps: [
    {
      name: 'taskflow-staging-fga',
      script: '/opt/openfga/1.18.3/openfga',
      args: 'run',
      interpreter: 'none',
      env: {
        OPENFGA_DATASTORE_ENGINE: 'sqlite',
        OPENFGA_DATASTORE_URI: `file:${DATA}/openfga.db`,
        OPENFGA_HTTP_ADDR: `127.0.0.1:${PORTS.fgaHttp}`,
        OPENFGA_GRPC_ADDR: `127.0.0.1:${PORTS.fgaGrpc}`,
        // Verified against v1.18.3: left at defaults, OpenFGA also listens on
        // every interface for metrics (:2112), HTTP (:8080) and gRPC (:8081).
        OPENFGA_METRICS_ENABLED: 'false',
        OPENFGA_PLAYGROUND_ENABLED: 'false',
        OPENFGA_PROFILER_ENABLED: 'false',
        OPENFGA_AUTHN_METHOD: 'preshared',
        OPENFGA_AUTHN_PRESHARED_KEYS: backendEnv('FGA_API_TOKEN'),
        OPENFGA_LOG_FORMAT: 'json',
      },
    },
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
