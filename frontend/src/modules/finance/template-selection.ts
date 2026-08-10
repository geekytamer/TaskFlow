import type { InvoiceTemplate } from '@/modules/finance/types';

type SelectableTemplate = Pick<InvoiceTemplate, 'id' | 'isDefault'>;

export function chooseTemplateId(
  templates: SelectableTemplate[],
  currentTemplateId?: string,
): string {
  if (currentTemplateId && templates.some((template) => template.id === currentTemplateId)) {
    return currentTemplateId;
  }

  return (templates.find((template) => template.isDefault) ?? templates[0])?.id ?? '';
}
