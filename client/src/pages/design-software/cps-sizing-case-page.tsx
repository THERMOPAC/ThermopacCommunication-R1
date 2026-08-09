// ── CPS Sizing Tool — Sizing Case detail ─────────────────────────────────────
// Opens a saved sizing case in the same two-tab layout as New Sizing Case:
// Customer Inputs (editable shared form) and Output Sizing (placeholder —
// sizing calculations NOT implemented until authorized).
import { useLocation, useRoute } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import Layout from "@/components/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FolderOpen, Calculator, ClipboardList } from "lucide-react";
import { CpsSizingNav, SizingCase } from "./cps-sizing-shared";
import CpsSizingCaseForm from "./cps-sizing-case-form";
import CpsOutputSizing from "./cps-output-sizing";

export default function CpsSizingCasePage() {
  const [, navigate] = useLocation();
  const [, params] = useRoute("/design-software/cps-sizing/case/:id");
  const caseId = Number(params?.id);

  const casesQ = useQuery<SizingCase[]>({
    queryKey: ["/api/design-software/cps/sizing-cases"],
    queryFn: () => apiRequest("GET", "/api/design-software/cps/sizing-cases") as Promise<SizingCase[]>,
  });
  const sizingCase = (casesQ.data ?? []).find(c => c.id === caseId) ?? null;

  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-page-title">
            <FolderOpen className="w-6 h-6" /> CPS Sizing Case{sizingCase ? ` — ${sizingCase.customer_name}` : ""}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review or edit the customer's sizing inputs and view the system sizing output.
          </p>
        </div>
        <CpsSizingNav />
        {casesQ.isLoading && (
          <div className="text-sm text-muted-foreground py-8 text-center">Loading…</div>
        )}
        {!casesQ.isLoading && !sizingCase && (
          <div className="text-sm text-muted-foreground py-8 text-center" data-testid="text-not-found">
            Sizing case not found. It may have been deleted.
          </div>
        )}
        {sizingCase && (
          <Tabs defaultValue="customer-inputs">
            <TabsList>
              <TabsTrigger value="customer-inputs" data-testid="tab-customer-inputs">
                <ClipboardList className="w-4 h-4 mr-1.5" /> Customer Inputs
              </TabsTrigger>
              <TabsTrigger value="output-sizing" data-testid="tab-output-sizing">
                <Calculator className="w-4 h-4 mr-1.5" /> Output Sizing
              </TabsTrigger>
            </TabsList>
            <TabsContent value="customer-inputs" className="mt-4">
              <div className="border rounded-lg p-5">
                <CpsSizingCaseForm
                  key={sizingCase.id}
                  editing={sizingCase}
                  onSaved={() => navigate("/design-software/cps-sizing")}
                  onCancel={() => navigate("/design-software/cps-sizing")}
                />
              </div>
            </TabsContent>
            <TabsContent value="output-sizing" className="mt-4">
              <CpsOutputSizing sizingCase={sizingCase} />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </Layout>
  );
}
