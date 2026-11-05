/**
 * Ready-made document templates (spec 2026-11-06-documents-hub-design, stage 2).
 * Plain data for the frontend block engine: picking one saves it as a company
 * template and opens the composer on it. The wording is a sensible starting
 * point, not legal advice — the owner edits it under Templates.
 */
import type { Block, InvoiceDoc } from '@/modules/finance/doc/types';
import type { InvoiceTemplate, TemplateDocumentType } from '@/modules/finance/types';
import type { InvoiceTemplateInput } from '@/services/financeService';

export type StarterLang = 'ar' | 'en';
export type StarterKey = 'mou' | 'service_agreement' | 'influencer_agreement' | 'to_whom_letter' | 'blank';

type Bi = { ar: string; en: string };

export interface StarterTemplate {
  key: StarterKey;
  docType: TemplateDocumentType;
  name: Bi;
  description: Bi;
}

export const STARTER_TEMPLATES: StarterTemplate[] = [
  {
    key: 'mou',
    docType: 'custom',
    name: { ar: 'مذكرة تفاهم', en: 'Memorandum of Understanding' },
    description: { ar: 'إطار تعاون بين طرفين: الغرض، التزامات كل طرف، المدة والسرية.', en: 'A cooperation framework between two parties: purpose, duties, term and confidentiality.' },
  },
  {
    key: 'service_agreement',
    docType: 'custom',
    name: { ar: 'اتفاقية تقديم خدمات', en: 'Service agreement' },
    description: { ar: 'نطاق الخدمات، الأتعاب وطريقة الدفع، المدة، الملكية والإنهاء.', en: 'Scope of services, fees and payment, term, ownership and termination.' },
  },
  {
    key: 'influencer_agreement',
    docType: 'custom',
    name: { ar: 'اتفاقية مؤثر', en: 'Influencer agreement' },
    description: { ar: 'المحتوى المطلوب، المنصات والمواعيد، الموافقة، حقوق الاستخدام والأجر.', en: 'Deliverables, platforms and dates, approval, usage rights and fee.' },
  },
  {
    key: 'to_whom_letter',
    docType: 'letter',
    name: { ar: 'خطاب لمن يهمه الأمر', en: 'To whom it may concern letter' },
    description: { ar: 'خطاب رسمي يشهد بحقيقة عن شخص أو جهة.', en: 'A formal letter confirming a fact about a person or organisation.' },
  },
  {
    key: 'blank',
    docType: 'custom',
    name: { ar: 'مستند فارغ', en: 'Blank document' },
    description: { ar: 'عنوان ونص حر وتوقيع — اكتب ما تحتاج.', en: 'A title, free text and a signature — write anything.' },
  },
];

const DEFAULT_PRIMARY = '#111827';
const DEFAULT_ACCENT = '#2563eb';

interface Ctx { lang: StarterLang; primary: string; accent: string; n: number }

const t = (ctx: Ctx, value: Bi) => value[ctx.lang];
const nextId = (ctx: Ctx, prefix: string) => `${prefix}-${ctx.n++}`;

const logo = (ctx: Ctx): Block => ({ id: nextId(ctx, 'logo'), type: 'image', binding: 'logo', fit: 'contain', height: 56, visibleWhen: 'hasLogo', style: { align: 'center', margin: { bottom: 12 } } });
const title = (ctx: Ctx, text: string): Block => ({ id: nextId(ctx, 'title'), type: 'heading', level: 1, content: text, style: { align: 'center', color: ctx.primary, margin: { bottom: 4 } } });
const dateLine = (ctx: Ctx): Block => ({ id: nextId(ctx, 'date'), type: 'text', content: `${t(ctx, { ar: 'التاريخ', en: 'Date' })}: {{document.date}}`, style: { align: 'center', color: '#64748b', margin: { bottom: 20 } } });
const clause = (ctx: Ctx, heading: string, body: string): Block[] => [
  { id: nextId(ctx, 'clause-h'), type: 'heading', level: 3, content: heading, style: { color: ctx.primary, margin: { top: 14, bottom: 4 } } },
  { id: nextId(ctx, 'clause'), type: 'text', content: body, style: { lineHeight: 1.7 } },
];
const para = (ctx: Ctx, body: string, margin = 10): Block => ({ id: nextId(ctx, 'para'), type: 'text', content: body, style: { lineHeight: 1.7, margin: { top: margin } } });
const notes = (ctx: Ctx): Block[] => clause(ctx, t(ctx, { ar: 'أحكام إضافية', en: 'Additional terms' }), '{{document.notes}}');

