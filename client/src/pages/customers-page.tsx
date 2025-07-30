import { useQuery } from "@tanstack/react-query";
import Layout from "@/components/layout";
import CustomerManagement from "@/components/customer-management";
import { Loader2 } from "lucide-react";
import { Customer } from "@shared/schema";
import { Helmet } from "react-helmet";

export default function CustomersPage() {
  const { data: customers, isLoading, error } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  return (
    <Layout>
      <Helmet>
        <title>Customer Management | THERMOPAC</title>
      </Helmet>

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold tracking-tight pl-4">Customer Management</h1>
        </div>
        
        <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="bg-destructive/10 p-4 rounded-md">
              <p className="text-destructive">Error loading customers: {String(error)}</p>
            </div>
          ) : (
            <CustomerManagement customers={customers || []} />
          )}
        </div>
      </div>
    </Layout>
  );
}