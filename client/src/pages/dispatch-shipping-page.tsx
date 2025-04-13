import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Loader2, Truck, FileText, Search, Plus, Trash2, Download, Upload, Eye, Edit, CheckCircle, XCircle } from "lucide-react";
import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Define schemas for form validation
const dispatchFormSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  dispatch_date: z.string().min(1, "Dispatch date is required"),
  expected_delivery_date: z.string().optional(),
  transporter_id: z.string().min(1, "Transporter is required"),
  gate_pass_number: z.string().min(1, "Gate pass number is required"),
  delivery_status: z.string().default("Pending"),
  notes: z.string().optional(),
});

const dispatchItemFormSchema = z.object({
  item_id: z.string().min(1, "Item is required"),
  quantity: z.number().min(1, "Quantity must be at least 1"),
  uom: z.string().min(1, "UOM is required"),
  remarks: z.string().optional(),
});

type Project = {
  id: number;
  name: string;
  code: string;
  financial_year: string;
};

type Transporter = {
  id: number;
  name: string;
  contact_person: string;
  email: string;
  phone: string;
};

type ProjectItem = {
  id: number;
  project_id: number;
  item_id: number;
  item_code: string;
  description: string;
  quantity: number;
  uom: string;
  make_or_buy: string;
  drawing_no: string | null;
  status: string;
};

type DispatchRecord = {
  id: number;
  project_id: number;
  dispatch_date: string;
  expected_delivery_date: string | null;
  transporter_id: number;
  gate_pass_number: string;
  delivery_status: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  project?: Project;
  transporter?: Transporter;
};

type DispatchItem = {
  id: number;
  dispatch_id: number;
  item_id: number;
  quantity: number;
  uom: string;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  item?: ProjectItem;
};

type DispatchDocument = {
  id: number;
  dispatch_id: number;
  file_name: string;
  file_type: string;
  file_size: number;
  storage_path: string;
  storage_url: string | null;
  uploaded_by: number;
  created_at: string;
};

