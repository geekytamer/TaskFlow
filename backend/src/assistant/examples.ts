import { norm } from './recipes/util';

/** Words that say nothing about what is asked, in English and Arabic (already normalized). */
const STOP = new Set([
  'the', 'a', 'an', 'to', 'of', 'for', 'and', 'in', 'on', 'my', 'me', 'i', 'is', 'are', 'what', 'which', 'how', 'please', 'can', 'you',
  'with', 'all', 'our', 'we', 'us', 'do', 'does', 'it', 'this', 'that', 'show', 'tell', 'give', 'list', 'have', 'there', 'any', 'some',
  'من', 'في', 'علي', 'الي', 'عن', 'ما', 'ماذا', 'كم', 'هل', 'لي', 'عندي', 'لنا', 'مع', 'هذا', 'هذه', 'هي', 'هو', 'و', 'يا', 'ممكن', 'لو', 'سمحت', 'اعطني', 'اعرض',
]);

/** The meaningful words of a request: normalized, Arabic article stripped, stop words and 1-letter words dropped. */
export function tokens(text: string): Set<string> {
  return new Set(
    norm(text)
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(' ')
      .map((w) => (w.length > 4 ? w.replace(/^(وال|بال|لل|ال)/, '') : w))
      .filter((w) => w.length > 1 && !STOP.has(w)),
  );
}

export interface ExampleLike { id: string; request: string; code: string }

/** The k saved requests most like this one (cosine over word sets), one per distinct request. */
export function similarExamples<T extends ExampleLike>(request: string, examples: T[], k = 3, min = 0.34): T[] {
  const want = tokens(request);
  if (!want.size) return [];
  const seen = new Set<string>();
  return examples
    .map((e) => {
      const got = tokens(e.request);
      let both = 0;
      for (const w of got) if (want.has(w)) both += 1;
      return { e, score: got.size ? both / Math.sqrt(got.size * want.size) : 0 };
    })
    .filter((x) => x.score >= min)
    .sort((x, y) => y.score - x.score)
    .filter((x) => {
      const key = norm(x.e.request);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, k)
    .map((x) => x.e);
}

/** The prompt block: patterns that worked, with a warning that their ids are not this request's. */
export function examplesBlock(examples: Array<{ request: string; code: string }>): string {
  if (!examples.length) return '';
  return [
    'Requests like this that worked here before (follow the pattern; their ids, names and dates belong to those requests, never reuse them):',
    ...examples.map((e) => `Request: ${e.request.slice(0, 300)}\n\`\`\`js\n${e.code.slice(0, 1500)}\n\`\`\``),
  ].join('\n');
}
