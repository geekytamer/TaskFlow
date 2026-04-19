'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type SectionEmptyStateProps = {
  title: string;
  description: string;
};

export function SectionEmptyState({ title, description }: SectionEmptyStateProps) {
  return (
    <Card className="border-dashed bg-muted/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">{description}</CardContent>
    </Card>
  );
}
