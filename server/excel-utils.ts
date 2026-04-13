import ExcelJS from 'exceljs';

function getCellValue(cell: ExcelJS.Cell): any {
  const value = cell.value;
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'object') {
    if (value instanceof Date) return value;
    if ('richText' in value) return (value as ExcelJS.CellRichTextValue).richText.map((r: any) => r.text).join('');
    if ('text' in value) return (value as ExcelJS.CellHyperlinkValue).text;
    if ('formula' in value) return (value as ExcelJS.CellFormulaValue).result;
    if ('error' in value) return undefined;
    if ('sharedFormula' in value) return (value as ExcelJS.CellSharedFormulaValue).result;
  }
  return value;
}

export function sheetToJson(worksheet: ExcelJS.Worksheet): Record<string, any>[] {
  const data: Record<string, any>[] = [];
  const headers: Record<number, string> = {};
  let isFirstRow = true;

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    if (isFirstRow) {
      row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
        const val = getCellValue(cell);
        if (val !== undefined && val !== null) {
          headers[colNumber] = String(val).trim();
        }
      });
      isFirstRow = false;
    } else {
      const rowData: Record<string, any> = {};
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        if (headers[colNumber]) {
          const val = getCellValue(cell);
          if (val !== undefined) {
            rowData[headers[colNumber]] = val;
          }
        }
      });
      if (Object.keys(rowData).length > 0) {
        data.push(rowData);
      }
    }
  });

  return data;
}

export function sheetToJsonWithColLetters(worksheet: ExcelJS.Worksheet): Record<string, any>[] {
  const data: Record<string, any>[] = [];

  worksheet.eachRow({ includeEmpty: false }, (row) => {
    const rowData: Record<string, any> = {};
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const colLetter = String.fromCharCode(64 + colNumber);
      const val = getCellValue(cell);
      if (val !== undefined) {
        rowData[colLetter] = val;
      }
    });
    if (Object.keys(rowData).length > 0) {
      data.push(rowData);
    }
  });

  return data;
}

export async function buildExcelBuffer(
  sheetName: string,
  data: Record<string, any>[],
  columnWidths?: number[]
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(sheetName);

  if (data.length > 0) {
    const headers = Object.keys(data[0]);
    worksheet.columns = headers.map((h, i) => ({
      header: h,
      key: h,
      width: columnWidths?.[i] ?? 15,
    }));
    worksheet.addRows(data);
  }

  return workbook.xlsx.writeBuffer() as Promise<Buffer>;
}

export { ExcelJS };
