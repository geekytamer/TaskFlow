'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronsUpDown, Check, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { useCompany } from '@/context/company-context';
import { useI18n } from '@/context/i18n-context';
import { useGroupScope } from '@/context/group-scope-context';
import { roleLabel } from '@/modules/authz/components/shared';
import { CompanyMark } from './company-mark';

/**
 * Where you are, and where you can go: the companies you belong to and, above
 * them, any group of companies you administer. A group is a scope of its own —
 * its page is not a company's — so picking one goes to that group's page, and
 * picking a company comes back to the company app.
 */
export function CompanySwitcher() {
  const [open, setOpen] = useState(false);
  const { companies, selectedCompany, setSelectedCompany } = useCompany();
  const { t, language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const router = useRouter();
  const { groups, group: currentGroup, enterGroup, leaveGroup } = useGroupScope();

  if (!selectedCompany) {
    return null;
  }

  // Entering a group puts the whole app in the group's scope; its pages show
  // every company at once. The dashboard is where that starts.
  const goToGroup = (next: (typeof groups)[number]) => {
    enterGroup(next);
    setOpen(false);
    router.push('/');
  };

  const goToCompany = (company: typeof selectedCompany) => {
    setSelectedCompany(company);
    setOpen(false);
    if (currentGroup) {
      leaveGroup();
      router.push('/');
    }
  };
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={currentGroup ? roleLabel(currentGroup, language) : selectedCompany.name}
          className="h-9 w-9 justify-center px-0 md:w-[250px] md:justify-between md:px-4"
          data-tutorial="company-switcher"
        >
          {/* Phones show just the company's mark; the name needs a wider screen. */}
          <div className="flex min-w-0 items-center gap-2">
            {currentGroup ? (
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-muted">
                <Layers className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            ) : (
              <CompanyMark company={selectedCompany} className="h-6 w-6" />
            )}
            <span className="hidden min-w-0 flex-col items-start md:flex">
              <span className="w-full truncate text-start leading-tight">
                {currentGroup ? roleLabel(currentGroup, language) : selectedCompany.name}
              </span>
              {currentGroup && (
                <span className="text-[10px] font-normal uppercase tracking-wide text-muted-foreground">
                  {tr('Group', 'مجموعة')}
                </span>
              )}
            </span>
          </div>
          <ChevronsUpDown className="ms-2 hidden h-4 w-4 shrink-0 opacity-50 md:block" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0" align="end">
        <Command>
          <CommandInput placeholder={t('company.search')} />
          <CommandList>
            <CommandEmpty>{t('company.none')}</CommandEmpty>
            {groups.length > 0 && (
              <CommandGroup heading={tr('Groups', 'المجموعات')}>
                {groups.map((group) => (
                  <CommandItem
                    key={group.id}
                    value={`${group.name} ${group.nameAr ?? ''}`}
                    onSelect={() => goToGroup(group)}
                  >
                    <Check className={cn('me-2 h-4 w-4', currentGroup?.id === group.id ? 'opacity-100' : 'opacity-0')} />
                    <span className="me-2 flex h-6 w-6 shrink-0 items-center justify-center rounded-md border bg-muted">
                      <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                    </span>
                    <span className="truncate">{roleLabel(group, language)}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            <CommandGroup heading={groups.length > 0 ? tr('Companies', 'الشركات') : undefined}>
              {companies.map((company) => (
                <CommandItem
                  key={company.id}
                  value={company.name}
                  onSelect={() => goToCompany(company)}
                >
                  <Check
                    className={cn(
                      'me-2 h-4 w-4',
                      !currentGroup && selectedCompany.id === company.id ? 'opacity-100' : 'opacity-0',
                    )}
                  />
                  <CompanyMark company={company} className="me-2 h-6 w-6" />
                  <span className="truncate">{company.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
