'use client';

import * as React from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { apiFetch } from '@/lib/api-client';
import { buildCsv, downloadAuthedFile, downloadTextFile, parseCsv, readFileText } from '@/lib/csv';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Download, Upload, FileDown, CheckCircle2, AlertTriangle } from 'lucide-react';

type ImportResult = { created: number; failed: number; errors?: Array<{ row: number; error: string }> };

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
  template,
}: {
  exportPath: string;
  exportFilename: string;
  importPath: string;
  onImported?: () => void | Promise<void>;
  labels?: { export?: string; import?: string; template?: string };
  /** When provided, renders a "Template" button that downloads a header-only
   * (or single sample-row) CSV the user can fill in and import. */
  template?: { filename: string; columns: string[]; sample?: Record<string, string> };
}) {
  const { toast } = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);

  const handleExport = async () => {
    try {
      await downloadAuthedFile(exportPath, exportFilename);
    } catch (error) {
      toast({ variant: 'destructive', title: 'Export failed', description: error instanceof Error ? error.message : undefined });
    }
  };

  const handleTemplate = () => {
    if (!template) return;
    const sampleRow = template.sample
      ? [template.columns.map((c) => template.sample![c] ?? '')]
      : [];
    downloadTextFile(template.filename, buildCsv(template.columns, sampleRow));
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
      const imported = await apiFetch<ImportResult>(importPath, {
        method: 'POST',
        body: JSON.stringify({ rows }),
      });
      setResult(imported);
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
      {template && (
        <Button variant="outline" size="sm" className="gap-1" onClick={handleTemplate}>
          <FileDown className="h-4 w-4" />
          {labels?.template ?? 'Template'}
        </Button>
      )}
      <Button variant="outline" size="sm" className="gap-1" onClick={handleExport}>
        <Download className="h-4 w-4" />
        {labels?.export ?? 'Export'}
      </Button>
      <Button variant="outline" size="sm" className="gap-1" onClick={() => inputRef.current?.click()} disabled={busy}>
        <Upload className="h-4 w-4" />
        {busy ? 'Importing…' : labels?.import ?? 'Import'}
      </Button>

      <Dialog open={!!result} onOpenChange={(open) => { if (!open) setResult(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Import summary</DialogTitle>
          </DialogHeader>
          {result && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                <span><strong>{result.created}</strong> row{result.created === 1 ? '' : 's'} imported</span>
              </div>
              {result.failed > 0 && (
                <div className="flex items-center gap-2 text-amber-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span><strong>{result.failed}</strong> row{result.failed === 1 ? '' : 's'} skipped</span>
                </div>
              )}
              {result.errors && result.errors.length > 0 && (
                <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
                  {result.errors.map((e, i) => (
                    <div key={i} className="flex gap-2 px-3 py-1.5">
                      <span className="shrink-0 font-medium text-muted-foreground">Row {e.row}</span>
                      <span className="text-destructive">{e.error}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setResult(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
