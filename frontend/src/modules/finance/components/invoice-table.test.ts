import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

test('invoice dialogs expose their supporting copy as accessible descriptions', async () => {
  const source = await readFile(new URL('./invoice-table.tsx', import.meta.url), 'utf8');
  const dialogHeaderCount = source.match(/<DialogHeader>/g)?.length ?? 0;
  const dialogDescriptionCount = source.match(/<DialogDescription\b/g)?.length ?? 0;

  assert.equal(dialogDescriptionCount, dialogHeaderCount);
});
