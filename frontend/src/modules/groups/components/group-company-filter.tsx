'use client';

/**
 * Which companies of the group a page is showing. One control, used by every
 * page that can show a whole group, so the choice means the same everywhere
 * and is remembered per group.
 */
import * as React from 'react';
import { Building2, Check, ChevronsUpDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useGroupScope } from '@/context/group-scope-context';
import { useI18n } from '@/context/i18n-context';

export function GroupCompanyFilter({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false);
  const { group, filter, setFilter, companyName } = useGroupScope();
  const { language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);

  // A group of one company has nothing to filter.
  if (!group || group.companyIds.length < 2) return null;

  const name = companyName;
  const chosen = filter.length ? filter : group.companyIds;
  const label = filter.length === 0
    ? tr('All companies', 'كل الشركات')
    : filter.length === 1
      ? name(filter[0])
      : tr(`${filter.length} companies`, `${filter.length} شركات`);

  const toggle = (id: string) => {
    // From the whole group, picking a company means "just this one" — the
    // reason to touch the filter. After that each click adds or removes.
    if (filter.length === 0) {
      setFilter(group.companyIds.length === 1 ? [] : [id]);
      return;
    }
    const next = filter.includes(id) ? filter.filter((x) => x !== id) : [...filter, id];
    // Nothing left, or everything, is the whole group again.
    setFilter(next.length === 0 || next.length === group.companyIds.length ? [] : next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" role="combobox" aria-expanded={open} className={cn('gap-2', className)}>
          <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <span className="max-w-[12rem] truncate">{label}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="end">
        <Command>
          <CommandInput placeholder={tr('Find a company', 'ابحث عن شركة')} />
          <CommandList>
            <CommandEmpty>{tr('No company matches.', 'لا توجد شركة مطابقة.')}</CommandEmpty>
            <CommandGroup>
              <CommandItem value={tr('All companies', 'كل الشركات')} onSelect={() => { setFilter([]); setOpen(false); }}>
                <Check className={cn('me-2 h-4 w-4', filter.length === 0 ? 'opacity-100' : 'opacity-0')} />
                {tr('All companies', 'كل الشركات')}
              </CommandItem>
              {group.companyIds.map((id) => (
                <CommandItem key={id} value={name(id)} onSelect={() => toggle(id)}>
                  <Check className={cn('me-2 h-4 w-4', filter.length > 0 && chosen.includes(id) ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{name(id)}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