/** Two signature columns: one per party. */
const twoSignatures = (ctx: Ctx, first: Bi, firstName: string, second: Bi, secondName: string): Block => {
  const column = (label: Bi, name: string): Block => ({
    id: nextId(ctx, 'sign-col'),
    type: 'text',
    content: `${t(ctx, label)}\n${name}\n\n${t(ctx, { ar: 'الاسم', en: 'Name' })}: ____________________\n${t(ctx, { ar: 'التوقيع', en: 'Signature' })}: ____________________\n${t(ctx, { ar: 'التاريخ', en: 'Date' })}: ____________________`,
    style: { lineHeight: 1.9 },
  });
  return {
    id: nextId(ctx, 'sign'),
    type: 'container',
    layout: 'grid',
    columns: 2,
    gap: 24,
    style: { margin: { top: 36 } },
    children: [column(first, firstName), column(second, secondName)],
  };
};

const FIRST_PARTY: Bi = { ar: 'الطرف الأول', en: 'First party' };
const SECOND_PARTY: Bi = { ar: 'الطرف الثاني', en: 'Second party' };

const partiesBlock = (ctx: Ctx, secondName: string, secondAddress?: string): Block => ({
  id: nextId(ctx, 'parties'),
  type: 'text',
  content: ctx.lang === 'ar'
    ? `حُرّرت هذه الوثيقة بتاريخ {{document.date}} بين كل من:\n\n1. ${t(ctx, FIRST_PARTY)}: {{company.name}}، وعنوانه {{company.address}}.\n2. ${t(ctx, SECOND_PARTY)}: ${secondName}${secondAddress ? `، وعنوانه ${secondAddress}` : ''}.`
    : `This document is made on {{document.date}} between:\n\n1. ${t(ctx, FIRST_PARTY)}: {{company.name}}, of {{company.address}}.\n2. ${t(ctx, SECOND_PARTY)}: ${secondName}${secondAddress ? `, of ${secondAddress}` : ''}.`,
  style: { lineHeight: 1.8, margin: { bottom: 6 } },
});

type Builder = (ctx: Ctx) => { body: Block[]; fieldLabels: Record<string, Bi> };

