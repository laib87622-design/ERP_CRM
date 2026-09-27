const escapeCsvValue = (value) => {
  const sanitized = value == null ? '' : String(value).replace(/\r?\n/g, ' ');
  return `"${sanitized.replace(/"/g, '""')}"`;
};

export function exportToCSV(rows, filename = 'export.csv') {
  if (!Array.isArray(rows) || rows.length === 0) {
    console.warn('CSV export skipped because there are no rows to export.');
    return false;
  }

  const normalizedRows = rows.map((row) => {
    if (!row || typeof row !== 'object') {
      return { value: row };
    }

    return Object.fromEntries(
      Object.entries(row).map(([key, value]) => {
        if (value === null || value === undefined) return [key, ''];
        if (typeof value === 'object') {
          if (value instanceof Date) return [key, value.toISOString()];
          if (Array.isArray(value)) return [key, value.join('; ')];
          return [key, JSON.stringify(value)];
        }
        return [key, String(value)];
      })
    );
  });

  const headers = [...new Set(normalizedRows.flatMap((row) => Object.keys(row)))];

  const csvContent = [
    headers.map((header) => escapeCsvValue(header)).join(','),
    ...normalizedRows.map((row) =>
      headers
        .map((header) => escapeCsvValue(row[header] ?? ''))
        .join(',')
    ),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');

  link.href = url;
  link.setAttribute('download', filename.endsWith('.csv') ? filename : `${filename}.csv`);
  link.style.display = 'none';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
  return true;
}

export default exportToCSV;
