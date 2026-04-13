import ExcelJS from 'exceljs';

function triggerDownload(buffer: ArrayBuffer, filename: string) {
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function downloadExcelFromJson(
  data: Record<string, any>[],
  sheetName: string,
  filename: string,
  columnWidths?: number[]
) {
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

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer, filename);
}

export async function downloadExcelFromAoa(
  sheets: Array<{ name: string; data: any[][]; columnWidths?: number[] }>,
  filename: string
) {
  const workbook = new ExcelJS.Workbook();

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    if (sheet.data.length > 0) {
      worksheet.addRows(sheet.data);
    }
    if (sheet.columnWidths) {
      sheet.columnWidths.forEach((width, i) => {
        const col = worksheet.getColumn(i + 1);
        col.width = width;
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(buffer, filename);
}

export { ExcelJS };
