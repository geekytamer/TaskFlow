import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { approverText, chipText, trailText } from './wording';

const en = (e: string) => e;
const ar = (_e: string, a: string) => a;

describe('approval wording', () => {
  it('names approvers in the reader\'s language, joined by any/all', () => {
    const approvers = [{ kind: 'role' as const, id: 'Accountant' as const, label: 'an Accountant' }, { kind: 'team' as const, id: 't', label: 'Legal' }];
    assert.equal(approverText(approvers, 'any', en), 'an Accountant or Legal');
    assert.equal(approverText(approvers, 'all', en), 'an Accountant and Legal');
    assert.equal(approverText([{ kind: 'manager', label: "the requester's manager" }], 'any', ar), 'مدير مقدّم الطلب');
    assert.equal(approverText([{ kind: 'role', id: 'Accountant', label: 'an Accountant' }], 'any', ar), 'محاسب');
  });

  it('says where a document stands in a few words', () => {
    const waiting = { docId: 'd', status: 'pending' as const, level: 2, levels: 3, need: 'any' as const, approvers: [{ kind: 'team' as const, id: 't', label: 'Finance' }], stuck: false };
    assert.equal(chipText(waiting, en), 'Waiting for Finance · 2 of 3');
    assert.equal(chipText({ ...waiting, level: 1, levels: 1 }, en), 'Waiting for Finance');
    assert.equal(chipText({ ...waiting, status: 'approved', level: null }, en), 'Approved');
    assert.equal(chipText({ ...waiting, status: 'changes_requested', level: null }, ar), 'مطلوب تعديل');
    assert.equal(chipText({ ...waiting, stuck: true }, en), 'Stuck: nobody can decide · 2 of 3');
  });

  it('tells each trail entry as a sentence', () => {
    const at = '2026-11-04T10:00:00Z';
    assert.equal(trailText({ level: 1, kind: 'approved', userId: 'u', userName: 'Sara', onBehalfOf: null, note: null, at }, en, () => ''), 'Sara approved step 1');
    assert.equal(trailText({ level: 2, kind: 'approved', userId: 'u', userName: 'Ali', onBehalfOf: 'x', note: null, at }, en, () => 'Sara'), 'Ali approved step 2 for Sara');
    assert.equal(trailText({ level: null, kind: 'started', userId: 'u', userName: 'Omar', onBehalfOf: null, note: null, at }, en, () => ''), 'Omar asked for approval');
    assert.equal(trailText({ level: 1, kind: 'reminded', userId: null, userName: null, onBehalfOf: null, note: null, at }, ar, () => ''), 'تذكير بالخطوة 1');
  });
});

describe('condition wording', () => {
  it('says each condition as a sentence, naming records', async () => {
    const { conditionText } = await import('./wording');
    const name = (f: string, v: string) => ({ s1: 'Globex', s2: 'Initech' } as Record<string, string>)[v] ?? v;
    assert.equal(conditionText([{ field: 'supplier', op: 'is', values: ['s1', 's2'] }], name, en), 'Only when the supplier is Globex or Initech');
    assert.equal(conditionText([{ field: 'category', op: 'is_not', values: ['Meals'] }, { field: 'project', op: 'is', values: ['p'] }], name, en),
      'Only when the category is not Meals, and the project is p');
    assert.equal(conditionText([{ field: 'leaveType', op: 'is', values: ['Annual'] }], name, ar), 'فقط عندما يكون نوع الإجازة Annual');
    assert.equal(conditionText([], name, en), '');
  });
});
