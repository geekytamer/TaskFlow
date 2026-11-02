const test = require('node:test');
const assert = require('node:assert/strict');
const { parseAccountLink, parseQuickAddText, accountKeys, findHandleClash } = require('../dist/influencers/handles');

test('profile links of each platform give the platform and the handle', () => {
  const cases = [
    ['https://www.instagram.com/Muscat.Eats/', 'Instagram', 'muscat.eats'],
    ['instagram.com/omani.fashion?igsh=abc', 'Instagram', 'omani.fashion'],
    ['https://www.tiktok.com/@salalah.trips?lang=ar', 'TikTok', 'salalah.trips'],
    ['https://www.snapchat.com/add/oman_snap', 'Snapchat', 'oman_snap'],
    ['snapchat.com/@oman_snap', 'Snapchat', 'oman_snap'],
    ['https://youtube.com/@OmanVlogs', 'YouTube', 'omanvlogs'],
    ['https://x.com/omantweets', 'X', 'omantweets'],
    ['https://twitter.com/omantweets', 'X', 'omantweets'],
    ['https://www.facebook.com/oman.page', 'Facebook', 'oman.page'],
    ['@Bare.Handle', 'Instagram', 'bare.handle'],
    ['bare_handle', 'Instagram', 'bare_handle'],
  ];
  for (const [input, platform, handle] of cases) {
    const parsed = parseAccountLink(input);
    assert.ok(parsed, `parsed ${input}`);
    assert.equal(parsed.platform, platform, input);
    assert.equal(parsed.handle, handle, input);
  }
  assert.match(parseAccountLink('https://www.tiktok.com/@salalah.trips').url, /^https:\/\/www\.tiktok\.com\/@salalah\.trips$/);
});

test('post links, other sites and junk are not accounts', () => {
  for (const input of ['https://www.instagram.com/p/C1abc/', 'https://www.instagram.com/reel/xyz', 'https://example.com/someone', 'hello world', '', '@', 'https://www.tiktok.com/']) {
    assert.equal(parseAccountLink(input), null, input);
  }
});

test('quick-add text: one influencer per line, several links on a line are one person', () => {
  const lines = parseQuickAddText('instagram.com/a.one  https://www.tiktok.com/@a.one\n\n@b.two, \nnot a link at all!\n');
  assert.equal(lines.length, 3);
  assert.deepEqual(lines[0].accounts.map((a) => `${a.platform}:${a.handle}`), ['Instagram:a.one', 'TikTok:a.one']);
  assert.deepEqual(lines[1].accounts.map((a) => `${a.platform}:${a.handle}`), ['Instagram:b.two']);
  assert.deepEqual(lines[2].accounts, [], 'plain words are not handles unless alone on the line or written with @');
  assert.equal(lines[2].line, 'not a link at all!');
  assert.equal(lines[0].name, null);
});

test('quick-add text: the words beside the links are the name', () => {
  const [line] = parseQuickAddText('أحمد البلوشي  @ahmed.om  tiktok.com/@ahmed.tt');
  assert.equal(line.name, 'أحمد البلوشي');
  assert.deepEqual(line.accounts.map((a) => `${a.platform}:${a.handle}`), ['Instagram:ahmed.om', 'TikTok:ahmed.tt']);
  const [alone] = parseQuickAddText('omani.fashion');
  assert.deepEqual(alone.accounts.map((a) => a.handle), ['omani.fashion'], 'a lone word is a handle');
  assert.equal(alone.name, null);
});

test('a record keys its accounts and its single-platform fields, however the handle was typed', () => {
  const keys = accountKeys({
    influencerPlatform: 'Instagram',
    influencerHandle: '@Jane.Doe',
    influencerAccounts: [
      { id: '1', platform: 'TikTok', url: 'https://www.tiktok.com/@jane.tt' },
      { id: '2', platform: 'Snapchat', handle: 'JaneSnap' },
      { id: '3', platform: 'YouTube' },
      { id: '4', platform: 'X', handle: 'jane.x' },
      { id: '5', platform: 'Facebook', url: 'https://www.instagram.com/wrong.site/' },
    ],
  });
  assert.deepEqual([...keys].sort(), ['instagram:jane.doe', 'snapchat:janesnap', 'tiktok:jane.tt', 'x:jane.x'], "a dotted handle counts on any platform; another site's link does not");
});

test('a clash is another influencer with the same key; the record itself and non-influencers do not count', () => {
  const contacts = [
    { id: 'c1', name: 'Ahmed', roles: ['Influencer'], influencerAccounts: [{ id: 'a', platform: 'Instagram', handle: 'ahmed.om' }] },
    { id: 'c2', name: 'Shop', roles: ['Client'], influencerAccounts: [{ id: 'b', platform: 'Instagram', handle: 'shop.om' }] },
  ];
  const clash = findHandleClash(contacts, ['instagram:ahmed.om']);
  assert.equal(clash.contact.id, 'c1');
  assert.equal(clash.key, 'instagram:ahmed.om');
  assert.equal(findHandleClash(contacts, ['instagram:ahmed.om'], 'c1'), null);
  assert.equal(findHandleClash(contacts, ['instagram:shop.om']), null);
  assert.equal(findHandleClash(contacts, ['tiktok:ahmed.om']), null);
});
