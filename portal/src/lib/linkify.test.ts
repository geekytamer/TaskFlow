import test from 'node:test';
import assert from 'node:assert/strict';
import { linkify } from './linkify';

test('plain text stays one text part', () => {
  assert.deepEqual(linkify('Launch the new dates.'), [{ kind: 'text', text: 'Launch the new dates.' }]);
  assert.deepEqual(linkify(''), []);
});

test('http and https addresses become links, the text around them stays', () => {
  assert.deepEqual(linkify('See https://example.com/brief?x=1 and http://a.om'), [
    { kind: 'text', text: 'See ' },
    { kind: 'link', text: 'https://example.com/brief?x=1', href: 'https://example.com/brief?x=1' },
    { kind: 'text', text: ' and ' },
    { kind: 'link', text: 'http://a.om', href: 'http://a.om/' },
  ]);
});

test('trailing punctuation belongs to the sentence, a balanced bracket to the link', () => {
  assert.deepEqual(linkify('Look: https://ex.com/a.'), [
    { kind: 'text', text: 'Look: ' },
    { kind: 'link', text: 'https://ex.com/a', href: 'https://ex.com/a' },
    { kind: 'text', text: '.' },
  ]);
  assert.deepEqual(linkify('(https://ex.com/a)'), [
    { kind: 'text', text: '(' },
    { kind: 'link', text: 'https://ex.com/a', href: 'https://ex.com/a' },
    { kind: 'text', text: ')' },
  ]);
  assert.equal(linkify('https://en.wikipedia.org/wiki/Oman_(country)')[0].text, 'https://en.wikipedia.org/wiki/Oman_(country)');
  assert.deepEqual(linkify('الرابط https://ex.com/a، شكراً').map((p) => p.text), ['الرابط ', 'https://ex.com/a', '، شكراً']);
});

test('only http(s) is linked: other schemes and broken addresses stay text', () => {
  for (const s of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://ex.com', 'www.example.com', 'https://']) {
    assert.ok(linkify(s).every((p) => p.kind === 'text'), s);
  }
});
