import assert from 'node:assert/strict';
import test from 'node:test';

// Ready-made templates (spec 2026-11-06-documents-hub-design, stage 2).

const KNOWN_BLOCKS = new Set(['container', 'text', 'heading', 'image', 'divider', 'spacer', 'shape', 'details', 'signature', 'pageBreak']);
const ALLOWED_TOKEN = /^(field\.[a-z0-9_]+|client\.(name|address|email)|company\.(name|address|phone|email)|document\.(date|number|notes)|today)$/;

const walk = (blocks: any[], visit: (b: any) => void) => {
  for (const b of blocks) {
    visit(b);
    if (Array.isArray(b.children)) walk(b.children, visit);
  }
};

test('every starter builds a clean document in Arabic and English', async () => {
  const { STARTER_TEMPLATES, buildStarter } = await import('./starter-templates');
  const { templateFields } = await import('../finance/doc/tokens');
  assert.ok(STARTER_TEMPLATES.length >= 5);
  for (const starter of STARTER_TEMPLATES) {
    for (const lang of ['ar', 'en'] as const) {
      const built = buildStarter(starter.key, lang);
      const where = `${starter.key}/${lang}`;
      assert.equal(built.doc.version, 1, where);
      assert.equal(built.doc.direction, lang === 'ar' ? 'rtl' : 'ltr', `${where} direction`);
      const ids = new Set<string>();
      let hasSignature = false;
      walk(built.doc.body, (b) => {
        assert.ok(KNOWN_BLOCKS.has(b.type), `${where} block ${b.type}`);
        assert.ok(!ids.has(b.id), `${where} duplicate id ${b.id}`);
        ids.add(b.id);
        if (b.type === 'signature' || String(b.id).startsWith('sign')) hasSignature = true;
      });
      assert.ok(hasSignature, `${where} has a place to sign`);
      const text = JSON.stringify(built.doc.body);
      assert.ok(text.includes('{{document.notes}}'), `${where} has room for extra terms`);
      for (const m of text.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) assert.match(m[1], ALLOWED_TOKEN, `${where} token ${m[1]}`);
      // Every fill-in box has a label in the document's own language.
      for (const field of templateFields(built.doc)) {
        const label = built.doc.fieldLabels?.[field];
        assert.ok(label, `${where} label for ${field}`);
        if (lang === 'ar') assert.match(label!, /[؀-ۿ]/, `${where} Arabic label for ${field}`);
      }
      assert.ok(built.name.trim(), where);
      assert.equal(built.docType, starter.docType, where);
    }
  }
  const names = STARTER_TEMPLATES.map((s) => s.name.en);
  assert.equal(new Set(names).size, names.length, 'distinct names');
});

test('a starter takes the company look from an existing template', async () => {
  const { starterTemplateInput } = await import('./starter-templates');
  const brand = { primaryColor: '#0f766e', accentColor: '#f59e0b', logoUrl: 'data:image/png;base64,AAA', stampUrl: 'data:s', signatureUrl: 'data:g', signatureLabel: 'CEO', letterheadImageUrl: 'data:l' } as never;
  const input = starterTemplateInput('mou', 'ar', brand);
  assert.equal(input.primaryColor, '#0f766e');
  assert.equal(input.accentColor, '#f59e0b');
  assert.equal(input.logoUrl, 'data:image/png;base64,AAA');
  assert.equal(input.signatureLabel, 'CEO');
  assert.equal(input.isDefault, false);
  assert.equal((input.doc as any).theme.primaryColor, '#0f766e');
  assert.equal(input.name, 'مذكرة تفاهم');
  const plain = starterTemplateInput('blank', 'en');
  assert.equal(plain.logoUrl, '');
  assert.equal(plain.docType, 'custom');
});
