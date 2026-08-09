// ── CPS Sizing Tool — New Sizing Case ────────────────────────────────────────
// Two tabs: Customer Inputs (input capture form) and Output Sizing
// (placeholder — sizing calculations NOT implemented).
import { useLocation } from "wouter";
import Layout from "@/components/layout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FilePlus2, Calculator, ClipboardList } from "lucide-react";
import { CpsSizingNav } from "./cps-sizing-shared";
import CpsSizingCaseForm from "./cps-sizing-case-form";
import CpsOutputSizing from "./cps-output-sizing";

export default function CpsSizingNewCasePage() {
  const [, navigate] = useLocation();
  return (
    <Layout>
      <div className="p-6 max-w-5xl mx-auto space-y-4">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2" data-testid="text-page-title">
            <FilePlus2 className="w-6 h-6" /> CPS Sizing Tool — New Sizing Case
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Capture the customer's sizing inputs and view the system sizing output.
          </p>
        </div>
        <CpsSizingNav />
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
                editing={null}
                onSaved={() => navigate("/design-software/cps-sizing")}
                onCancel={() => navigate("/design-software/cps-sizing")}
              />
            </div>
          </TabsContent>
          <TabsContent value="output-sizing" className="mt-4">
            <CpsOutputSizing sizingCase={null} />
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
}
