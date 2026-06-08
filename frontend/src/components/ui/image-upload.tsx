'use client';

import * as React from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useI18n } from '@/context/i18n-context';

const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

interface ImageUploadProps {
  value?: string;
  onChange: (value?: string) => void;
  label: string;
}

export function ImageUpload({ value, onChange, label }: ImageUploadProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { t } = useI18n();

  const readFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast({ variant: 'destructive', title: t('upload.invalidFile'), description: t('upload.chooseImage') });
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast({ variant: 'destructive', title: t('upload.imageTooLarge'), description: t('upload.maxSize') });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => onChange(typeof reader.result === 'string' ? reader.result : undefined);
    reader.readAsDataURL(file);
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml"
        className="hidden"
        onChange={(event) => readFile(event.target.files?.[0])}
      />
      <Button type="button" variant="outline" onClick={() => inputRef.current?.click()}>
        <ImagePlus className="me-2 h-4 w-4" />
        {label}
      </Button>
      {value && (
        <Button type="button" variant="ghost" size="icon" onClick={() => onChange(undefined)}>
          <Trash2 className="h-4 w-4" />
          <span className="sr-only">{t('upload.removeImage')}</span>
        </Button>
      )}
    </div>
  );
}