const BUILDERS: Record<StarterKey, Builder> = {
  mou: (ctx) => ({
    fieldLabels: {
      'field.purpose': { ar: 'موضوع التعاون', en: 'Purpose of cooperation' },
      'field.first_party_duties': { ar: 'التزامات الطرف الأول', en: 'First party commitments' },
      'field.second_party_duties': { ar: 'التزامات الطرف الثاني', en: 'Second party commitments' },
      'field.term': { ar: 'مدة المذكرة', en: 'Term' },
    },
    body: [
      logo(ctx),
      title(ctx, t(ctx, { ar: 'مذكرة تفاهم', en: 'Memorandum of Understanding' })),
      dateLine(ctx),
      partiesBlock(ctx, '{{client.name}}', '{{client.address}}'),
      ...clause(ctx, t(ctx, { ar: '١. الغرض', en: '1. Purpose' }), t(ctx, {
        ar: 'يتفق الطرفان على التعاون في: {{field.purpose}}.',
        en: 'The parties agree to cooperate on: {{field.purpose}}.',
      })),
      ...clause(ctx, t(ctx, { ar: '٢. التزامات الطرفين', en: '2. Commitments' }), t(ctx, {
        ar: 'يلتزم الطرف الأول بما يلي: {{field.first_party_duties}}.\nيلتزم الطرف الثاني بما يلي: {{field.second_party_duties}}.',
        en: 'The first party will: {{field.first_party_duties}}.\nThe second party will: {{field.second_party_duties}}.',
      })),
      ...clause(ctx, t(ctx, { ar: '٣. المدة', en: '3. Term' }), t(ctx, {
        ar: 'تسري هذه المذكرة لمدة {{field.term}} من تاريخ توقيعها، ويجوز تجديدها باتفاق مكتوب بين الطرفين.',
        en: 'This memorandum runs for {{field.term}} from signature and may be renewed by written agreement.',
      })),
      ...clause(ctx, t(ctx, { ar: '٤. السرية', en: '4. Confidentiality' }), t(ctx, {
        ar: 'يلتزم كل طرف بالمحافظة على سرية المعلومات التي يطّلع عليها من الطرف الآخر، وعدم الإفصاح عنها لأي جهة دون موافقة مكتوبة.',
        en: 'Each party keeps confidential the information it receives from the other and does not disclose it without written consent.',
      })),
      ...clause(ctx, t(ctx, { ar: '٥. طبيعة المذكرة', en: '5. Nature of this memorandum' }), t(ctx, {
        ar: 'تعبّر هذه المذكرة عن نية الطرفين في التعاون، ولا تُنشئ التزامات مالية ملزمة إلا بموجب اتفاقيات تفصيلية لاحقة، باستثناء بند السرية.',
        en: 'This memorandum records the parties’ intent to cooperate. It creates no binding financial obligation except through later detailed agreements, apart from the confidentiality clause.',
      })),
      ...clause(ctx, t(ctx, { ar: '٦. الإنهاء', en: '6. Termination' }), t(ctx, {
        ar: 'يجوز لأي من الطرفين إنهاء هذه المذكرة بإشعار كتابي مدته ثلاثون (٣٠) يوماً.',
        en: 'Either party may end this memorandum with thirty (30) days’ written notice.',
      })),
      ...notes(ctx),
      twoSignatures(ctx, FIRST_PARTY, '{{company.name}}', SECOND_PARTY, '{{client.name}}'),
    ],
  }),

  service_agreement: (ctx) => ({
    fieldLabels: {
      'field.services': { ar: 'الخدمات المطلوبة', en: 'Services' },
      'field.fee': { ar: 'قيمة الأتعاب', en: 'Fee' },
      'field.payment_terms': { ar: 'طريقة الدفع', en: 'Payment terms' },
      'field.start_date': { ar: 'تاريخ البدء', en: 'Start date' },
      'field.end_date': { ar: 'تاريخ الانتهاء', en: 'End date' },
    },
    body: [
      logo(ctx),
      title(ctx, t(ctx, { ar: 'اتفاقية تقديم خدمات', en: 'Service Agreement' })),
      dateLine(ctx),
      partiesBlock(ctx, '{{client.name}}', '{{client.address}}'),
      ...clause(ctx, t(ctx, { ar: '١. نطاق الخدمات', en: '1. Scope of services' }), t(ctx, {
        ar: 'يقدّم الطرف الأول للطرف الثاني الخدمات التالية: {{field.services}}.',
        en: 'The first party provides the second party with the following services: {{field.services}}.',
      })),
      ...clause(ctx, t(ctx, { ar: '٢. الأتعاب والدفع', en: '2. Fees and payment' }), t(ctx, {
        ar: 'يدفع الطرف الثاني مبلغ {{field.fee}} مقابل الخدمات، وفق ما يلي: {{field.payment_terms}}.',
        en: 'The second party pays {{field.fee}} for the services, as follows: {{field.payment_terms}}.',
      })),
      ...clause(ctx, t(ctx, { ar: '٣. المدة', en: '3. Term' }), t(ctx, {
        ar: 'تبدأ الاتفاقية في {{field.start_date}} وتنتهي في {{field.end_date}} ما لم تُجدَّد باتفاق مكتوب.',
        en: 'The agreement starts on {{field.start_date}} and ends on {{field.end_date}} unless renewed in writing.',
      })),
      ...clause(ctx, t(ctx, { ar: '٤. التزامات الطرف الثاني', en: '4. Client responsibilities' }), t(ctx, {
        ar: 'يزوّد الطرف الثاني الطرف الأول بالمعلومات والمواد والموافقات اللازمة في الوقت المناسب لتنفيذ الخدمات.',
        en: 'The second party provides the information, materials and approvals needed in good time to perform the services.',
      })),
      ...clause(ctx, t(ctx, { ar: '٥. الملكية الفكرية', en: '5. Ownership' }), t(ctx, {
        ar: 'تنتقل ملكية المخرجات النهائية إلى الطرف الثاني بعد سداد كامل الأتعاب، ويحق للطرف الأول عرضها ضمن أعماله ما لم يُتفق على خلاف ذلك.',
        en: 'Final deliverables pass to the second party once fees are paid in full; the first party may show them in its portfolio unless agreed otherwise.',
      })),
      ...clause(ctx, t(ctx, { ar: '٦. السرية', en: '6. Confidentiality' }), t(ctx, {
        ar: 'يلتزم الطرفان بالمحافظة على سرية المعلومات المتبادلة بينهما خلال مدة الاتفاقية وبعدها.',
        en: 'Both parties keep each other’s information confidential during and after the agreement.',
      })),
      ...clause(ctx, t(ctx, { ar: '٧. الإنهاء', en: '7. Termination' }), t(ctx, {
        ar: 'يجوز لأي طرف إنهاء الاتفاقية بإشعار كتابي مدته خمسة عشر (١٥) يوماً، على أن يدفع الطرف الثاني مقابل ما تم إنجازه حتى تاريخ الإنهاء.',
        en: 'Either party may terminate with fifteen (15) days’ written notice; the second party pays for work done up to that date.',
      })),
      ...clause(ctx, t(ctx, { ar: '٨. القانون الواجب التطبيق', en: '8. Governing law' }), t(ctx, {
        ar: 'تخضع هذه الاتفاقية لقوانين سلطنة عُمان.',
        en: 'This agreement is governed by the laws of the Sultanate of Oman.',
      })),
      ...notes(ctx),
      twoSignatures(ctx, FIRST_PARTY, '{{company.name}}', SECOND_PARTY, '{{client.name}}'),
    ],
  }),

  influencer_agreement: (ctx) => ({
    fieldLabels: {
      'field.influencer_name': { ar: 'اسم المؤثر', en: 'Influencer name' },
      'field.influencer_handle': { ar: 'الحساب', en: 'Account handle' },
      'field.brand': { ar: 'العلامة التجارية', en: 'Brand' },
      'field.platforms': { ar: 'المنصات', en: 'Platforms' },
      'field.deliverables': { ar: 'المحتوى المطلوب', en: 'Deliverables' },
      'field.posting_dates': { ar: 'مواعيد النشر', en: 'Posting dates' },
      'field.fee': { ar: 'الأجر', en: 'Fee' },
      'field.payment_terms': { ar: 'طريقة الدفع', en: 'Payment terms' },
      'field.usage_period': { ar: 'مدة حق استخدام المحتوى', en: 'Content usage period' },
      'field.exclusivity': { ar: 'الحصرية', en: 'Exclusivity' },
    },
    body: [
      logo(ctx),
      title(ctx, t(ctx, { ar: 'اتفاقية تعاون مع مؤثر', en: 'Influencer Agreement' })),
      dateLine(ctx),
      partiesBlock(ctx, '{{field.influencer_name}} ({{field.influencer_handle}})'),
      ...clause(ctx, t(ctx, { ar: '١. الحملة', en: '1. Campaign' }), t(ctx, {
        ar: 'يُنتج الطرف الثاني محتوى للعلامة التجارية {{field.brand}} وينشره على: {{field.platforms}}.',
        en: 'The second party creates content for {{field.brand}} and publishes it on: {{field.platforms}}.',
      })),
      ...clause(ctx, t(ctx, { ar: '٢. المحتوى والمواعيد', en: '2. Deliverables and dates' }), t(ctx, {
        ar: 'المحتوى المطلوب: {{field.deliverables}}.\nمواعيد النشر: {{field.posting_dates}}.',
        en: 'Deliverables: {{field.deliverables}}.\nPosting dates: {{field.posting_dates}}.',
      })),
      ...clause(ctx, t(ctx, { ar: '٣. الموافقة المسبقة', en: '3. Approval' }), t(ctx, {
        ar: 'يرسل الطرف الثاني المحتوى للموافقة قبل النشر بثمانٍ وأربعين (٤٨) ساعة على الأقل، ولا يُنشر إلا بعد موافقة الطرف الأول.',
        en: 'The second party sends content for approval at least forty-eight (48) hours before posting and posts only once approved.',
      })),
      ...clause(ctx, t(ctx, { ar: '٤. الإفصاح', en: '4. Disclosure' }), t(ctx, {
        ar: 'يُوضَّح أن المحتوى إعلان مدفوع وفق الأنظمة المعمول بها في سلطنة عُمان.',
        en: 'Content is clearly marked as paid advertising as required by the regulations in force in the Sultanate of Oman.',
      })),
      ...clause(ctx, t(ctx, { ar: '٥. حقوق الاستخدام والحصرية', en: '5. Usage rights and exclusivity' }), t(ctx, {
        ar: 'يحق للطرف الأول والعلامة التجارية إعادة استخدام المحتوى لمدة {{field.usage_period}}.\nالحصرية: {{field.exclusivity}}.',
        en: 'The first party and the brand may reuse the content for {{field.usage_period}}.\nExclusivity: {{field.exclusivity}}.',
      })),
      ...clause(ctx, t(ctx, { ar: '٦. الأجر', en: '6. Fee' }), t(ctx, {
        ar: 'يحصل الطرف الثاني على {{field.fee}}، يُدفع كالتالي: {{field.payment_terms}}.',
        en: 'The second party receives {{field.fee}}, paid as follows: {{field.payment_terms}}.',
      })),
      ...clause(ctx, t(ctx, { ar: '٧. الإلغاء', en: '7. Cancellation' }), t(ctx, {
        ar: 'إذا لم يُنشر المحتوى المتفق عليه في موعده دون عذر مقبول، يحق للطرف الأول خصم الجزء المقابل من الأجر أو إلغاء الاتفاقية.',
        en: 'If agreed content is not posted on time without a valid reason, the first party may deduct the matching part of the fee or cancel the agreement.',
      })),
      ...notes(ctx),
      twoSignatures(ctx, FIRST_PARTY, '{{company.name}}', SECOND_PARTY, '{{field.influencer_name}}'),
    ],
  }),

  to_whom_letter: (ctx) => ({
    fieldLabels: {
      'field.person_name': { ar: 'اسم الشخص أو الجهة', en: 'Person or organisation' },
      'field.statement': { ar: 'مضمون الإفادة', en: 'What we confirm' },
    },
    body: [
      logo(ctx),
      { id: nextId(ctx, 'date'), type: 'text', content: `${t(ctx, { ar: 'التاريخ', en: 'Date' })}: {{document.date}}`, style: { align: 'right', color: '#64748b', margin: { bottom: 28 } } },
      title(ctx, t(ctx, { ar: 'إلى من يهمه الأمر', en: 'To Whom It May Concern' })),
      para(ctx, t(ctx, {
        ar: 'تشهد {{company.name}} بأن {{field.person_name}} {{field.statement}}.',
        en: '{{company.name}} hereby confirms that {{field.person_name}} {{field.statement}}.',
      }), 24),
      para(ctx, '{{document.notes}}'),
      para(ctx, t(ctx, {
        ar: 'وقد أُعطيت هذه الإفادة بناءً على طلبه دون أدنى مسؤولية على الشركة.',
        en: 'This letter is issued at their request without any liability on the company.',
      })),
      { id: nextId(ctx, 'signature'), type: 'signature', style: { margin: { top: 40 } } },
    ],
  }),

  blank: (ctx) => ({
    fieldLabels: { 'field.title': { ar: 'العنوان', en: 'Title' } },
    body: [
      logo(ctx),
      title(ctx, '{{field.title}}'),
      dateLine(ctx),
      para(ctx, '{{document.notes}}', 8),
      { id: nextId(ctx, 'signature'), type: 'signature', style: { margin: { top: 40 } } },
    ],
  }),
};

