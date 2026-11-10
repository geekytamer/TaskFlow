/**
 * Influencer accounts are stored clean: no "@" in front of a handle (the
 * page adds one), a profile link built from the handle when none was given,
 * and names from Instagram without characters that cannot be shown.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const request = require('supertest');

const { createServer } = require('../dist/server');
const { DataStore } = require('../dist/data/store');
const { cleanHandle, profileUrlOf, cleanDisplayName } = require('../dist/influencers/handles');
const { makeTmpDir } = require('./helpers/tmp');

const quiet = { info() {}, warn() {}, error() {} };

test('clean handle: no @, no spaces, no trailing slash; a pasted profile link gives its handle', () => {
  assert.equal(cleanHandle('@@abduuu_21'), 'abduuu_21');
  assert.equal(cleanHandle('  @Sara.Eats/ '), 'Sara.Eats');
  assert.equal(cleanHandle('https://www.instagram.com/sara.eats/?hl=en'), 'sara.eats');
  assert.equal(cleanHandle('https://www.tiktok.com/@sara.eats'), 'sara.eats');
  assert.equal(cleanHandle(''), undefined);
  assert.equal(cleanHandle(undefined), undefined);
});

test('profile link from platform and handle', () => {
  assert.equal(profileUrlOf('Instagram', 'sara.eats'), 'https://www.instagram.com/sara.eats/');
  assert.equal(profileUrlOf('TikTok', 'sara'), 'https://www.tiktok.com/@sara');
  assert.equal(profileUrlOf('Snapchat', 'sara'), 'https://www.snapchat.com/add/sara');
  assert.equal(profileUrlOf('X', 'sara'), 'https://x.com/sara');
  assert.equal(profileUrlOf('Other', 'sara'), undefined);
  assert.equal(profileUrlOf('Instagram', undefined), undefined);
});

test('display name: characters that cannot be shown are dropped', () => {
  assert.equal(cleanDisplayName('ABDUL RAHMAN AL-AWADHI بو �'), 'ABDUL RAHMAN AL-AWADHI بو');
  assert.equal(cleanDisplayName('Sara\u0000\u0007 Eats  '), 'Sara Eats');
  assert.equal(cleanDisplayName('سارة 🌸'), 'سارة 🌸', 'real emoji stay');
  assert.equal(cleanDisplayName('�'), '');
});

test('saving accounts: handles stored without @, links filled in', async () => {
  const dbPath = path.join(makeTmpDir('taskflow-inf-clean-'), 'taskflow.db');
  const store = new DataStore({ dbPath, seedOnEmpty: false });
  const company = store.createCompany({ name: 'Peak', website: '', address: '' });
  const admin = store.createUser({ name: 'A', email: 'a@clean.test', role: 'Admin', companyIds: [company.id], companyRoles: [{ companyId: company.id, role: 'Admin' }], password: 'x' });
  const server = createServer({ store, dbPath, seedOnEmpty: false, allowSeedReset: false, logger: quiet, portalCompanyId: company.id }).listen(0);
  server.unref();
  const auth = { Authorization: `Bearer ${store.issueToken(admin.id)}` };

  const created = await request(server).post(`/companies/${company.id}/contacts`).set(auth).send({
    name: 'Sara', roles: ['Influencer'], influencerPlatform: 'Instagram', influencerHandle: '@sara.eats',
    influencerAccounts: [
      { platform: 'Instagram', handle: '@sara.eats', followers: 5000 },
      { platform: 'TikTok', handle: '@@sara_tt' },
      { platform: 'Snapchat', handle: 'sara', url: 'https://snapchat.com/add/sara-custom' },
    ],
  });
  assert.equal(created.status, 201, created.text);
  const [ig, tt, sc] = created.body.influencerAccounts;
  assert.equal(created.body.influencerHandle, 'sara.eats');
  assert.deepEqual([ig.handle, ig.url], ['sara.eats', 'https://www.instagram.com/sara.eats/']);
  assert.deepEqual([tt.handle, tt.url], ['sara_tt', 'https://www.tiktok.com/@sara_tt']);
  assert.equal(sc.url, 'https://snapchat.com/add/sara-custom', 'a link given by hand is kept');

  const updated = await request(server).put(`/contacts/${created.body.id}`).set(auth).send({
    influencerAccounts: [{ ...tt, handle: '@new_tt', url: undefined }],
  });
  assert.equal(updated.status, 200, updated.text);
  assert.deepEqual([updated.body.influencerAccounts[0].handle, updated.body.influencerAccounts[0].url], ['new_tt', 'https://www.tiktok.com/@new_tt']);
});
