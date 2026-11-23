// Reads the first sheet of an .xlsx file into rows of text, with nothing but
// Node itself: an .xlsx is a zip of XML files, so this finds the zip's
// directory, inflates the three parts it needs (the workbook, its shared
// strings and the first sheet) and reads the cells. Enough for store lists
// and the like; formulas give their saved value, dates their serial number.
import { inflateRawSync } from 'node:zlib';

const bad = (message) => Object.assign(new Error(message), { status: 400 });

// The zip's central directory: name → { method, offset, size }.
function entries(buf) {
  let end = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 66000); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      end = i;
      break;
    }
  }
  if (end === -1) throw bad('That file is not an Excel (.xlsx) file.');
  const count = buf.readUInt16LE(end + 10);
  let at = buf.readUInt32LE(end + 16);
  const out = new Map();
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw bad('That Excel file looks damaged.');
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const offset = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    out.set(name, { method, offset, size });
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

function read(buf, list, name) {
  const e = list.get(name);
  if (!e) return null;
  if (buf.readUInt32LE(e.offset) !== 0x04034b50) throw bad('That Excel file looks damaged.');
  const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
  const data = buf.subarray(start, start + e.size);
  if (e.method === 0) return data.toString('utf8');
  if (e.method === 8) return inflateRawSync(data, { maxOutputLength: 64 * 1024 * 1024 }).toString('utf8');
  throw bad('That Excel file uses a kind of compression this can’t read. Save it again from Excel or Google Sheets.');
}

const unescape = (s) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, '&');

// All the <t> text inside a piece of XML, joined (rich text has several runs).
const textOf = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => unescape(m[1])).join('');

// "BC12" → 54 (zero-based column).
function columnIndex(ref) {
  const letters = /^[A-Z]+/.exec(ref)?.[0] || 'A';
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

// The first sheet as an array of rows, each an array of trimmed strings.
export function readXlsx(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 100) throw bad('That file is empty or not an Excel file.');
  const list = entries(buf);
  const workbook = read(buf, list, 'xl/workbook.xml');
  if (!workbook) throw bad('That file is not an Excel (.xlsx) file.');
  // The first sheet's file, through the workbook's relationships.
  const firstId = /<sheet\b[^>]*\br:id="([^"]+)"/.exec(workbook)?.[1];
  const rels = read(buf, list, 'xl/_rels/workbook.xml.rels') || '';
  let target = null;
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    if (new RegExp(`\\bId="${firstId}"`).test(m[0])) target = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
  }
  const sheetPath = target ? (target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`) : 'xl/worksheets/sheet1.xml';
  const sheet = read(buf, list, sheetPath) || read(buf, list, 'xl/worksheets/sheet1.xml');
  if (!sheet) throw bad('That Excel file has no sheet to read.');
  const sharedXml = read(buf, list, 'xl/sharedStrings.xml') || '';
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]));

  const rows = [];
  for (const rowMatch of sheet.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
    const row = [];
    for (const c of rowMatch[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = c[1];
      const inner = c[2] || '';
      const ref = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
      const type = /\bt="([^"]+)"/.exec(attrs)?.[1];
      const v = /<v>([\s\S]*?)<\/v>/.exec(inner)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(v)] ?? '';
      else if (type === 'inlineStr') value = textOf(inner);
      else if (v != null) value = unescape(v);
      const col = ref ? columnIndex(ref) : row.length;
      while (row.length < col) row.push('');
      row[col] = String(value).replace(/\s+/g, ' ').trim();
    }
    rows.push(row);
  }
  return rows.filter((r) => r.some((x) => x));
}
