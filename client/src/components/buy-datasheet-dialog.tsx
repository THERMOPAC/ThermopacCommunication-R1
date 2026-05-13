import { useState } from "react";
import { Document, Page, View, Text, StyleSheet, pdf } from "@react-pdf/renderer";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { FileSpreadsheet, Download, Loader2 } from "lucide-react";
import { buildDatasheetEntries } from "@/lib/buy-subgroup-fields";

export interface DatasheetLine {
  line_number?: number | null;
  generic_requirement?: string | null;
  default_specification?: string | null;
  technical_attributes?: Record<string, unknown> | null;
  notes?: string | null;
  tag_no?: string | null;
  model?: string | null;
  buy_subgroup_label?: string | null;
  buy_subgroup_code?: string | null;
  buy_group_code?: string | null;
  buy_group_label?: string | null;
  service_description?: string | null;
  equipment_reference?: string | null;
}

// ── PDF Styles ─────────────────────────────────────────────────────────────────
const S = StyleSheet.create({
  page:         { fontFamily: "Helvetica", fontSize: 9, color: "#1a1a1a", paddingTop: 30, paddingBottom: 40, paddingHorizontal: 35 },
  header:       { backgroundColor: "#1e3a5f", padding: "10 12", flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14, borderRadius: 2 },
  hLeft:        { color: "#ffffff" },
  hTitle:       { fontSize: 14, fontFamily: "Helvetica-Bold", letterSpacing: 1 },
  hSub:         { fontSize: 6.5, color: "#93c5fd", marginTop: 1 },
  hRight:       { color: "#ffffff", alignItems: "flex-end" },
  hBadge:       { fontSize: 10, fontFamily: "Helvetica-Bold", color: "#fbbf24" },
  hDate:        { fontSize: 6, color: "#93c5fd", marginTop: 2 },
  infoGrid:     { flexDirection: "row", gap: 5, marginBottom: 12 },
  infoBox:      { flex: 1, backgroundColor: "#f8fafc", borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 3, padding: "5 7" },
  infoLabel:    { fontSize: 6, color: "#64748b", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 2 },
  infoValue:    { fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#0f172a" },
  secTitle:     { fontSize: 7.5, fontFamily: "Helvetica-Bold", color: "#1e3a5f", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 5, borderBottomWidth: 1, borderBottomColor: "#bfdbfe", paddingBottom: 2 },
  reqBox:       { backgroundColor: "#eff6ff", borderWidth: 1, borderColor: "#bfdbfe", borderRadius: 3, padding: "6 8", marginBottom: 12 },
  reqText:      { fontSize: 9, color: "#1e40af", lineHeight: 1.4 },
  reqSub:       { fontSize: 8, color: "#3b82f6", marginTop: 3, lineHeight: 1.4 },
  attrTable:    { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 3, marginBottom: 12, overflow: "hidden" },
  attrRowEven:  { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f1f5f9", backgroundColor: "#ffffff" },
  attrRowOdd:   { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: "#f1f5f9", backgroundColor: "#f8fafc" },
  attrKey:      { width: "45%", padding: "4 7", fontSize: 8.5, color: "#64748b" },
  attrVal:      { width: "55%", padding: "4 7", fontSize: 8.5, fontFamily: "Helvetica-Bold", color: "#0f172a", borderLeftWidth: 1, borderLeftColor: "#e2e8f0" },
  notesBox:     { backgroundColor: "#fefce8", borderWidth: 1, borderColor: "#fde68a", borderRadius: 3, padding: "6 8", marginBottom: 12 },
  notesText:    { fontSize: 8.5, color: "#92400e", lineHeight: 1.4 },
  footer:       { position: "absolute", bottom: 18, left: 35, right: 35, flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: "#e2e8f0", paddingTop: 4 },
  footerText:   { fontSize: 6, color: "#94a3b8" },
});

// ── PDF Document component ─────────────────────────────────────────────────────
function BuyDatasheetPdfDocument({ line }: { line: DatasheetLine }) {
  const entries = buildDatasheetEntries(line.buy_subgroup_code, line.technical_attributes);
  const subgroupDisplay = line.buy_subgroup_label || line.buy_subgroup_code || "—";
  const groupDisplay    = line.buy_group_label    || line.buy_group_code    || "—";
  const now     = new Date();
  const dateStr = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}/${now.getFullYear()}`;

  return (
    <Document>
      <Page size="A4" style={S.page}>
        {/* ── Header ── */}
        <View style={S.header}>
          <View style={S.hLeft}>
            <Text style={S.hTitle}>THERMOPAC PROCESS ENGINEERING LLP</Text>
          </View>
          <View style={S.hRight}>
            <Text style={S.hBadge}>TECHNICAL DATASHEET</Text>
            <Text style={S.hDate}>Generated: {dateStr}</Text>
          </View>
        </View>

        {/* ── Info grid ── */}
        <View style={S.infoGrid}>
          <View style={S.infoBox}>
            <Text style={S.infoLabel}>Equipment Group</Text>
            <Text style={S.infoValue}>{groupDisplay}</Text>
          </View>
          <View style={S.infoBox}>
            <Text style={S.infoLabel}>Subgroup</Text>
            <Text style={S.infoValue}>{subgroupDisplay}</Text>
          </View>
          <View style={S.infoBox}>
            <Text style={S.infoLabel}>Line No.</Text>
            <Text style={S.infoValue}>{line.line_number ?? "—"}</Text>
          </View>
          <View style={S.infoBox}>
            <Text style={S.infoLabel}>Tag No.</Text>
            <Text style={S.infoValue}>{line.tag_no || "—"}</Text>
          </View>
          {line.model && line.model !== "TBN" && (
            <View style={S.infoBox}>
              <Text style={S.infoLabel}>Model</Text>
              <Text style={S.infoValue}>{line.model}</Text>
            </View>
          )}
        </View>

        {/* ── Requirement ── */}
        {line.generic_requirement && (
          <View style={{ marginBottom: 12 }}>
            <Text style={S.secTitle}>Requirement</Text>
            <View style={S.reqBox}>
              <Text style={S.reqText}>{line.generic_requirement}</Text>
              {line.default_specification && (
                <Text style={S.reqSub}>{line.default_specification}</Text>
              )}
            </View>
          </View>
        )}

        {/* ── Technical Specifications ── */}
        {entries.length > 0 && (
          <View style={{ marginBottom: 12 }}>
            <Text style={S.secTitle}>Technical Specifications</Text>
            <View style={S.attrTable}>
              {entries.map(({ label, value }, idx) => (
                <View key={label + idx} style={idx % 2 === 0 ? S.attrRowEven : S.attrRowOdd}>
                  <Text style={S.attrKey}>{label}</Text>
                  <Text style={S.attrVal}>{value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* ── Notes ── */}
        {line.notes && (
          <View style={{ marginBottom: 12 }}>
            <Text style={S.secTitle}>Notes</Text>
            <View style={S.notesBox}>
              <Text style={S.notesText}>{line.notes}</Text>
            </View>
          </View>
        )}

        {/* ── Footer ── */}
        <View style={S.footer} fixed>
          <Text style={S.footerText}>THERMOPAC Process Engineering LLP — THERMOPAC QMS</Text>
          <Text style={S.footerText}>CONFIDENTIAL — For internal use only</Text>
        </View>
      </Page>
    </Document>
  );
}

// ── PDF download helper ────────────────────────────────────────────────────────
export async function downloadDatasheetPdf(line: DatasheetLine): Promise<void> {
  const blob = await pdf(<BuyDatasheetPdfDocument line={line} />).toBlob();
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href     = url;
  const tag    = line.tag_no    ? `_${line.tag_no}`         : "";
  const lineNo = line.line_number ? `_L${line.line_number}` : "";
  a.download   = `Datasheet${lineNo}${tag}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Shared Preview Dialog ─────────────────────────────────────────────────────
export function DatasheetPreviewDialog({
  line, open, onClose,
}: { line: DatasheetLine | null; open: boolean; onClose: () => void }) {
  const [downloading, setDownloading] = useState(false);

  if (!line) return null;

  const entries  = buildDatasheetEntries(line.buy_subgroup_code, line.technical_attributes);
  const subLabel = line.buy_subgroup_label || line.buy_subgroup_code || "";

  async function handleDownload() {
    setDownloading(true);
    try {
      await downloadDatasheetPdf(line!);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Technical Datasheet
          </DialogTitle>
          {(subLabel || line.line_number) && (
            <DialogDescription>
              {subLabel}{subLabel && line.line_number ? " — " : ""}
              {line.line_number ? `Line ${line.line_number}` : ""}
            </DialogDescription>
          )}
        </DialogHeader>

        <div className="space-y-3 py-1 max-h-[58vh] overflow-y-auto pr-1">
          {line.generic_requirement && (
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Requirement</p>
              <p className="text-sm">{line.generic_requirement}</p>
              {line.default_specification && (
                <p className="text-xs text-muted-foreground mt-1">{line.default_specification}</p>
              )}
            </div>
          )}

          {entries.length > 0 ? (
            <div className="rounded-md border divide-y text-sm">
              {entries.map(({ label, value }, idx) => (
                <div key={label + idx} className="flex items-center justify-between px-3 py-1.5">
                  <span className="text-muted-foreground text-xs">{label}</span>
                  <span className="font-medium text-right ml-4 text-xs">{value}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No technical attributes recorded.</p>
          )}

          {line.notes && (
            <div className="rounded-md border bg-muted/40 px-3 py-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm">{line.notes}</p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            className="sm:mr-auto gap-2"
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Download className="h-4 w-4" />
            }
            Download PDF
          </Button>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
