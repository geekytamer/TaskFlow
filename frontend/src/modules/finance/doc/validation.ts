import type { Block, BlockStyle, BoxSpacing, InvoiceDoc } from './types';

const BLOCK_TYPES = new Set([
  'container',
  'text',
  'heading',
  'image',
  'divider',
  'spacer',
  'shape',
  'lineItems',
  'totals',
  'details',
  'payment',
  'signature',
  'qr',
  'pageBreak',
]);
const VISIBLE_WHEN = new Set([
  'always',
  'hasNotes',
  'hasBankAccounts',
  'hasLogo',
  'hasStamp',
  'hasSignature',
]);
const ALIGNS = new Set(['left', 'center', 'right']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function checkString(
  value: unknown,
  path: string,
  errors: string[],
  options: { optional?: boolean; max?: number; allowEmpty?: boolean } = {},
) {
  if (value === undefined && options.optional) return;
  if (typeof value !== 'string') {
    errors.push(`${path} must be a string.`);
    return;
  }
  if (!options.allowEmpty && !value.trim()) errors.push(`${path} is required.`);
  if (value.length > (options.max ?? 10_000)) errors.push(`${path} is too long.`);
}

function checkNumber(
  value: unknown,
  path: string,
  errors: string[],
  options: { optional?: boolean; min?: number; max?: number } = {},
) {
  if (value === undefined && options.optional) return;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    errors.push(`${path} must be a finite number.`);
    return;
  }
  if (options.min !== undefined && value < options.min) errors.push(`${path} must be at least ${options.min}.`);
  if (options.max !== undefined && value > options.max) errors.push(`${path} must be at most ${options.max}.`);
}

function checkSpacing(value: unknown, path: string, errors: string[]) {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    checkNumber(value[side], `${path}.${side}`, errors, { optional: true, min: -200, max: 500 });
  }
}

function checkStyle(value: unknown, path: string, errors: string[]) {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  checkSpacing(value.margin, `${path}.margin`, errors);
  checkSpacing(value.padding, `${path}.padding`, errors);
  for (const key of ['background', 'width', 'color', 'fontFamily'] as const) {
    checkString(value[key], `${path}.${key}`, errors, { optional: true, max: 200 });
  }
  for (const key of ['borderRadius', 'fontSize', 'fontWeight', 'lineHeight'] as const) {
    checkNumber(value[key], `${path}.${key}`, errors, { optional: true, min: 0, max: key === 'fontWeight' ? 1000 : 500 });
  }
  if (value.align !== undefined && !ALIGNS.has(String(value.align))) errors.push(`${path}.align is invalid.`);
  for (const key of ['italic', 'uppercase'] as const) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') errors.push(`${path}.${key} must be a boolean.`);
  }
  if (value.border !== undefined) {
    if (!isRecord(value.border)) {
      errors.push(`${path}.border must be an object.`);
    } else {
      checkNumber(value.border.width, `${path}.border.width`, errors, { optional: true, min: 0, max: 20 });
      checkString(value.border.color, `${path}.border.color`, errors, { optional: true, max: 100 });
      if (value.border.style !== undefined && !['solid', 'dashed', 'dotted'].includes(String(value.border.style))) {
        errors.push(`${path}.border.style is invalid.`);
      }
      if (value.border.sides !== undefined && (
        !Array.isArray(value.border.sides)
        || value.border.sides.some((side) => !['top', 'right', 'bottom', 'left'].includes(String(side)))
      )) {
        errors.push(`${path}.border.sides is invalid.`);
      }
    }
  }
}

function checkColumns(value: unknown, path: string, errors: string[]) {
  if (value === undefined) return;
  if (!Array.isArray(value) || value.length > 20) {
    errors.push(`${path} must be an array with at most 20 columns.`);
    return;
  }
  value.forEach((column, index) => {
    const itemPath = `${path}[${index}]`;
    if (!isRecord(column)) {
      errors.push(`${itemPath} must be an object.`);
      return;
    }
    checkString(column.id, `${itemPath}.id`, errors, { max: 100 });
    if (!['sku', 'description', 'quantity', 'unitPrice', 'amount', 'custom'].includes(String(column.key))) {
      errors.push(`${itemPath}.key is invalid.`);
    }
    checkString(column.label, `${itemPath}.label`, errors, { max: 100, allowEmpty: true });
    if (typeof column.visible !== 'boolean') errors.push(`${itemPath}.visible must be a boolean.`);
    checkNumber(column.width, `${itemPath}.width`, errors, { optional: true, min: 1, max: 100 });
    if (column.align !== undefined && !ALIGNS.has(String(column.align))) errors.push(`${itemPath}.align is invalid.`);
  });
}

