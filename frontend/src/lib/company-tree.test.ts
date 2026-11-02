import assert from 'node:assert/strict';
import test from 'node:test';
import { isGroupCompany, scopeCompanyIds, subtree, treeOrder } from './company-tree';

const companies = [
  { id: 'g' },
  { id: 'a', parentCompanyId: 'g' },
  { id: 'b', parentCompanyId: 'g' },
  { id: 'a1', parentCompanyId: 'a' },
  { id: 'solo' },
];

test('subtree is the company first, then everything below it', () => {
  assert.deepEqual(subtree(companies, 'g'), ['g', 'a', 'b', 'a1']);
  assert.deepEqual(subtree(companies, 'solo'), ['solo']);
});

test('a company with children among mine is a group', () => {
  assert.equal(isGroupCompany(companies, 'g'), true);
  assert.equal(isGroupCompany(companies, 'a1'), false);
  assert.equal(isGroupCompany(companies, 'missing'), false);
});

test('scope: self is the company alone; tree is the filter, or the whole tree', () => {
  assert.deepEqual(scopeCompanyIds(companies, 'g', 'self', []), ['g']);
  assert.deepEqual(scopeCompanyIds(companies, 'g', 'tree', []), ['g', 'a', 'b', 'a1']);
  assert.deepEqual(scopeCompanyIds(companies, 'g', 'tree', ['b', 'a']), ['a', 'b'], 'tree order, not click order');
});

test('a remembered filter naming a company I can no longer see is dropped quietly', () => {
  assert.deepEqual(scopeCompanyIds(companies, 'g', 'tree', ['gone', 'b']), ['b']);
  assert.deepEqual(scopeCompanyIds(companies, 'g', 'tree', ['gone']), ['g', 'a', 'b', 'a1'], 'nothing left: the whole tree');
});

test('a company without children ignores a tree scope', () => {
  assert.deepEqual(scopeCompanyIds(companies, 'solo', 'tree', ['a']), ['solo']);
});

test('treeOrder puts each group above its companies, indented; a parent I cannot see makes a top', () => {
  const list = [
    { id: 'b', name: 'Beta', parentCompanyId: 'g' },
    { id: 'z', name: 'Zed' },
    { id: 'g', name: 'Group' },
    { id: 'a', name: 'Alpha', parentCompanyId: 'g' },
    { id: 'o', name: 'Orphan', parentCompanyId: 'hidden' },
  ];
  assert.deepEqual(
    treeOrder(list).map(({ company, depth }) => `${depth}:${company.id}`),
    ['0:g', '1:a', '1:b', '0:o', '0:z'],
  );
});
