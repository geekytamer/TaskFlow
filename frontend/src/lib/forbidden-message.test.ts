import assert from 'node:assert/strict';
import test from 'node:test';
import { forbiddenSentence, isForbiddenBody, labelsFromCatalogue, refusalSentence, rolesToAsk } from './forbidden-message';

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

test('the structured roles list wins over parsing the sentence', () => {
  const s = forbiddenSentence({ code: 'FORBIDDEN', permission: 'sales.delete', roles: ['Sales, North', 'Admin'], message: 'Ask a Sales, North or Admin.' }, labels, 'en');
  assert.equal(s, 'You need the permission "Delete quotations and sales orders" — ask a Sales, North or Admin.');
  const none = forbiddenSentence({ code: 'FORBIDDEN', permission: 'sales.delete', roles: [] }, labels, 'en');
  assert.match(none, /nobody in this company has it yet/);
});

test('other coded refusals are translated; an unknown code keeps the server message', () => {
  const higher = refusalSentence({ code: 'HIGHER_THAN_YOU', missing: ['sales.delete'] }, labels, 'en');
  assert.equal(higher, "You can't give permissions you don't have yourself: Delete quotations and sales orders.");
  assert.equal(refusalSentence({ code: 'HIGHER_THAN_YOU', missing: ['sales.delete'] }, labels, 'ar'), 'لا يمكنك منح صلاحيات لا تملكها بنفسك: حذف عروض الأسعار وأوامر البيع.');
  for (const code of ['NO_COMPANY_ACCESS', 'LOCKOUT', 'SYSTEM_ROLE', 'GROUP_ROLE', 'GROUP_PERSON', 'ROLE_ASSIGN_FORBIDDEN', 'USER_OUTSIDE_COMPANY', 'IDENTITY_SHARED', 'SUPER_ADMIN_ONLY']) {
    const en = refusalSentence({ code }, labels, 'en');
    const ar = refusalSentence({ code }, labels, 'ar');
    assert.ok(en && !/\d{3}/.test(en), code);
    assert.ok(ar && /[؀-ۿ]/.test(ar), `${code} has Arabic`);
  }
  assert.equal(refusalSentence({ code: 'FORBIDDEN', permission: 'sales.delete' }, labels, 'en')?.startsWith('You need the permission'), true);
  assert.equal(refusalSentence({ code: 'CREDIT_LIMIT_EXCEEDED' }, labels, 'en'), null);
});

test('the refusal hold drops only the echo of the same failure', async () => {
  const { isRefusalEcho, showRefusalToast } = await import('@/hooks/use-toast');
  showRefusalToast({ variant: 'destructive', title: 'Not allowed', description: 'You need the permission "X" — ask an Admin.' });
  assert.equal(isRefusalEcho({ title: 'Could not delete', description: 'You need the permission "X" — ask an Admin.' }), true);
  assert.equal(isRefusalEcho({ title: 'Could not load invoices', description: 'Network error' }), false, 'another failure still shows');
  assert.equal(isRefusalEcho({ title: 'Saved' }), false);
  assert.equal(isRefusalEcho({ description: 'You need the permission "X" — ask an Admin.' }, Date.now() + 10_000), false, 'the hold ends');
});

test('I-1: a generic error toast right after a refusal is dropped; a toast with news still shows', async () => {
  const { isRefusalEcho, showRefusalToast } = await import('@/hooks/use-toast');
  showRefusalToast({ variant: 'destructive', title: 'Not allowed', description: 'You need the permission "Edit contacts" — ask an Admin.' }, 2500, 'Ask an Admin.');
  assert.equal(isRefusalEcho({ variant: 'destructive', title: 'An error occurred' }), true, 'common.error (en)');
  assert.equal(isRefusalEcho({ variant: 'destructive', title: 'حدث خطأ' }), true, 'common.error (ar)');
  assert.equal(isRefusalEcho({ variant: 'destructive', title: 'An error occurred', description: 'Ask an Admin.' }), true, 'the raw server message');
  assert.equal(isRefusalEcho({ variant: 'destructive', title: 'Could not save', description: 'The file is too large.' }), false, 'news');
  assert.equal(isRefusalEcho({ title: 'An error occurred' }), false, 'only destructive toasts');
});

test('M-6 / M-7: who to ask past three names, and what exceeds with its scope', () => {
  const labels = { permissions: { 'crm.view': { en: 'See opportunities', ar: 'عرض الفرص' } }, fields: {} };
  assert.equal(
    refusalSentence({ code: 'FORBIDDEN', permission: 'crm.view', roles: ['Manager', 'Accountant', 'Sales desk', 'Admin'] }, labels, 'en'),
    'You need the permission "See opportunities" — ask a Manager, Accountant, Sales desk or an Admin.',
  );
  assert.deepEqual(rolesToAsk('Ask a Manager, Accountant, Sales desk or an Admin.'), ['Manager', 'Accountant', 'Sales desk', 'Admin']);
  const excess = [{ key: 'crm.view', scope: 'group' }, { key: 'b' }, { key: 'c' }, { key: 'd' }, { key: 'e' }];
  assert.equal(
    refusalSentence({ code: 'HIGHER_THAN_YOU', excess, where: 'GIG' } as never, labels, 'en'),
    "You can't give permissions you don't have yourself in GIG: See opportunities (every company of the group); b; c; and 2 more.",
  );
  assert.match(refusalSentence({ code: 'OVER_LIMIT', limit: 1000, amount: 5000, currency: 'USD' } as never, labels, 'en') ?? '', /1,000 USD and this is 5,000 USD/);
});
