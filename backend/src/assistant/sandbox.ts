import { newQuickJSWASMModuleFromVariant, type QuickJSWASMModule } from 'quickjs-emscripten-core';
import variant from '@jitl/quickjs-wasmfile-release-sync';

/**
 * Runs a script the model wrote, in QuickJS compiled to WebAssembly: no
 * network, files, timers, process or require. Its only way out is `api`,
 * whose calls the host makes (as the signed-in person) and answers.
 */
export interface SandboxHost {
  /** Make (or, for a change, propose) one API call; the value is handed to the script as JSON. */
  call(method: string, path: string, body: unknown, summary: string | undefined): Promise<unknown>;
}

export interface SandboxLimits {
  /** Wall-clock budget for the whole script, API calls included. */
  timeoutMs: number;
  /** Most API calls one script may make. */
  maxCalls: number;
  memoryBytes: number;
}

export interface SandboxResult {
  ok: boolean;
  /** The script's return value (JSON-safe), or the error message. */
  value?: unknown;
  error?: string;
  logs: string[];
}

export const DEFAULT_LIMITS: SandboxLimits = { timeoutMs: 30_000, maxCalls: 40, memoryBytes: 64 * 1024 * 1024 };

let modulePromise: Promise<QuickJSWASMModule> | undefined;
const quickjs = () => (modulePromise ??= newQuickJSWASMModuleFromVariant(variant));

/** What a run adds to the script's globals: constants (COMPANY_ID, ME, TODAY) and tf.<recipe>. */
export interface SandboxExtras {
  globals?: Record<string, string>;
  recipes?: string[];
}

function extrasPrelude(extras: SandboxExtras): string {
  const lines = Object.entries(extras.globals ?? {})
    .filter(([k]) => /^[A-Z][A-Z_]*$/.test(k))
    .map(([k, v]) => `const ${k} = ${JSON.stringify(String(v))};`);
  const names = (extras.recipes ?? []).filter((n) => /^[a-zA-Z]+$/.test(n));
  lines.push(`const tf = Object.freeze({ ${names.map((n) => `${n}: (a) => __recipe(${JSON.stringify(n)}, a)`).join(', ')} });`);
  return lines.join('\n');
}

const PRELUDE = `
const __j = (s) => (s === undefined || s === '' ? null : JSON.parse(s));
const __call = async (m, p, b, s) => {
  if (typeof p !== 'string' || !p.startsWith('/')) throw new Error('api path must start with /');
  const r = __j(await __host(m, p, b === undefined ? '' : JSON.stringify(b), s === undefined ? '' : String(s)));
  if (r && r.__error) { const e = new Error(r.__error); e.status = r.status; throw e; }
  return r;
};
const __recipe = async (n, a) => {
  const r = __j(await __host('RECIPE', n, a === undefined ? '' : JSON.stringify(a), ''));
  if (r && r.__error) { const e = new Error(r.__error); e.status = r.status; throw e; }
  return r;
};
const api = Object.freeze({
  get: (p) => __call('GET', p),
  post: (p, b, s) => __call('POST', p, b, s),
  put: (p, b, s) => __call('PUT', p, b, s),
  patch: (p, b, s) => __call('PATCH', p, b, s),
  delete: (p, s) => __call('DELETE', p, undefined, s),
});
const show = async (rows, kind) => __j(await __host('SHOW', '/', JSON.stringify({ rows, kind: kind === undefined ? null : kind }), ''));
const search = async (q) => __j(await __host('SEARCH', String(q), '', ''));
const findApi = search;
const makeDocument = async (template, fields, summary) => __j(await __host('DOC', '/', JSON.stringify({ template, fields: fields ?? {} }), summary === undefined ? '' : String(summary)));
const lookup = async (q) => __j(await __host('LOOKUP', String(q), '', ''));
const console = Object.freeze({ log: (...a) => __log(a.map((x) => typeof x === 'string' ? x : JSON.stringify(x)).join(' ')) });
`;

