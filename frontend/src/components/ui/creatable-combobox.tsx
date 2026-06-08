'use client';

import * as React from 'react';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

interface CreatableComboboxProps {
  /** Existing values to suggest (e.g. categories already in use). */
  options: string[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  /** Label template for the create row; "{value}" is replaced with the typed text. */
  createLabel?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * A searchable select for open-ended string values: pick an existing value or
 * type a new one to create it. The committed value is the raw string (not an
 * id), so it's a drop-in upgrade for a free-text <Input>.
 */
export function CreatableCombobox({
  options,
  value,
  onValueChange,
  placeholder = 'Select or type…',
  searchPlaceholder = 'Search or add…',
  createLabel = 'Create "{value}"',
  disabled,
  className,
}: CreatableComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');

  const sorted = React.useMemo(
    () => Array.from(new Set(options.filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [options],
  );
  const trimmed = query.trim();
  const exactExists = sorted.some((o) => o.toLowerCase() === trimmed.toLowerCase());

  const commit = (next: string) => {
    onValueChange(next);
    setQuery('');
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', !value && 'text-muted-foreground', className)}
        >
          <span className="truncate">{value || placeholder}</span>
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput value={query} onValueChange={setQuery} placeholder={searchPlaceholder} />
          <CommandList>
            {sorted.length === 0 && !trimmed && <CommandEmpty>{searchPlaceholder}</CommandEmpty>}
            <CommandGroup>
              {sorted.map((opt) => (
                <CommandItem key={opt} value={opt} onSelect={() => commit(opt)}>
                  <Check className={cn('me-2 h-4 w-4', value === opt ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{opt}</span>
                </CommandItem>
              ))}
              {trimmed && !exactExists && (
                <CommandItem value={`__create__${trimmed}`} onSelect={() => commit(trimmed)}>
                  <Plus className="me-2 h-4 w-4" />
                  <span className="truncate">{createLabel.replace('{value}', trimmed)}</span>
                </CommandItem>
              )}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
