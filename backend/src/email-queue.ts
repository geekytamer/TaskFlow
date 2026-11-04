/**
 * One line for every outgoing email. Resend allows 10 requests a second per
 * account; the hourly reminder sweep used to fire dozens of critical
 * notification emails at once and lost them to 429s. Each send now waits for
 * a free slot in a sliding one-second window (first come, first served), and
 * a rate-limit 429 is retried with capped exponential backoff and jitter.
 * Quota-exhausted 429s and other errors are returned at once: retrying them
 * within seconds cannot help.
 */

export type EmailAttempt = { sent: boolean; error?: string; rateLimited?: boolean };

export interface EmailQueueOptions {
  /** Sends allowed to start in any one-second window. */
  perSecond: number;
  /** Retries after the first try, for rate-limit failures only. */
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** 0..1, for jitter; tests pass () => 0. */
  random?: () => number;
}

export interface EmailQueue {
  run(attempt: () => Promise<EmailAttempt>): Promise<EmailAttempt>;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function createEmailQueue(options: EmailQueueOptions): EmailQueue {
  const perSecond = Math.max(1, Math.floor(options.perSecond));
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? realSleep;
  const random = options.random ?? Math.random;
  const starts: number[] = [];
  let gate: Promise<void> = Promise.resolve();

  /** Resolves when this caller may start a request; callers are served in order. */
  const acquire = (): Promise<void> => {
    const turn = gate.then(async () => {
      for (;;) {
        const t = now();
        while (starts.length > 0 && starts[0] <= t - 1000) starts.shift();
        if (starts.length < perSecond) {
          starts.push(t);
          return;
        }
        await sleep(starts[0] + 1000 - t + 1);
      }
    });
    gate = turn.catch(() => undefined);
    return turn;
  };

  return {
    async run(attempt) {
      let result: EmailAttempt = { sent: false, error: 'Email not attempted.' };
      for (let tryNo = 0; tryNo <= options.maxRetries; tryNo += 1) {
        if (tryNo > 0) {
          const backoff = Math.min(options.maxDelayMs, options.baseDelayMs * 2 ** (tryNo - 1));
          await sleep(backoff + Math.floor(random() * options.baseDelayMs));
        }
        await acquire();
        try {
          result = await attempt();
        } catch (error: any) {
          return { sent: false, error: error?.message || 'Failed to send email.' };
        }
        if (result.sent || !result.rateLimited) return result;
      }
      return result;
    },
  };
}

/** True for Resend's per-second limit; false for daily/monthly quota and other errors. */
export function isRateLimitError(error: { name?: string; statusCode?: number | null; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const text = `${error.name ?? ''} ${error.message ?? ''}`;
  if (/quota/i.test(text)) return false;
  return error.name === 'rate_limit_exceeded' || error.statusCode === 429 || /too many requests/i.test(text);
}
