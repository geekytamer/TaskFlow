import test from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicates, isFollowupLate, isQuiet, matchesContactSearch, matchesQuickFilter, phoneKey } from './contact-list';

test('phone key: the same Omani number however it is written', () => {
  assert.equal(phoneKey('+968 9123 4567'), '91234567');
  assert.equal(phoneKey('0096891234567'), '91234567');
  assert.equal(phoneKey('9123-4567'), '91234567');
  assert.equal(phoneKey('+971 50 123 4567'), '971501234567');
  assert.equal(phoneKey(null), '');
});

test('search finds a contact by part of the phone number, and still by name', () => {
  const c = { id: '1', name: 'شركة النخيل', email: 'info@nakheel.om', phone: '+968 9123 4567' };
  assert.ok(matchesContactSearch('9123', c));
  assert.ok(matchesContactSearch('91234567', c));
  assert.ok(matchesContactSearch('+968 9123 4567', c));
  assert.ok(matchesContactSearch('+968 9123', c), 'a partial number typed with the country code');
  assert.ok(matchesContactSearch('00968 91', c));
  assert.ok(matchesContactSearch('9689123', c));
  assert.ok(matchesContactSearch('النخيل', c));
  assert.ok(matchesContactSearch('nakheel', c));
  assert.ok(!matchesContactSearch('5555', c));
  assert.ok(!matchesContactSearch('12', c), 'two digits are too few to match a phone');
});

test('duplicates: same phone, same email or same name; the contact itself is skipped', () => {
  const list = [
    { id: 'a', name: 'شركة النخيل', phone: '+968 9123 4567', email: 'info@nakheel.om' },
    { id: 'b', name: 'Brand Co', phone: '2400 0000', email: 'hello@brand.om' },
  ];
  assert.deepEqual(findDuplicates({ name: 'New', phone: '91234567' }, list).map((d) => [d.contact.id, d.reasons]), [['a', ['phone']]]);
  assert.deepEqual(findDuplicates({ name: 'brand co', email: 'HELLO@brand.om' }, list).map((d) => [d.contact.id, d.reasons]), [['b', ['email', 'name']]]);
  assert.deepEqual(findDuplicates({ name: 'شركه النخيل' }, list).map((d) => d.contact.id), ['a'], 'Arabic spelling variants fold');
  assert.deepEqual(findDuplicates({ name: 'Brand Co' }, list, 'b'), []);
  assert.deepEqual(findDuplicates({ name: 'Al', phone: '123' }, list), [], 'too short to judge');
});

test('quick filters: mine, late follow-up, no contact for a month', () => {
  const today = new Date('2026-11-10T09:00:00');
  const old = '2026-08-01T00:00:00Z';
  assert.ok(matchesQuickFilter('mine', { id: '1', name: 'x', ownerUserId: 'me' }, 'me', today));
  assert.ok(!matchesQuickFilter('mine', { id: '1', name: 'x', ownerUserId: 'other' }, 'me', today));
  assert.ok(!matchesQuickFilter('mine', { id: '1', name: 'x' }, undefined, today));

  assert.ok(isFollowupLate({ id: '1', name: 'x', nextFollowupDate: '2026-11-09' }, today));
  assert.ok(!isFollowupLate({ id: '1', name: 'x', nextFollowupDate: '2026-11-10' }, today), 'today is not late');
  assert.ok(!isFollowupLate({ id: '1', name: 'x' }, today));

  assert.ok(isQuiet({ id: '1', name: 'x', createdAt: old, lastActivityAt: '2026-09-01T00:00:00Z' }, today));
  assert.ok(isQuiet({ id: '1', name: 'x', createdAt: old, lastActivityAt: null }, today), 'never contacted');
  assert.ok(!isQuiet({ id: '1', name: 'x', createdAt: old, lastActivityAt: '2026-11-01T00:00:00Z' }, today));
  assert.ok(!isQuiet({ id: '1', name: 'x', createdAt: '2026-11-05T00:00:00Z', lastActivityAt: null }, today), 'new contacts are not quiet yet');
});
