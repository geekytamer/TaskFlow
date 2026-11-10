import test from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_FILTERS,
  accountLinks,
  activeFilterCount,
  cleanHandle,
  displayName,
  engagementOf,
  filtersFromQuery,
  filtersToQuery,
  isMissing,
  matchesFilters,
  placeOptions,
  rosterEngagement,
  sizeTierOf,
  type InfluencerFilters,
  type InfluencerLike,
} from './influencer-list';

const sara: InfluencerLike = {
  id: '1', name: 'سارة البلوشي', nameEn: 'Sara Al Balushi', phone: '+968 9123 4567',
  influencerNiche: 'Food, Lifestyle', location: 'Muscat, Batinah', languages: ['Arabic', 'English'],
  availabilityStatus: 'Available', rateCardAmount: 300,
  influencerAccounts: [
    { id: 'a', platform: 'Instagram', handle: '@sara.eats', followers: 90_000, engagementRate: 2 },
    { id: 'b', platform: 'TikTok', handle: 'sara_tt', followers: 10_000, engagementRate: 12 },
  ],
};

test('handles lose their @; every account gets a link to open', () => {
  assert.equal(cleanHandle('@@abduuu_21'), 'abduuu_21');
  assert.deepEqual(accountLinks(sara).map((a) => [a.platform, a.handle, a.url]), [
    ['Instagram', 'sara.eats', 'https://www.instagram.com/sara.eats/'],
    ['TikTok', 'sara_tt', 'https://www.tiktok.com/@sara_tt'],
  ]);
  assert.deepEqual(accountLinks({ id: '2', name: 'x', influencerPlatform: 'Snapchat', influencerHandle: '@snap1' }).map((a) => a.url), ['https://www.snapchat.com/add/snap1']);
  assert.deepEqual(accountLinks({ id: '3', name: 'x', influencerAccounts: [{ platform: 'Other', handle: 'x' }] }).map((a) => a.url), [null]);
  assert.equal(accountLinks({ id: '4', name: 'x', influencerAccounts: [{ platform: 'Instagram', handle: 'a', url: 'https://custom.link/a' }] })[0].url, 'https://custom.link/a', 'a saved link wins');
});

test('names without the replacement character', () => {
  assert.equal(displayName('ABDUL RAHMAN بو �'), 'ABDUL RAHMAN بو');
});

test('engagement weighted by followers, for one influencer and for the roster', () => {
  // 2% on 90K and 12% on 10K: 3%, not the 12% the best account would say.
  assert.equal(engagementOf(sara), 3);
  assert.equal(engagementOf({ id: 'x', name: 'x', engagementRate: 4.5 }), 4.5);
  const big = { id: 'b', name: 'big', followerCount: 1_000_000, engagementRate: 1 };
  const small = { id: 's', name: 'small', followerCount: 1_000, engagementRate: 20 };
  assert.equal(rosterEngagement([big, small]), 1);
});

test('size tiers', () => {
  assert.equal(sizeTierOf(0), null);
  assert.equal(sizeTierOf(9_999), 'nano');
  assert.equal(sizeTierOf(10_000), 'micro');
  assert.equal(sizeTierOf(250_000), 'macro');
  assert.equal(sizeTierOf(14_000_000), 'mega');
});

test('places split from free text and ranked by how many influencers name them', () => {
  assert.deepEqual(placeOptions([
    { id: '1', name: 'a', location: 'Muscat, Batinah' },
    { id: '2', name: 'b', location: 'Muscat_Sohar' },
    { id: '3', name: 'c', location: 'muscat' },
  ]), ['Muscat', 'Batinah', 'Sohar']);
});

test('filters: each one narrows, together they combine', () => {
  const f = (over: Partial<InfluencerFilters>) => ({ ...EMPTY_FILTERS, ...over });
  const pricing = { pricing: true };
  assert.ok(matchesFilters(sara, f({ platform: 'TikTok' }), pricing));
  assert.ok(!matchesFilters(sara, f({ platform: 'YouTube' }), pricing));
  assert.ok(matchesFilters(sara, f({ place: 'batinah' }), pricing));
  assert.ok(!matchesFilters(sara, f({ place: 'Salalah' }), pricing));
  assert.ok(matchesFilters(sara, f({ language: 'english' }), pricing));
  assert.ok(matchesFilters(sara, f({ size: 'macro' }), pricing), '100K in all is macro');
  assert.ok(!matchesFilters(sara, f({ size: 'micro' }), pricing));
  assert.ok(matchesFilters(sara, f({ minEngagement: '3' }), pricing));
  assert.ok(!matchesFilters(sara, f({ minEngagement: '3.5' }), pricing));
  assert.ok(matchesFilters(sara, f({ minRate: '200', maxRate: '300' }), pricing));
  assert.ok(!matchesFilters(sara, f({ maxRate: '250' }), pricing));
  assert.ok(matchesFilters(sara, f({ maxRate: '250' }), { pricing: false }), 'price filters do nothing without price access');
  assert.ok(matchesFilters(sara, f({ missing: 'payout' }), pricing));
  assert.ok(!matchesFilters(sara, f({ missing: 'phone' }), pricing));
  assert.ok(matchesFilters(sara, f({ q: '@sara.eats' }), pricing), 'search by handle with @');
  assert.ok(matchesFilters(sara, f({ q: 'ساره' }), pricing), 'Arabic spelling folded');
  assert.ok(matchesFilters(sara, f({ q: 'Balushi' }), pricing), 'the other-language name');
  assert.ok(!matchesFilters(sara, f({ q: 'nobody' }), pricing));
});

test('missing data kinds', () => {
  assert.ok(isMissing({ id: '1', name: 'x' }, 'phone'));
  assert.ok(isMissing({ id: '1', name: 'x' }, 'rate'));
  assert.ok(isMissing({ id: '1', name: 'x' }, 'account'));
  assert.ok(!isMissing(sara, 'account'));
});

test('filters survive the address and count what narrows', () => {
  const f: InfluencerFilters = { ...EMPTY_FILTERS, place: 'Muscat', size: 'micro', sort: 'engagement', q: 'سارة' };
  const back = filtersFromQuery(filtersToQuery(f));
  assert.deepEqual(back, f);
  assert.equal(filtersToQuery(EMPTY_FILTERS), '');
  assert.equal(activeFilterCount(f), 2);
  assert.deepEqual(filtersFromQuery('size=giant&sort=hacked&missing=x'), EMPTY_FILTERS, 'unknown values ignored');
});
