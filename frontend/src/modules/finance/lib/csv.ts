export function downloadCsv(
  filename: string,
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
) {
  const csv = toCsv(headers, rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function toCsv(
  headers: string[],
  rows: Array<Array<string | number | boolean | null | undefined>>,
) {
  const headerRow = headers.map(escapeCsvValue).join(',');
  const bodyRows = rows.map((row) => row.map(escapeCsvValue).join(',')).join('\n');
  return bodyRows ? `${headerRow}\n${bodyRows}` : `${headerRow}\n`;
}

function escapeCsvValue(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) return '';
  const raw = String(value);
  if (raw.includes(',') || raw.includes('"') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

