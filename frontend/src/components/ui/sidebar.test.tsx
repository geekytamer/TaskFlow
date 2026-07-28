import assert from 'node:assert/strict';
import test from 'node:test';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { SidebarInset } from './sidebar';

test('sidebar inset allows wide page content to shrink within the viewport', () => {
  const markup = renderToStaticMarkup(<SidebarInset />);

  assert.match(markup, /\bmin-w-0\b/);
});
