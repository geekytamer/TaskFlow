import assert from 'node:assert/strict';
import test from 'node:test';
import { quoteMatches } from '../lib/quote-search';

const quote = { quoteNumber: 'QT-0500', notes: '', items: [{ description: 'تصميم', descriptionEn: 'Design', descriptionAr: 'تصميم' }] } as never;

test('search finds a quote by either language of the client or its lines', () => {
  assert.ok(quoteMatches(quote, 'design', { client: ['Gulf Retail', 'الخليج للتجزئة'] }));
  assert.ok(quoteMatches(quote, 'الخليج', { client: ['Gulf Retail', 'الخليج للتجزئة'] }));
  assert.ok(quoteMatches(quote, 'qt-05', { client: [] }));
  assert.ok(!quoteMatches(quote, 'nothing', { client: ['Gulf Retail'] }));
});

test('an empty query matches everything and Arabic diacritics are ignored', () => {
  assert.ok(quoteMatches(quote, '   ', { client: [] }));
  assert.ok(quoteMatches(quote, 'تَصميم', { client: [] }));
});
