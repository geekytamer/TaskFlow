'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { localizeUiText } from '@/lib/ui-text';

type SectionEmptyStateProps = {
  title: string;
  description: string;
};

export function SectionEmptyState({ title, description }: SectionEmptyStateProps) {
  const localizedTitle = localizeUiText(title);
  const localizedDescription = localizeUiText(description);
  return (
    <Card className="border-dashed bg-muted/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{localizedTitle}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{localizedDescription}</CardContent>
    </Card>
  );
}
