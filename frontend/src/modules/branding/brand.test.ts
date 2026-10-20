import test from 'node:test';
import assert from 'node:assert/strict';
import { brandCss, brandName, brandVariables, forDarkBackground, hexToHsl, readableOn } from './brand';

test('hexToHsl reads #rrggbb and refuses anything else', () => {
  assert.deepEqual(hexToHsl('#ffffff'), { h: 0, s: 0, l: 100 });
  assert.deepEqual(hexToHsl('#f26a1b'), { h: 22, s: 89, l: 53 });
  assert.equal(hexToHsl('orange'), null);
  assert.equal(hexToHsl('#fff'), null);
});

test('text on a brand colour stays readable', () => {
  assert.equal(readableOn(hexToHsl('#111111')!), '0 0% 100%', 'white on black');
  assert.equal(readableOn(hexToHsl('#5b6af0')!), '0 0% 100%', 'white on indigo');
  assert.equal(readableOn(hexToHsl('#facc15')!), '224 30% 10%', 'ink on yellow');
  assert.equal(readableOn(hexToHsl('#ffffff')!), '224 30% 10%', 'ink on white');
});

test('dark mode lifts a deep brand colour so it shows on the dark background', () => {
  assert.equal(forDarkBackground({ h: 22, s: 89, l: 40 }).l, 60);
  assert.equal(forDarkBackground({ h: 22, s: 89, l: 70 }).l, 70);
});

test('a light sidebar colour is not forced onto dark mode', () => {
  const lightSidebar = brandVariables({ enabled: true, sidebarColor: '#f5f5f5' });
  assert.ok(lightSidebar.light['--sidebar-background']);
  assert.equal(lightSidebar.dark['--sidebar-background'], undefined);
  const blackSidebar = brandVariables({ enabled: true, sidebarColor: '#111111' });
  assert.equal(blackSidebar.dark['--sidebar-background'], blackSidebar.light['--sidebar-background']);
  assert.equal(blackSidebar.light['--sidebar-foreground'], '0 0% 88%');
});

test('no brand, no CSS', () => {
  assert.equal(brandCss(null), '');
  assert.equal(brandCss({ enabled: true }), '');
});

test('brand CSS covers colours, corners and font', () => {
  const css = brandCss({ enabled: true, primaryColor: '#f26a1b', radius: 'sharp', font: 'tajawal' });
  assert.match(css, /:root\{--primary:22 89% 53%;/);
  assert.match(css, /:root\.dark\{--primary:22 89% 60%;/);
  assert.match(css, /--radius:0\.25rem/);
  assert.match(css, /font-family:'Tajawal'/);
});

test('the product name only gives way when the brand is switched on', () => {
  assert.equal(brandName(undefined, 'Peak'), 'TaskFlow');
  assert.equal(brandName({ enabled: false, displayName: 'Peak' }, 'Peak Creative'), 'TaskFlow');
  assert.equal(brandName({ enabled: true, displayName: 'Peak' }, 'Peak Creative'), 'Peak');
  assert.equal(brandName({ enabled: true }, 'Peak Creative'), 'Peak Creative');
  assert.equal(brandName({ enabled: true, displayName: '  ' }, ''), 'TaskFlow');
});
