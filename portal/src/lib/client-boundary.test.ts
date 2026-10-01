import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * A 'use client' module must never reach server-only code (next/headers, the
 * session cookie, the backend fetch). The type checker cannot see this and the
 * page only fails when it is built, so the rule is enforced here instead. Type
 * imports are erased at build time and are allowed.
 */

const SRC = path.resolve(__dirname, '..');
const SERVER_ONLY = ['next/headers'];

const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? files(full) : /\.(ts|tsx)$/.test(name) && !name.endsWith('.test.ts') ? [full] : [];
  });

const resolve = (from: string, spec: string): string | null => {
  const base = spec.startsWith('@/') ? path.join(SRC, spec.slice(2)) : spec.startsWith('.') ? path.resolve(path.dirname(from), spec) : null;
  if (!base) return null;
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
};

/** Runtime imports only: `import type` and `export type` are erased. */
const runtimeImports = (file: string): string[] => {
  const source = readFileSync(file, 'utf8');
  const specs: string[] = [];
  const pattern = /^\s*(?:import|export)\s+(?!type\b)(?:[^'";]*?\sfrom\s+)?['"]([^'"]+)['"]/gm;
  for (const match of source.matchAll(pattern)) specs.push(match[1]);
  return specs;
};

/** The chain from `file` to a server-only module, or null. */
const serverChain = (file: string, seen = new Set<string>()): string[] | null => {
  if (seen.has(file)) return null;
  seen.add(file);
  for (const spec of runtimeImports(file)) {
    if (SERVER_ONLY.includes(spec)) return [path.relative(SRC, file), spec];
    const next = resolve(file, spec);
    if (!next) continue;
    const chain = serverChain(next, seen);
    if (chain) return [path.relative(SRC, file), ...chain];
  }
  return null;
};

test('no client component reaches server-only code', () => {
  const clientFiles = files(SRC).filter((f) => /^\s*['"]use client['"]/.test(readFileSync(f, 'utf8')));
  assert.ok(clientFiles.length > 5, 'found the client components');
  const problems = clientFiles.map((f) => serverChain(f)).filter((c): c is string[] => c !== null).map((c) => c.join(' -> '));
  assert.deepEqual(problems, []);
});
