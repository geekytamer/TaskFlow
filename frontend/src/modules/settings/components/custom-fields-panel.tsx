'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useCompany } from '@/context/company-context';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/context/i18n-context';
import {
  createCustomFieldDefinition,
  deleteCustomFieldDefinition,
  getCustomFieldDefinitions,
  type CustomFieldDefinition,
  type CustomFieldEntityType,
  type CustomFieldType,
} from '@/services/customFieldService';
import { Trash2 } from 'lucide-react';

const ENTITY_LABELS: Record<CustomFieldEntityType, { en: string; ar: string }> = {
  contact: { en: 'Contacts', ar: 'جهات الاتصال' },
  inventory_item: { en: 'Inventory items', ar: 'أصناف المخزون' },
};

const FIELD_TYPES: CustomFieldType[] = ['text', 'number', 'date', 'boolean', 'select'];

export function CustomFieldsPanel() {
  const { selectedCompany, currentRole } = useCompany();
  const { toast } = useToast();
  const { language } = useI18n();
  const tr = React.useCallback((en: string, ar: string) => (language === 'ar' ? ar : en), [language]);
  const canEdit = currentRole === 'Admin' || currentRole === 'Manager';

  const [definitions, setDefinitions] = React.useState<CustomFieldDefinition[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  // New-field form state.
  const [entityType, setEntityType] = React.useState<CustomFieldEntityType>('contact');
  const [label, setLabel] = React.useState('');
  const [fieldType, setFieldType] = React.useState<CustomFieldType>('text');
  const [options, setOptions] = React.useState('');
  const [required, setRequired] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!selectedCompany) {
      setDefinitions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      setDefinitions(await getCustomFieldDefinitions(selectedCompany.id));
    } finally {
      setLoading(false);
    }
  }, [selectedCompany]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    if (!selectedCompany) return;
    if (!label.trim()) {
      toast({ variant: 'destructive', title: tr('Label is required.', 'الاسم مطلوب.') });
      return;
    }
    const parsedOptions = options.split(',').map((o) => o.trim()).filter(Boolean);
    if (fieldType === 'select' && parsedOptions.length === 0) {
      toast({ variant: 'destructive', title: tr('Add at least one option.', 'أضف خياراً واحداً على الأقل.') });
      return;
    }
    setSaving(true);
    try {
      await createCustomFieldDefinition(selectedCompany.id, {
        entityType,
        label: label.trim(),
        fieldType,
        options: fieldType === 'select' ? parsedOptions : undefined,
        required,
      });
      setLabel('');
      setOptions('');
      setRequired(false);
      setFieldType('text');
      await load();
      toast({ title: tr('Custom field added', 'تمت إضافة الحقل') });
    } catch (error: any) {
      toast({
        variant: 'destructive',
        title: tr('Could not add field', 'تعذر إضافة الحقل'),
        description: error?.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(tr('Delete this custom field? Existing data is kept but hidden.', 'حذف هذا الحقل؟ تبقى البيانات الحالية لكنها تُخفى.'))) {
      return;
    }
    try {
      await deleteCustomFieldDefinition(id);
      await load();
      toast({ title: tr('Custom field deleted', 'تم حذف الحقل') });
    } catch (error: any) {
      toast({ variant: 'destructive', title: tr('Could not delete field', 'تعذر حذف الحقل'), description: error?.message });
    }
  };

  const byEntity = (type: CustomFieldEntityType) => definitions.filter((d) => d.entityType === type);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{tr('Custom fields', 'الحقول المخصصة')}</CardTitle>
        <CardDescription>
          {tr(
            'Define extra fields captured on contacts and inventory items.',
            'عرّف حقولاً إضافية تُسجَّل على جهات الاتصال وأصناف المخزون.',
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {canEdit && (
          <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-[180px_1fr_160px_1fr_auto] md:items-end">
            <div className="space-y-1">
              <Label>{tr('Applies to', 'يُطبّق على')}</Label>
              <Select value={entityType} onValueChange={(v) => setEntityType(v as CustomFieldEntityType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(ENTITY_LABELS) as CustomFieldEntityType[]).map((type) => (
                    <SelectItem key={type} value={type}>{tr(ENTITY_LABELS[type].en, ENTITY_LABELS[type].ar)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{tr('Label', 'الاسم')}</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={tr('e.g. Account Tier', 'مثال: فئة الحساب')} />
            </div>
            <div className="space-y-1">
              <Label>{tr('Type', 'النوع')}</Label>
              <Select value={fieldType} onValueChange={(v) => setFieldType(v as CustomFieldType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {FIELD_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>{tr('Options (comma-separated)', 'الخيارات (مفصولة بفواصل)')}</Label>
              <Input
                value={options}
                onChange={(e) => setOptions(e.target.value)}
                placeholder={tr('Gold, Silver, Bronze', 'ذهبي، فضي، برونزي')}
                disabled={fieldType !== 'select'}
              />
            </div>
            <div className="flex items-center gap-3 pb-1">
              <div className="flex items-center gap-2">
                <Switch checked={required} onCheckedChange={setRequired} />
                <span className="text-sm">{tr('Required', 'إلزامي')}</span>
              </div>
              <Button onClick={handleCreate} disabled={saving}>
                {saving ? tr('Adding…', 'جارٍ…') : tr('Add', 'إضافة')}
              </Button>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">{tr('Loading…', 'جارٍ التحميل…')}</p>
        ) : (
          (Object.keys(ENTITY_LABELS) as CustomFieldEntityType[]).map((type) => {
            const fields = byEntity(type);
            return (
              <div key={type} className="space-y-2">
                <h4 className="text-sm font-medium">{tr(ENTITY_LABELS[type].en, ENTITY_LABELS[type].ar)}</h4>
                {fields.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{tr('No custom fields yet.', 'لا توجد حقول مخصصة بعد.')}</p>
                ) : (
                  <div className="space-y-2">
                    {fields.map((def) => (
                      <div key={def.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">{def.label}</span>
                          <Badge variant="outline">{def.fieldType}</Badge>
                          {def.required && <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200">{tr('Required', 'إلزامي')}</Badge>}
                          {def.fieldType === 'select' && def.options && (
                            <span className="text-xs text-muted-foreground">{def.options.join(', ')}</span>
                          )}
                        </div>
                        {canEdit && (
                          <Button variant="ghost" size="sm" onClick={() => handleDelete(def.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
