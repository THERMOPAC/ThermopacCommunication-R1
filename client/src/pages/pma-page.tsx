import Layout from '@/components/layout';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Edit2, Trash2, Search, Eye, Download, FileIcon, ExternalLink } from 'lucide-react';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';
import { apiRequest } from '@/lib/queryClient';

// Form validation schemas
const pmaFormSchema = z.object({
  pmaNumber: z.string().min(1, 'PMA Number is required'),
  materialType: z.string().min(1, 'Material Type is required'),
  specification: z.string().min(1, 'Specification is required'),
  grade: z.string().min(1, 'Grade is required'),
  approvalLevel: z.enum(['Level 1', 'Level 2', 'Level 3']),
  status: z.enum(['Draft', 'Under Review', 'Approved', 'Rejected']),
  remarks: z.string().optional(),
});

type PMAFormData = z.infer<typeof pmaFormSchema>;

export default function PMAPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedPMA, setSelectedPMA] = useState<any>(null);
  const [selectedMaterials, setSelectedMaterials] = useState<string[]>([]);
  const queryClient = useQueryClient();

  // Fetch PMA documents
  const { data: pmaDocuments = [], isLoading } = useQuery({
    queryKey: ['/api/quality/pma'],
  });

  // Fetch available materials
  const { data: availableMaterials = [] } = useQuery({
    queryKey: ['/api/quality/material-identification'],
  });

  // Create PMA mutation
  const createPMAMutation = useMutation({
    mutationFn: async (data: PMAFormData & { materials: string[] }) => {
      return apiRequest('/api/quality/pma', {
        method: 'POST',
        body: data,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quality/pma'] });
      setIsAddDialogOpen(false);
      setSelectedMaterials([]);
      toast({
        title: 'Success',
        description: 'PMA document created successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to create PMA document',
        variant: 'destructive',
      });
    },
  });

  // Update PMA mutation
  const updatePMAMutation = useMutation({
    mutationFn: async (data: { id: string } & Partial<PMAFormData> & { materials?: string[] }) => {
      const { id, ...updateData } = data;
      return apiRequest(`/api/quality/pma/${id}`, {
        method: 'PUT',
        body: updateData,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quality/pma'] });
      setIsEditDialogOpen(false);
      setSelectedPMA(null);
      setSelectedMaterials([]);
      toast({
        title: 'Success',
        description: 'PMA document updated successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to update PMA document',
        variant: 'destructive',
      });
    },
  });

  // Delete PMA mutation
  const deletePMAMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/quality/pma/${id}`, {
        method: 'DELETE',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quality/pma'] });
      toast({
        title: 'Success',
        description: 'PMA document deleted successfully',
      });
    },
    onError: (error: any) => {
      toast({
        title: 'Error',
        description: error.message || 'Failed to delete PMA document',
        variant: 'destructive',
      });
    },
  });

  // Add form
  const addForm = useForm<PMAFormData>({
    resolver: zodResolver(pmaFormSchema),
    defaultValues: {
      pmaNumber: '',
      materialType: '',
      specification: '',
      grade: '',
      approvalLevel: 'Level 1',
      status: 'Draft',
      remarks: '',
    },
  });

  // Edit form
  const editForm = useForm<PMAFormData>({
    resolver: zodResolver(pmaFormSchema),
    defaultValues: {
      pmaNumber: '',
      materialType: '',
      specification: '',
      grade: '',
      approvalLevel: 'Level 1',
      status: 'Draft',
      remarks: '',
    },
  });

  // Filter PMA documents based on search term
  const filteredPMADocuments = pmaDocuments.filter((pma: any) =>
    pma.pmaNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pma.materialType?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pma.specification?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    pma.grade?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleAddPMA = (data: PMAFormData) => {
    createPMAMutation.mutate({
      ...data,
      materials: selectedMaterials,
    });
  };

  const handleEditPMA = (data: PMAFormData) => {
    if (!selectedPMA) return;
    updatePMAMutation.mutate({
      id: selectedPMA.id,
      ...data,
      materials: selectedMaterials,
    });
  };

  const handleDeletePMA = (id: string) => {
    if (confirm('Are you sure you want to delete this PMA document?')) {
      deletePMAMutation.mutate(id);
    }
  };

  const openEditDialog = (pma: any) => {
    setSelectedPMA(pma);
    setSelectedMaterials(pma.materials?.map((m: any) => m.materialId) || []);
    editForm.reset({
      pmaNumber: pma.pmaNumber || '',
      materialType: pma.materialType || '',
      specification: pma.specification || '',
      grade: pma.grade || '',
      approvalLevel: pma.approvalLevel || 'Level 1',
      status: pma.status || 'Draft',
      remarks: pma.remarks || '',
    });
    setIsEditDialogOpen(true);
  };

  const openViewDialog = (pma: any) => {
    setSelectedPMA(pma);
    setIsViewDialogOpen(true);
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'Approved':
        return 'bg-green-100 text-green-800';
      case 'Under Review':
        return 'bg-yellow-100 text-yellow-800';
      case 'Rejected':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Layout>
      <div className="container py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">PMA Documents</h1>
          <p className="text-muted-foreground">
            Manage Particular Material Appraisal (PMA) documents for quality control
          </p>
        </div>

        {/* Header Actions */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
              <Input
                placeholder="Search PMA documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 w-64"
              />
            </div>
          </div>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add PMA Document
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Add New PMA Document</DialogTitle>
              </DialogHeader>
              <Form {...addForm}>
                <form onSubmit={addForm.handleSubmit(handleAddPMA)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={addForm.control}
                      name="pmaNumber"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>PMA Number</FormLabel>
                          <FormControl>
                            <Input placeholder="PMA-2025-001" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addForm.control}
                      name="materialType"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Material Type</FormLabel>
                          <FormControl>
                            <Input placeholder="Steel, Aluminum, etc." {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={addForm.control}
                      name="specification"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Specification</FormLabel>
                          <FormControl>
                            <Input placeholder="ASTM A516 Gr 70" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addForm.control}
                      name="grade"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Grade</FormLabel>
                          <FormControl>
                            <Input placeholder="Grade 70" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={addForm.control}
                      name="approvalLevel"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Approval Level</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select approval level" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Level 1">Level 1</SelectItem>
                              <SelectItem value="Level 2">Level 2</SelectItem>
                              <SelectItem value="Level 3">Level 3</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={addForm.control}
                      name="status"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Status</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select status" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Draft">Draft</SelectItem>
                              <SelectItem value="Under Review">Under Review</SelectItem>
                              <SelectItem value="Approved">Approved</SelectItem>
                              <SelectItem value="Rejected">Rejected</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={addForm.control}
                    name="remarks"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Remarks</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Additional remarks or notes"
                            className="resize-none"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Material Selection */}
                  <div className="space-y-2">
                    <Label>Associated Materials</Label>
                    <div className="border rounded-md p-3 max-h-32 overflow-y-auto">
                      {availableMaterials.map((material: any) => (
                        <div key={material.id} className="flex items-center space-x-2 py-1">
                          <Checkbox
                            id={`material-${material.id}`}
                            checked={selectedMaterials.includes(material.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedMaterials([...selectedMaterials, material.id]);
                              } else {
                                setSelectedMaterials(selectedMaterials.filter(id => id !== material.id));
                              }
                            }}
                          />
                          <Label htmlFor={`material-${material.id}`} className="text-sm">
                            {material.material_identification_id} - {material.material_description || 'No description'}
                          </Label>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end space-x-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsAddDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={createPMAMutation.isPending}>
                      {createPMAMutation.isPending ? 'Creating...' : 'Create PMA Document'}
                    </Button>
                  </div>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        {/* PMA Documents Table */}
        <Card>
          <CardHeader>
            <CardTitle>PMA Documents ({filteredPMADocuments.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-4">Loading PMA documents...</div>
            ) : filteredPMADocuments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                {searchTerm ? 'No PMA documents found matching your search.' : 'No PMA documents found. Create your first PMA document to get started.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>PMA Number</TableHead>
                      <TableHead>Material Type</TableHead>
                      <TableHead>Specification</TableHead>
                      <TableHead>Grade</TableHead>
                      <TableHead>Approval Level</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created Date</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPMADocuments.map((pma: any) => (
                      <TableRow key={pma.id}>
                        <TableCell className="font-medium">{pma.pmaNumber}</TableCell>
                        <TableCell>{pma.materialType}</TableCell>
                        <TableCell>{pma.specification}</TableCell>
                        <TableCell>{pma.grade}</TableCell>
                        <TableCell>{pma.approvalLevel}</TableCell>
                        <TableCell>
                          <Badge className={getStatusBadgeColor(pma.status)}>
                            {pma.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {pma.createdAt ? format(new Date(pma.createdAt), 'MMM dd, yyyy') : '-'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center space-x-2">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openViewDialog(pma)}
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openEditDialog(pma)}
                            >
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleDeletePMA(pma.id)}
                              disabled={deletePMAMutation.isPending}
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

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit PMA Document</DialogTitle>
            </DialogHeader>
            <Form {...editForm}>
              <form onSubmit={editForm.handleSubmit(handleEditPMA)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="pmaNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>PMA Number</FormLabel>
                        <FormControl>
                          <Input placeholder="PMA-2025-001" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="materialType"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Material Type</FormLabel>
                        <FormControl>
                          <Input placeholder="Steel, Aluminum, etc." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="specification"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Specification</FormLabel>
                        <FormControl>
                          <Input placeholder="ASTM A516 Gr 70" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="grade"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Grade</FormLabel>
                        <FormControl>
                          <Input placeholder="Grade 70" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={editForm.control}
                    name="approvalLevel"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Approval Level</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select approval level" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Level 1">Level 1</SelectItem>
                            <SelectItem value="Level 2">Level 2</SelectItem>
                            <SelectItem value="Level 3">Level 3</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={editForm.control}
                    name="status"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Status</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select status" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Draft">Draft</SelectItem>
                            <SelectItem value="Under Review">Under Review</SelectItem>
                            <SelectItem value="Approved">Approved</SelectItem>
                            <SelectItem value="Rejected">Rejected</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={editForm.control}
                  name="remarks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remarks</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Additional remarks or notes"
                          className="resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Material Selection for Edit */}
                <div className="space-y-2">
                  <Label>Associated Materials</Label>
                  <div className="border rounded-md p-3 max-h-32 overflow-y-auto">
                    {availableMaterials.map((material: any) => (
                      <div key={material.id} className="flex items-center space-x-2 py-1">
                        <Checkbox
                          id={`edit-material-${material.id}`}
                          checked={selectedMaterials.includes(material.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setSelectedMaterials([...selectedMaterials, material.id]);
                            } else {
                              setSelectedMaterials(selectedMaterials.filter(id => id !== material.id));
                            }
                          }}
                        />
                        <Label htmlFor={`edit-material-${material.id}`} className="text-sm">
                          {material.material_identification_id} - {material.material_description || 'No description'}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end space-x-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsEditDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={updatePMAMutation.isPending}>
                    {updatePMAMutation.isPending ? 'Updating...' : 'Update PMA Document'}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>

        {/* View Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>PMA Document Details</DialogTitle>
            </DialogHeader>
            {selectedPMA && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">PMA Number</Label>
                    <p className="text-sm text-muted-foreground">{selectedPMA.pmaNumber}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Material Type</Label>
                    <p className="text-sm text-muted-foreground">{selectedPMA.materialType}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Specification</Label>
                    <p className="text-sm text-muted-foreground">{selectedPMA.specification}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Grade</Label>
                    <p className="text-sm text-muted-foreground">{selectedPMA.grade}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Approval Level</Label>
                    <p className="text-sm text-muted-foreground">{selectedPMA.approvalLevel}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Status</Label>
                    <Badge className={getStatusBadgeColor(selectedPMA.status)}>
                      {selectedPMA.status}
                    </Badge>
                  </div>
                </div>

                {selectedPMA.remarks && (
                  <div>
                    <Label className="text-sm font-medium">Remarks</Label>
                    <p className="text-sm text-muted-foreground">{selectedPMA.remarks}</p>
                  </div>
                )}

                <Separator />

                <div>
                  <Label className="text-sm font-medium">Associated Materials</Label>
                  {selectedPMA.materials && selectedPMA.materials.length > 0 ? (
                    <div className="mt-2 space-y-2">
                      {selectedPMA.materials.map((material: any) => (
                        <div key={material.materialId} className="flex items-center justify-between p-2 border rounded">
                          <span className="text-sm">
                            {material.material?.material_identification_id} - {material.material?.material_description || 'No description'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground mt-2">No materials associated</p>
                  )}
                </div>

                <Separator />

                <div className="flex justify-between text-sm text-muted-foreground">
                  <span>
                    Created: {selectedPMA.createdAt ? format(new Date(selectedPMA.createdAt), 'MMM dd, yyyy HH:mm') : '-'}
                  </span>
                  <span>
                    Updated: {selectedPMA.updatedAt ? format(new Date(selectedPMA.updatedAt), 'MMM dd, yyyy HH:mm') : '-'}
                  </span>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}