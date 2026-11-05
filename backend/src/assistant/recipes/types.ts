export type Lang = 'en' | 'ar';

/**
 * What a recipe can do: read and propose through the same guarded path a
 * script uses (catalogue match, body checks, proposal cap), as the person.
 */
export interface RecipeContext {
  companyId: string;
  userId: string;
  /** YYYY-MM-DD, the same "today" the model is told. */
  today: string;
  /** The company's currency code. */
  currency: string;
  /** The language the person wrote in; confirm-card summaries follow it. */
  lang: Lang;
  get<T = unknown>(path: string): Promise<T>;
  /** A change that waits for the person's confirmation; resolves to { pending, actionId, summary }. */
  propose(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body: unknown, summary: string): Promise<unknown>;
  /** Display names for ids the recipe already read (never a way to read data). */
  names: {
    user(id: string): string | undefined;
    client(id: string): string | undefined;
    project(id: string): string | undefined;
  };
}

export interface Recipe {
  /** Called as tf.<name>(args) in a script; letters only. */
  name: string;
  /** The call as the model should write it. */
  signature: string;
  /** What it returns, in a few words. */
  returns: string;
  /** English search words for findApi (the name counts too). */
  words: string[];
  /** True when it proposes changes rather than only reading. */
  changes?: boolean;
  run(ctx: RecipeContext, args: unknown): Promise<unknown>;
}
