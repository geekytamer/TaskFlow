'use client';

import * as React from 'react';
import { Building2, Check, ChevronDown, Layers } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { isGroupCompany, treeOrder, type TreeCompany } from '@/lib/company-tree';

type Tr = (en: string, ar: string) => string;
export interface AssistantScope { companyId: string; scope: 'company' | 'group' }
type Named = TreeCompany & { id: string; name: string };

/** What the assistant works on when the app has this company selected: a group means its whole group. */
export const defaultScope = (companies: readonly Named[], companyId: string): AssistantScope =>
  ({ companyId, scope: isGroupCompany(companies, companyId) ? 'group' : 'company' });

export const scopeKey = (s: AssistantScope) => `${s.companyId}:${s.scope}`;

/**
 * Which companies the assistant works on, chosen in the assistant itself (the
 * app's selected company stays as it is). Every company the person can open,
 * as a tree: a group first as "whole group" (every company under it they can
 * open), then its companies one by one.
 */
export function AssistantContextSwitcher({ companies, value, onChange, tr, compact, disabled }: {
  companies: readonly Named[];
  value: AssistantScope;
  onChange: (next: AssistantScope) => void;
  tr: Tr;
  compact?: boolean;
  disabled?: boolean;
}) {
  const current = companies.find((c) => c.id === value.companyId);
  const isWhole = value.scope === 'group';
  const label = current ? current.name : tr('Choose a company', 'اختر شركة');
  const ordered = treeOrder(companies as Named[]);
  const Icon = isWhole ? Layers : Building2;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={disabled}
          className={cn('h-8 min-w-0 gap-1.5 px-2.5', compact ? 'max-w-[11rem]' : 'max-w-[18rem]')}
          aria-label={tr(`Assistant works on: ${label}${isWhole ? ' (whole group)' : ''}`, `يعمل المساعد على: ${label}${isWhole ? ' (المجموعة كاملة)' : ''}`)}>
          <Icon className={cn('h-3.5 w-3.5 shrink-0', isWhole && 'text-primary')} />
          <span className="min-w-0 truncate">{label}</span>
          {isWhole ? <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">{tr('whole group', 'المجموعة')}</span> : null}
          <ChevronDown className="h-3.5 w-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="max-h-[22rem] w-72 overflow-y-auto">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          {tr('The assistant works on', 'يعمل المساعد على')}
        </DropdownMenuLabel>
        {ordered.map(({ company, depth }, i) => {
          const group = isGroupCompany(companies, company.id);
          const items: React.ReactNode[] = [];
          if (group) {
            if (i > 0) items.push(<DropdownMenuSeparator key={`sep-${company.id}`} />);
            const on = value.companyId === company.id && value.scope === 'group';
            items.push(
              <DropdownMenuItem key={`${company.id}:group`} onSelect={() => onChange({ companyId: company.id, scope: 'group' })} className="gap-2">
                <Layers className="h-4 w-4 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{company.name}</span>
                  <span className="block text-xs text-muted-foreground">{tr('Whole group: the companies in it you can open', 'المجموعة كاملة: شركاتها التي تستطيع فتحها')}</span>
                </span>
                {on ? <Check className="h-4 w-4 shrink-0" /> : null}
              </DropdownMenuItem>,
            );
            return items;
          }
          const on = value.companyId === company.id && value.scope === 'company';
          items.push(
            <DropdownMenuItem key={`${company.id}:company`} onSelect={() => onChange({ companyId: company.id, scope: 'company' })} className="gap-2">
              <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" style={{ marginInlineStart: `${Math.min(depth, 3) * 0.75}rem` }} />
              <span className="min-w-0 flex-1 truncate">{company.name}</span>
              {on ? <Check className="h-4 w-4 shrink-0" /> : null}
            </DropdownMenuItem>,
          );
          return items;
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
