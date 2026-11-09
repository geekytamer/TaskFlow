import test from 'node:test';
import assert from 'node:assert/strict';
import { agingOf, dayText, quickLinks, sinceText, statementOf, whatsappDigits } from './contact-finance';

test('whatsapp digits: Omani 8-digit numbers get 968; + and 00 are dropped', () => {
  assert.equal(whatsappDigits('9123 4567'), '96891234567');
  assert.equal(whatsappDigits('+968 9123 4567'), '96891234567');
  assert.equal(whatsappDigits('00968-9123-4567'), '96891234567');
  assert.equal(whatsappDigits('+971 50 123 4567'), '971501234567');
  assert.equal(whatsappDigits(''), null);
  assert.equal(whatsappDigits('123'), null);
});

test('quick links only for what the contact has', () => {
  assert.deepEqual(quickLinks({ phone: '+968 9123 4567', email: 'a@b.om' }), {
    call: 'tel:+96891234567', whatsapp: 'https://wa.me/96891234567', email: 'mailto:a@b.om',
  });
  assert.deepEqual(quickLinks({}), { call: null, whatsapp: null, email: null });
});

test('aging puts what is owed in the right bucket, in company currency', () => {
  const today = new Date('2026-11-10T09:00:00');
  const aging = agingOf([
    { dueDate: '2026-11-20', outstandingAmount: 100 },          // not due
    { dueDate: '2026-11-10', outstandingAmount: 10 },           // due today: not overdue
    { dueDate: '2026-11-01', outstandingAmount: 50 },           // 9 days
    { dueDate: '2026-09-20', outstandingAmount: 20, exchangeRate: 0.385 }, // 51 days, foreign
    { dueDate: '2026-08-20', outstandingAmount: 30 },           // 82 days
    { dueDate: '2026-06-01', outstandingAmount: 40 },           // 162 days
    { dueDate: '2026-06-01', outstandingAmount: 999, status: 'Draft' },
    { dueDate: '2026-06-01', outstandingAmount: 0 },
  ], today);
  assert.equal(aging.current, 110);
  assert.equal(aging.d1_30, 50);
  assert.equal(aging.d31_60, 7.7);
  assert.equal(aging.d61_90, 30);
  assert.equal(aging.d90plus, 40);
  assert.equal(aging.overdue, 127.7);
  assert.equal(aging.total, 237.7);
});

test('statement: invoices and payments by date with a running balance', () => {
  const lines = statementOf(
    [
      { id: 'i1', invoiceNumber: 'INV-1', issueDate: '2026-10-01', total: 500 },
      { id: 'i2', invoiceNumber: 'INV-2', issueDate: '2026-10-15', total: 200 },
      { id: 'i3', invoiceNumber: 'INV-3', issueDate: '2026-10-16', total: 900, status: 'Draft' },
    ],
    [
      { id: 'p1', invoiceNumber: 'INV-1', amount: 300, paidAt: '2026-10-10', method: 'Cash' },
      { id: 'p2', invoiceNumber: 'INV-2', amount: 200, paidAt: '2026-10-15' },
    ],
  );
  assert.deepEqual(lines.map((l) => [l.reference, l.kind, l.debit, l.credit, l.balance]), [
    ['INV-1', 'invoice', 500, 0, 500],
    ['INV-1', 'payment', 0, 300, 200],
    ['INV-2', 'invoice', 200, 0, 400],
    ['INV-2', 'payment', 0, 200, 200],
  ]);
});

test('since text in both languages', () => {
  const now = new Date('2026-11-10T12:00:00');
  assert.equal(sinceText('2026-11-10T08:00:00', 'ar', now), 'اليوم');
  assert.equal(sinceText('2026-11-09T08:00:00', 'ar', now), 'أمس');
  assert.equal(sinceText('2026-11-01T12:00:00', 'ar', now), 'منذ 9 يوم');
  assert.equal(sinceText('2026-08-01T12:00:00', 'en', now), '3 months ago');
  assert.equal(sinceText(null, 'ar', now), null);
});

test('day text: dd/mm/yyyy, Western digits, no direction marks', () => {
  assert.equal(dayText('2026-11-05T10:00:00'), '05/11/2026');
  assert.equal(dayText(null), null);
  assert.equal(dayText('not a date'), null);
  assert.ok(!/[\u200e\u200f\u061c]/.test(dayText('2026-01-09T10:00:00')!));
});
