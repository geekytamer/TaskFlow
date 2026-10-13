import test from 'node:test';
import assert from 'node:assert/strict';
import { navFor } from './nav';

const hrefs = (items: Array<{ href: string }>) => items.map((i) => i.href);

test('client navigation: four tabs on the phone bar, the rest behind More', () => {
  const nav = navFor('client');
  assert.deepEqual(hrefs(nav.bar), ['/', '/campaigns', '/influencers', '/messages']);
  assert.deepEqual(hrefs(nav.primary), ['/', '/campaigns', '/influencers', '/requests', '/messages']);
  assert.deepEqual(hrefs(nav.secondary), ['/billing', '/analytics', '/games', '/referrals']);
  const more = hrefs([...nav.primary, ...nav.secondary]).filter((h) => !hrefs(nav.bar).includes(h));
  assert.deepEqual(more, ['/requests', '/billing', '/analytics', '/games', '/referrals'], 'every page is reachable from More on a phone');
});

test('influencer navigation', () => {
  const nav = navFor('influencer');
  assert.deepEqual(hrefs(nav.bar), ['/', '/deals', '/calendar', '/money']);
  assert.deepEqual(hrefs(nav.primary), ['/', '/deals', '/calendar', '/money', '/messages']);
  assert.deepEqual(hrefs(nav.secondary), ['/contacts', '/media-kit', '/connections', '/analytics', '/profile', '/games', '/referrals']);
});

test('the active item: home only on exact match, others by prefix', async () => {
  const { isActive } = await import('./nav');
  assert.equal(isActive('/', '/'), true);
  assert.equal(isActive('/', '/campaigns'), false);
  assert.equal(isActive('/campaigns', '/campaigns/abc'), true);
  assert.equal(isActive('/campaigns', '/campaignsx'), false);
});