export default function DispatchShippingPage() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("dispatch-list");
  const [selectedDispatch, setSelectedDispatch] = useState<DispatchRecord | null>(null);
  const [isAddingItem, setIsAddingItem] = useState(false);
  const [isUploadingDocument, setIsUploadingDocument] = useState(false);
  const [isAddingDispatch, setIsAddingDispatch] = useState(false);
  
  // Query for fetching projects
  const { data: projects, isLoading: isLoadingProjects } = useQuery({
    queryKey: ['/api/projects'],
    queryFn: async () => {
      const response = await fetch('/api/projects');
      const data = await response.json();
      return data;
    }
  });
  
  // Query for fetching transporters
  const { data: transporters, isLoading: isLoadingTransporters } = useQuery({
    queryKey: ['/api/transporters'],
    queryFn: async () => {
      const response = await fetch('/api/transporters');
      const data = await response.json();
      return data;
    }
  });
  
  // Query for fetching dispatch records
  const { 
    data: dispatchRecords, 
    isLoading: isLoadingDispatchRecords,
    refetch: refetchDispatchRecords
  } = useQuery({
    queryKey: ['/api/dispatch'],
    queryFn: async () => {
      const response = await fetch('/api/dispatch');
      const data = await response.json();
      return data;
    }
  });
  
  // Form for creating new dispatch
  const dispatchForm = useForm<z.infer<typeof dispatchFormSchema>>({
    resolver: zodResolver(dispatchFormSchema),
    defaultValues: {
      projectId: "",
      dispatch_date: new Date().toISOString().split('T')[0],
      expected_delivery_date: "",
      transporter_id: "",
      gate_pass_number: "",
      delivery_status: "Pending",
      notes: "",
    },
  });
  
  // Form for adding item to dispatch
  const itemForm = useForm<z.infer<typeof dispatchItemFormSchema>>({
    resolver: zodResolver(dispatchItemFormSchema),
    defaultValues: {
      item_id: "",
      quantity: 1,
      uom: "",
      remarks: "",
    },
  });
  
  // Mutation for creating new dispatch
  const createDispatchMutation = useMutation({
    mutationFn: async (values: z.infer<typeof dispatchFormSchema>) => {
      const res = await apiRequest("POST", "/api/dispatch", {
        project_id: parseInt(values.projectId),
        dispatch_date: values.dispatch_date,
        expected_delivery_date: values.expected_delivery_date || null,
        transporter_id: parseInt(values.transporter_id),
        gate_pass_number: values.gate_pass_number,
        delivery_status: values.delivery_status,
        notes: values.notes || null,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Dispatch record created successfully",
      });
      setIsAddingDispatch(false);
      dispatchForm.reset();
      refetchDispatchRecords();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create dispatch record",
        variant: "destructive",
      });
    },
  });
  
  // Query for fetching project items
  const {
    data: projectItems,
    isLoading: isLoadingProjectItems,
    refetch: refetchProjectItems,
  } = useQuery({
    queryKey: ['/api/dispatch/project-items', selectedDispatch?.project_id],
    queryFn: async () => {
      if (!selectedDispatch?.project_id) return [];
      const response = await fetch(`/api/project-items/${selectedDispatch.project_id}`);
      const data = await response.json();
      return data;
    },
    enabled: !!selectedDispatch?.project_id,
  });
  
  // Query for fetching dispatch items
  const {
    data: dispatchItems,
    isLoading: isLoadingDispatchItems,
    refetch: refetchDispatchItems,
  } = useQuery({
    queryKey: ['/api/dispatch', selectedDispatch?.id, 'items'],
    queryFn: async () => {
      if (!selectedDispatch?.id) return [];
      const response = await fetch(`/api/dispatch/${selectedDispatch.id}/items`);
      const data = await response.json();
      return data;
    },
    enabled: !!selectedDispatch?.id,
  });
  
  // Query for fetching dispatch documents
  const {
    data: dispatchDocuments,
    isLoading: isLoadingDispatchDocuments,
    refetch: refetchDispatchDocuments,
  } = useQuery({
    queryKey: ['/api/dispatch', selectedDispatch?.id, 'documents'],
    queryFn: async () => {
      if (!selectedDispatch?.id) return [];
      const response = await fetch(`/api/dispatch/${selectedDispatch.id}/documents`);
      const data = await response.json();
      return data;
    },
    enabled: !!selectedDispatch?.id,
  });
  
  // Mutation for adding item to dispatch
  const addItemMutation = useMutation({
    mutationFn: async (values: z.infer<typeof dispatchItemFormSchema>) => {
      if (!selectedDispatch) throw new Error("No dispatch selected");
      
      const res = await apiRequest("POST", `/api/dispatch/${selectedDispatch.id}/items`, {
        item_id: parseInt(values.item_id),
        quantity: values.quantity,
        uom: values.uom,
        remarks: values.remarks || null,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Item added to dispatch successfully",
      });
      setIsAddingItem(false);
      itemForm.reset();
      refetchDispatchItems();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add item to dispatch",
        variant: "destructive",
      });
    },
  });
  
  // Mutation for deleting dispatch item
  const deleteItemMutation = useMutation({
    mutationFn: async (itemId: number) => {
      const res = await apiRequest("DELETE", `/api/dispatch/items/${itemId}`);
      return res;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Item removed from dispatch successfully",
      });
      refetchDispatchItems();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove item from dispatch",
        variant: "destructive",
      });
    },
  });
  
  // Mutation for uploading document
  const uploadDocumentMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      if (!selectedDispatch) throw new Error("No dispatch selected");
      
      const res = await fetch(`/api/dispatch/${selectedDispatch.id}/documents`, {
        method: "POST",
        body: formData,
      });
      
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || "Failed to upload document");
      }
      
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Document uploaded successfully",
      });
      setIsUploadingDocument(false);
      refetchDispatchDocuments();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
    },
  });
  
  // Mutation for deleting document
  const deleteDocumentMutation = useMutation({
    mutationFn: async (documentId: number) => {
      const res = await apiRequest("DELETE", `/api/dispatch/documents/${documentId}`);
      return res;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Document deleted successfully",
      });
      refetchDispatchDocuments();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete document",
        variant: "destructive",
      });
    },
  });
  
  // Mutation for updating dispatch status
  const updateDispatchStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await apiRequest("PUT", `/api/dispatch/${id}`, {
        delivery_status: status,
      });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Dispatch status updated successfully",
      });
      refetchDispatchRecords();
      if (selectedDispatch) {
        // Update selected dispatch with new status
        const updated = dispatchRecords.find((d: DispatchRecord) => d.id === selectedDispatch.id);
        if (updated) {
          setSelectedDispatch(updated);
        }
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update dispatch status",
        variant: "destructive",
      });
    },
  });
  
  // Function to download document
  const downloadDocument = async (documentId: number) => {
    try {
      const response = await fetch(`/api/dispatch/documents/${documentId}/download`);
      const data = await response.json();
      
      if (data.url) {
        window.open(data.url, '_blank');
      } else {
        toast({
          title: "Error",
          description: "Failed to generate download URL",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download document",
        variant: "destructive",
      });
    }
  };
  
  // Function to handle file upload
  const handleFileUpload = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const formData = new FormData(form);
    
    uploadDocumentMutation.mutate(formData);
  };
  
  // Function to view dispatch details
  const viewDispatchDetails = (dispatch: DispatchRecord) => {
    setSelectedDispatch(dispatch);
    setActiveTab("dispatch-details");
  };
  
  // Render loading state
  if (isLoadingProjects || isLoadingTransporters || isLoadingDispatchRecords) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-2">Loading...</span>
      </div>
    );
  }
  
  // Render dispatch list
  const renderDispatchList = () => {
    if (!dispatchRecords || dispatchRecords.length === 0) {
      return (
        <Alert className="mt-4">
          <AlertTitle>No dispatch records found</AlertTitle>
          <AlertDescription>
            Create a new dispatch record to get started.
          </AlertDescription>
        </Alert>
      );
    }
    
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Project</TableHead>
            <TableHead>Dispatch Date</TableHead>
            <TableHead>Gate Pass</TableHead>
            <TableHead>Transporter</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {dispatchRecords.map((dispatch: DispatchRecord) => (
            <TableRow key={dispatch.id}>
              <TableCell>{dispatch.id}</TableCell>
              <TableCell>
                {dispatch.project?.code} - {dispatch.project?.name}
              </TableCell>
              <TableCell>{format(new Date(dispatch.dispatch_date), 'dd/MM/yyyy')}</TableCell>
              <TableCell>{dispatch.gate_pass_number}</TableCell>
              <TableCell>{dispatch.transporter?.name}</TableCell>
              <TableCell>
                <Badge
                  className={
                    dispatch.delivery_status === "Delivered" ? "bg-green-500 text-white" :
                    dispatch.delivery_status === "In Transit" ? "bg-yellow-500 text-white" :
                    ""
                  }
                  variant={dispatch.delivery_status === "Pending" ? "outline" : "default"}
                >
                  {dispatch.delivery_status}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex space-x-2">
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => viewDispatchDetails(dispatch)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>View Details</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };
  
  // Render dispatch details
  const renderDispatchDetails = () => {
    if (!selectedDispatch) return null;
    
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold">
              Dispatch #{selectedDispatch.id}
            </h2>
            <p className="text-muted-foreground">
              Project: {selectedDispatch.project?.name} ({selectedDispatch.project?.code})
            </p>
          </div>
          <div className="flex space-x-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setActiveTab("dispatch-list");
                      setSelectedDispatch(null);
                    }}
                  >
                    Back to List
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Return to dispatch list</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            
            <Select
              value={selectedDispatch.delivery_status}
              onValueChange={(value) => 
                updateDispatchStatusMutation.mutate({
                  id: selectedDispatch.id,
                  status: value
                })
              }
            >
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Update Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="In Transit">In Transit</SelectItem>
                <SelectItem value="Delivered">Delivered</SelectItem>
                <SelectItem value="Cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        
        <Card>
          <CardHeader>
            <CardTitle>Dispatch Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">Dispatch Date</h4>
                <p>{format(new Date(selectedDispatch.dispatch_date), 'dd/MM/yyyy')}</p>
              </div>
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">Expected Delivery Date</h4>
                <p>
                  {selectedDispatch.expected_delivery_date
                    ? format(new Date(selectedDispatch.expected_delivery_date), 'dd/MM/yyyy')
                    : 'Not specified'}
                </p>
              </div>
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">Gate Pass Number</h4>
                <p>{selectedDispatch.gate_pass_number}</p>
              </div>
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">Status</h4>
                <Badge
                  variant={
                    selectedDispatch.delivery_status === "Delivered" ? "success" :
                    selectedDispatch.delivery_status === "In Transit" ? "warning" :
                    "outline"
                  }
                >
                  {selectedDispatch.delivery_status}
                </Badge>
              </div>
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">Transporter</h4>
                <p>{selectedDispatch.transporter?.name}</p>
              </div>
              <div>
                <h4 className="font-medium text-sm text-muted-foreground">Transporter Contact</h4>
                <p>{selectedDispatch.transporter?.contact_person} ({selectedDispatch.transporter?.phone})</p>
              </div>
            </div>
            
            {selectedDispatch.notes && (
              <div className="mt-4">
                <h4 className="font-medium text-sm text-muted-foreground">Notes</h4>
                <p>{selectedDispatch.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
        
        <Tabs defaultValue="items" className="w-full">
          <TabsList>
            <TabsTrigger value="items">Items</TabsTrigger>
            <TabsTrigger value="documents">Documents</TabsTrigger>
          </TabsList>
          
          <TabsContent value="items" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Dispatch Items</h3>
              <Button onClick={() => setIsAddingItem(true)} disabled={isAddingItem}>
                <Plus className="h-4 w-4 mr-2" />
                Add Item
              </Button>
            </div>
            
            {isLoadingDispatchItems ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2">Loading items...</span>
              </div>
            ) : !dispatchItems || dispatchItems.length === 0 ? (
              <Alert>
                <AlertTitle>No items added</AlertTitle>
                <AlertDescription>
                  Add items to this dispatch record using the "Add Item" button.
                </AlertDescription>
              </Alert>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>UOM</TableHead>
                    <TableHead>Remarks</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dispatchItems.map((item: DispatchItem) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.item?.item_code}</TableCell>
                      <TableCell>{item.item?.description}</TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>{item.uom}</TableCell>
                      <TableCell>{item.remarks || '-'}</TableCell>
                      <TableCell>
                        <Button
                          variant="destructive"
                          size="icon"
                          onClick={() => deleteItemMutation.mutate(item.id)}
                          disabled={deleteItemMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            
            {/* Dialog for adding items */}
            <Dialog open={isAddingItem} onOpenChange={setIsAddingItem}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Item to Dispatch</DialogTitle>
                  <DialogDescription>
                    Select an item from the project and specify the quantity.
                  </DialogDescription>
                </DialogHeader>
                
                <Form {...itemForm}>
                  <form onSubmit={itemForm.handleSubmit((values) => addItemMutation.mutate(values))} className="space-y-4">
                    <FormField
                      control={itemForm.control}
                      name="item_id"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Item</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value.toString()}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select an item" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {projectItems && projectItems.map((item: ProjectItem) => (
                                <SelectItem key={item.id} value={item.item_id.toString()}>
                                  {item.item_code} - {item.description}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={itemForm.control}
                      name="quantity"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Quantity</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min="1"
                              {...field}
                              onChange={(e) => field.onChange(parseInt(e.target.value))}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={itemForm.control}
                      name="uom"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>UOM</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={itemForm.control}
                      name="remarks"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Remarks</FormLabel>
                          <FormControl>
                            <Input {...field} />
                          </FormControl>
                          <FormDescription>Optional notes about this item</FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <DialogFooter>
                      <Button 
                        type="submit" 
                        disabled={addItemMutation.isPending}
                      >
                        {addItemMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Add Item
                      </Button>
                    </DialogFooter>
                  </form>
                </Form>
              </DialogContent>
            </Dialog>
          </TabsContent>
          
          <TabsContent value="documents" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Documents</h3>
              <Button onClick={() => setIsUploadingDocument(true)} disabled={isUploadingDocument}>
                <Upload className="h-4 w-4 mr-2" />
                Upload Document
              </Button>
            </div>
            
            {isLoadingDispatchDocuments ? (
              <div className="flex items-center justify-center h-32">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <span className="ml-2">Loading documents...</span>
              </div>
            ) : !dispatchDocuments || dispatchDocuments.length === 0 ? (
              <Alert>
                <AlertTitle>No documents uploaded</AlertTitle>
                <AlertDescription>
                  Upload documents related to this dispatch using the "Upload Document" button.
                </AlertDescription>
              </Alert>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>File Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Uploaded</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {dispatchDocuments.map((doc: DispatchDocument) => (
                    <TableRow key={doc.id}>
                      <TableCell>{doc.file_name}</TableCell>
                      <TableCell>{doc.file_type}</TableCell>
                      <TableCell>{formatFileSize(doc.file_size)}</TableCell>
                      <TableCell>{format(new Date(doc.created_at), 'dd/MM/yyyy HH:mm')}</TableCell>
                      <TableCell>
                        <div className="flex space-x-2">
                          <Button
                            variant="outline"
                            size="icon"
                            onClick={() => downloadDocument(doc.id)}
                          >
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="destructive"
                            size="icon"
                            onClick={() => deleteDocumentMutation.mutate(doc.id)}
                            disabled={deleteDocumentMutation.isPending}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            
            {/* Dialog for uploading documents */}
            <Dialog open={isUploadingDocument} onOpenChange={setIsUploadingDocument}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Upload Document</DialogTitle>
                  <DialogDescription>
                    Upload a document related to this dispatch.
                  </DialogDescription>
                </DialogHeader>
                
                <form onSubmit={handleFileUpload} className="space-y-4">
                  <div className="grid w-full max-w-sm items-center gap-1.5">
                    <FormLabel htmlFor="file">Document</FormLabel>
                    <Input id="file" name="file" type="file" required />
                    <p className="text-sm text-muted-foreground">
                      Max file size: 10MB
                    </p>
                  </div>
                  
                  <DialogFooter>
                    <Button
                      type="submit"
                      disabled={uploadDocumentMutation.isPending}
                    >
                      {uploadDocumentMutation.isPending && (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      )}
                      Upload
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </TabsContent>
        </Tabs>
      </div>
    );
  };
  
  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dispatch & Shipping</h1>
          <p className="text-muted-foreground">
            Manage dispatch records and shipping information for projects
          </p>
        </div>
        
        {activeTab === "dispatch-list" && (
          <Button onClick={() => setIsAddingDispatch(true)}>
            <Truck className="mr-2 h-4 w-4" />
            New Dispatch
          </Button>
        )}
      </div>
      
      {activeTab === "dispatch-list" ? renderDispatchList() : renderDispatchDetails()}
      
      {/* Dialog for creating new dispatch */}
      <Dialog open={isAddingDispatch} onOpenChange={setIsAddingDispatch}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create New Dispatch Record</DialogTitle>
            <DialogDescription>
              Fill in the details to create a new dispatch record
            </DialogDescription>
          </DialogHeader>
          
          <Form {...dispatchForm}>
            <form onSubmit={dispatchForm.handleSubmit((values) => createDispatchMutation.mutate(values))} className="space-y-4">
              <FormField
                control={dispatchForm.control}
                name="projectId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a project" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projects && projects.map((project: Project) => (
                          <SelectItem key={project.id} value={project.id.toString()}>
                            {project.code} - {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={dispatchForm.control}
                  name="dispatch_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Dispatch Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={dispatchForm.control}
                  name="expected_delivery_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expected Delivery Date</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormDescription>Optional</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={dispatchForm.control}
                  name="transporter_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Transporter</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a transporter" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {transporters && transporters.map((transporter: Transporter) => (
                            <SelectItem key={transporter.id} value={transporter.id.toString()}>
                              {transporter.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={dispatchForm.control}
                  name="gate_pass_number"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gate Pass Number</FormLabel>
                      <FormControl>
                        <Input {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <FormField
                control={dispatchForm.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Notes</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormDescription>Optional additional information</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <DialogFooter>
                <Button
                  type="submit"
                  disabled={createDispatchMutation.isPending}
                >
                  {createDispatchMutation.isPending && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Create Dispatch
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Helper function to format file size
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}