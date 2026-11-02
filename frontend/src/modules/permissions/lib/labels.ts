export type Translate = (key: string, fallback?: string) => string;

/** Catalogue module keys are kebab-case; dictionary keys are camelCase. */
export function moduleLabelKey(moduleKey: string): string {
  return `perm.module.${moduleKey.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())}`;
}

export function moduleLabel(moduleKey: string, t: Translate): string {
  const pretty = moduleKey.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return t(moduleLabelKey(moduleKey), pretty);
}
