type RecordValue = Record<string, unknown>;

const object = (value: unknown): RecordValue =>
  value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};

const csvCell = (value: unknown): string => {
  let text = value === null || value === undefined ? "" : String(value);
  // Spreadsheet applications can execute cells beginning with these characters.
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export function stage5ParameterRegisterCsv(geometry: unknown): string {
  const parameters = Array.isArray(object(geometry).parameters)
    ? (object(geometry).parameters as unknown[]).map(object)
    : [];
  const rows = parameters.map(parameter => [
    parameter.key,
    parameter.label,
    parameter.value,
    parameter.unit,
    parameter.classification,
    parameter.note,
  ]);
  const header = ["Key", "Parameter", "Value", "Unit", "Classification", "Provenance / formula / note"];
  return "\uFEFF" + [header, ...rows].map(row => row.map(csvCell).join(",")).join("\r\n");
}
