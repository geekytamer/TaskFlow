'use client';

import { useState } from 'react';
import { ChevronsUpDown, Check } from 'lucide-react';
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
import { CompanyMark } from './company-mark';

export function CompanySwitcher() {
  const [open, setOpen] = useState(false);
  const { companies, selectedCompany, setSelectedCompany } = useCompany();
  const { t } = useI18n();

  if (!selectedCompany) {
    return null;
  }
  
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-[250px] justify-between"
        >
          <div className="flex items-center gap-2">
            <CompanyMark company={selectedCompany} className="h-6 w-6" />
            <span className="truncate">{selectedCompany.name}</span>
          </div>
          <ChevronsUpDown className="ms-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[250px] p-0">
        <Command>
          <CommandInput placeholder={t('company.search')} />
          <CommandList>
            <CommandEmpty>{t('company.none')}</CommandEmpty>
            <CommandGroup>
              {companies.map((company) => (
                <CommandItem
                  key={company.id}
                  value={company.name}
                  onSelect={() => {
                    setSelectedCompany(company);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      'me-2 h-4 w-4',
                      selectedCompany.id === company.id
                        ? 'opacity-100'
                        : 'opacity-0'
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
