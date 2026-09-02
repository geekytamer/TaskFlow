const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const created = [];

/**
 * Creates a temporary directory that is removed when the test process exits.
 *
 * The suite builds ~100 SQLite databases per run (api.test.js alone creates a
 * server 97 times). Leaving them behind leaked roughly 130 MB per run, and a
 * full disk makes SQLite writes fail nondeterministically — which showed up as
 * unrelated tests failing at random with impossible status codes.
 */
function makeTmpDir(prefix = 'taskflow-') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  created.push(dir);
  return dir;
}

/** Convenience: a temp directory plus the conventional database path inside it. */
function makeTmpDbPath(prefix = 'taskflow-') {
  return path.join(makeTmpDir(prefix), 'taskflow.db');
}

process.on('exit', () => {
  for (const dir of created) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best effort: a leftover directory is better than masking a real failure.
    }
  }
});

module.exports = { makeTmpDir, makeTmpDbPath };
