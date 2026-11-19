/** Helpers for quotation lines (spec 2026-11-19 §4.5): sections are headings, optional lines are priced but not counted. */
type QuoteLine = { lineType?: 'section'; optional?: boolean; amount?: number; lineTotal?: number };

const value = (line: QuoteLine) => Number(line.amount ?? line.lineTotal ?? 0) || 0;

export const countedLines = <T extends QuoteLine>(lines: T[]): T[] => lines.filter((l) => l.lineType !== 'section' && !l.optional);

export const optionalTotal = (lines: QuoteLine[]): number =>
  Number(lines.filter((l) => l.lineType !== 'section' && l.optional).reduce((sum, l) => sum + value(l), 0).toFixed(2));

/** Printed line numbers: sections get none; items (optional ones included) count 1, 2, 3… */
export const itemNumbers = (lines: QuoteLine[]): (number | null)[] => {
  let n = 0;
  return lines.map((l) => (l.lineType === 'section' ? null : ++n));
};
