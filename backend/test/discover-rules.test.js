const test = require('node:test');
const assert = require('node:assert/strict');
const {
  tierOf, growthOver3Months, engagementRate, omaniSignal, bioContacts, parseHandleList, locationFromBio, maskContacts,
} = require('../dist/discover/discover');

const DAY = 24 * 60 * 60 * 1000;
const at = (daysAgo) => new Date(Date.UTC(2026, 9, 12) - daysAgo * DAY).toISOString();

test('tiers follow follower bands', () => {
  assert.equal(tierOf(9_999), 'nano');
  assert.equal(tierOf(10_000), 'micro');
  assert.equal(tierOf(99_999), 'micro');
  assert.equal(tierOf(100_000), 'mid');
  assert.equal(tierOf(500_000), 'macro');
  assert.equal(tierOf(1_000_000), 'mega');
});

test('3-month growth compares with the snapshot nearest 90 days ago, and needs at least 75 days of history', () => {
  const now = new Date(Date.UTC(2026, 9, 12));
  assert.equal(growthOver3Months([{ followers: 1000, takenAt: at(30) }, { followers: 1100, takenAt: at(0) }], now), null, 'too recent');
  const snaps = [
    { followers: 800, takenAt: at(200) },
    { followers: 1000, takenAt: at(88) },
    { followers: 1050, takenAt: at(60) },
    { followers: 1100, takenAt: at(0) },
  ];
  assert.equal(growthOver3Months(snaps, now), 10, '1000 to 1100 is +10%');
  assert.equal(growthOver3Months([{ followers: 0, takenAt: at(90) }, { followers: 5, takenAt: at(0) }], now), null, 'no base');
});

test('engagement is average likes plus comments over followers, in percent', () => {
  assert.equal(engagementRate(10_000, [{ likes: 300, comments: 20 }, { likes: 500, comments: 30 }]), 4.25);
  assert.equal(engagementRate(10_000, []), null);
  assert.equal(engagementRate(0, [{ likes: 1, comments: 0 }]), null);
});

test('an Omani signal comes from the flag, places, +968 or Arabic place names', () => {
  assert.equal(omaniSignal({ bio: 'Food 🇴🇲', fullName: 'x' }), true);
  assert.equal(omaniSignal({ bio: 'Based in Salalah', fullName: 'x' }), true);
  assert.equal(omaniSignal({ bio: 'WhatsApp +968 9123 4567', fullName: 'x' }), true);
  assert.equal(omaniSignal({ bio: 'من مسقط', fullName: 'x' }), true);
  assert.equal(omaniSignal({ bio: 'Dubai lifestyle', fullName: 'x' }), false);
  assert.equal(omaniSignal({ bio: 'Romania travels', fullName: 'x' }), false, 'oman inside another word does not count');
});

test('bio contacts: emails and phone numbers for staff', () => {
  const c = bioContacts('Business: hello@noor.om | +968 9123 4567 / WhatsApp 93888871');
  assert.deepEqual(c.emails, ['hello@noor.om']);
  assert.deepEqual(c.phones, ['+96891234567', '93888871']);
});

test('location from the bio names the Omani place it mentions', () => {
  assert.equal(locationFromBio('Food blogger 📍Muscat'), 'Muscat');
  assert.equal(locationFromBio('مسقط - عمان'), 'Muscat');
  assert.equal(locationFromBio('Travel'), null);
});

test('handle lists accept @handles, links and commas, and report what they skip', () => {
  const { handles, skipped } = parseHandleList('@Noor.Eats\nhttps://www.instagram.com/omani_chef/\nnot a handle!, faisal__test140');
  assert.deepEqual(handles, ['noor.eats', 'omani_chef', 'faisal__test140']);
  assert.deepEqual(skipped, ['not a handle!']);
});

test('clients see bios with contact details hidden', () => {
  assert.equal(maskContacts('Food 🇴🇲 | hello@noor.om | +968 9123 4567 | WhatsApp 93888871'), 'Food 🇴🇲 | ••• | ••• | WhatsApp •••');
  assert.equal(maskContacts('Call 00968 99 123 456'), 'Call •••');
  assert.equal(maskContacts(null), null);
});
