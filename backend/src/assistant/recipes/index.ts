import type { Recipe } from './types';
import { createTasks, logTime, myTasks, updateTask } from './tasks';
import { invoices, receivables, recordPayment, salesSummary } from './sales';
import { createContact, findContact, onLeave, pendingApprovals, stock } from './business';

export type { Recipe, RecipeContext } from './types';

/** The ready-made helpers a script calls as tf.<name>(args), most used first. */
export const RECIPES: Recipe[] = [
  myTasks, createTasks, updateTask, logTime,
  invoices, receivables, salesSummary, recordPayment,
  stock, onLeave, findContact, createContact, pendingApprovals,
];

export const recipeByName = (name: string): Recipe | undefined => RECIPES.find((r) => r.name === name);

const stem = (w: string) => w.replace(/(ies|es|s)$/, (m) => (m === 'ies' ? 'y' : ''));

/** Recipes whose name or words match an English query, best first. */
export function searchRecipes(query: string, limit = 4): Recipe[] {
  const terms = query.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 1).map(stem);
  if (!terms.length) return [];
  return RECIPES
    .map((r) => {
      const words = new Set([...r.words, ...r.name.replace(/([A-Z])/g, ' $1').toLowerCase().split(' ')].map(stem));
      return { r, score: terms.filter((t) => words.has(t)).length };
    })
    .filter((x) => x.score > 0)
    .sort((x, y) => y.score - x.score)
    .slice(0, limit)
    .map((x) => x.r);
}

/** One line for the prompt and findApi. */
export const describeRecipe = (r: Recipe): string => `tf.${r.signature} → ${r.returns}${r.changes ? ' (proposes; the person confirms)' : ''}`;
