const test = require('node:test');
const assert = require('node:assert/strict');

const { renderInviteEmail } = require('../dist/portal/portal-email');

const input = {
  name: 'Ada <script>alert(1)</script>', companyName: 'Peak & Co', audience: 'client',
  link: 'https://clients.peak.test/accept/abc123',
};

test('the invitation escapes names and carries the link in both languages', () => {
  const { subject, html } = renderInviteEmail(input);
  assert.match(subject, /Peak & Co/);
  assert.equal(html.includes('<script>'), false);
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(html.includes('Peak &amp; Co'));
  assert.ok(html.includes('href="https://clients.peak.test/accept/abc123"'));
  assert.match(html, /Set your password/);
  assert.match(html, /dir="rtl"/);
  assert.match(html, /[؀-ۿ]/);
});

test('the wording follows the audience', () => {
  assert.match(renderInviteEmail(input).html, /client portal/i);
  assert.match(renderInviteEmail({ ...input, audience: 'influencer' }).html, /influencer portal/i);
});
