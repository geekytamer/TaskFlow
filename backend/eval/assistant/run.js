#!/usr/bin/env node
/**
 * npm run eval:assistant [-- --only id1,id2] [-- --lang en|ar]
 * Runs every case against the model in AI_BASE_URL / AI_MODEL on a fresh
 * fixture, prints a table and appends the score to history.jsonl. Changes are
 * never confirmed: a case checks what was proposed.
 */
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
// EVAL_DIST runs a frozen copy of the build (a baseline) while the source keeps changing.
const dist = process.env.EVAL_DIST ?? path.join(__dirname, '../../dist');
const { createServer } = require(path.join(dist, 'server'));
const { DataStore } = require(path.join(dist, 'data/store'));
const { modelConfigFromEnv } = require(path.join(dist, 'assistant/model'));
const { seedFixture } = require('./fixture');
const cases = require('./cases');

const arg = (name) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : undefined; };

async function main() {
  const config = modelConfigFromEnv();
  if (!config) { console.error('Set AI_BASE_URL and AI_MODEL (e.g. http://127.0.0.1:11434/v1 and qwen3:8b).'); process.exit(2); }
  const only = arg('only')?.split(',');
  const langs = arg('lang') ? [arg('lang')] : ['en', 'ar'];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-eval-'));
  const dbPath = path.join(dir, 'eval.db');
  const store = new DataStore({ dbPath, seedOnEmpty: true });
  const today = new Date().toISOString().slice(0, 10);
  const fx = seedFixture(store, today);
  const server = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: { info() {}, warn() {}, error() {} } }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const tokens = { admin: store.issueToken(fx.admin.id), charlie: store.issueToken(fx.charlie.id) };

  const results = [];
  for (const c of cases.filter((x) => !only || only.includes(x.id))) {
    for (const lang of langs) {
      const started = Date.now();
      let verdict;
      let reply = '';
      try {
        const res = await fetch(`${base}/assistant/chat`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: `Bearer ${tokens[c.as ?? 'admin']}` },
          body: JSON.stringify({ companyId: fx.companyId, message: c[lang] }),
        });
        const view = await res.json();
        if (!res.ok) throw new Error(`${res.status} ${view.message ?? ''}`);
        const answer = [...view.items].reverse().find((i) => i.role === 'assistant') ?? { text: '', cards: [] };
        reply = answer.text;
        const proposals = store.listAssistantActions(view.id).map((a) => ({ method: a.method, path: a.path.split('?')[0], body: a.body ?? {}, summary: a.summary }));
        verdict = c.check({ reply, cards: view.items.flatMap((i) => i.cards ?? []), proposals, fx, store });
      } catch (err) {
        verdict = `error: ${err instanceof Error ? err.message : String(err)}`;
      }
      const ms = Date.now() - started;
      results.push({ id: c.id, lang, ok: verdict === true, why: verdict === true ? '' : String(verdict), ms, reply: reply.slice(0, 160) });
      console.log(`${verdict === true ? 'PASS' : 'FAIL'}  ${c.id.padEnd(20)} ${lang}  ${String(Math.round(ms / 1000)).padStart(3)}s  ${verdict === true ? '' : verdict}`);
    }
  }
  server.close();
  const passed = results.filter((r) => r.ok).length;
  const times = results.map((r) => r.ms).sort((a, b) => a - b);
  const row = {
    at: new Date().toISOString(), model: config.model, mode: config.toolMode, passed, total: results.length,
    score: Math.round((passed / Math.max(1, results.length)) * 1000) / 10, medianMs: times[Math.floor(times.length / 2)] ?? 0,
    failed: results.filter((r) => !r.ok).map((r) => `${r.id}/${r.lang}`), filtered: Boolean(only || arg('lang')),
  };
  console.log(`\n${passed}/${results.length} passed (${row.score}%), median ${Math.round(row.medianMs / 1000)}s per request, model ${config.model}`);
  fs.appendFileSync(path.join(__dirname, 'history.jsonl'), `${JSON.stringify(row)}\n`);
}

main().catch((err) => { console.error(err); process.exit(1); });
