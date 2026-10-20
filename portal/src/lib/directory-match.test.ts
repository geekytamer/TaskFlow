import test from 'node:test';
import assert from 'node:assert/strict';
import { applyDirectory, matchesDirectory, optionCounts, placeFacets } from './directory-match';
import type { CatalogueEntry } from './catalogue';

const e = (over: Partial<CatalogueEntry>): CatalogueEntry => ({
  id: over.name ?? 'x', name: 'x', niche: null, location: null, languages: [], availability: null,
  platforms: [{ platform: 'Instagram', handle: '@x', url: null, followers: 1, avgViews: null, engagementRate: null, verified: null }],
  price: { kind: 'on_request' }, photoAt: null, bio: null, gender: null,
  followers: 0, engagementRate: null, growth3m: null, tier: 'nano', ...over,
});

test('niche matches any single niche in the field, ignoring case', () => {
  assert.ok(matchesDirectory(e({ niche: 'Lifestyle; Advertising' }), { niche: 'advertising' }));
  assert.ok(!matchesDirectory(e({ niche: 'Lifestyle' }), { niche: 'Cars' }));
});

test('a location of several places matches each, and Arabic names fold to English', () => {
  assert.ok(matchesDirectory(e({ location: 'Muscat, Nizwa' }), { location: 'Nizwa' }));
  assert.ok(matchesDirectory(e({ location: 'مسقط' }), { location: 'Muscat' }));
  assert.deepEqual(placeFacets([e({ location: 'Muscat, Nizwa' }), e({ location: 'Muscat' }), e({ location: 'مسقط' })]), ['Muscat', 'Nizwa']);
});

test('a price bound leaves out prices on request; ranges overlap the bounds', () => {
  const ranged = e({ price: { kind: 'range', min: 200, max: 400, currency: 'OMR' } });
  assert.ok(matchesDirectory(ranged, { minPrice: '300', maxPrice: '1000' }));
  assert.ok(!matchesDirectory(ranged, { minPrice: '500' }));
  assert.ok(!matchesDirectory(e({}), { maxPrice: '1000' }));
});

test('search looks in name, niche, location, bio and handles', () => {
  assert.ok(matchesDirectory(e({ platforms: [{ platform: 'TikTok', handle: '@sara.eats', url: null, followers: 1, avgViews: null, engagementRate: null, verified: null }] }), { q: 'SARA' }));
  assert.ok(!matchesDirectory(e({ name: 'Omar' }), { q: 'sara' }));
});

test('apply filters then orders like the backend: most followers by default, price lowest first with on request last', () => {
  const all = [
    e({ name: 'a', followers: 10, price: { kind: 'range', min: 300, max: 400, currency: 'OMR' } }),
    e({ name: 'b', followers: 30 }),
    e({ name: 'c', followers: 20, price: { kind: 'range', min: 100, max: 200, currency: 'OMR' } }),
  ];
  assert.deepEqual(applyDirectory(all, {}).map((x) => x.name), ['b', 'c', 'a']);
  assert.deepEqual(applyDirectory(all, { sort: 'price' }).map((x) => x.name), ['c', 'a', 'b']);
});

test('option counts reflect every other filter but not the list itself', () => {
  const all = [e({ name: 'a', niche: 'Cars', location: 'Muscat' }), e({ name: 'b', niche: 'Food', location: 'Muscat' }), e({ name: 'c', niche: 'Cars', location: 'Sohar' })];
  assert.deepEqual(optionCounts(all, { niche: 'Cars', location: 'Muscat' }, 'niche', ['Cars', 'Food']), { Cars: 1, Food: 1 });
  assert.deepEqual(optionCounts(all, { niche: 'Cars' }, 'location', ['Muscat', 'Sohar']), { Muscat: 1, Sohar: 1 });
});
