import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useState, useEffect } from "react";
import { useParams } from "wouter";
import { Layout } from "../layout";

// Simple component to test direct updates
export default function MaterialIdentificationDirectUpdate() {
  const { toast } = useToast();
  const { id } = useParams<{ id: string }>();
  
  const [record, setRecord] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  
  // Form fields
  const [materialDescription, setMaterialDescription] = useState("");
  const [materialCode, setMaterialCode] = useState("");
  const [specification, setSpecification] = useState("");
  const [materialGrade, setMaterialGrade] = useState("");
  const [millName, setMillName] = useState("");
  
  // Load the record
  useEffect(() => {
    async function loadRecord() {
      try {
        setLoading(true);
        const response = await fetch(`/api/quality/material-identification/${id}`);
        if (!response.ok) {
          throw new Error("Failed to load record");
        }
        
        const data = await response.json();
        setRecord(data);
        
        // Set form fields
        setMaterialDescription(data.material_description || "");
        setMaterialCode(data.material_code || "");
        setSpecification(data.specification || "");
        setMaterialGrade(data.material_grade || "");
        setMillName(data.mill_name || "");
        
        setLoading(false);
      } catch (err) {
        setError("Failed to load record");
        setLoading(false);
        console.error("Error loading record:", err);
      }
    }
    
    loadRecord();
  }, [id]);
  
  // Handle direct update via test endpoint
  const handleDirectUpdate = async () => {
    try {
      const updateData = {
        materialDescription,
        materialCode,
        specification,
        materialGrade,
        millName
      };
      
      console.log("Sending direct update:", updateData);
      
      const response = await fetch(`/api/quality/material-identification/test-update/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });
      
      const responseText = await response.text();
      console.log("Direct update response:", responseText);
      
      let responseData;
      try {
        responseData = JSON.parse(responseText);
      } catch (e) {
        console.error("Failed to parse response:", e);
      }
      
      if (response.ok) {
        toast({
          title: "Update Successful",
          description: "Record updated using direct update method."
        });
        
        // Reload the record to see updated values
        const refreshResponse = await fetch(`/api/quality/material-identification/${id}`);
        const refreshData = await refreshResponse.json();
        setRecord(refreshData);
        
        // Update form fields with the refreshed data
        setMaterialDescription(refreshData.material_description || "");
        setMaterialCode(refreshData.material_code || "");
        setSpecification(refreshData.specification || "");
        setMaterialGrade(refreshData.material_grade || "");
        setMillName(refreshData.mill_name || "");
      } else {
        toast({
          title: "Update Failed",
          description: "Failed to update record.",
          variant: "destructive"
        });
      }
    } catch (err) {
      console.error("Error updating record:", err);
      toast({
        title: "Error",
        description: "An error occurred while updating the record.",
        variant: "destructive"
      });
    }
  };
  
  // Original update via regular endpoint (for comparison)
  const handleRegularUpdate = async () => {
    try {
      const updateData = {
        materialIdentificationId: record.material_identification_id,
        projectId: record.project_id,
        projectNumber: record.project_number,
        projectName: record.project_name,
        materialDescription,
        materialCode,
        specification,
        materialGrade,
        heatNumber: record.heat_number,
        batchNumber: record.batch_number,
        millName,
        millTestCertificateNumber: record.mill_test_certificate_number,
        quantity: record.quantity,
        dimensions: record.dimensions,
        materialStatus: record.material_status,
        inspectorName: record.inspector_name,
        inspectionDate: record.inspection_date,
        inspectionOrderNumber: record.inspection_order_number,
        remarks: record.remarks
      };
      
      console.log("Sending regular update:", updateData);
      
      const response = await fetch(`/api/quality/material-identification/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });
      
      const responseText = await response.text();
      console.log("Regular update response:", responseText);
      
      if (response.ok) {
        toast({
          title: "Update Successful",
          description: "Record updated using regular update method."
        });
        
        // Reload the record
        const refreshResponse = await fetch(`/api/quality/material-identification/${id}`);
        const refreshData = await refreshResponse.json();
        setRecord(refreshData);
        
        // Update form fields
        setMaterialDescription(refreshData.material_description || "");
        setMaterialCode(refreshData.material_code || "");
        setSpecification(refreshData.specification || "");
        setMaterialGrade(refreshData.material_grade || "");
        setMillName(refreshData.mill_name || "");
      } else {
        toast({
          title: "Update Failed",
          description: "Failed to update record using regular method.",
          variant: "destructive"
        });
      }
    } catch (err) {
      console.error("Error with regular update:", err);
      toast({
        title: "Error",
        description: "An error occurred with the regular update.",
        variant: "destructive"
      });
    }
  };
  
  if (loading) {
    return (
      <Layout>
        <div className="container mx-auto py-6">
          <Card>
            <CardHeader>
              <CardTitle>Loading...</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex justify-center">
                <span className="loading loading-spinner text-primary"></span>
              </div>
            </CardContent>
          </Card>
        </div>
      </Layout>
    );
  }
  
  if (error) {
    return (
      <Layout>
        <div className="container mx-auto py-6">
          <Card>
            <CardHeader>
              <CardTitle>Error</CardTitle>
              <CardDescription>{error}</CardDescription>
            </CardHeader>
          </Card>
        </div>
      </Layout>
    );
  }
  
  return (
    <Layout>
      <div className="container mx-auto py-6">
        <Card>
          <CardHeader>
            <CardTitle>Direct Update Tester</CardTitle>
            <CardDescription>
              Testing different update methods for Material Identification ID: {record?.material_identification_id}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="font-medium">Material Description</label>
                  <Input 
                    value={materialDescription} 
                    onChange={(e) => setMaterialDescription(e.target.value)}
                    placeholder="Enter material description"
                  />
                  <p className="text-sm text-gray-500">Current value: {record?.material_description}</p>
                </div>
                
                <div className="space-y-2">
                  <label className="font-medium">Material Code</label>
                  <Input 
                    value={materialCode} 
                    onChange={(e) => setMaterialCode(e.target.value)}
                    placeholder="Enter material code"
                  />
                  <p className="text-sm text-gray-500">Current value: {record?.material_code}</p>
                </div>
                
                <div className="space-y-2">
                  <label className="font-medium">Specification</label>
                  <Input 
                    value={specification} 
                    onChange={(e) => setSpecification(e.target.value)}
                    placeholder="Enter specification"
                  />
                  <p className="text-sm text-gray-500">Current value: {record?.specification}</p>
                </div>
                
                <div className="space-y-2">
                  <label className="font-medium">Material Grade</label>
                  <Input 
                    value={materialGrade} 
                    onChange={(e) => setMaterialGrade(e.target.value)}
                    placeholder="Enter material grade"
                  />
                  <p className="text-sm text-gray-500">Current value: {record?.material_grade}</p>
                </div>
                
                <div className="space-y-2">
                  <label className="font-medium">Mill Name</label>
                  <Input 
                    value={millName} 
                    onChange={(e) => setMillName(e.target.value)}
                    placeholder="Enter mill name"
                  />
                  <p className="text-sm text-gray-500">Current value: {record?.mill_name}</p>
                </div>
              </div>
              
              <div className="flex flex-col md:flex-row space-y-4 md:space-y-0 md:space-x-4 pt-4">
                <Button 
                  onClick={handleDirectUpdate}
                  variant="default"
                >
                  Update with Test Endpoint
                </Button>
                
                <Button 
                  onClick={handleRegularUpdate}
                  variant="outline"
                >
                  Update with Regular Endpoint
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}