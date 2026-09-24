import test from 'node:test';
import assert from 'node:assert/strict';
import { dictionaries, dirFor, parseLang, t } from './i18n';

test('English and Arabic define exactly the same keys', () => {
  assert.deepEqual(Object.keys(dictionaries.ar).sort(), Object.keys(dictionaries.en).sort());
});

test('no string is empty and every Arabic string is written in Arabic', () => {
  for (const [key, value] of Object.entries(dictionaries.en)) assert.ok(value.trim(), `en ${key}`);
  for (const [key, value] of Object.entries(dictionaries.ar)) {
    assert.ok(value.trim(), `ar ${key}`);
    assert.match(value, /[؀-ۿ]/, `ar ${key} has no Arabic letters`);
  }
});

test('no visible string contains an em dash or en dash', () => {
  for (const lang of ['en', 'ar'] as const) {
    for (const [key, value] of Object.entries(dictionaries[lang])) {
      assert.doesNotMatch(value, /[\u2013\u2014]/, `${lang} ${key}`);
    }
  }
});

test('language and direction resolve safely', () => {
  assert.equal(parseLang('ar'), 'ar');
  assert.equal(parseLang('fr'), 'en');
  assert.equal(parseLang(undefined), 'en');
  assert.equal(dirFor('ar'), 'rtl');
  assert.equal(dirFor('en'), 'ltr');
  assert.equal(t('ar', 'nav.signOut'), dictionaries.ar['nav.signOut']);
});
