import Layout from '@/components/layout';
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Edit2, FileText, Search, Download, Upload, File, Calendar, User } from "lucide-react";
import type { TestProcedure, TestProcedureInsert } from "@/shared/schema";

export default function TestProceduresPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<TestProcedure | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMethod, setFilterMethod] = useState<string>("all");
  
  const queryClient = useQueryClient();

  // Fetch test procedures
  const { data: procedures = [], isLoading } = useQuery({
    queryKey: ["/api/quality/test-procedures"],
  });

  // Fetch next procedure ID
  const { data: nextProcedureNumber } = useQuery({
    queryKey: ["/api/quality/test-procedures/next-number"],
  });

  // Create procedure mutation
  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const response = await fetch("/api/quality/test-procedures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create procedure");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quality/test-procedures"] });
      setIsDialogOpen(false);
      resetForm();
      toast({
        title: "Success",
        description: "Test procedure created successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update procedure mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const response = await fetch(`/api/quality/test-procedures/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to update procedure");
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quality/test-procedures"] });
      setIsDialogOpen(false);
      setEditingProcedure(null);
      resetForm();
      toast({
        title: "Success",
        description: "Test procedure updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });



  // Form state
  const [formData, setFormData] = useState({
    procedureNumber: "",
    procedureName: "",
    ndtMethod: "HT",
    applicableStandard: "",
    procedureRevision: "R1",
    scope: "",
    technique: "",
    sensitivity: "",
    preparation: "",
    procedureSteps: "",
    evaluation: "",
    documentation: "",
    personnelQualification: "",
    acceptanceCriteria: "",
    limitations: "",
    environmentalConditions: "",
    status: "Draft" as const,
    approvalLevel: "",
    remarks: "",
    tags: ""
  });

  // File upload state
  const [fileUpload, setFileUpload] = useState<File | null>(null);

  const resetForm = () => {
    setFormData({
      procedureNumber: nextProcedureNumber?.procedureNumber || "",
      procedureName: "",
      ndtMethod: "HT",
      applicableStandard: "",
      procedureRevision: "R1",
      scope: "",
      technique: "",
      sensitivity: "",
      preparation: "",
      procedureSteps: "",
      evaluation: "",
      documentation: "",
      personnelQualification: "",
      acceptanceCriteria: "",
      limitations: "",
      environmentalConditions: "",
      status: "Draft" as const,
      approvalLevel: "",
      remarks: "",
      tags: ""
    });
    setFileUpload(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate required fields
    if (!formData.procedureName || !formData.ndtMethod) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    // For create, require file upload
    if (!editingProcedure && !fileUpload) {
      toast({
        title: "Error",
        description: "Please upload a procedure document",
        variant: "destructive",
      });
      return;
    }

    try {
      if (editingProcedure) {
        // Update existing procedure with optional file upload
        if (fileUpload) {
          // If user selected a new file, upload it
          const updateFormData = new FormData();
          
          // Append form fields
          Object.entries(formData).forEach(([key, value]) => {
            updateFormData.append(key, value);
          });
          
          // Append file
          updateFormData.append('file', fileUpload);

          const response = await fetch(`/api/quality/test-procedures/${editingProcedure.id}`, {
            method: "PUT",
            body: updateFormData,
          });
          
          if (!response.ok) throw new Error("Failed to update procedure");
          
          queryClient.invalidateQueries({ queryKey: ["/api/quality/test-procedures"] });
          setIsDialogOpen(false);
          setEditingProcedure(null);
          resetForm();
          toast({
            title: "Success",
            description: "Test procedure updated successfully with new file",
          });
        } else {
          // No file upload, just update the record
          const updateData = { ...formData };
          updateMutation.mutate({ id: editingProcedure.id, data: updateData });
        }
      } else {
        // Create new procedure with file upload
        const createFormData = new FormData();
        
        // Auto-populate procedure number from API
        const finalFormData = {
          ...formData,
          procedureNumber: nextProcedureNumber?.procedureNumber || formData.procedureNumber
        };
        
        // Append form fields
        Object.entries(finalFormData).forEach(([key, value]) => {
          createFormData.append(key, value);
        });
        
        // Append file
        if (fileUpload) {
          createFormData.append('file', fileUpload);
        }

        // Call mutation with FormData
        const response = await fetch("/api/quality/test-procedures", {
          method: "POST",
          body: createFormData,
        });
        
        if (!response.ok) throw new Error("Failed to create procedure");
        
        queryClient.invalidateQueries({ queryKey: ["/api/quality/test-procedures"] });
        queryClient.invalidateQueries({ queryKey: ["/api/quality/test-procedures/next-number"] });
        setIsDialogOpen(false);
        resetForm();
        toast({
          title: "Success",
          description: "Test procedure created successfully",
        });
      }
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handleEdit = (procedure: any) => {
    setEditingProcedure(procedure);
    setFormData({
      procedureNumber: procedure.procedureNumber || "",
      procedureName: procedure.procedureName || "",
      ndtMethod: procedure.ndtMethod || "LPT",
      applicableStandard: procedure.applicableStandard || "",
      procedureRevision: procedure.procedureRevision || "R1",
      scope: procedure.scope || "",
      technique: procedure.technique || "",
      sensitivity: procedure.sensitivity || "",
      preparation: procedure.preparation || "",
      procedureSteps: procedure.procedureSteps || "",
      evaluation: procedure.evaluation || "",
      documentation: procedure.documentation || "",
      personnelQualification: procedure.personnelQualification || "",
      acceptanceCriteria: procedure.acceptanceCriteria || "",
      limitations: procedure.limitations || "",
      environmentalConditions: procedure.environmentalConditions || "",
      status: procedure.status || "Draft",
      approvalLevel: procedure.approvalLevel || "",
      remarks: procedure.remarks || "",
      tags: procedure.tags || ""
    });
    setIsDialogOpen(true);
  };



  const handleDownload = async (procedure: TestProcedure) => {
    try {
      // Use window.open for direct download
      window.open(`/api/quality/test-procedures/${procedure.id}/download`, '_blank');
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download procedure file",
        variant: "destructive",
      });
    }
  };

  const handleFileUpload = (procedure: TestProcedure) => {
    // Create a file input element programmatically
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.pdf,.doc,.docx';
    fileInput.style.display = 'none';
    
    fileInput.onchange = async (event) => {
      const target = event.target as HTMLInputElement;
      const file = target.files?.[0];
      
      if (!file) return;
      
      try {
        const formData = new FormData();
        formData.append('file', file);
        
        const response = await fetch(`/api/quality/test-procedures/${procedure.id}/upload`, {
          method: 'POST',
          body: formData,
          credentials: 'include'
        });
        
        if (!response.ok) {
          throw new Error('Upload failed');
        }
        
        // Refresh the data
        queryClient.invalidateQueries({ queryKey: ["/api/quality/test-procedures"] });
        
        toast({
          title: "Success",
          description: "File uploaded successfully",
        });
      } catch (error) {
        toast({
          title: "Error",
          description: "Failed to upload file",
          variant: "destructive",
        });
      }
    };
    
    // Trigger the file selection dialog
    document.body.appendChild(fileInput);
    fileInput.click();
    document.body.removeChild(fileInput);
  };

  // Filter procedures
  const filteredProcedures = procedures.filter((procedure: TestProcedure) => {
    const matchesSearch = 
      procedure.procedureNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      procedure.procedureName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      procedure.ndtMethod?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesMethod = filterMethod === "all" || procedure.ndtMethod === filterMethod;
    
    return matchesSearch && matchesMethod;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300">Active</Badge>;
      case "draft":
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300">Draft</Badge>;
      case "archived":
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300">Archived</Badge>;
      default:
        return <Badge className="bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300">{status}</Badge>;
    }
  };

  // Helper component to display procedure file information
  const ProcedureFileInfo = ({ procedure }: { procedure?: TestProcedure | null }) => {
    if (!procedure) {
      return (
        <div className="bg-gray-50 border border-gray-200 dark:bg-gray-900/50 dark:border-gray-700 rounded-lg p-4 mt-4">
          <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
            📄 Uploaded Files Information
          </h4>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Files will be displayed here after the procedure is created and saved.
          </p>
        </div>
      );
    }

    const attachments = procedure.attachments ? JSON.parse(procedure.attachments) : [];
    
    return (
      <div className="bg-gray-50 border border-gray-200 dark:bg-gray-900/50 dark:border-gray-700 rounded-lg p-4 mt-4">
        <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
          📄 Uploaded Files Information
        </h4>
        
        {attachments.length > 0 ? (
          <div className="space-y-3">
            {attachments.map((file: any, index: number) => (
              <div key={index} className="flex items-start space-x-3 p-3 bg-white dark:bg-gray-800 rounded border">
                <File className="w-5 h-5 text-blue-500 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                      {file.fileName}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => procedure && handleDownload(procedure)}
                      className="ml-2 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                    >
                      <Download className="w-4 h-4 mr-1" />
                      Download
                    </Button>
                  </div>
                  <div className="flex items-center mt-1 space-x-4 text-xs text-gray-500 dark:text-gray-400">
                    <div className="flex items-center">
                      <Calendar className="w-3 h-3 mr-1" />
                      {new Date(file.uploadedAt).toLocaleDateString()}
                    </div>
                    <div className="flex items-center">
                      <User className="w-3 h-3 mr-1" />
                      Uploaded by User {file.uploadedBy}
                    </div>
                  </div>
                  <div className="mt-1">
                    <p className="text-xs text-gray-600 dark:text-gray-400 font-mono">
                      📁 GCS Path: QMS/Test_Procedures/{procedure.ndtMethod}/{procedure.applicableStandard?.includes('EN') ? 'EN' : 'ASME'}/{procedure.procedureNumber}.pdf
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-4">
            <FileText className="w-8 h-8 text-gray-400 mx-auto mb-2" />
            <p className="text-sm text-gray-500 dark:text-gray-400">
              No files uploaded yet
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Upload a procedure document to see file information here
            </p>
          </div>
        )}
      </div>
    );
  };

  const getMethodBadge = (method: string) => {
    const colors: Record<string, string> = {
      HT: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      PNT: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
      RT: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
      PT: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
      UT: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
      MT: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300"
    };

    const displayNames: Record<string, string> = {
      HT: "HT",
      PNT: "PNT",
      RT: "RT",
      PT: "PT", 
      UT: "UT",
      MT: "MT"
    };
    
    const displayName = displayNames[method] || method;
    return <Badge className={colors[method] || "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"}>{displayName}</Badge>;
  };

  return (
    <Layout>
      <div className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold pl-4">Test Procedures</h1>
          <p className="text-muted-foreground">Manage NDT test procedures and standards</p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { setEditingProcedure(null); resetForm(); }}>
              <Plus className="h-4 w-4 mr-2" />
              Add Test Procedure
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingProcedure ? "Edit Test Procedure" : "Add New Test Procedure"}
              </DialogTitle>
              <DialogDescription>
                {editingProcedure ? "Update the test procedure details" : "Create a new NDT test procedure"}
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="procedureNumber">Procedure ID *</Label>
                  <Input
                    id="procedureNumber"
                    value={formData.procedureNumber}
                    onChange={(e) => setFormData({ ...formData, procedureNumber: e.target.value })}
                    placeholder={nextProcedureNumber?.procedureNumber || "Auto-generated"}
                    className="bg-gray-50 text-gray-600"
                    readOnly={!editingProcedure}
                    title={editingProcedure ? "Procedure ID can be edited" : "Auto-generated (read-only)"}
                  />
                </div>
                <div>
                  <Label htmlFor="ndtMethod">NDT Method *</Label>
                  <Select value={formData.ndtMethod} onValueChange={(value) => setFormData({ ...formData, ndtMethod: value as any })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="HT">Hydraulic Testing (HT)</SelectItem>
                      <SelectItem value="PNT">Pneumatic Testing (PNT)</SelectItem>
                      <SelectItem value="RT">Radiographic Testing (RT)</SelectItem>
                      <SelectItem value="PT">Penetrant Testing (PT)</SelectItem>
                      <SelectItem value="UT">Ultrasonic Testing (UT)</SelectItem>
                      <SelectItem value="MT">Magnetic Testing (MT)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="procedureName">Procedure Name *</Label>
                <Input
                  id="procedureName"
                  value={formData.procedureName}
                  onChange={(e) => setFormData({ ...formData, procedureName: e.target.value })}
                  placeholder="Enter procedure name"
                  required
                />
              </div>

              <div>
                <Label htmlFor="scope">Scope</Label>
                <Textarea
                  id="scope"
                  value={formData.scope}
                  onChange={(e) => setFormData({ ...formData, scope: e.target.value })}
                  placeholder="Define the scope and application of this procedure"
                  rows={2}
                />
              </div>

              <div>
                <Label htmlFor="applicableStandard">Applicable Standards</Label>
                <Select value={formData.applicableStandard} onValueChange={(value) => setFormData({ ...formData, applicableStandard: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select applicable standard" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">ASME Standards</SelectLabel>
                      <SelectItem value="ASME SEC V">ASME Section V</SelectItem>
                      <SelectItem value="ASTM E165">ASTM E165 - Liquid Penetrant</SelectItem>
                      <SelectItem value="ASTM E709">ASTM E709 - Magnetic Particle</SelectItem>
                      <SelectItem value="ASTM E1444">ASTM E1444 - Magnetic Particle</SelectItem>
                      <SelectItem value="ASTM E1417">ASTM E1417 - Liquid Penetrant</SelectItem>
                      <SelectItem value="API 5L">API 5L - Line Pipe</SelectItem>
                      <SelectItem value="AWS D1.1">AWS D1.1 - Structural Welding Code</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">EN Standards</SelectLabel>
                      <SelectItem value="EN 13445-5">EN 13445-5 - Unfired Pressure Vessels (LPT, MPT, RT, etc.)</SelectItem>
                      <SelectItem value="EN ISO 3452">EN ISO 3452 - Penetrant Testing</SelectItem>
                      <SelectItem value="EN ISO 9934">EN ISO 9934 - Magnetic Particle Testing</SelectItem>
                    </SelectGroup>
                    <SelectGroup>
                      <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">Other</SelectLabel>
                      <SelectItem value="Other">Other (specify in remarks)</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="procedureSteps">Procedure Steps</Label>
                <Textarea
                  id="procedureSteps"
                  value={formData.procedureSteps}
                  onChange={(e) => setFormData({ ...formData, procedureSteps: e.target.value })}
                  placeholder="Detailed step-by-step procedure"
                  rows={4}
                />
              </div>

              <div>
                <Label htmlFor="acceptanceCriteria">Acceptance Criteria</Label>
                <Textarea
                  id="acceptanceCriteria"
                  value={formData.acceptanceCriteria}
                  onChange={(e) => setFormData({ ...formData, acceptanceCriteria: e.target.value })}
                  placeholder="Define acceptance criteria and reject limits"
                  rows={3}
                />
              </div>



              {/* File Upload Section */}
              <div className="bg-blue-50 border-2 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800 rounded-lg p-4">
                <Label htmlFor="fileUpload" className="text-base font-semibold">
                  {editingProcedure ? "Upload New Document (Optional)" : "Procedure Document * (Required)"}
                </Label>
                <div className="mt-2 space-y-2">
                  <Input
                    id="fileUpload"
                    type="file"
                    onChange={(e) => setFileUpload(e.target.files?.[0] || null)}
                    accept=".pdf,.doc,.docx"
                    className="bg-white dark:bg-gray-900"
                  />
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <p>📄 Supported formats: PDF, DOC, DOCX files only</p>
                    <p>📦 Max file size: 10MB</p>
                    {editingProcedure && (
                      <p>🔄 Upload a new file to replace the existing document</p>
                    )}
                  </div>
                  {fileUpload && (
                    <div className="flex items-center space-x-2 p-2 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded">
                      <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                      <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                        Selected: {fileUpload.name} ({Math.round(fileUpload.size / 1024)} KB)
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Uploaded Files Information Section */}
              <ProcedureFileInfo procedure={editingProcedure} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="procedureRevision">Revision</Label>
                  <Input
                    id="procedureRevision"
                    value={formData.procedureRevision}
                    onChange={(e) => setFormData({ ...formData, procedureRevision: e.target.value })}
                    placeholder="e.g., R1, R2"
                  />
                </div>
                <div>
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(value) => setFormData({ ...formData, status: value as any })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Draft">Draft</SelectItem>
                      <SelectItem value="Under Review">Under Review</SelectItem>
                      <SelectItem value="Approved">Approved</SelectItem>
                      <SelectItem value="Superseded">Superseded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="remarks">Remarks</Label>
                <Textarea
                  id="remarks"
                  value={formData.remarks}
                  onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                  placeholder="Additional remarks or comments"
                  rows={2}
                />
              </div>

              <div className="flex justify-end space-x-2 pt-4">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {createMutation.isPending || updateMutation.isPending ? (
                    editingProcedure ? "Updating..." : "Creating..."
                  ) : (
                    editingProcedure ? 
                      (fileUpload ? "Update & Upload File" : "Update Procedure") : 
                      (fileUpload ? "Create & Upload File" : "Select File to Continue")
                  )}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search by procedure ID, title, or method..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div className="w-full md:w-48">
              <Select value={filterMethod} onValueChange={setFilterMethod}>
                <SelectTrigger>
                  <SelectValue placeholder="Filter by method" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Methods</SelectItem>
                  <SelectItem value="HT">Hydraulic Testing (HT)</SelectItem>
                  <SelectItem value="PNT">Pneumatic Testing (PNT)</SelectItem>
                  <SelectItem value="RT">Radiographic Testing (RT)</SelectItem>
                  <SelectItem value="PT">Penetrant Testing (PT)</SelectItem>
                  <SelectItem value="UT">Ultrasonic Testing (UT)</SelectItem>
                  <SelectItem value="MT">Magnetic Testing (MT)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* GCS Storage Path Information */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="h-5 w-5 mr-2" />
            GCS Storage Paths for NDT Methods
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground mb-4">
              Test procedure documents are stored in Google Cloud Storage using the following path structure:
            </p>
            
            <div className="grid gap-3">
              {/* HT - Hydraulic Testing */}
              <div className="flex items-start space-x-3 p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                <Badge variant="outline" className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  HT
                </Badge>
                <div className="flex-1">
                  <p className="font-medium text-sm">Hydraulic Testing</p>
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono">
                    QMS/Test_Procedures/HT/ASME/{`{procedureNumber}`}.pdf
                  </code>
                </div>
              </div>

              {/* PNT - Pneumatic Testing */}
              <div className="flex items-start space-x-3 p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                <Badge variant="outline" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  PNT
                </Badge>
                <div className="flex-1">
                  <p className="font-medium text-sm">Pneumatic Testing</p>
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono">
                    QMS/Test_Procedures/PNT/ASME/{`{procedureNumber}`}.pdf
                  </code>
                </div>
              </div>

              {/* RT - Radiographic Testing */}
              <div className="flex items-start space-x-3 p-3 bg-purple-50 dark:bg-purple-950/20 rounded-lg">
                <Badge variant="outline" className="bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200">
                  RT
                </Badge>
                <div className="flex-1">
                  <p className="font-medium text-sm">Radiographic Testing</p>
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono">
                    QMS/Test_Procedures/RT/ASME/{`{procedureNumber}`}.pdf
                  </code>
                </div>
              </div>

              {/* PT - Penetrant Testing */}
              <div className="flex items-start space-x-3 p-3 bg-orange-50 dark:bg-orange-950/20 rounded-lg">
                <Badge variant="outline" className="bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200">
                  PT
                </Badge>
                <div className="flex-1">
                  <p className="font-medium text-sm">Penetrant Testing</p>
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono">
                    QMS/Test_Procedures/PT/EN/{`{procedureNumber}`}.pdf
                  </code>
                </div>
              </div>

              {/* UT - Ultrasonic Testing */}
              <div className="flex items-start space-x-3 p-3 bg-cyan-50 dark:bg-cyan-950/20 rounded-lg">
                <Badge variant="outline" className="bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200">
                  UT
                </Badge>
                <div className="flex-1">
                  <p className="font-medium text-sm">Ultrasonic Testing</p>
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono">
                    QMS/Test_Procedures/UT/ASME/{`{procedureNumber}`}.pdf
                  </code>
                </div>
              </div>

              {/* MT - Magnetic Testing */}
              <div className="flex items-start space-x-3 p-3 bg-pink-50 dark:bg-pink-950/20 rounded-lg">
                <Badge variant="outline" className="bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200">
                  MT
                </Badge>
                <div className="flex-1">
                  <p className="font-medium text-sm">Magnetic Testing</p>
                  <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded font-mono">
                    QMS/Test_Procedures/MT/ASTM/{`{procedureNumber}`}.pdf
                  </code>
                </div>
              </div>
            </div>

            <div className="mt-4 p-3 bg-gray-50 dark:bg-gray-900 rounded-lg">
              <p className="text-xs text-muted-foreground">
                <strong>Note:</strong> The standard type (ASME, EN, ASTM) in the path is determined by the "Applicable Standards" field selection. 
                For example, a PT procedure with "EN ISO 3452" standard will be stored in the EN subdirectory.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Procedures Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="h-5 w-5 mr-2" />
            Test Procedures ({filteredProcedures.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">Loading test procedures...</div>
          ) : filteredProcedures.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchTerm || filterMethod !== "all" ? "No procedures match your filters" : "No test procedures found"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Procedure ID</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Revision</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredProcedures.map((procedure: TestProcedure) => (
                    <TableRow key={procedure.id}>
                      <TableCell className="font-medium">{procedure.procedureNumber}</TableCell>
                      <TableCell>{getMethodBadge(procedure.ndtMethod)}</TableCell>
                      <TableCell>{procedure.procedureName}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{procedure.procedureRevision || "R1"}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(procedure.status)}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(procedure)}
                            className="text-green-600 hover:text-green-800"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleFileUpload(procedure)}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <Upload className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDownload(procedure)}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
      </div>
    </Layout>
  );
}