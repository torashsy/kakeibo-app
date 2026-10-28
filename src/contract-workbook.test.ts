// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { decodeContractWorkbook, readContractWorkbook } from './contract-workbook';

const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
const rel = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
function fixture(sheet: string, options: { shared?: string; styles?: string; date1904?: boolean; external?: boolean } = {}) {
  const files: Record<string, Uint8Array> = {
    'xl/workbook.xml': strToU8(`<workbook xmlns="${main}" xmlns:r="${rel}"><workbookPr date1904="${options.date1904 ? 1 : 0}"/><sheets><sheet name="契約一覧" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': strToU8(`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"${options.external ? ' TargetMode="External"' : ''}/></Relationships>`),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet xmlns="${main}"><sheetData>${sheet}</sheetData></worksheet>`),
  };
  if (options.shared) files['xl/sharedStrings.xml'] = strToU8(`<sst xmlns="${main}">${options.shared}</sst>`);
  if (options.styles) files['xl/styles.xml'] = strToU8(`<styleSheet xmlns="${main}">${options.styles}</styleSheet>`);
  return zipSync(files);
}

describe('local contract workbook reader', () => {
  it('keeps Japanese text without ruby, leading zeros, real zero and absent cells distinct', () => {
    const bytes = fixture('<row r="2"><c r="B2" t="s"><v>0</v></c><c r="C2" t="s"><v>1</v></c><c r="G2"><v>0</v></c><c r="I2" s="1"><v>46139</v></c></row>', {
      shared: '<si><t>電話番号</t><rPh sb="0" eb="4"><t>デンワバンゴウ</t></rPh></si><si><t>00000001234</t></si>',
      styles: '<numFmts count="1"><numFmt numFmtId="176" formatCode="yyyy-mm-dd"/></numFmts><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="176"/></cellXfs>',
    });
    const rows = decodeContractWorkbook(bytes)['契約一覧'];
    expect(rows[0]).toEqual([]);
    expect(rows[1][1]).toBe('電話番号');
    expect(rows[1][2]).toBe('00000001234');
    expect(rows[1][6]).toBe(0);
    expect(rows[1][7]).toBeUndefined();
    expect(rows[1][8]).toBe('2026-04-27');
  });

  it('reads rich inline text and a cached formula value without evaluating formulas', () => {
    const bytes = fixture('<row r="1"><c r="A1" t="inlineStr"><is><r><t>契約</t></r><r><t>チェック</t></r><rPh sb="0" eb="2"><t>ケイヤク</t></rPh></is></c><c r="B1"><f>1+2</f><v>7</v></c><c r="C1" t="e"><v>#REF!</v></c></row>');
    expect(decodeContractWorkbook(bytes)['契約一覧'][0]).toEqual(['契約チェック', 7]);
  });

  it('respects the Mac 1904 date system and numeric phone display padding', () => {
    const bytes = fixture('<row r="1"><c r="A1" s="1"><v>0</v></c><c r="B1" s="2"><v>1234</v></c></row>', {
      date1904: true,
      styles: '<numFmts count="1"><numFmt numFmtId="177" formatCode="00000000000"/></numFmts><cellXfs count="3"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="177"/></cellXfs>',
    });
    expect(decodeContractWorkbook(bytes)['契約一覧'][0]).toEqual(['1904-01-01', '00000001234']);
  });

  it('preserves the calendar date in ISO date cells and built-in date-time formats', () => {
    const bytes = fixture('<row r="1"><c r="A1" t="d"><v>2026-04-01T00:00:00+09:00</v></c><c r="B1" s="1"><v>46139.5</v></c></row>', {
      styles: '<cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="22"/></cellXfs>',
    });
    expect(decodeContractWorkbook(bytes)['契約一覧'][0]).toEqual(['2026-04-01', '2026-04-27']);
  });

  it('rejects non-workbooks and external worksheet relationships', () => {
    expect(() => decodeContractWorkbook(strToU8('not a workbook'))).toThrow('Excelファイルを開けません');
    expect(() => decodeContractWorkbook(zipSync({ 'note.txt': strToU8('example') }))).toThrow('ワークシート');
    expect(() => decodeContractWorkbook(fixture('<row r="1"/>', { external: true }))).toThrow('読み取れるワークシート');
  });

  it('uses the file API without accepting a different file type', async () => {
    const bytes = fixture('<row r="1"><c r="A1"><v>120</v></c></row>');
    const file = new File([bytes as BlobPart], 'contracts.xlsx');
    expect((await readContractWorkbook(file))['契約一覧'][0][0]).toBe(120);
    await expect(readContractWorkbook(new File(['example'], 'contracts.csv'))).rejects.toThrow('.xlsx');
  });
});
