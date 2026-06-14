'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api-client';
import { downloadAuthedFile, parseCsv, readFileText } from '@/lib/csv';
import { Download, Upload } from 'lucide-react';

/**
 * Export + import a list as CSV. Export downloads from `exportPath`; import
 * parses the chosen file client-side and POSTs `{ rows }` to `importPath`,
 * expecting `{ created, failed, errors }` back.
 */
export function CsvImportExport({
  exportPath,
  exportFilename,
  importPath,
  onImported,
  labels,
}: {
  exportPath: string;
  exportFilename: string;
  importPath: string;
  onImported?: () => void | Promise<void>;
  labels?: { export?: string; import?: string };
}) {
  const { toast } = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);

  const handleExport = async () => {
    try {
      await downloadAuthedFile(exportPath, exportFilename);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Export failed', description: error instanceof Error ? error.message : undefined });
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setBusy(true);
    try {
      const rows = parseCsv(await readFileText(file));
      if (rows.length === 0) {
        toast({ variant: 'destructive', title: 'No rows found in the file.' });
        return;
      }
      const result = await apiFetch<{ created: number; failed: number }>(importPath, {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      toast({
        title: `Imported ${result.created} row${result.created === 1 ? '' : 's'}`,
        description: result.failed > 0 ? `${result.failed} row(s) were skipped.` : undefined,
        variant: result.failed > 0 ? 'destructive' : undefined,
      });
      await onImported?.();
    } catch (error) {
      toast({ variant: 'destructive', title: 'Import failed', description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          handleFile(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
      <Button variant="outline" size="sm" className="gap-1" onClick={handleExport}>
        <Download className="h-4 w-4" />
        {labels?.export ?? 'Export'}
      </Button>
      <Button variant="outline" size="sm" className="gap-1" onClick={() => inputRef.current?.click()} disabled={busy}>
        <Upload className="h-4 w-4" />
        {busy ? 'Importing…' : labels?.import ?? 'Import'}
      </Button>
    </>
  );
}
