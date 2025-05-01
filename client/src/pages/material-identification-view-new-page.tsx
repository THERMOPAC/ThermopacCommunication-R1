import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { format } from "date-fns";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, FileUp, Edit, Download, Trash2, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { apiRequest } from "@/lib/queryClient";

// Define interface for the Material Identification record
interface MaterialIdentification {
  id: number;
  material_identification_id: string;
  project_id: number;
  project_name: string;
  project_number: string;
  inspection_order_number: string;
  material_description: string;
  material_code: string;
  specification: string;
  material_grade: string;
  heat_number: string;
  batch_number: string | null;
  mill_name: string;
  mill_test_certificate_number: string;
  quantity: string;
  dimensions: string;
  material_status: string;
  inspector_name: string;
  inspection_date: string;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

interface MaterialIdentificationViewProps {
  params: {
    id: string;
  };
}

export default function MaterialIdentificationViewNewPage({ params }: MaterialIdentificationViewProps) {
  const [, navigate] = useLocation();
  const recordId = params.id;
  
  // Fetch the Material Identification record
  const { data, isLoading, error } = useQuery({
    queryKey: ['/api/quality/material-identification', recordId],
    queryFn: async () => {
      const response = await fetch(`/api/quality/material-identification/${recordId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch material identification record');
      }
      return response.json();
    },
    enabled: !!recordId && recordId !== 'new',
  });

  // Format date from API (YYYY-MM-DD) to readable format
  const formatDate = (dateString: string): string => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return format(date, 'PPP'); // Format as "Apr 29, 2023"
    } catch (error) {
      return dateString;
    }
  };
  
  // Get color for material status badge
  const getStatusColor = (status: string): string => {
    switch (status?.toLowerCase()) {
      case 'accepted':
        return 'bg-green-500';
      case 'rejected':
        return 'bg-red-500';
      case 'hold':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  // Navigate to edit page for this record
  const handleEdit = () => {
    navigate(`/quality/material-identification/edit/${recordId}`);
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="container mx-auto py-6">
          <div className="flex justify-center items-center h-40">
            <span className="loading loading-spinner text-primary"></span>
          </div>
        </div>
      </Layout>
    );
  }

  if (error || !data) {
    return (
      <Layout>
        <div className="container mx-auto py-6">
          <Card>
            <CardHeader>
              <CardTitle>Error</CardTitle>
              <CardDescription>
                Failed to load the Material Identification record.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <p>There was an error loading this record. Please try again or contact support.</p>
              <Button 
                variant="outline" 
                className="mt-4" 
                onClick={() => navigate('/quality/material-identification')}
              >
                Back to List
              </Button>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }

  const record: MaterialIdentification = data;

  return (
    <Layout>
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader className="flex flex-row items-start justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                Material Identification Record
                <Badge className={getStatusColor(record.material_status)}>
                  {record.material_status}
                </Badge>
              </CardTitle>
              <CardDescription>
                Viewing material identification record {record.material_identification_id}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handleEdit}>
                <Edit className="h-4 w-4 mr-2" />
                Edit
              </Button>
              <Button variant="outline" onClick={() => navigate('/quality/material-identification')}>
                Back to List
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg p-6">
              {/* Header Information */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 pb-6 border-b">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">MI ID</h3>
                  <p className="text-lg font-semibold">{record.material_identification_id}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Project</h3>
                  <p className="text-lg font-semibold">{record.project_number}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Project Name</h3>
                  <p className="text-lg font-semibold">{record.project_name}</p>
                </div>
              </div>

              {/* Material Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 pb-6 border-b">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Material Description</h3>
                  <p className="mt-1">{record.material_description}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Material Code</h3>
                  <p className="mt-1">{record.material_code}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Specification</h3>
                  <p className="mt-1">{record.specification}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Material Grade</h3>
                  <p className="mt-1">{record.material_grade}</p>
                </div>
              </div>

              {/* Heat/Batch/Mill Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 pb-6 border-b">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Heat Number</h3>
                  <p className="mt-1">{record.heat_number}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Batch Number</h3>
                  <p className="mt-1">{record.batch_number || 'N/A'}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Mill Name</h3>
                  <p className="mt-1">{record.mill_name}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Mill Test Certificate No.</h3>
                  <p className="mt-1">{record.mill_test_certificate_number}</p>
                </div>
              </div>

              {/* Quantity/Dimensions Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 pb-6 border-b">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Quantity</h3>
                  <p className="mt-1">{record.quantity}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Dimensions</h3>
                  <p className="mt-1">{record.dimensions}</p>
                </div>
              </div>

              {/* Inspection Information */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6 pb-6 border-b">
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Inspector's Name</h3>
                  <p className="mt-1">{record.inspector_name}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500">Inspection Date</h3>
                  <p className="mt-1">{formatDate(record.inspection_date)}</p>
                </div>
                <div className="md:col-span-2">
                  <h3 className="text-sm font-medium text-gray-500">Remarks</h3>
                  <p className="mt-1">{record.remarks || 'No remarks provided'}</p>
                </div>
              </div>

              {/* Document Section (placeholder for future GCS integration) */}
              <div className="mt-6">
                <h3 className="text-sm font-medium text-gray-500 mb-3">Documents</h3>
                <div className="bg-gray-50 p-4 rounded-md text-center">
                  <FileText className="h-10 w-10 mx-auto text-gray-400" />
                  <p className="mt-2 text-sm text-gray-500">Document upload functionality will be implemented in future updates.</p>
                </div>
              </div>

              {/* Metadata and Timestamps */}
              <div className="mt-6 text-xs text-gray-500">
                <p>Created: {formatDate(record.created_at)}</p>
                <p>Last Updated: {formatDate(record.updated_at)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}