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
import { Plus, Edit2, FileText, Search, Download, File, Calendar, User, AlertTriangle } from "lucide-react";
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import type { SelectTestProcedure, InsertTestProcedure, insertTestProcedureSchema } from "../../../shared/schema";

type TestProcedure = SelectTestProcedure;
import { z } from 'zod';

export default function TestProceduresPage() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProcedure, setEditingProcedure] = useState<SelectTestProcedure | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterMethod, setFilterMethod] = useState<string>("all");
  
  const queryClient = useQueryClient();

  // Form validation schema - all fields mandatory except remarks
  const testProcedureFormSchema = z.object({
    procedureNumber: z.string().min(1, "Procedure number is required"),
    procedureName: z.string().min(1, "Procedure name is required"),
    ndtMethod: z.enum(['HT', 'PNT', 'RT', 'PT', 'UT', 'MT']),
    applicableStandard: z.string().min(1, "Applicable standard is required"),
    procedureRevision: z.string().min(1, "Procedure revision is required"),
    scope: z.string().min(1, "Scope is required"),
    preparation: z.string().min(1, "Preparation is required"),
    procedureSteps: z.string().min(1, "Procedure steps are required"),
    personnelQualification: z.string().min(1, "Personnel qualification is required"),
    acceptanceCriteria: z.string().min(1, "Acceptance criteria is required"),
    limitations: z.string().min(1, "Limitations are required"),
    status: z.enum(['Draft', 'Under Review', 'Approved', 'Superseded']),
    approvalLevel: z.enum(['Level 1', 'Level 2', 'Level 3'], {
      errorMap: () => ({ message: "Approval level is required" })
    }),
    remarks: z.string().optional(), // Only field that remains optional
    tags: z.string().min(1, "Tags are required"),
  });

  type TestProcedureFormData = z.infer<typeof testProcedureFormSchema>;

  // React Hook Form setup
  const form = useForm<TestProcedureFormData>({
    resolver: zodResolver(testProcedureFormSchema),
    defaultValues: {
      procedureNumber: "",
      procedureName: "",
      ndtMethod: "HT",
      applicableStandard: "",
      procedureRevision: "R1",
      scope: "",
      preparation: "",
      procedureSteps: "",
      personnelQualification: "",
      acceptanceCriteria: "",
      limitations: "",
      status: "Draft",
      approvalLevel: "Level 1",
      remarks: "",
      tags: "",
    },
  });

  // Fetch test procedures
  const { data: procedures = [], isLoading } = useQuery<SelectTestProcedure[]>({
    queryKey: ["/api/quality/test-procedures"],
  });

  // Fetch next procedure ID
  const { data: nextProcedureNumber } = useQuery<{ procedureNumber: string }>({
    queryKey: ["/api/quality/test-procedures/next-number"],
  });

  // Create procedure mutation
  const createMutation = useMutation({
    mutationFn: async (data: TestProcedureFormData) => {
      const response = await fetch("/api/quality/test-procedures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!response.ok) throw new Error("Failed to create procedure");
      return response.json();
    },
    onSuccess: (newProcedure) => {
      queryClient.invalidateQueries({ queryKey: ["/api/quality/test-procedures"] });
      queryClient.invalidateQueries({ queryKey: ["/api/quality/test-procedures/next-number"] });
      
      // If there's a pending file upload, upload it immediately
      if (fileUpload) {
        handleImmediateUpload(fileUpload, newProcedure.id);
      }
      
      setIsDialogOpen(false);
      form.reset();
      setEditingProcedure(null);
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
    mutationFn: async ({ id, data }: { id: number; data: TestProcedureFormData }) => {
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
      form.reset();
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



  // File upload state
  const [fileUpload, setFileUpload] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // ValidationErrorSummary component
  const ValidationErrorSummary = ({ errors }: { errors: Record<string, any> }) => {
    const fieldNameMap: Record<string, string> = {
      procedureNumber: "Procedure Number",
      procedureName: "Procedure Name",
      ndtMethod: "NDT Method",
      applicableStandard: "Applicable Standard",
      procedureRevision: "Procedure Revision",
      scope: "Scope",
      preparation: "Preparation",
      procedureSteps: "Procedure Steps",
      personnelQualification: "Personnel Qualification",
      acceptanceCriteria: "Acceptance Criteria",
      limitations: "Limitations",
      status: "Status",
      approvalLevel: "Approval Level",
      tags: "Tags",
    };

    const errorEntries = Object.entries(errors).filter(([_, error]) => error?.message);
    
    if (errorEntries.length === 0) return null;

    return (
      <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-4">
        <div className="flex">
          <AlertTriangle className="h-5 w-5 text-red-400" />
          <div className="ml-3">
            <h3 className="text-sm font-medium text-red-800">
              Please fix the following errors:
            </h3>
            <div className="mt-2 text-sm text-red-700">
              <ul className="list-disc list-inside space-y-1">
                {errorEntries.map(([field, error]) => (
                  <li key={field}>
                    {fieldNameMap[field] || field}: {error.message}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Immediate file upload function
  const handleImmediateUpload = async (file: File, procedureId?: number) => {
    if (!file || (!editingProcedure && !procedureId)) {
      toast({
        title: "Error",
        description: "No procedure selected for upload",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);

      const targetId = editingProcedure?.id || procedureId;
      console.log('Uploading file to procedure ID:', targetId);
      
      const response = await fetch(`/api/quality/test-procedures/${targetId}/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      console.log('Upload response status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Upload failed with response:', errorText);
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();
      console.log('Upload result:', result);

      setUploadSuccess(true);
      setFileUpload(null);
      
      // Clear upload success after 3 seconds
      setTimeout(() => setUploadSuccess(false), 3000);
      
      toast({
        title: "Success",
        description: "Document uploaded successfully!",
      });

    } catch (error) {
      console.error('Upload error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload document",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  // Form submission handlers
  const onSubmit = (data: TestProcedureFormData) => {
    if (editingProcedure) {
      updateMutation.mutate({ id: editingProcedure.id, data });
    } else {
      const finalData = {
        ...data,
        procedureNumber: nextProcedureNumber?.procedureNumber || data.procedureNumber
      };
      createMutation.mutate(finalData);
    }
  };

  const handleEdit = (procedure: SelectTestProcedure) => {
    setEditingProcedure(procedure);
    form.reset({
      procedureNumber: procedure.procedureNumber || "",
      procedureName: procedure.procedureName || "",
      ndtMethod: (procedure.ndtMethod as "HT" | "PNT" | "RT" | "PT" | "UT" | "MT") || "HT",
      applicableStandard: procedure.applicableStandard || "",
      procedureRevision: procedure.procedureRevision || "R1",
      scope: procedure.scope || "",
      preparation: procedure.preparation || "",
      procedureSteps: procedure.procedureSteps || "",
      personnelQualification: procedure.personnelQualification || "",
      acceptanceCriteria: procedure.acceptanceCriteria || "",
      limitations: procedure.limitations || "",
      status: (procedure.status as "Draft" | "Under Review" | "Approved" | "Superseded") || "Draft",
      approvalLevel: (procedure.approvalLevel as "Level 1" | "Level 2" | "Level 3") || "Level 1",
      remarks: procedure.remarks || "",
      tags: procedure.tags || ""
    });
    setIsDialogOpen(true);
  };

  // Reset form when opening new procedure dialog
  const handleOpenDialog = () => {
    setEditingProcedure(null);
    form.reset({
      procedureNumber: nextProcedureNumber?.procedureNumber || "",
      procedureName: "",
      ndtMethod: "HT",
      applicableStandard: "",
      procedureRevision: "R1",
      scope: "",
      preparation: "",
      procedureSteps: "",
      personnelQualification: "",
      acceptanceCriteria: "",
      limitations: "",
      status: "Draft",
      approvalLevel: "Level 1",
      remarks: "",
      tags: "",
    });
    setIsDialogOpen(true);
  };



  const handleDownload = async (procedure: TestProcedure) => {
    try {
      console.log('Downloading test procedure:', procedure.id);
      
      const response = await fetch(`/api/quality/test-procedures/${procedure.id}/download`, {
        method: 'GET',
        credentials: 'include'
      });
      
      console.log('Download response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Download failed:', errorText);
        throw new Error(`Download failed: ${response.status}`);
      }
      
      const result = await response.json();
      console.log('Download result:', result);
      
      if (!result.downloadUrl) {
        throw new Error('No download URL provided');
      }
      
      // Use the signed URL to download the file
      const link = document.createElement('a');
      link.href = result.downloadUrl;
      link.download = result.fileName || `${procedure.procedureNumber}.pdf`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast({
        title: "Download Started",
        description: `Downloading ${result.fileName}`,
      });
    } catch (error) {
      console.error('Download error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to download procedure file",
        variant: "destructive",
      });
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
        <Dialog open={isDialogOpen} onOpenChange={(open) => {
          setIsDialogOpen(open);
          if (!open) {
            form.reset();
            setEditingProcedure(null);
          }
        }}>
          <DialogTrigger asChild>
            <Button onClick={handleOpenDialog}>
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
            
            <ValidationErrorSummary errors={form.formState.errors} />
            
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="procedureNumber"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel className={fieldState.error ? "text-red-600" : ""}>
                          Procedure Number *
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder={nextProcedureNumber?.procedureNumber || "Auto-generated"}
                            className={`${editingProcedure ? 'bg-gray-50 text-gray-600' : ''} ${fieldState.error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}`}
                            readOnly={!!editingProcedure}
                            title={editingProcedure ? "Procedure Number cannot be changed during edit" : "Auto-generated procedure number"}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="ndtMethod"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel className={fieldState.error ? "text-red-600" : ""}>
                          NDT Method *
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className={fieldState.error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="HT">Hydraulic Testing (HT)</SelectItem>
                            <SelectItem value="PNT">Pneumatic Testing (PNT)</SelectItem>
                            <SelectItem value="RT">Radiographic Testing (RT)</SelectItem>
                            <SelectItem value="PT">Penetrant Testing (PT)</SelectItem>
                            <SelectItem value="UT">Ultrasonic Testing (UT)</SelectItem>
                            <SelectItem value="MT">Magnetic Testing (MT)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="procedureName"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className={fieldState.error ? "text-red-600" : ""}>
                        Procedure Name *
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter procedure name"
                          className={fieldState.error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="scope"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className={fieldState.error ? "text-red-600" : ""}>
                        Scope *
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Define the scope and application of this procedure"
                          rows={2}
                          className={fieldState.error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="applicableStandard"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className={fieldState.error ? "text-red-600" : ""}>
                        Applicable Standards *
                      </FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger className={fieldState.error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}>
                            <SelectValue placeholder="Select applicable standard" />
                          </SelectTrigger>
                        </FormControl>
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
                      <FormMessage />
                    </FormItem>
                  )}
                />



                <FormField
                  control={form.control}
                  name="preparation"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className={fieldState.error ? "text-red-600" : ""}>
                        Preparation *
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Preparation procedures"
                          rows={2}
                          className={fieldState.error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="procedureSteps"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className={fieldState.error ? "text-red-600" : ""}>
                        Procedure Steps *
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Detailed step-by-step procedure"
                          rows={4}
                          className={fieldState.error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />



                <FormField
                  control={form.control}
                  name="personnelQualification"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className={fieldState.error ? "text-red-600" : ""}>
                        Personnel Qualification *
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Personnel qualification requirements"
                          rows={2}
                          className={fieldState.error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="acceptanceCriteria"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className={fieldState.error ? "text-red-600" : ""}>
                        Acceptance Criteria *
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Define acceptance criteria and reject limits"
                          rows={3}
                          className={fieldState.error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="limitations"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className={fieldState.error ? "text-red-600" : ""}>
                        Limitations *
                      </FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Procedure limitations"
                          rows={2}
                          className={fieldState.error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />





                {/* File Upload Section */}
                <div className="bg-blue-50 border-2 border-blue-200 dark:bg-blue-950/20 dark:border-blue-800 rounded-lg p-4">
                  <Label htmlFor="fileUpload" className="text-base font-semibold">
                    {editingProcedure ? "Upload New Document (Optional)" : "Procedure Document * (Required)"}
                  </Label>
                  <div className="mt-2 space-y-2">
                    <Input
                      id="fileUpload"
                      type="file"
                      onChange={async (e) => {
                        const file = e.target.files?.[0] || null;
                        setFileUpload(file);
                        
                        // For editing procedures, upload immediately
                        if (editingProcedure && file) {
                          await handleImmediateUpload(file);
                        }
                      }}
                      accept=".pdf,.doc,.docx"
                      className="bg-white dark:bg-gray-900"
                      disabled={isUploading}
                    />
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      <p>📄 Supported formats: PDF, DOC, DOCX files only</p>
                      <p>📦 Max file size: 10MB</p>
                      {editingProcedure ? (
                        <p>🔄 Files upload immediately upon selection</p>
                      ) : (
                        <p>📋 File will upload after procedure creation</p>
                      )}
                    </div>
                    
                    {/* Upload Status */}
                    {isUploading && (
                      <div className="flex items-center space-x-2 p-2 bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 rounded">
                        <div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></div>
                        <p className="text-sm text-blue-700 dark:text-blue-300 font-medium">
                          Uploading document...
                        </p>
                      </div>
                    )}
                    
                    {uploadSuccess && (
                      <div className="flex items-center space-x-2 p-2 bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800 rounded">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        <p className="text-sm text-green-700 dark:text-green-300 font-medium">
                          ✅ Document uploaded successfully!
                        </p>
                      </div>
                    )}
                    
                    {fileUpload && !editingProcedure && (
                      <div className="flex items-center space-x-2 p-2 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded">
                        <div className="w-2 h-2 bg-amber-500 rounded-full"></div>
                        <p className="text-sm text-amber-700 dark:text-amber-300 font-medium">
                          Ready: {fileUpload.name} ({Math.round(fileUpload.size / 1024)} KB)
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Uploaded Files Information Section */}
                <ProcedureFileInfo procedure={editingProcedure} />

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="procedureRevision"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel className={fieldState.error ? "text-red-600" : ""}>
                          Revision *
                        </FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            placeholder="e.g., R1, R2"
                            className={fieldState.error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="status"
                    render={({ field, fieldState }) => (
                      <FormItem>
                        <FormLabel className={fieldState.error ? "text-red-600" : ""}>
                          Status *
                        </FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger className={fieldState.error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}>
                              <SelectValue />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Draft">Draft</SelectItem>
                            <SelectItem value="Under Review">Under Review</SelectItem>
                            <SelectItem value="Approved">Approved</SelectItem>
                            <SelectItem value="Superseded">Superseded</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="remarks"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel>Remarks</FormLabel>
                      <FormControl>
                        <Textarea
                          {...field}
                          placeholder="Additional remarks or comments"
                          rows={2}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="tags"
                  render={({ field, fieldState }) => (
                    <FormItem>
                      <FormLabel className={fieldState.error ? "text-red-600" : ""}>
                        Tags * 
                      </FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="Enter comma-separated tags (e.g., welding, pressure-vessel, API-650)"
                          className={fieldState.error ? "border-red-500 focus:border-red-500 focus:ring-red-500" : ""}
                        />
                      </FormControl>
                      <div className="text-xs text-muted-foreground mt-1">
                        Add searchable keywords separated by commas for easy filtering and categorization
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end space-x-2 pt-4">
                  <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={createMutation.isPending || updateMutation.isPending || isUploading || (!editingProcedure && !fileUpload)}
                  >
                    {createMutation.isPending || updateMutation.isPending ? (
                      editingProcedure ? "Updating..." : "Creating..."
                    ) : (
                      editingProcedure ? "Update Procedure" : 
                      fileUpload ? "Create Procedure & Upload File" : "Select File to Continue"
                    )}
                  </Button>
                </div>
              </form>
            </Form>
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