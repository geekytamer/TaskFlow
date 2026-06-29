import * as React from 'react';

import { localizeUiPlaceholder } from '@/lib/ui-text';
import {cn} from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<'textarea'>>(
  ({className, placeholder, value, ...props}, ref) => {
    return (
      <textarea
        className={cn(
          'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
          className
        )}
        ref={ref}
        placeholder={localizeUiPlaceholder(placeholder) as string | undefined}
        // Coerce a null controlled value to '' so callers passing a nullable
        // field don't trigger React's "value should not be null" warning.
        value={value === null ? '' : value}
        {...props}
      />
    );
  }
);
Textarea.displayName = 'Textarea';

export {Textarea};