export function getStarter(key: StarterKey): StarterTemplate {
  const found = STARTER_TEMPLATES.find((s) => s.key === key);
  if (!found) throw new Error(`Unknown starter template ${key}`);
  return found;
}

/** The document of a starter, in one language, with the company colours. */
export function buildStarter(
  key: StarterKey,
  lang: StarterLang,
  colors: { primary?: string; accent?: string } = {},
): { name: string; docType: TemplateDocumentType; doc: InvoiceDoc } {
  const starter = getStarter(key);
  const ctx: Ctx = { lang, primary: colors.primary || DEFAULT_PRIMARY, accent: colors.accent || DEFAULT_ACCENT, n: 0 };
  const { body, fieldLabels } = BUILDERS[key](ctx);
  return {
    name: starter.name[lang],
    docType: starter.docType,
    doc: {
      version: 1,
      page: { size: 'A4', orientation: 'portrait', margin: { top: 18, right: 20, bottom: 18, left: 20 } },
      theme: { fontFamily: 'inherit', primaryColor: ctx.primary, accentColor: ctx.accent, textColor: '#0f172a' },
      body,
      direction: lang === 'ar' ? 'rtl' : 'ltr',
      fieldLabels: Object.fromEntries(Object.entries(fieldLabels).map(([k, v]) => [k, v[lang]])),
    },
  };
}