function checkBlock(
  value: unknown,
  path: string,
  errors: string[],
  ids: Set<string>,
  depth: number,
) {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  if (depth > 8) {
    errors.push(`${path} exceeds the maximum nesting depth.`);
    return;
  }
  checkString(value.id, `${path}.id`, errors, { max: 100 });
  if (typeof value.id === 'string') {
    if (ids.has(value.id)) errors.push(`${path}.id must be unique.`);
    ids.add(value.id);
  }
  checkString(value.type, `${path}.type`, errors, { max: 40 });
  if (!BLOCK_TYPES.has(String(value.type))) {
    errors.push(`${path}.type is unsupported.`);
    return;
  }
  checkStyle(value.style, `${path}.style`, errors);
  if (value.visibleWhen !== undefined && !VISIBLE_WHEN.has(String(value.visibleWhen))) {
    errors.push(`${path}.visibleWhen is invalid.`);
  }

  switch (value.type) {
    case 'container':
      if (!['stack', 'row', 'grid'].includes(String(value.layout))) errors.push(`${path}.layout is invalid.`);
      checkNumber(value.columns, `${path}.columns`, errors, { optional: true, min: 1, max: 6 });
      checkNumber(value.gap, `${path}.gap`, errors, { optional: true, min: 0, max: 200 });
      if (!Array.isArray(value.children) || value.children.length > 100) {
        errors.push(`${path}.children must be an array with at most 100 blocks.`);
      } else {
        value.children.forEach((child, index) => checkBlock(child, `${path}.children[${index}]`, errors, ids, depth + 1));
      }
      break;
    case 'text':
      checkString(value.content, `${path}.content`, errors, { max: 20_000, allowEmpty: true });
      break;
    case 'heading':
      checkString(value.content, `${path}.content`, errors, { max: 2_000, allowEmpty: true });
      if (![1, 2, 3].includes(Number(value.level))) errors.push(`${path}.level is invalid.`);
      break;
    case 'image':
      checkString(value.src, `${path}.src`, errors, { optional: true, max: 2_000_000 });
      if (value.binding !== undefined && !['logo', 'stamp', 'signature', 'header', 'footer'].includes(String(value.binding))) {
        errors.push(`${path}.binding is invalid.`);
      }
      if (value.fit !== undefined && !['contain', 'cover'].includes(String(value.fit))) errors.push(`${path}.fit is invalid.`);
      checkNumber(value.height, `${path}.height`, errors, { optional: true, min: 1, max: 2000 });
      break;
    case 'spacer':
      checkNumber(value.height, `${path}.height`, errors, { min: 0, max: 2000 });
      break;
    case 'shape':
      checkNumber(value.height, `${path}.height`, errors, { optional: true, min: 1, max: 2000 });
      break;
    case 'lineItems':
      checkColumns(value.columns, `${path}.columns`, errors);
      break;
    case 'totals':
      for (const key of ['showSubtotal', 'showTax', 'showTotal'] as const) {
        if (value[key] !== undefined && typeof value[key] !== 'boolean') errors.push(`${path}.${key} must be a boolean.`);
      }
      break;
    case 'details':
      checkString(value.title, `${path}.title`, errors, { optional: true, max: 200, allowEmpty: true });
      if (!Array.isArray(value.fields) || value.fields.length > 50) {
        errors.push(`${path}.fields must be an array with at most 50 entries.`);
      } else {
        value.fields.forEach((field, index) => {
          const fieldPath = `${path}.fields[${index}]`;
          if (!isRecord(field)) {
            errors.push(`${fieldPath} must be an object.`);
            return;
          }
          checkString(field.label, `${fieldPath}.label`, errors, { max: 200, allowEmpty: true });
          checkString(field.value, `${fieldPath}.value`, errors, { max: 2_000, allowEmpty: true });
        });
      }
      break;
    case 'payment':
      checkString(value.title, `${path}.title`, errors, { optional: true, max: 200, allowEmpty: true });
      break;
    case 'qr':
      checkString(value.caption, `${path}.caption`, errors, { optional: true, max: 500, allowEmpty: true });
      break;
    default:
      break;
  }
}

export function validateInvoiceDoc(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ['Document must be an object.'];
  if (value.version !== 1) errors.push('version must be 1.');

  if (!isRecord(value.page)) {
    errors.push('page must be an object.');
  } else {
    if (!['A4', 'Letter'].includes(String(value.page.size))) errors.push('page.size is invalid.');
    if (!['portrait', 'landscape'].includes(String(value.page.orientation))) errors.push('page.orientation is invalid.');
    if (!isRecord(value.page.margin)) {
      errors.push('page.margin must be an object.');
    } else {
      checkSpacing(value.page.margin, 'page.margin', errors);
      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
        checkNumber(value.page.margin[side], `page.margin.${side}`, errors, { min: 0, max: 50 });
      }
    }
  }

  if (!isRecord(value.theme)) {
    errors.push('theme must be an object.');
  } else {
    checkString(value.theme.fontFamily, 'theme.fontFamily', errors, { max: 200 });
    checkString(value.theme.primaryColor, 'theme.primaryColor', errors, { max: 100 });
    checkString(value.theme.accentColor, 'theme.accentColor', errors, { max: 100 });
    checkString(value.theme.textColor, 'theme.textColor', errors, { max: 100 });
  }

  if (!Array.isArray(value.body) || value.body.length > 200) {
    errors.push('body must be an array with at most 200 blocks.');
  } else {
    const ids = new Set<string>();
    value.body.forEach((block, index) => checkBlock(block, `body[${index}]`, errors, ids, 0));
  }
  return errors.slice(0, 50);
}

export function isInvoiceDoc(value: unknown): value is InvoiceDoc {
  return validateInvoiceDoc(value).length === 0;
}

export function cloneInvoiceDoc(doc: InvoiceDoc): InvoiceDoc {
  return JSON.parse(JSON.stringify(doc)) as InvoiceDoc;
}

export function mergeSpacing(current: BoxSpacing | undefined, patch: Partial<BoxSpacing>): BoxSpacing {
  return { ...current, ...patch };
}

export function mergeBlockStyle(current: BlockStyle | undefined, patch: BlockStyle): BlockStyle {
  return { ...current, ...patch };
}

export function countBlocks(blocks: Block[]): number {
  return blocks.reduce((total, block) => total + 1 + (block.type === 'container' ? countBlocks(block.children) : 0), 0);
}
