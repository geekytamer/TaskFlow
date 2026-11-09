import { modelConfigFromEnv, openAiChat, ModelUnavailableError, type ChatFn } from '../assistant/model';
import { HttpError } from '../http';
import { asRecord, enumValue, requiredString } from '../validation';
import type { RouteContext } from './context';
import { handler } from './shared';
import type { Express } from 'express';

/**
 * "اقترح ترجمة / Suggest translation" (spec 2026-11-10-bilingual-names-design):
 * the other-language name for a record, from the in-app assistant's own model
 * (AI_BASE_URL / AI_MODEL; no paid API). It only suggests: nothing is saved
 * here, the person reviews the text in the form and saves it themselves.
 */
export function registerNameSuggestionRoutes(app: Express, ctx: RouteContext, options: { chat?: ChatFn } = {}): void {
  const { authMiddleware, requireCompanyRoles } = ctx;
  const config = options.chat ? null : modelConfigFromEnv();
  const chat: ChatFn | null = options.chat ?? (config ? openAiChat(config) : null);

  app.post(
    '/companies/:companyId/name-suggestion',
    authMiddleware,
    handler(async (req, res) => {
      requireCompanyRoles(req, req.params.companyId, ['Admin', 'Manager', 'Accountant', 'Employee']);
      const body = asRecord(req.body, 'body');
      const text = requiredString(body.text, 'text', { min: 1 }).replace(/\s+/g, ' ').trim().slice(0, 200);
      const from = enumValue(body.from, 'from', ['ar', 'en'] as const);
      // A person or company is written the way it sounds; a service or product is translated.
      const kind = enumValue(body.kind ?? 'term', 'kind', ['name', 'term'] as const);
      if (!chat) throw new HttpError(503, 'The assistant is not set up, so suggestions are off. Type the name yourself.', { code: 'ASSISTANT_OFFLINE' });
      const to = from === 'ar' ? 'English' : 'Arabic';
      const task = kind === 'name'
        ? `This is the name of a person or a business. Write it in ${to} letters the way it is pronounced (transliterate). Do not translate the meaning of the words.`
        : `This is the name of a product or service on a price list. Translate it into natural ${to} as a business in Oman would write it.`;
      let reply: string | null;
      try {
        reply = (await chat([
          { role: 'system', content: `${task} Answer with the ${to} text only: no quotes, no notes, no explanation.` },
          { role: 'user', content: text },
        ], [])).content;
      } catch (err) {
        if (err instanceof ModelUnavailableError) {
          throw new HttpError(503, 'The assistant is offline right now. Type the name yourself.', { code: 'ASSISTANT_OFFLINE' });
        }
        throw err;
      }
      // Small models wrap answers in thinking tags, quotes or a second line: keep the first real line.
      const suggestion = (reply ?? '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .split('\n').map((line) => line.trim()).find(Boolean)
        ?.replace(/^["'«“]+|["'»”]+$/g, '')
        .trim()
        .slice(0, 200) ?? '';
      if (!suggestion) throw new HttpError(502, 'No suggestion came back. Type the name yourself.');
      res.json({ suggestion });
    }),
  );
}
