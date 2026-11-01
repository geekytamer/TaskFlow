'use client';

import * as React from 'react';
import { Textarea } from '@/components/ui/textarea';

type Person = { id: string; name: string };

/**
 * A text box where "@" suggests colleagues. Picking one writes "@Name" into the
 * text and remembers who it was; `mentionIds` lists the people still named in it.
 */
export function useMentions(text: string) {
  const [picked, setPicked] = React.useState<Record<string, string>>({});
  const mentionIds = Object.entries(picked).filter(([, name]) => text.includes(`@${name}`)).map(([id]) => id);
  return { picked, setPicked, mentionIds, reset: () => setPicked({}) };
}

export function MentionTextarea({
  value,
  onChange,
  people,
  onPick,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  people: Person[];
  onPick: (person: Person) => void;
  placeholder?: string;
  className?: string;
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null);
  const at = /(?:^|\s)@([^\s@]*)$/.exec(value);
  const suggestions = at ? people.filter((p) => p.name.toLowerCase().includes(at[1].toLowerCase())).slice(0, 6) : [];

  const pick = (person: Person) => {
    onChange(value.replace(/@([^\s@]*)$/, `@${person.name} `));
    onPick(person);
    ref.current?.focus();
  };

  return (
    <div className="relative">
      <Textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (suggestions.length > 0 && (e.key === 'Enter' || e.key === 'Tab')) {
            e.preventDefault();
            pick(suggestions[0]);
          }
        }}
        placeholder={placeholder}
        className={className}
      />
      {suggestions.length > 0 && (
        <ul className="absolute start-0 top-full z-20 mt-1 w-64 overflow-hidden rounded-md border bg-popover shadow-md" role="listbox">
          {suggestions.map((person) => (
            <li key={person.id}>
              <button
                type="button"
                onMouseDown={(e) => { e.preventDefault(); pick(person); }}
                className="w-full px-3 py-2 text-start text-sm hover:bg-muted"
              >
                <bdi>{person.name}</bdi>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
