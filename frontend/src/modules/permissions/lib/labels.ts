export type Translate = (key: string, fallback?: string) => string;

/** Catalogue module keys are kebab-case; dictionary keys are camelCase. */
export function moduleLabelKey(moduleKey: string): string {
  return `perm.module.${moduleKey.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}`;
}

export function moduleLabel(moduleKey: string, t: Translate): string {
  const pretty = moduleKey.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return t(moduleLabelKey(moduleKey), pretty);
}

/**
 * Renders one action.
 *
 * Actions may be qualified with a sub-resource — "users.read" alongside a plain
 * "read" on the same module — because the underlying routes disagree about who
 * may use them. Rendering only the verb would show "view" twice with no way to
 * tell them apart, so the scope is kept: "view · users".
 */
export function actionLabel(action: string, t: Translate): string {
  const parts = action.split('.');
  const verb = parts[parts.length - 1];
  const scope = parts.slice(0, -1).join(' ').replace(/-/g, ' ');
  const verbLabel = t(`perm.action.${verb}`, verb);
  return scope ? `${verbLabel} · ${scope}` : verbLabel;
}

/** Distinct, stably ordered action labels — plain verbs first, then qualified. */
export function actionLabels(actions: string[], t: Translate): string[] {
  const plain: string[] = [];
  const qualified: string[] = [];
  const seen = new Set<string>();
  for (const action of actions) {
    const label = actionLabel(action, t);
    if (seen.has(label)) continue;
    seen.add(label);
    (action.includes('.') ? qualified : plain).push(label);
  }
  return [...plain, ...qualified];
}
