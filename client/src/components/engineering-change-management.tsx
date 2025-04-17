import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNow } from 'date-fns';
import { 
  Plus, 
  Pencil, 
  Trash, 
  FileText, 
  Upload, 
  Loader2, 
  ClipboardList,
  Download,
  Eye,
  Filter
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, queryClient } from "../lib/queryClient";

interface ChangeDocument {
  id: number;
  document_name: string;
  document_type: string;
  document_path: string;
  uploaded_by: number;
  uploaded_at: string;
  storage_url: string;
}

interface ECR {
  id: number;
  document_number: string;
  item_id: number;
  description: string;
  reason: string;
  status: string;
  requested_by: number;
  requested_date: string;
  approved_by?: number;
  approved_date?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  documents?: ChangeDocument[];
}

interface ECN {
  id: number;
  document_number: string;
  ecr_id?: number;
  item_id: number;
  description: string;
  implementation_details: string;
  status: string;
  issued_by: number;
  issued_date: string;
  implementation_date?: string;
  implemented_by?: number;
  notes?: string;
  created_at: string;
  updated_at: string;
  documents?: ChangeDocument[];
}

interface EngineeringChangeManagementProps {
  itemId: number;
  users: any[];
  onBack: () => void;
}

const EngineeringChangeManagement: React.FC<EngineeringChangeManagementProps> = ({ itemId, users, onBack }) => {
  const [activeTab, setActiveTab] = useState<'ecr' | 'ecn'>('ecr');
  const [createEcrDialogOpen, setCreateEcrDialogOpen] = useState(false);
  const [createEcnDialogOpen, setCreateEcnDialogOpen] = useState(false);
  const [selectedEcr, setSelectedEcr] = useState<ECR | null>(null);
  const [selectedEcn, setSelectedEcn] = useState<ECN | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState('Drawing');
  const [currentDocumentTarget, setCurrentDocumentTarget] = useState<{ type: 'ecr' | 'ecn', id: number } | null>(null);
  
  // Form data for ECR creation/editing
  const [ecrForm, setEcrForm] = useState({
    description: '',
    reason: '',
    notes: '',
    drawing_number: ''
  });
  
  // Form data for ECN creation/editing
  const [ecnForm, setEcnForm] = useState({
    description: '',
    implementation_details: '',
    ecr_id: undefined as number | undefined,
    implementation_date: '',
    notes: '',
    drawing_number: ''
  });
  
  // State for current item details
  const [currentItem, setCurrentItem] = useState<{id: number, drawingNo?: string, itemCode: string} | null>(null);
  
  // State for available drawing numbers (parent and components)
  const [drawingNumbers, setDrawingNumbers] = useState<{id: number, drawingNo: string, itemCode: string}[]>([]);

  // Fetch ECRs
  const { 
    data: ecrs = [], 
    isLoading: ecrsLoading 
  } = useQuery({
    queryKey: ['/api/ecr/item', itemId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/ecr/item/${itemId}`);
      return await res.json();
    },
    enabled: !!itemId,
  });
  
  // Fetch ECNs
  const { 
    data: ecns = [], 
    isLoading: ecnsLoading 
  } = useQuery({
    queryKey: ['/api/ecn/item', itemId],
    queryFn: async () => {
      const res = await apiRequest('GET', `/api/ecn/item/${itemId}`);
      return await res.json();
    },
    enabled: !!itemId,
  });

  // Create ECR mutation
  const createEcrMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/ecr', {
        ...data,
        item_id: itemId
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ecr/item', itemId] });
      setCreateEcrDialogOpen(false);
      setEcrForm({ description: '', reason: '', notes: '', drawing_number: '' });
      toast({
        title: "ECR Created",
        description: "Engineering Change Request has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create ECR",
        variant: "destructive",
      });
    }
  });

  // Create ECN mutation
  const createEcnMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/ecn', {
        ...data,
        item_id: itemId
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ecn/item', itemId] });
      setCreateEcnDialogOpen(false);
      setEcnForm({
        description: '',
        implementation_details: '',
        ecr_id: undefined,
        implementation_date: '',
        notes: '',
        drawing_number: ''
      });
      toast({
        title: "ECN Created",
        description: "Engineering Change Notice has been created successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create ECN",
        variant: "destructive",
      });
    }
  });

  // Update ECR status mutation
  const updateEcrStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number, status: string }) => {
      const res = await apiRequest('PUT', `/api/ecr/${id}`, { status });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ecr/item', itemId] });
      toast({
        title: "Status Updated",
        description: "ECR status has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    }
  });

  // Update ECN status mutation
  const updateEcnStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number, status: string }) => {
      const res = await apiRequest('PUT', `/api/ecn/${id}`, { status });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ecn/item', itemId] });
      toast({
        title: "Status Updated",
        description: "ECN status has been updated successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update status",
        variant: "destructive",
      });
    }
  });

  // Delete ECR mutation
  const deleteEcrMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/ecr/${id}`);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ecr/item', itemId] });
      toast({
        title: "ECR Deleted",
        description: "Engineering Change Request has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete ECR",
        variant: "destructive",
      });
    }
  });

  // Delete ECN mutation
  const deleteEcnMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/ecn/${id}`);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/ecn/item', itemId] });
      toast({
        title: "ECN Deleted",
        description: "Engineering Change Notice has been deleted successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete ECN",
        variant: "destructive",
      });
    }
  });

  // Upload document mutation
  const uploadDocumentMutation = useMutation({
    mutationFn: async ({ id, type, file, docType }: { id: number, type: 'ecr' | 'ecn', file: File, docType: string }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentType', docType);
      
      const url = type === 'ecr' ? `/api/ecr/${id}/documents` : `/api/ecn/${id}/documents`;
      const res = await apiRequest('POST', url, formData, true);
      return await res.json();
    },
    onSuccess: (_, variables) => {
      const queryKey = variables.type === 'ecr' ? ['/api/ecr/item', itemId] : ['/api/ecn/item', itemId];
      queryClient.invalidateQueries({ queryKey });
      setUploadDialogOpen(false);
      setSelectedFile(null);
      setDocumentType('Drawing');
      toast({
        title: "Document Uploaded",
        description: "Document has been uploaded successfully.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to upload document",
        variant: "destructive",
      });
    }
  });

  // Format date for display
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' (' + formatDistanceToNow(date, { addSuffix: true }) + ')';
  };

  // Handle file input change
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFile(e.target.files[0]);
    }
  };

  // Get user name by ID
  const getUserName = (userId: number) => {
    const user = users.find(u => u.id === userId);
    return user ? user.username : 'Unknown';
  };

  // ECR status badge component
  const EcrStatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'Draft':
        return <Badge variant="outline">Draft</Badge>;
      case 'Submitted':
        return <Badge variant="secondary">Submitted</Badge>;
      case 'Approved':
        return <Badge className="bg-green-600 text-white hover:bg-green-700">Approved</Badge>;
      case 'Rejected':
        return <Badge variant="destructive">Rejected</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // ECN status badge component
  const EcnStatusBadge = ({ status }: { status: string }) => {
    switch (status) {
      case 'Draft':
        return <Badge variant="outline">Draft</Badge>;
      case 'Open':
        return <Badge variant="secondary">Open</Badge>;
      case 'In Progress':
        return <Badge className="bg-yellow-500 text-white hover:bg-yellow-600">In Progress</Badge>;
      case 'Implemented':
        return <Badge className="bg-green-600 text-white hover:bg-green-700">Implemented</Badge>;
      case 'Cancelled':
        return <Badge variant="destructive">Cancelled</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  // Handle ECR create form submission
  const handleCreateEcr = () => {
    if (!ecrForm.description || !ecrForm.reason) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    
    // Automatically set the drawing number from the current item
    const drawingNumber = currentItem?.drawingNo || currentItem?.itemCode || '';
    
    createEcrMutation.mutate({
      ...ecrForm,
      drawing_number: drawingNumber
    });
  };

  // Handle ECN create form submission
  const handleCreateEcn = () => {
    if (!ecnForm.description || !ecnForm.implementation_details) {
      toast({
        title: "Validation Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }
    
    // Automatically set the drawing number from the current item
    const drawingNumber = currentItem?.drawingNo || currentItem?.itemCode || '';
    
    createEcnMutation.mutate({
      ...ecnForm,
      drawing_number: drawingNumber
    });
  };

  // Handle document upload
  const handleUploadDocument = () => {
    if (!selectedFile || !currentDocumentTarget) {
      toast({
        title: "Validation Error",
        description: "Please select a file to upload",
        variant: "destructive",
      });
      return;
    }
    
    uploadDocumentMutation.mutate({
      id: currentDocumentTarget.id,
      type: currentDocumentTarget.type,
      file: selectedFile,
      docType: documentType
    });
  };

  // Open upload dialog for a specific ECR/ECN
  const openUploadDialog = (type: 'ecr' | 'ecn', id: number) => {
    setCurrentDocumentTarget({ type, id });
    setUploadDialogOpen(true);
  };

  // Handle ECR deletion
  const handleDeleteEcr = (id: number) => {
    if (window.confirm('Are you sure you want to delete this ECR?')) {
      deleteEcrMutation.mutate(id);
    }
  };

  // Handle ECN deletion
  const handleDeleteEcn = (id: number) => {
    if (window.confirm('Are you sure you want to delete this ECN?')) {
      deleteEcnMutation.mutate(id);
    }
  };
  
  // Fetch drawing numbers for parent item and components
  useEffect(() => {
    const fetchDrawingNumbers = async () => {
      try {
        // Fetch parent item details
        const itemRes = await apiRequest('GET', `/api/master-items/${itemId}`);
        const item = await itemRes.json();
        
        // Set current item
        setCurrentItem({
          id: item.id,
          drawingNo: item.drawingNo,
          itemCode: item.itemCode
        });
        
        // Fetch components
        const componentsRes = await apiRequest('GET', `/api/master-items/${itemId}/components`);
        const components = await componentsRes.json();
        
        // Combine parent and component drawing numbers
        const allDrawings = [
          ...(item.drawingNo ? [{ id: item.id, drawingNo: item.drawingNo, itemCode: item.itemCode }] : []),
          ...components
            .filter((comp: any) => comp.drawingNo)
            .map((comp: any) => ({ 
              id: comp.id, 
              drawingNo: comp.drawingNo, 
              itemCode: comp.itemCode 
            }))
        ];
        
        setDrawingNumbers(allDrawings);
      } catch (error) {
        console.error('Error fetching drawing numbers:', error);
      }
    };
    
    if (itemId) {
      fetchDrawingNumbers();
    }
  }, [itemId]);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">ECR & ECN Management</h3>
        <div className="space-x-2">
          <Button 
            size="sm" 
            variant="outline" 
            onClick={() => setCreateEcrDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" /> Create ECR
          </Button>
          <Button 
            size="sm"
            onClick={() => setCreateEcnDialogOpen(true)}
          >
            <Plus className="h-4 w-4 mr-1" /> Create ECN
          </Button>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as 'ecr' | 'ecn')}>
        <TabsList className="grid w-[400px] grid-cols-2">
          <TabsTrigger value="ecr">Engineering Change Requests</TabsTrigger>
          <TabsTrigger value="ecn">Engineering Change Notices</TabsTrigger>
        </TabsList>
        
        <TabsContent value="ecr">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doc No.</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Requested By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ecrsLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : ecrs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6">
                      <div className="flex flex-col items-center justify-center text-sm text-muted-foreground">
                        <ClipboardList className="h-8 w-8 mb-2" />
                        <p>No Engineering Change Requests yet</p>
                        <p className="text-xs mt-1">Use the Create ECR button to add a new request</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  ecrs.map((ecr: ECR) => (
                    <TableRow key={ecr.id}>
                      <TableCell>{ecr.document_number}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={ecr.description}>
                        {ecr.description}
                      </TableCell>
                      <TableCell>{getUserName(ecr.requested_by)}</TableCell>
                      <TableCell>{formatDate(ecr.requested_date)}</TableCell>
                      <TableCell>
                        <EcrStatusBadge status={ecr.status} />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedEcr(ecr)}>
                              <Eye className="h-4 w-4 mr-2" /> View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openUploadDialog('ecr', ecr.id)}>
                              <Upload className="h-4 w-4 mr-2" /> Upload Documents
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => updateEcrStatusMutation.mutate({ id: ecr.id, status: 'Submitted' })}
                              disabled={ecr.status !== 'Draft'}
                            >
                              Submit for Approval
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => updateEcrStatusMutation.mutate({ id: ecr.id, status: 'Approved' })}
                              disabled={ecr.status !== 'Submitted'}
                            >
                              Approve
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => updateEcrStatusMutation.mutate({ id: ecr.id, status: 'Rejected' })}
                              disabled={ecr.status !== 'Submitted'}
                            >
                              Reject
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDeleteEcr(ecr.id)} className="text-red-500">
                              <Trash className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
        
        <TabsContent value="ecn">
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Doc No.</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Issued By</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ecnsLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : ecns.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-6">
                      <div className="flex flex-col items-center justify-center text-sm text-muted-foreground">
                        <ClipboardList className="h-8 w-8 mb-2" />
                        <p>No Engineering Change Notices yet</p>
                        <p className="text-xs mt-1">Use the Create ECN button to add a new notice</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  ecns.map((ecn: ECN) => (
                    <TableRow key={ecn.id}>
                      <TableCell>{ecn.document_number}</TableCell>
                      <TableCell className="max-w-[200px] truncate" title={ecn.description}>
                        {ecn.description}
                      </TableCell>
                      <TableCell>{getUserName(ecn.issued_by)}</TableCell>
                      <TableCell>{formatDate(ecn.issued_date)}</TableCell>
                      <TableCell>
                        <EcnStatusBadge status={ecn.status} />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setSelectedEcn(ecn)}>
                              <Eye className="h-4 w-4 mr-2" /> View Details
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => openUploadDialog('ecn', ecn.id)}>
                              <Upload className="h-4 w-4 mr-2" /> Upload Documents
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem 
                              onClick={() => updateEcnStatusMutation.mutate({ id: ecn.id, status: 'Open' })}
                              disabled={ecn.status !== 'Draft'}
                            >
                              Set to Open
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => updateEcnStatusMutation.mutate({ id: ecn.id, status: 'In Progress' })}
                              disabled={ecn.status !== 'Open'}
                            >
                              Mark as In Progress
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => updateEcnStatusMutation.mutate({ id: ecn.id, status: 'Implemented' })}
                              disabled={ecn.status !== 'In Progress'}
                            >
                              Mark as Implemented
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              onClick={() => updateEcnStatusMutation.mutate({ id: ecn.id, status: 'Cancelled' })}
                              disabled={['Implemented', 'Cancelled'].includes(ecn.status)}
                            >
                              Cancel
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDeleteEcn(ecn.id)} className="text-red-500">
                              <Trash className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
      
      <div className="flex justify-between mt-6">
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
          >
            Back
          </Button>
        </div>
      </div>
      
      {/* Create ECR Dialog */}
      <Dialog open={createEcrDialogOpen} onOpenChange={setCreateEcrDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create Engineering Change Request</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="ecr-drawing">Drawing Number</Label>
              <div className="border rounded-md p-2 bg-muted text-sm">
                {currentItem?.drawingNo ? `${currentItem.drawingNo} - ${currentItem.itemCode}` : `${currentItem?.itemCode || ''}`}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Drawing number is automatically set from the current item</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ecr-description">Description</Label>
              <Textarea
                id="ecr-description"
                placeholder="Enter a description of the requested change"
                value={ecrForm.description}
                onChange={(e) => setEcrForm({ ...ecrForm, description: e.target.value })}
                className="min-h-[80px]"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ecr-reason">Reason for Change</Label>
              <Textarea
                id="ecr-reason"
                placeholder="Explain why this change is needed"
                value={ecrForm.reason}
                onChange={(e) => setEcrForm({ ...ecrForm, reason: e.target.value })}
                className="min-h-[80px]"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ecr-notes">Additional Notes (Optional)</Label>
              <Textarea
                id="ecr-notes"
                placeholder="Any additional information or context"
                value={ecrForm.notes}
                onChange={(e) => setEcrForm({ ...ecrForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateEcrDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateEcr}
              disabled={createEcrMutation.isPending}
            >
              {createEcrMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create ECR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Create ECN Dialog */}
      <Dialog open={createEcnDialogOpen} onOpenChange={setCreateEcnDialogOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Create Engineering Change Notice</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {ecrs.length > 0 && (
              <div className="grid gap-2">
                <Label htmlFor="ecn-ecr">Related ECR (Optional)</Label>
                <Select
                  value={ecnForm.ecr_id?.toString() || ""}
                  onValueChange={(value) => setEcnForm({ ...ecnForm, ecr_id: value ? parseInt(value) : undefined })}
                >
                  <SelectTrigger id="ecn-ecr">
                    <SelectValue placeholder="Select an ECR" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {ecrs.map((ecr: ECR) => (
                      <SelectItem key={ecr.id} value={ecr.id.toString()}>
                        {ecr.document_number} - {ecr.description.slice(0, 30)}{ecr.description.length > 30 ? '...' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <Label htmlFor="ecn-drawing">Drawing Number</Label>
              <div className="border rounded-md p-2 bg-muted text-sm">
                {currentItem?.drawingNo ? `${currentItem.drawingNo} - ${currentItem.itemCode}` : `${currentItem?.itemCode || ''}`}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Drawing number is automatically set from the current item</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ecn-description">Description</Label>
              <Textarea
                id="ecn-description"
                placeholder="Enter a description of the change"
                value={ecnForm.description}
                onChange={(e) => setEcnForm({ ...ecnForm, description: e.target.value })}
                className="min-h-[80px]"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ecn-implementation">Implementation Details</Label>
              <Textarea
                id="ecn-implementation"
                placeholder="Provide specific implementation instructions"
                value={ecnForm.implementation_details}
                onChange={(e) => setEcnForm({ ...ecnForm, implementation_details: e.target.value })}
                className="min-h-[80px]"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ecn-date">Target Implementation Date (Optional)</Label>
              <Input
                id="ecn-date"
                type="date"
                value={ecnForm.implementation_date}
                onChange={(e) => setEcnForm({ ...ecnForm, implementation_date: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="ecn-notes">Additional Notes (Optional)</Label>
              <Textarea
                id="ecn-notes"
                placeholder="Any additional information or context"
                value={ecnForm.notes}
                onChange={(e) => setEcnForm({ ...ecnForm, notes: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateEcnDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateEcn}
              disabled={createEcnMutation.isPending}
            >
              {createEcnMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Create ECN
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* ECR Detail Dialog */}
      <Dialog open={!!selectedEcr} onOpenChange={(open) => !open && setSelectedEcr(null)}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Engineering Change Request Details</DialogTitle>
          </DialogHeader>
          {selectedEcr && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Document Number</h4>
                  <p>{selectedEcr.document_number}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Status</h4>
                  <EcrStatusBadge status={selectedEcr.status} />
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Requested By</h4>
                  <p>{getUserName(selectedEcr.requested_by)}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Requested Date</h4>
                  <p>{formatDate(selectedEcr.requested_date)}</p>
                </div>
                {selectedEcr.approved_by && (
                  <div>
                    <h4 className="font-semibold text-sm text-muted-foreground">Approved By</h4>
                    <p>{getUserName(selectedEcr.approved_by)}</p>
                  </div>
                )}
                {selectedEcr.approved_date && (
                  <div>
                    <h4 className="font-semibold text-sm text-muted-foreground">Approval Date</h4>
                    <p>{formatDate(selectedEcr.approved_date)}</p>
                  </div>
                )}
              </div>
              
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground">Description</h4>
                <p className="mt-1 whitespace-pre-line">{selectedEcr.description}</p>
              </div>
              
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground">Reason for Change</h4>
                <p className="mt-1 whitespace-pre-line">{selectedEcr.reason}</p>
              </div>
              
              {selectedEcr.notes && (
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Additional Notes</h4>
                  <p className="mt-1 whitespace-pre-line">{selectedEcr.notes}</p>
                </div>
              )}
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-semibold text-sm">Related Documents</h4>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => openUploadDialog('ecr', selectedEcr.id)}
                  >
                    <Upload className="h-4 w-4 mr-1" /> Upload
                  </Button>
                </div>
                
                {selectedEcr.documents && selectedEcr.documents.length > 0 ? (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Uploaded By</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedEcr.documents.map((doc: ChangeDocument) => (
                          <TableRow key={doc.id}>
                            <TableCell className="max-w-[200px] truncate">{doc.document_name}</TableCell>
                            <TableCell>{doc.document_type}</TableCell>
                            <TableCell>{getUserName(doc.uploaded_by)}</TableCell>
                            <TableCell>{formatDate(doc.uploaded_at)}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => window.open(doc.storage_url, '_blank')}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-6 border rounded-md">
                    <div className="flex flex-col items-center justify-center text-sm text-muted-foreground">
                      <FileText className="h-8 w-8 mb-2" />
                      <p>No documents attached</p>
                      <p className="text-xs mt-1">Upload relevant documents using the button above</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* ECN Detail Dialog */}
      <Dialog open={!!selectedEcn} onOpenChange={(open) => !open && setSelectedEcn(null)}>
        <DialogContent className="sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Engineering Change Notice Details</DialogTitle>
          </DialogHeader>
          {selectedEcn && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Document Number</h4>
                  <p>{selectedEcn.document_number}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Status</h4>
                  <EcnStatusBadge status={selectedEcn.status} />
                </div>
                {selectedEcn.ecr_id && (
                  <div>
                    <h4 className="font-semibold text-sm text-muted-foreground">Related ECR</h4>
                    <p>
                      {(() => {
                        const relatedEcr = ecrs.find((ecr: any) => ecr.id === selectedEcn.ecr_id);
                        return relatedEcr ? relatedEcr.document_number : 'Unknown';
                      })()}
                    </p>
                  </div>
                )}
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Issued By</h4>
                  <p>{getUserName(selectedEcn.issued_by)}</p>
                </div>
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Issued Date</h4>
                  <p>{formatDate(selectedEcn.issued_date)}</p>
                </div>
                {selectedEcn.implementation_date && (
                  <div>
                    <h4 className="font-semibold text-sm text-muted-foreground">Target Implementation Date</h4>
                    <p>{new Date(selectedEcn.implementation_date).toLocaleDateString()}</p>
                  </div>
                )}
                {selectedEcn.implemented_by && (
                  <div>
                    <h4 className="font-semibold text-sm text-muted-foreground">Implemented By</h4>
                    <p>{getUserName(selectedEcn.implemented_by)}</p>
                  </div>
                )}
              </div>
              
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground">Description</h4>
                <p className="mt-1 whitespace-pre-line">{selectedEcn.description}</p>
              </div>
              
              <div>
                <h4 className="font-semibold text-sm text-muted-foreground">Implementation Details</h4>
                <p className="mt-1 whitespace-pre-line">{selectedEcn.implementation_details}</p>
              </div>
              
              {selectedEcn.notes && (
                <div>
                  <h4 className="font-semibold text-sm text-muted-foreground">Additional Notes</h4>
                  <p className="mt-1 whitespace-pre-line">{selectedEcn.notes}</p>
                </div>
              )}
              
              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-semibold text-sm">Related Documents</h4>
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => openUploadDialog('ecn', selectedEcn.id)}
                  >
                    <Upload className="h-4 w-4 mr-1" /> Upload
                  </Button>
                </div>
                
                {selectedEcn.documents && selectedEcn.documents.length > 0 ? (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Uploaded By</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedEcn.documents.map((doc: ChangeDocument) => (
                          <TableRow key={doc.id}>
                            <TableCell className="max-w-[200px] truncate">{doc.document_name}</TableCell>
                            <TableCell>{doc.document_type}</TableCell>
                            <TableCell>{getUserName(doc.uploaded_by)}</TableCell>
                            <TableCell>{formatDate(doc.uploaded_at)}</TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => window.open(doc.storage_url, '_blank')}
                              >
                                <Download className="h-4 w-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                ) : (
                  <div className="text-center py-6 border rounded-md">
                    <div className="flex flex-col items-center justify-center text-sm text-muted-foreground">
                      <FileText className="h-8 w-8 mb-2" />
                      <p>No documents attached</p>
                      <p className="text-xs mt-1">Upload relevant documents using the button above</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Document Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Upload Document</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="document-type">Document Type</Label>
              <Select
                value={documentType}
                onValueChange={setDocumentType}
              >
                <SelectTrigger id="document-type">
                  <SelectValue placeholder="Select a document type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Drawing">Drawing</SelectItem>
                  <SelectItem value="Specification">Specification</SelectItem>
                  <SelectItem value="Instructions">Instructions</SelectItem>
                  <SelectItem value="Authorization">Authorization</SelectItem>
                  <SelectItem value="Other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="document-file">Select File</Label>
              <Input
                id="document-file"
                type="file"
                onChange={handleFileChange}
              />
              {selectedFile && (
                <p className="text-sm text-muted-foreground mt-1">
                  Selected file: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(2)} KB)
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setUploadDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleUploadDocument}
              disabled={uploadDocumentMutation.isPending || !selectedFile}
            >
              {uploadDocumentMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Upload
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EngineeringChangeManagement;