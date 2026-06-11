const blockTypes = new Set([
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
const visibleWhenValues = new Set([
  'always',
  'hasNotes',
  'hasBankAccounts',
  'hasLogo',
  'hasStamp',
  'hasSignature',
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

function finiteNumber(
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

function stringValue(
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

function spacing(value: unknown, path: string, errors: string[], min = -200, max = 500) {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  for (const side of ['top', 'right', 'bottom', 'left']) {
    finiteNumber(value[side], `${path}.${side}`, errors, { optional: true, min, max });
  }
}

function style(value: unknown, path: string, errors: string[]) {
  if (value === undefined) return;
  if (!isRecord(value)) {
    errors.push(`${path} must be an object.`);
    return;
  }
  spacing(value.margin, `${path}.margin`, errors);
  spacing(value.padding, `${path}.padding`, errors);
  for (const key of ['background', 'width', 'color', 'fontFamily']) {
    stringValue(value[key], `${path}.${key}`, errors, { optional: true, max: 200 });
  }
  // Background image may be a data URL, so it gets the same generous cap as image src.
  stringValue(value.backgroundImage, `${path}.backgroundImage`, errors, { optional: true, max: 2_000_000 });
  if (value.backgroundSize !== undefined && !['cover', 'contain', 'auto'].includes(String(value.backgroundSize))) {
    errors.push(`${path}.backgroundSize is invalid.`);
  }
  for (const key of ['borderRadius', 'fontSize', 'fontWeight', 'lineHeight']) {
    finiteNumber(value[key], `${path}.${key}`, errors, { optional: true, min: 0, max: key === 'fontWeight' ? 1000 : 500 });
  }
  if (value.align !== undefined && !['left', 'center', 'right'].includes(String(value.align))) {
    errors.push(`${path}.align is invalid.`);
  }
  for (const key of ['italic', 'uppercase', 'fullBleed']) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') errors.push(`${path}.${key} must be a boolean.`);
  }
  if (value.border !== undefined) {
    if (!isRecord(value.border)) {
      errors.push(`${path}.border must be an object.`);
    } else {
      finiteNumber(value.border.width, `${path}.border.width`, errors, { optional: true, min: 0, max: 20 });
      stringValue(value.border.color, `${path}.border.color`, errors, { optional: true, max: 100 });
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

function columns(value: unknown, path: string, errors: string[]) {
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
    stringValue(column.id, `${itemPath}.id`, errors, { max: 100 });
    if (!['sku', 'description', 'quantity', 'unitPrice', 'amount', 'custom'].includes(String(column.key))) {
      errors.push(`${itemPath}.key is invalid.`);
    }
    stringValue(column.label, `${itemPath}.label`, errors, { max: 100, allowEmpty: true });
    if (typeof column.visible !== 'boolean') errors.push(`${itemPath}.visible must be a boolean.`);
    finiteNumber(column.width, `${itemPath}.width`, errors, { optional: true, min: 1, max: 100 });
    if (column.align !== undefined && !['left', 'center', 'right'].includes(String(column.align))) {
      errors.push(`${itemPath}.align is invalid.`);
    }
  });
}

function block(
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
  stringValue(value.id, `${path}.id`, errors, { max: 100 });
  if (typeof value.id === 'string') {
    if (ids.has(value.id)) errors.push(`${path}.id must be unique.`);
    ids.add(value.id);
  }
  stringValue(value.type, `${path}.type`, errors, { max: 40 });
  if (!blockTypes.has(String(value.type))) {
    errors.push(`${path}.type is unsupported.`);
    return;
  }
  style(value.style, `${path}.style`, errors);
  if (value.visibleWhen !== undefined && !visibleWhenValues.has(String(value.visibleWhen))) {
    errors.push(`${path}.visibleWhen is invalid.`);
  }

  switch (value.type) {
    case 'container':
      if (!['stack', 'row', 'grid'].includes(String(value.layout))) errors.push(`${path}.layout is invalid.`);
      finiteNumber(value.columns, `${path}.columns`, errors, { optional: true, min: 1, max: 6 });
      finiteNumber(value.gap, `${path}.gap`, errors, { optional: true, min: 0, max: 200 });
      if (!Array.isArray(value.children) || value.children.length > 100) {
        errors.push(`${path}.children must be an array with at most 100 blocks.`);
      } else {
        value.children.forEach((child, index) => block(child, `${path}.children[${index}]`, errors, ids, depth + 1));
      }
      break;
    case 'text':
      stringValue(value.content, `${path}.content`, errors, { max: 20_000, allowEmpty: true });
      break;
    case 'heading':
      stringValue(value.content, `${path}.content`, errors, { max: 2_000, allowEmpty: true });
      if (![1, 2, 3].includes(Number(value.level))) errors.push(`${path}.level is invalid.`);
      break;
    case 'image':
      stringValue(value.src, `${path}.src`, errors, { optional: true, max: 2_000_000 });
      if (value.binding !== undefined && !['logo', 'stamp', 'signature', 'header', 'footer'].includes(String(value.binding))) {
        errors.push(`${path}.binding is invalid.`);
      }
      if (value.fit !== undefined && !['contain', 'cover'].includes(String(value.fit))) errors.push(`${path}.fit is invalid.`);
      finiteNumber(value.height, `${path}.height`, errors, { optional: true, min: 1, max: 2000 });
      break;
    case 'spacer':
      finiteNumber(value.height, `${path}.height`, errors, { min: 0, max: 2000 });
      break;
    case 'shape':
      finiteNumber(value.height, `${path}.height`, errors, { optional: true, min: 1, max: 2000 });
      break;
    case 'lineItems':
      columns(value.columns, `${path}.columns`, errors);
      break;
    case 'totals':
      for (const key of ['showSubtotal', 'showTax', 'showTotal']) {
        if (value[key] !== undefined && typeof value[key] !== 'boolean') errors.push(`${path}.${key} must be a boolean.`);
      }
      break;
    case 'details':
      stringValue(value.title, `${path}.title`, errors, { optional: true, max: 200, allowEmpty: true });
      if (!Array.isArray(value.fields) || value.fields.length > 50) {
        errors.push(`${path}.fields must be an array with at most 50 entries.`);
      } else {
        value.fields.forEach((field, index) => {
          const fieldPath = `${path}.fields[${index}]`;
          if (!isRecord(field)) {
            errors.push(`${fieldPath} must be an object.`);
            return;
          }
          stringValue(field.label, `${fieldPath}.label`, errors, { max: 200, allowEmpty: true });
          stringValue(field.value, `${fieldPath}.value`, errors, { max: 2_000, allowEmpty: true });
        });
      }
      break;
    case 'payment':
      stringValue(value.title, `${path}.title`, errors, { optional: true, max: 200, allowEmpty: true });
      break;
    case 'qr':
      stringValue(value.caption, `${path}.caption`, errors, { optional: true, max: 500, allowEmpty: true });
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
      spacing(value.page.margin, 'page.margin', errors, 0, 50);
      for (const side of ['top', 'right', 'bottom', 'left']) {
        finiteNumber(value.page.margin[side], `page.margin.${side}`, errors, { min: 0, max: 50 });
      }
    }
  }
  if (!isRecord(value.theme)) {
    errors.push('theme must be an object.');
  } else {
    stringValue(value.theme.fontFamily, 'theme.fontFamily', errors, { max: 200 });
    stringValue(value.theme.primaryColor, 'theme.primaryColor', errors, { max: 100 });
    stringValue(value.theme.accentColor, 'theme.accentColor', errors, { max: 100 });
    stringValue(value.theme.textColor, 'theme.textColor', errors, { max: 100 });
  }
  if (!Array.isArray(value.body) || value.body.length > 200) {
    errors.push('body must be an array with at most 200 blocks.');
  } else {
    const ids = new Set<string>();
    value.body.forEach((item, index) => block(item, `body[${index}]`, errors, ids, 0));
  }
  return errors.slice(0, 50);
}
