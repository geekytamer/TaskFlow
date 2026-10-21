import assert from 'node:assert/strict';
import test from 'node:test';
import { forbiddenSentence, isForbiddenBody, labelsFromCatalogue, rolesToAsk } from './forbidden-message';

const labels = labelsFromCatalogue({
  areas: [{ actions: [{ key: 'sales.delete', label: { en: 'Delete quotations and sales orders', ar: 'حذف عروض الأسعار وأوامر البيع' } }] }],
  fields: [{ key: 'salary', label: { en: 'Salaries (pay, allowances, payslips)', ar: 'الرواتب (الأجر والبدلات وقسائم الراتب)' } }],
});

test('reads who to ask from the v2 message', () => {
  assert.deepEqual(rolesToAsk('Ask an Admin or Manager.'), ['Admin', 'Manager']);
  assert.deepEqual(rolesToAsk('Ask a Sales lead, Admin or Owner.'), ['Sales lead', 'Admin', 'Owner']);
  assert.equal(rolesToAsk('You do not have permission to perform this action.'), null);
  assert.equal(rolesToAsk(undefined), null);
});

test('one English sentence: the permission label and who to ask', () => {
  const s = forbiddenSentence({ code: 'FORBIDDEN', permission: 'sales.delete', message: 'Ask an Admin or Manager.' }, labels, 'en');
  assert.equal(s, 'You need the permission "Delete quotations and sales orders" — ask an Admin or Manager.');
  assert.doesNotMatch(s, /403/);
  assert.equal(s.split('. ').length, 1, 'one sentence');
});

test('Arabic: label and translated standard role names', () => {
  const s = forbiddenSentence({ code: 'FORBIDDEN', permission: 'sales.delete', message: 'Ask an Admin or Manager.' }, labels, 'ar');
  assert.equal(s, 'تحتاج إلى صلاحية «حذف عروض الأسعار وأوامر البيع» — اطلبها من مدير النظام أو مدير.');
});

test('a custom role name is kept as written', () => {
  const s = forbiddenSentence({ code: 'FORBIDDEN', permission: 'sales.delete', message: 'Ask a Sales lead.' }, labels, 'ar');
  assert.match(s, /اطلبها من Sales lead\.$/);
});

test('under legacy (generic message) it still names who to ask', () => {
  const en = forbiddenSentence({ code: 'FORBIDDEN', permission: 'sales.delete', message: 'You do not have permission to perform this action.' }, labels, 'en');
  assert.equal(en, 'You need the permission "Delete quotations and sales orders" — ask whoever manages roles in your company.');
  const ar = forbiddenSentence({ code: 'FORBIDDEN', permission: 'sales.delete', message: 'You do not have permission to perform this action.' }, labels, 'ar');
  assert.match(ar, /اطلبها من مسؤول الأدوار في شركتك\.$/);
});

test('a sensitive field refusal names the field', () => {
  const s = forbiddenSentence({ code: 'FORBIDDEN', permission: 'field:salary', message: 'Ask an Admin.' }, labels, 'en');
  assert.equal(s, 'You can\'t change "Salaries (pay, allowances, payslips)" — ask an Admin.');
});

test('nobody holds it yet', () => {
  const s = forbiddenSentence({ code: 'FORBIDDEN', permission: 'sales.delete', message: 'Nobody in this company has this permission yet. Ask an administrator to grant it.' }, labels, 'en');
  assert.match(s, /nobody in this company has it yet, so ask the platform administrator\.$/);
});

test('without the catalogue or a key: a plain sentence, never a status code', () => {
  assert.equal(
    forbiddenSentence({ code: 'FORBIDDEN', permission: null }, null, 'en'),
    "You don't have permission to do this — ask whoever manages roles in your company.",
  );
  assert.equal(
    forbiddenSentence({ code: 'FORBIDDEN', permission: 'sales.delete', message: 'Ask an Admin.' }, null, 'ar'),
    'ليست لديك صلاحية لهذا الإجراء — اطلبها من مدير النظام.',
  );
});

test('recognises the 403 body', () => {
  assert.equal(isForbiddenBody({ code: 'FORBIDDEN', permission: 'x' }), true);
  assert.equal(isForbiddenBody({ code: 'CREDIT_LIMIT_EXCEEDED' }), false);
  assert.equal(isForbiddenBody(null), false);
});
