import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/layout";
import VendorManagement from "@/components/vendor-management";
import { Loader2 } from "lucide-react";
import { Customer } from "@shared/schema";
import { Helmet } from "react-helmet";

export default function VendorsPage() {
  const { data: allBPs, isLoading, error } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const vendors = (allBPs || []).filter(
    (bp) => (bp as any).cardType === "V" || (bp as any).cardType === "S"
  );

  return (
    <Layout>
      <Helmet>
        <title>Vendor Management | THERMOPAC</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight pl-4">Vendor / Supplier Management</h1>
        </div>

        <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="bg-destructive/10 p-4 rounded-md">
              <p className="text-destructive">Error loading vendors: {String(error)}</p>
            </div>
          ) : (
            <VendorManagement vendors={vendors} />
          )}
        </div>
      </div>
    </Layout>
  );
}