export async function runInSandbox(code: string, host: SandboxHost, limits: SandboxLimits = DEFAULT_LIMITS, extras: SandboxExtras = {}): Promise<SandboxResult> {
  const mod = await quickjs();
  const runtime = mod.newRuntime();
  runtime.setMemoryLimit(limits.memoryBytes);
  runtime.setMaxStackSize(1024 * 1024);
  const deadline = Date.now() + limits.timeoutMs;
  runtime.setInterruptHandler(() => Date.now() > deadline);
  const ctx = runtime.newContext();
  const logs: string[] = [];
  let calls = 0;
  let disposed = false;
  const pending = new Set<{ dispose(): void }>();

  try {
    const log = ctx.newFunction('__log', (line) => {
      if (logs.length < 50) logs.push(ctx.getString(line).slice(0, 2000));
    });
    ctx.setProp(ctx.global, '__log', log);
    log.dispose();

    const hostFn = ctx.newFunction('__host', (m, p, b, s) => {
      const method = ctx.getString(m);
      const path = ctx.getString(p);
      const bodyText = ctx.getString(b);
      const summary = ctx.getString(s) || undefined;
      const deferred = ctx.newPromise();
      pending.add(deferred);
      const settle = (text: string) => {
        if (disposed) return;
        pending.delete(deferred);
        const value = ctx.newString(text);
        deferred.resolve(value);
        value.dispose();
        runtime.executePendingJobs();
      };
      calls += 1;
      if (calls > limits.maxCalls) {
        // Answered on a later tick, like every other call: settle() runs pending jobs,
        // which must not happen re-entrantly while the VM is inside this very call.
        setImmediate(() => settle(JSON.stringify({ __error: `too many api calls in one script (limit ${limits.maxCalls}); return what you have and continue in another run` })));
      } else {
        let body: unknown;
        try { body = bodyText ? JSON.parse(bodyText) : undefined; } catch { body = undefined; }
        host.call(method, path, body, summary).then(
          (value) => settle(JSON.stringify(value ?? null)),
          (err: unknown) => settle(JSON.stringify({ __error: err instanceof Error ? err.message : String(err), status: (err as { status?: number })?.status })),
        );
      }
      return deferred.handle;
    });
    ctx.setProp(ctx.global, '__host', hostFn);
    hostFn.dispose();

    const prelude = ctx.evalCode(`${PRELUDE}\n${extrasPrelude(extras)}`, 'prelude.js');
    ctx.unwrapResult(prelude).dispose();

    const evaluated = ctx.evalCode(`(async () => {\n${code}\n})()`, 'script.js');
    if (evaluated.error) {
      const error = ctx.dump(evaluated.error);
      evaluated.error.dispose();
      return { ok: false, error: messageOf(error), logs };
    }
    const promise = ctx.resolvePromise(evaluated.value);
    evaluated.value.dispose();
    runtime.executePendingJobs();

    const timer = new Promise<'timeout'>((resolve) => {
      const t = setTimeout(() => resolve('timeout'), Math.max(0, deadline - Date.now()));
      t.unref?.();
    });
    const settled = await Promise.race([promise, timer]);
    if (settled === 'timeout') return { ok: false, error: `the script took longer than ${Math.round(limits.timeoutMs / 1000)}s`, logs };
    if (settled.error) {
      const error = ctx.dump(settled.error);
      settled.error.dispose();
      return { ok: false, error: messageOf(error), logs };
    }
    const value = ctx.dump(settled.value);
    settled.value.dispose();
    return { ok: true, value: value === undefined ? null : value, logs };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err), logs };
  } finally {
    disposed = true;
    for (const d of pending) { try { d.dispose(); } catch { /* already gone */ } }
    try { ctx.dispose(); runtime.dispose(); } catch { /* a pending promise can hold handles; the runtime goes with the GC */ }
  }
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) {
    const e = error as { name?: string; message?: string };
    return e.message === 'interrupted' ? 'the script ran too long' : `${e.name ?? 'Error'}: ${e.message}`;
  }
  return String(error);
}
