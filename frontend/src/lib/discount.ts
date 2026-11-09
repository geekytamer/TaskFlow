/**
 * Adds up the per-line discounts of a quotation, sales order or invoice so a
 * document can say what it cost before the discount, how much came off, and
 * what is left. A line's discount is what its stored net amount is short of
 * quantity × unit price; only lines that carry a discount count, so a line
 * whose amount was typed by hand never shows up as a discount.
 */
export type DiscountLine = {
  quantity: number;
  unitPrice: number;
  amount: number;
  discount?: number;
};

const r2 = (n: number) => Number(n.toFixed(2));

export function discountTotals(lines: DiscountLine[]) {
  let net = 0;
  let discount = 0;
  for (const line of lines) {
    const amount = Number(line.amount) || 0;
    net += amount;
    if (Number(line.discount) > 0) {
      const gross = (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0);
      discount += Math.max(0, gross - amount);
    }
  }
  return { gross: r2(net + discount), discount: r2(discount), net: r2(net) };
}

