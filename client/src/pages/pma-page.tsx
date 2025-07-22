import Layout from '@/components/layout';
import { useState, useRef } from 'react';
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
import { Label } from '@/components/ui/label';
import { toast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Plus, Edit2, Trash2, Search, Eye, Download, FileIcon, Upload } from 'lucide-react';
import { format } from 'date-fns';
import { Separator } from '@/components/ui/separator';

// Form validation schema for new simplified PMA structure
const pmaFormSchema = z.object({
  pmaNumber: z.string().min(1, 'PMA Number is required'),
  specification: z.string().min(1, 'Specification is required'),
  grade: z.string().min(1, 'Grade is required'),
  status: z.enum(['Draft', 'Active', 'Inactive']),
  remarks: z.string().optional(),
  issueDate: z.string().min(1, 'Issue Date is required'),
  expiryDate: z.string().min(1, 'Expiry Date is required'),
});

type PMAFormData = z.infer<typeof pmaFormSchema>;

export default function PMAPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [selectedPMA, setSelectedPMA] = useState<any>(null);
  const [fileUpload, setFileUpload] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const queryClient = useQueryClient();

  // Fetch PMA documents
  const { data: pmaDocuments = [], isLoading } = useQuery({
    queryKey: ['/api/quality/pma'],
  });

  // Get available specifications and grades from material identification
  const { data: materialData } = useQuery({
    queryKey: ['/api/quality/material-identification'],
  });

  const availableSpecifications = [...new Set(
    materialData?.data?.map((item: any) => item.specification).filter(Boolean) || []
  )].sort();

  const availableGrades = [...new Set(
    materialData?.data?.map((item: any) => item.materialGrade || item.material_grade).filter(Boolean) || []
  )].sort();

  // Form setup
  const form = useForm<PMAFormData>({
    resolver: zodResolver(pmaFormSchema),
    defaultValues: {
      pmaNumber: '',
      specification: '',
      grade: '',
      status: 'Draft',
      remarks: '',
      issueDate: '',
      expiryDate: '',
    },
  });

  // Create PMA mutation
  const createPMAMutation = useMutation({
    mutationFn: async (data: PMAFormData) => {
      if (!fileUpload) {
        throw new Error('File upload is required');
      }

      const formData = new FormData();
      formData.append('pmaNumber', data.pmaNumber);
      formData.append('specification', data.specification);
      formData.append('grade', data.grade);
      formData.append('status', data.status);
      formData.append('remarks', data.remarks || '');
      formData.append('issueDate', data.issueDate);
      formData.append('expiryDate', data.expiryDate);
      formData.append('file', fileUpload);

      const response = await fetch('/api/quality/pma', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create PMA document');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quality/pma'] });
      setIsAddDialogOpen(false);
      setFileUpload(null);
      form.reset();
      toast({
        title: 'Success',
        description: 'PMA document created successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Update PMA mutation
  const updatePMAMutation = useMutation({
    mutationFn: async (data: PMAFormData & { id: number }) => {
      const formData = new FormData();
      formData.append('pmaNumber', data.pmaNumber);
      formData.append('specification', data.specification);
      formData.append('grade', data.grade);
      formData.append('status', data.status);
      formData.append('remarks', data.remarks || '');
      formData.append('issueDate', data.issueDate);
      formData.append('expiryDate', data.expiryDate);
      
      if (fileUpload) {
        formData.append('file', fileUpload);
      }

      const response = await fetch(`/api/quality/pma/${data.id}`, {
        method: 'PUT',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to update PMA document');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quality/pma'] });
      setIsEditDialogOpen(false);
      setSelectedPMA(null);
      setFileUpload(null);
      form.reset();
      toast({
        title: 'Success',
        description: 'PMA document updated successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Delete PMA mutation
  const deletePMAMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await fetch(`/api/quality/pma/${id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to delete PMA document');
      }

      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/quality/pma'] });
      toast({
        title: 'Success',
        description: 'PMA document deleted successfully',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Handlers
  const handleAddPMA = (data: PMAFormData) => {
    createPMAMutation.mutate(data);
  };

  const handleEditPMA = (pma: any) => {
    setSelectedPMA(pma);
    form.reset({
      pmaNumber: pma.pmaNumber || pma.pma_number,
      specification: pma.specification,
      grade: pma.grade,
      status: pma.status,
      remarks: pma.remarks || '',
      issueDate: pma.issueDate ? format(new Date(pma.issueDate), 'yyyy-MM-dd') : '',
      expiryDate: pma.expiryDate ? format(new Date(pma.expiryDate), 'yyyy-MM-dd') : '',
    });
    setIsEditDialogOpen(true);
  };

  const handleUpdatePMA = (data: PMAFormData) => {
    if (selectedPMA) {
      updatePMAMutation.mutate({ ...data, id: selectedPMA.id });
    }
  };

  const handleDeletePMA = (id: number) => {
    if (window.confirm('Are you sure you want to delete this PMA document?')) {
      deletePMAMutation.mutate(id);
    }
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['application/pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
      if (!allowedTypes.includes(file.type)) {
        toast({
          title: 'Invalid File Type',
          description: 'Only PDF and DOCX files are allowed',
          variant: 'destructive',
        });
        return;
      }
      setFileUpload(file);
    }
  };

  const handleDownload = (fileUrl: string, fileName: string) => {
    window.open(fileUrl, '_blank');
  };

  // Filter documents based on search
  const filteredDocuments = pmaDocuments.filter((doc: any) =>
    (doc.pmaNumber || doc.pma_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.specification || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (doc.grade || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getStatusBadge = (status: string) => {
    const statusColors = {
      Draft: 'bg-yellow-100 text-yellow-800',
      Active: 'bg-green-100 text-green-800',
      Inactive: 'bg-red-100 text-red-800',
    };
    return statusColors[status as keyof typeof statusColors] || 'bg-gray-100 text-gray-800';
  };

  return (
    <Layout>
      <div className="container py-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>PMA (Particular Material Appraisal) Documents</CardTitle>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add PMA Document
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Create New PMA Document</DialogTitle>
                  </DialogHeader>
                  <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleAddPMA)} className="space-y-4">
                      {/* PMA Number */}
                      <FormField
                        control={form.control}
                        name="pmaNumber"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>PMA Number *</FormLabel>
                            <FormControl>
                              <Input {...field} placeholder="Enter PMA Number" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Specification */}
                      <FormField
                        control={form.control}
                        name="specification"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Specification *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select specification" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {availableSpecifications.map((spec) => (
                                  <SelectItem key={spec} value={spec}>
                                    {spec}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Grade */}
                      <FormField
                        control={form.control}
                        name="grade"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Grade *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select grade" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                {availableGrades.map((grade) => (
                                  <SelectItem key={grade} value={grade}>
                                    {grade}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Status */}
                      <FormField
                        control={form.control}
                        name="status"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Status *</FormLabel>
                            <Select onValueChange={field.onChange} value={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="Draft">Draft</SelectItem>
                                <SelectItem value="Active">Active</SelectItem>
                                <SelectItem value="Inactive">Inactive</SelectItem>
                              </SelectContent>
                            </Select>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Remarks */}
                      <FormField
                        control={form.control}
                        name="remarks"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Remarks</FormLabel>
                            <FormControl>
                              <Textarea {...field} rows={3} placeholder="Enter remarks" />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Issue Date */}
                      <FormField
                        control={form.control}
                        name="issueDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Issue Date *</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="date" 
                                min={format(new Date(), 'yyyy-MM-dd')}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* Expiry Date */}
                      <FormField
                        control={form.control}
                        name="expiryDate"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Expiry Date *</FormLabel>
                            <FormControl>
                              <Input 
                                {...field} 
                                type="date" 
                                min={format(new Date(), 'yyyy-MM-dd')}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* File Upload */}
                      <div className="space-y-2">
                        <Label>File Upload * (PDF or DOCX only)</Label>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.docx"
                          onChange={handleFileUpload}
                          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                        />
                        {fileUpload && (
                          <p className="text-sm text-green-600">Selected: {fileUpload.name}</p>
                        )}
                      </div>

                      <div className="flex justify-end space-x-2">
                        <Button type="button" variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createPMAMutation.isPending || !fileUpload}>
                          {createPMAMutation.isPending ? 'Creating...' : 'Create PMA Document'}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>

            {/* Search */}
            <div className="flex items-center space-x-2">
              <Search className="w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search PMA documents..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
          </CardHeader>

          <CardContent>
            {isLoading ? (
              <div className="text-center py-8">Loading PMA documents...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>PMA Number</TableHead>
                    <TableHead>Specification</TableHead>
                    <TableHead>Grade</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Issue Date</TableHead>
                    <TableHead>Expiry Date</TableHead>
                    <TableHead>File</TableHead>
                    <TableHead>Created By</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-gray-500">
                        No PMA documents found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredDocuments.map((doc: any) => (
                      <TableRow key={doc.id}>
                        <TableCell className="font-medium">
                          {doc.pmaNumber || doc.pma_number}
                        </TableCell>
                        <TableCell>{doc.specification}</TableCell>
                        <TableCell>{doc.grade}</TableCell>
                        <TableCell>
                          <Badge className={getStatusBadge(doc.status)}>
                            {doc.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {doc.issueDate || doc.issue_date 
                            ? format(new Date(doc.issueDate || doc.issue_date), 'MMM dd, yyyy')
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          {doc.expiryDate || doc.expiry_date 
                            ? format(new Date(doc.expiryDate || doc.expiry_date), 'MMM dd, yyyy')
                            : '-'
                          }
                        </TableCell>
                        <TableCell>
                          {(doc.fileUrl || doc.file_url) && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDownload(
                                doc.fileUrl || doc.file_url, 
                                doc.originalFileName || doc.original_file_name || 'document'
                              )}
                            >
                              <FileIcon className="w-4 h-4 mr-1" />
                              Download
                            </Button>
                          )}
                        </TableCell>
                        <TableCell>{doc.creatorName || doc.creator_name || '-'}</TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditPMA(doc)}
                            >
                              <Edit2 className="w-4 h-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeletePMA(doc.id)}
                              className="text-red-600 hover:text-red-800"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Edit Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit PMA Document</DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(handleUpdatePMA)} className="space-y-4">
                {/* Same form fields as add dialog */}
                <FormField
                  control={form.control}
                  name="pmaNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>PMA Number *</FormLabel>
                      <FormControl>
                        <Input {...field} placeholder="Enter PMA Number" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="specification"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Specification *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select specification" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableSpecifications.map((spec) => (
                            <SelectItem key={spec} value={spec}>
                              {spec}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="grade"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Grade *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select grade" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableGrades.map((grade) => (
                            <SelectItem key={grade} value={grade}>
                              {grade}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Draft">Draft</SelectItem>
                          <SelectItem value="Active">Active</SelectItem>
                          <SelectItem value="Inactive">Inactive</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="remarks"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Remarks</FormLabel>
                      <FormControl>
                        <Textarea {...field} rows={3} placeholder="Enter remarks" />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="expiryDate"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Expiry Date *</FormLabel>
                      <FormControl>
                        <Input 
                          {...field} 
                          type="date" 
                          min={format(new Date(), 'yyyy-MM-dd')}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="space-y-2">
                  <Label>File Upload (PDF or DOCX only)</Label>
                  <p className="text-sm text-gray-500">Leave empty to keep existing file</p>
                  <input
                    type="file"
                    accept=".pdf,.docx"
                    onChange={handleFileUpload}
                    className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                  />
                  {fileUpload && (
                    <p className="text-sm text-green-600">New file selected: {fileUpload.name}</p>
                  )}
                </div>

                <div className="flex justify-end space-x-2">
                  <Button 
                    type="button" 
                    variant="outline" 
                    onClick={() => {
                      setIsEditDialogOpen(false);
                      setFileUpload(null);
                    }}
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
      </div>
    </Layout>
  );
}