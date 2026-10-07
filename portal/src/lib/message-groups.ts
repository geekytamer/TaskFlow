/** Browser safe. How a conversation is laid out: by the business's day, then runs from one author. */

const RUN_GAP_MS = 10 * 60 * 1000;

/** The calendar day (YYYY-MM-DD) of a moment in a time zone. */
export function localDay(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

interface Groupable { id: string; createdAt: string; author: { kind: string; name: string | null } }

/**
 * Days in order, each with its messages; `first` marks where a new run starts
 * (another author, or more than ten minutes since the last message), so the
 * author's name shows once per run.
 */
export function groupMessages<T extends Groupable>(messages: T[], timeZone: string): Array<{ day: string; items: Array<{ message: T; first: boolean }> }> {
  const days: Array<{ day: string; items: Array<{ message: T; first: boolean }> }> = [];
  let previous: T | undefined;
  for (const message of messages) {
    const day = localDay(message.createdAt, timeZone);
    if (days.at(-1)?.day !== day) {
      days.push({ day, items: [] });
      previous = undefined;
    }
    const sameAuthor = previous && previous.author.kind === message.author.kind && previous.author.name === message.author.name;
    const close = previous && Date.parse(message.createdAt) - Date.parse(previous.createdAt) <= RUN_GAP_MS;
    days.at(-1)!.items.push({ message, first: !(sameAuthor && close) });
    previous = message;
  }
  return days;
}
