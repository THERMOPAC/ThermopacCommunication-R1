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
import { Plus, Edit2, Trash2, FileText, Search } from "lucide-react";
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

  // Delete procedure mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/quality/test-procedures/${id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Failed to delete procedure");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/quality/test-procedures"] });
      toast({
        title: "Success",
        description: "Test procedure deleted successfully",
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
    ndtMethod: "LPT",
    applicableStandard: "",
    procedureRevision: "R1",
    scope: "",
    technique: "",
    equipment: "",
    materials: "",
    sensitivity: "",
    preparation: "",
    procedureSteps: "",
    evaluation: "",
    documentation: "",
    personnelQualification: "",
    calibrationRequirements: "",
    acceptanceCriteria: "",
    limitations: "",
    safetyPrecautions: "",
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
      ndtMethod: "LPT",
      applicableStandard: "",
      procedureRevision: "R1",
      scope: "",
      technique: "",
      equipment: "",
      materials: "",
      sensitivity: "",
      preparation: "",
      procedureSteps: "",
      evaluation: "",
      documentation: "",
      personnelQualification: "",
      calibrationRequirements: "",
      acceptanceCriteria: "",
      limitations: "",
      safetyPrecautions: "",
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
        // Update existing procedure
        const updateData = { ...formData };
        updateMutation.mutate({ id: editingProcedure.id, data: updateData });
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
      equipment: procedure.equipment || "",
      materials: procedure.materials || "",
      sensitivity: procedure.sensitivity || "",
      preparation: procedure.preparation || "",
      procedureSteps: procedure.procedureSteps || "",
      evaluation: procedure.evaluation || "",
      documentation: procedure.documentation || "",
      personnelQualification: procedure.personnelQualification || "",
      calibrationRequirements: procedure.calibrationRequirements || "",
      acceptanceCriteria: procedure.acceptanceCriteria || "",
      limitations: procedure.limitations || "",
      safetyPrecautions: procedure.safetyPrecautions || "",
      environmentalConditions: procedure.environmentalConditions || "",
      status: procedure.status || "Draft",
      approvalLevel: procedure.approvalLevel || "",
      remarks: procedure.remarks || "",
      tags: procedure.tags || ""
    });
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm("Are you sure you want to delete this test procedure?")) {
      deleteMutation.mutate(id);
    }
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

  const getMethodBadge = (method: string) => {
    const colors: Record<string, string> = {
      LPT: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300",
      MPT: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-300",
      RT: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300",
      PT: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300",
      UT: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300",
      MT: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-300"
    };
    
    return <Badge className={colors[method] || "bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300"}>{method}</Badge>;
  };

  return (
    <Layout>
      <div className="container py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold">Test Procedures</h1>
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
                      <SelectItem value="LPT">Liquid Penetrant Testing (LPT)</SelectItem>
                      <SelectItem value="MPT">Magnetic Particle Testing (MPT)</SelectItem>
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



              <div>
                <Label htmlFor="fileUpload">Procedure Document * (Required)</Label>
                <Input
                  id="fileUpload"
                  type="file"
                  onChange={(e) => setFileUpload(e.target.files?.[0] || null)}
                  accept=".pdf,.doc,.docx"
                  className="mb-2"
                />
                <p className="text-sm text-gray-600">Upload procedure document (PDF, DOC, DOCX formats only)</p>
                {fileUpload && (
                  <p className="text-sm text-green-600 mt-1">Selected: {fileUpload.name}</p>
                )}
              </div>

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
                  {editingProcedure ? "Update Procedure" : "Create Procedure"}
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
                  <SelectItem value="LPT">LPT</SelectItem>
                  <SelectItem value="MPT">MPT</SelectItem>
                  <SelectItem value="RT">RT</SelectItem>
                  <SelectItem value="PT">PT</SelectItem>
                  <SelectItem value="UT">UT</SelectItem>
                  <SelectItem value="MT">MT</SelectItem>
                </SelectContent>
              </Select>
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
                    <TableHead>Approved By</TableHead>
                    <TableHead>Effective Date</TableHead>
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
                      <TableCell>{procedure.approvedByUser || "-"}</TableCell>
                      <TableCell>{procedure.approvedAt ? new Date(procedure.approvedAt).toLocaleDateString() : "-"}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEdit(procedure)}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDelete(procedure.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-4 w-4" />
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