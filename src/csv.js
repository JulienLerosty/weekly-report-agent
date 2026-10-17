// Minimal RFC 4180 CSV parser (quotes, escaped quotes, CRLF).
export function parseCsv(text) {
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x !== '')) rows.push(row);
  if (!rows.length) throw new Error('CSV is empty');
  const [head, ...body] = rows;
  const header = head.map((h) => h.trim());
  return body.map((r, i) => {
    if (r.length !== header.length) throw new Error(`Row ${i + 2}: expected ${header.length} columns, got ${r.length}`);
    return Object.fromEntries(header.map((h, j) => [h, r[j].trim()]));
  });
}