/**
 * What to save as a company template. The look (colours, logo, letterhead,
 * stamp, signature) comes from one of the company's own templates when given.
 */
export function starterTemplateInput(
  key: StarterKey,
  lang: StarterLang,
  brand?: Partial<InvoiceTemplate>,
): InvoiceTemplateInput {
  const built = buildStarter(key, lang, { primary: brand?.primaryColor, accent: brand?.accentColor });
  return {
    name: built.name,
    docType: built.docType,
    layout: 'classic',
    isDefault: false,
    primaryColor: built.doc.theme.primaryColor,
    accentColor: built.doc.theme.accentColor,
    logoUrl: brand?.logoUrl ?? '',
    headerImageUrl: '',
    footerImageUrl: '',
    letterheadPdfUrl: brand?.letterheadPdfUrl ?? '',
    letterheadImageUrl: brand?.letterheadImageUrl ?? '',
    stampUrl: brand?.stampUrl ?? '',
    signatureUrl: brand?.signatureUrl ?? '',
    signatureLabel: brand?.signatureLabel ?? '',
    paymentInstructions: '',
    terms: '',
    footerNote: '',
    watermarkEnabled: false,
    watermarkText: 'DRAFT',
    watermarkOpacity: 0.12,
    showCompanyAddress: true,
    showTaxId: true,
    qrEnabled: false,
    qrPosition: 'center',
    doc: built.doc,
  } as InvoiceTemplateInput;
}

/** The company template whose look a new starter copies: the default letter, else any letter/quote/custom. */
export function brandSource(templates: InvoiceTemplate[]): InvoiceTemplate | undefined {
  const order: TemplateDocumentType[] = ['letter', 'quote', 'custom', 'memo', 'invoice'];
  for (const type of order) {
    const ofType = templates.filter((tpl) => tpl.docType === type);
    const pick = ofType.find((tpl) => tpl.isDefault) ?? ofType[0];
    if (pick) return pick;
  }
  return templates[0];
}
