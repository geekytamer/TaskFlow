import assert from 'node:assert/strict';
import test from 'node:test';
import { pushSupport, urlBase64ToUint8Array } from './push';

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const OLD_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

test('an iPhone in Safari has to add the portal to its home screen first', () => {
  assert.equal(pushSupport({ ua: IPHONE, standalone: false, hasPush: false, touchPoints: 5 }), 'ios-install');
  assert.equal(pushSupport({ ua: IPHONE, standalone: true, hasPush: true, touchPoints: 5 }), 'ok');
});

test('an iPad that reports itself as a Mac is treated as an iPad', () => {
  assert.equal(pushSupport({ ua: IPAD_DESKTOP_UA, standalone: false, hasPush: false, touchPoints: 5 }), 'ios-install');
});

test('iOS before 16.4 cannot receive them at all', () => {
  assert.equal(pushSupport({ ua: OLD_IPHONE, standalone: true, hasPush: false, touchPoints: 5 }), 'ios-too-old');
});

test('Android and desktop browsers with push are ready; without push they are unsupported', () => {
  assert.equal(pushSupport({ ua: ANDROID, standalone: false, hasPush: true, touchPoints: 5 }), 'ok');
  assert.equal(pushSupport({ ua: ANDROID, standalone: false, hasPush: false, touchPoints: 5 }), 'unsupported');
});

test('the VAPID key decodes from URL-safe base64', () => {
  assert.deepEqual([...urlBase64ToUint8Array('AQID_-8')], [1, 2, 3, 255, 239]);
});
