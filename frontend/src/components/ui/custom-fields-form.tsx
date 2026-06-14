'use client';

import * as React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { CustomFieldDefinition } from '@/services/customFieldService';

/**
 * Renders editable inputs for a set of custom field definitions. Values are a
 * flat map keyed by each definition's `key`; onChange returns the next map.
 */
export function CustomFieldsForm({
  definitions,
  values,
  onChange,
  disabled,
}: {
  definitions: CustomFieldDefinition[];
  values: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
  disabled?: boolean;
}) {
  if (definitions.length === 0) return null;

  const set = (key: string, value: unknown) => {
    const next = { ...values };
    if (value === undefined || value === '' || value === null) {
      delete next[key];
    } else {
      next[key] = value;
    }
    onChange(next);
  };

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {definitions.map((def) => {
        const value = values[def.key];
        return (
          <div key={def.id} className="space-y-1">
            <Label>
              {def.label}
              {def.required ? <span className="ms-1 text-destructive">*</span> : null}
            </Label>
            {def.fieldType === 'text' && (
              <Input
                value={value === undefined || value === null ? '' : String(value)}
                onChange={(e) => set(def.key, e.target.value)}
                disabled={disabled}
              />
            )}
            {def.fieldType === 'number' && (
              <Input
                type="number"
                value={value === undefined || value === null ? '' : String(value)}
                onChange={(e) => set(def.key, e.target.value === '' ? '' : Number(e.target.value))}
                disabled={disabled}
              />
            )}
            {def.fieldType === 'date' && (
              <Input
                type="date"
                value={value ? String(value).slice(0, 10) : ''}
                onChange={(e) => set(def.key, e.target.value)}
                disabled={disabled}
              />
            )}
            {def.fieldType === 'boolean' && (
              <div className="flex h-10 items-center">
                <Switch
                  checked={value === true}
                  onCheckedChange={(checked) => set(def.key, checked)}
                  disabled={disabled}
                />
              </div>
            )}
            {def.fieldType === 'select' && (
              <Select
                value={value ? String(value) : ''}
                onValueChange={(v) => set(def.key, v)}
                disabled={disabled}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {(def.options || []).map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        );
      })}
    </div>
  );
}
