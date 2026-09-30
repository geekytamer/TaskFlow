import { dictionaries, type Key, type Lang } from './i18n';

/** Staff type availability as free text; known values are translated, others shown as typed. */
export function availabilityLabel(value: string, lang: Lang): string {
  return dictionaries[lang][`avail.${value}` as Key] ?? value;
}
