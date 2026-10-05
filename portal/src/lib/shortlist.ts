/** Browser safe. The creators a client ticked in the catalogue, carried in the URL as `with`. */
const MAX = 20;
const ID = /^[\w-]{1,64}$/;

export function parseShortlist(value: string | string[] | undefined): string[] {
  const raw = value === undefined ? [] : Array.isArray(value) ? value : [value];
  return [...new Set(raw.filter((v) => ID.test(v)))].slice(0, MAX);
}

export const toggleShortlist = (ids: string[], id: string): string[] =>
  ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];

export function shortlistHref(ids: string[]): string {
  const q = new URLSearchParams();
  ids.forEach((id) => q.append('with', id));
  const text = q.toString();
  return text ? `/requests/new?${text}` : '/requests/new';
}
