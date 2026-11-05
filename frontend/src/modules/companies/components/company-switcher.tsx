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
import { useCompanyScope } from '@/context/company-scope-context';
import { isGroupCompany, treeOrder } from '@/lib/company-tree';
import { CompanyMark } from './company-mark';

/**
 * Where you are, and where you can go: your companies as a tree, each group
 * above the companies under it. A group is a company, so picking it is like
 * picking any company; its pages then show the whole group.
 */
export function CompanySwitcher() {
  const [open, setOpen] = useState(false);
  const { companies, selectedCompany, setSelectedCompany } = useCompany();
  const { t, language } = useI18n();
  const tr = (en: string, ar: string) => (language === 'ar' ? ar : en);
  const router = useRouter();
  const { isGroup } = useCompanyScope();

  if (!selectedCompany) {
    return null;
  }

  // A group is a company: picking it is picking a company, and its pages
  // show the whole group.
  const goToCompany = (company: typeof selectedCompany) => {
    const wasGroup = isGroup;
    setSelectedCompany(company);
    setOpen(false);
    if (wasGroup || isGroupCompany(companies, company.id)) router.push('/');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={selectedCompany.name}
          className="h-9 w-9 min-w-0 shrink justify-center px-0 md:w-[176px] md:justify-between md:px-3 lg:w-[220px] xl:w-[250px] xl:px-4"
          data-tutorial="company-switcher"
        >
          {/* Phones show just the company's mark; the name needs a wider screen. */}
          <div className="flex min-w-0 items-center gap-2">
            <CompanyMark company={selectedCompany} className="h-6 w-6" />
            <span className="hidden min-w-0 flex-col items-start md:flex">
              <span className="w-full truncate text-start leading-tight">
                {selectedCompany.name}
              </span>
              {isGroup && (
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
            <CommandGroup>
              {treeOrder(companies).map(({ company, depth }) => {
                const group = isGroupCompany(companies, company.id);
                return (
                  <CommandItem
                    key={company.id}
                    value={`${company.name} ${company.id}`}
                    onSelect={() => goToCompany(company)}
                    style={{ paddingInlineStart: `${0.5 + depth * 1.25}rem` }}
                  >
                    <Check className={cn('me-2 h-4 w-4 shrink-0', selectedCompany.id === company.id ? 'opacity-100' : 'opacity-0')} />
                    <CompanyMark company={company} className="me-2 h-6 w-6" />
                    <span className="min-w-0 flex-1 truncate">{company.name}</span>
                    {group && (
                      <span className="ms-2 inline-flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                        <Layers className="h-3 w-3" aria-hidden="true" />
                        {tr('Group', 'مجموعة')}
                      </span>
                    )}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
