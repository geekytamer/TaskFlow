import test from 'node:test';
import assert from 'node:assert/strict';
import { hrefWithShortlist, parseShortlist, shortlistHref, toggleShortlist } from './shortlist';

test('parses ids from the URL: dedupes, drops junk, caps at 20', () => {
  assert.deepEqual(parseShortlist(undefined), []);
  assert.deepEqual(parseShortlist('a1'), ['a1']);
  assert.deepEqual(parseShortlist(['a1', 'b-2', 'a1', 'bad id', '<x>', '']), ['a1', 'b-2']);
  assert.equal(parseShortlist(Array.from({ length: 30 }, (_, i) => `id${i}`)).length, 20);
});

test('toggles one creator in or out, keeping order', () => {
  assert.deepEqual(toggleShortlist(['a', 'b'], 'c'), ['a', 'b', 'c']);
  assert.deepEqual(toggleShortlist(['a', 'b'], 'a'), ['b']);
});

test('builds the request link with every chosen creator', () => {
  assert.equal(shortlistHref([]), '/requests/new');
  assert.equal(shortlistHref(['a', 'b']), '/requests/new?with=a&with=b');
});

test('puts the shortlist into any catalogue link, replacing the one it carried', () => {
  assert.equal(hrefWithShortlist('/influencers', []), '/influencers');
  assert.equal(hrefWithShortlist('/influencers', ['a', 'b']), '/influencers?with=a&with=b');
  assert.equal(hrefWithShortlist('/influencers?niche=Food&with=old&view=list', ['a']), '/influencers?niche=Food&view=list&with=a');
  assert.equal(hrefWithShortlist('/influencers?with=old', []), '/influencers');
});
