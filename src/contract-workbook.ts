import { unzipSync, strFromU8 } from 'fflate';

// Read locally selected XLSX files. Workbook content never goes to a parsing server.
// Only cell values are read; formulas, macros, links and embedded objects are not run.
export type ContractWorkbook = Record<string, unknown[][]>;
const MAIN_NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_XML_BYTES = 24 * 1024 * 1024;

function parseXML(text: string, part: string): Document {
  const document = new DOMParser().parseFromString(text, 'application/xml');
  if (document.getElementsByTagName('parsererror').length) {
    throw new Error(`Excelの${part}を読み取れませんでした。Excelで保存し直してから選択してください。`);
  }
  return document;
}

function descendants(parent: Document | Element, tag: string): Element[] {
  return Array.from(parent.getElementsByTagName('*')).filter(element => element.localName === tag);
}

// Excel ruby readings live in rPh; textContent would append them to Japanese labels.
function cellText(parent?: Element): string {
  if (!parent) return '';
  return Array.from(parent.children).map(child => {
    if (child.localName === 't') return child.textContent || '';
    if (child.localName === 'r') return Array.from(child.children)
      .filter(node => node.localName === 't').map(node => node.textContent || '').join('');
    return '';
  }).join('');
}

function columnIndex(address: string): number {
  const letters = address.match(/^[A-Za-z]+/)?.[0];
  if (!letters) return -1;
  let result = 0;
  for (const letter of letters.toUpperCase()) result = result * 26 + letter.charCodeAt(0) - 64;
  return result - 1;
}

function resolvePart(target: string): string | undefined {
  const parts: string[] = [];
  for (const part of (target.startsWith('/') ? target.slice(1) : `xl/${target}`).split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  const path = parts.join('/');
  return /^xl\/worksheets\/[^/]+\.xml$/.test(path) ? path : undefined;
}

function isDateFormat(id: number, custom: Map<number, string>): boolean {
  if ((id >= 14 && id <= 17) || id === 22 || (id >= 27 && id <= 36) || (id >= 50 && id <= 58)) return true;
  const format = (custom.get(id) || '').replace(/"[^"]*"|\[[^\]]*\]|\\./g, '');
  return /[yd]/i.test(format) && /[md]/i.test(format);
}

function excelDate(serial: number, date1904: boolean): string | undefined {
  const offset = date1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, serial < 60 ? 31 : 30);
  const date = new Date(offset + Math.floor(serial) * 86400000);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : undefined;
}

export function decodeContractWorkbook(bytes: Uint8Array): ContractWorkbook {
  if (bytes.byteLength > MAX_FILE_BYTES) throw new Error('Excelファイルは10MB以下を選択してください。');
  let totalBytes = 0;
  let parts: Record<string, Uint8Array>;
  try {
    parts = unzipSync(bytes, {
      filter(file) {
        const wanted = /^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(file.name);
        if (!wanted) return false;
        totalBytes += file.originalSize;
        if (totalBytes > MAX_XML_BYTES) throw new Error('too-large');
        return true;
      },
    });
  } catch {
    throw new Error('Excelファイルを開けませんでした。パスワードのない.xlsxファイルを選択してください。');
  }
  const read = (path: string): Document | undefined => parts[path] ? parseXML(strFromU8(parts[path]), path) : undefined;
  const workbook = read('xl/workbook.xml');
  const relations = read('xl/_rels/workbook.xml.rels');
  if (!workbook || !relations) throw new Error('Excelのワークシートが見つかりませんでした。');
  const date1904 = ['1', 'true'].includes(descendants(workbook, 'workbookPr')[0]?.getAttribute('date1904') || '');
  const shared = read('xl/sharedStrings.xml');
  const strings = shared ? descendants(shared, 'si').map(cellText) : [];
  const styles = read('xl/styles.xml');
  const formats = new Map<number, string>(styles ? descendants(styles, 'numFmt').map(item => [Number(item.getAttribute('numFmtId')), item.getAttribute('formatCode') || '']) : []);
  const xfs = styles ? descendants(styles, 'cellXfs')[0] : undefined;
  const styleFormats = xfs ? Array.from(xfs.children).map(item => Number(item.getAttribute('numFmtId'))) : [];
  const targets = new Map<string, string>();
  for (const rel of descendants(relations, 'Relationship')) {
    if (rel.getAttribute('TargetMode') === 'External') continue;
    const target = resolvePart(rel.getAttribute('Target') || '');
    if (target) targets.set(rel.getAttribute('Id') || '', target);
  }
  const output: ContractWorkbook = Object.create(null);
  for (const sheet of descendants(workbook, 'sheet')) {
    const name = sheet.getAttribute('name');
    const target = targets.get(sheet.getAttributeNS(REL_NS, 'id') || sheet.getAttribute('r:id') || '');
    if (!name || !target) continue;
    const xml = read(target);
    if (!xml) continue;
    const rows: unknown[][] = [];
    let count = 0;
    for (const row of descendants(xml, 'row')) {
      const rowIndex = Number(row.getAttribute('r')) - 1;
      if (!Number.isInteger(rowIndex) || rowIndex < 0 || rowIndex > 10000) continue;
      const values: unknown[] = [];
      for (const cell of Array.from(row.children).filter(item => item.localName === 'c')) {
        if (++count > 100000) throw new Error('この契約表は大きすぎます。契約一覧のシートだけを保存して選択してください。');
        const column = columnIndex(cell.getAttribute('r') || '');
        if (column < 0 || column > 255) continue;
        const type = cell.getAttribute('t');
        const raw = cell.getElementsByTagNameNS(MAIN_NS, 'v')[0]?.textContent ?? descendants(cell, 'v')[0]?.textContent;
        if (type === 'inlineStr') values[column] = cellText(descendants(cell, 'is')[0]);
        else if (type === 's') values[column] = strings[Number(raw)] ?? '';
        else if (type === 'str') values[column] = raw || '';
        else if (type === 'd') values[column] = raw && /^\d{4}-\d{2}-\d{2}(?:T|$)/.test(raw) ? raw.slice(0, 10) : '';
        else if (type === 'b') values[column] = raw === '1';
        else if (type === 'e' || raw == null || raw.trim() === '') continue;
        else {
          const value = Number(raw);
          if (!Number.isFinite(value)) continue;
          const formatId = styleFormats[Number(cell.getAttribute('s') || 0)] || 0;
          const format = formats.get(formatId) || '';
          if (isDateFormat(formatId, formats)) values[column] = excelDate(value, date1904);
          else if (/^0{8,}$/.test(format)) values[column] = String(Math.trunc(value)).padStart(format.length, '0');
          else values[column] = value;
        }
      }
      rows[rowIndex] = values;
    }
    output[name] = Array.from({ length: rows.length }, (_, i) => rows[i] || []);
  }
  if (!Object.keys(output).length) throw new Error('読み取れるワークシートがありません。');
  return output;
}

export async function readContractWorkbook(file: File): Promise<ContractWorkbook> {
  if (!/\.xlsx$/i.test(file.name)) throw new Error('契約チェックシートの.xlsxファイルを選択してください。');
  if (file.size > MAX_FILE_BYTES) throw new Error('Excelファイルは10MB以下を選択してください。');
  return decodeContractWorkbook(new Uint8Array(await file.arrayBuffer()));
}
