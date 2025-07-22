import Layout from '@/components/layout';
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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

  // Create procedure mutation
  const createMutation = useMutation({
    mutationFn: async (data: TestProcedureInsert) => {
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
    mutationFn: async ({ id, data }: { id: number; data: TestProcedureInsert }) => {
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
  const [formData, setFormData] = useState<TestProcedureInsert>({
    procedureId: "",
    testMethod: "LPT",
    title: "",
    description: "",
    applicableStandards: "",
    equipmentRequired: "",
    procedureSteps: "",
    acceptanceCriteria: "",
    calibrationFrequency: "",
    safetyPrecautions: "",
    revision: "R1",
    approvedBy: "",
    approvalDate: new Date().toISOString().split('T')[0],
    effectiveDate: new Date().toISOString().split('T')[0],
    status: "draft"
  });

  const resetForm = () => {
    setFormData({
      procedureId: "",
      testMethod: "LPT",
      title: "",
      description: "",
      applicableStandards: "",
      equipmentRequired: "",
      procedureSteps: "",
      acceptanceCriteria: "",
      calibrationFrequency: "",
      safetyPrecautions: "",
      revision: "R1",
      approvedBy: "",
      approvalDate: new Date().toISOString().split('T')[0],
      effectiveDate: new Date().toISOString().split('T')[0],
      status: "draft"
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingProcedure) {
      updateMutation.mutate({ id: editingProcedure.id, data: formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleEdit = (procedure: TestProcedure) => {
    setEditingProcedure(procedure);
    setFormData({
      procedureId: procedure.procedureId,
      testMethod: procedure.testMethod,
      title: procedure.title,
      description: procedure.description || "",
      applicableStandards: procedure.applicableStandards || "",
      equipmentRequired: procedure.equipmentRequired || "",
      procedureSteps: procedure.procedureSteps || "",
      acceptanceCriteria: procedure.acceptanceCriteria || "",
      calibrationFrequency: procedure.calibrationFrequency || "",
      safetyPrecautions: procedure.safetyPrecautions || "",
      revision: procedure.revision,
      approvedBy: procedure.approvedBy || "",
      approvalDate: procedure.approvalDate || new Date().toISOString().split('T')[0],
      effectiveDate: procedure.effectiveDate || new Date().toISOString().split('T')[0],
      status: procedure.status
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
      procedure.procedureId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      procedure.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      procedure.testMethod.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesMethod = filterMethod === "all" || procedure.testMethod === filterMethod;
    
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
                  <Label htmlFor="procedureId">Procedure ID *</Label>
                  <Input
                    id="procedureId"
                    value={formData.procedureId}
                    onChange={(e) => setFormData({ ...formData, procedureId: e.target.value })}
                    placeholder="e.g., TP-LPT-001"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="testMethod">Test Method *</Label>
                  <Select value={formData.testMethod} onValueChange={(value) => setFormData({ ...formData, testMethod: value as any })}>
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
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="Enter procedure title"
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Enter procedure description"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="applicableStandards">Applicable Standards</Label>
                  <Input
                    id="applicableStandards"
                    value={formData.applicableStandards}
                    onChange={(e) => setFormData({ ...formData, applicableStandards: e.target.value })}
                    placeholder="e.g., ASME V, ASTM E165"
                  />
                </div>
                <div>
                  <Label htmlFor="calibrationFrequency">Calibration Frequency</Label>
                  <Input
                    id="calibrationFrequency"
                    value={formData.calibrationFrequency}
                    onChange={(e) => setFormData({ ...formData, calibrationFrequency: e.target.value })}
                    placeholder="e.g., Annual, 6 months"
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="equipmentRequired">Equipment Required</Label>
                <Textarea
                  id="equipmentRequired"
                  value={formData.equipmentRequired}
                  onChange={(e) => setFormData({ ...formData, equipmentRequired: e.target.value })}
                  placeholder="List required equipment and materials"
                  rows={2}
                />
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
                <Label htmlFor="safetyPrecautions">Safety Precautions</Label>
                <Textarea
                  id="safetyPrecautions"
                  value={formData.safetyPrecautions}
                  onChange={(e) => setFormData({ ...formData, safetyPrecautions: e.target.value })}
                  placeholder="Safety requirements and precautions"
                  rows={2}
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="revision">Revision</Label>
                  <Input
                    id="revision"
                    value={formData.revision}
                    onChange={(e) => setFormData({ ...formData, revision: e.target.value })}
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
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="active">Active</SelectItem>
                      <SelectItem value="archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="approvedBy">Approved By</Label>
                  <Input
                    id="approvedBy"
                    value={formData.approvedBy}
                    onChange={(e) => setFormData({ ...formData, approvedBy: e.target.value })}
                    placeholder="Approver name"
                  />
                </div>
                <div>
                  <Label htmlFor="approvalDate">Approval Date</Label>
                  <Input
                    id="approvalDate"
                    type="date"
                    value={formData.approvalDate}
                    onChange={(e) => setFormData({ ...formData, approvalDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="effectiveDate">Effective Date</Label>
                  <Input
                    id="effectiveDate"
                    type="date"
                    value={formData.effectiveDate}
                    onChange={(e) => setFormData({ ...formData, effectiveDate: e.target.value })}
                  />
                </div>
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
                      <TableCell className="font-medium">{procedure.procedureId}</TableCell>
                      <TableCell>{getMethodBadge(procedure.testMethod)}</TableCell>
                      <TableCell>{procedure.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{procedure.revision}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(procedure.status)}</TableCell>
                      <TableCell>{procedure.approvedBy || "-"}</TableCell>
                      <TableCell>{procedure.effectiveDate || "-"}</TableCell>
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