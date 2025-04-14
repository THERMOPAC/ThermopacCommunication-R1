import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { useLocation } from 'wouter';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { 
  ClipboardList, 
  File as FileIcon, 
  FileUp, 
  FolderOpen,
  Pencil, 
  Plus, 
  Package, 
  Search, 
  Trash2,
  Loader2
} from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/hooks/use-auth';
import { canManageContent } from '@/lib/permissions';
import MasterItemsImport from './master-items-import';
import { ItemComponentsImport } from './item-components-import';
import ItemFileStorage from './item-file-storage';

// Define the MasterItem type based on your schema
interface MasterItem {
  id: number;
  itemCode: string;
  description: string;
  specification: string | null;
  uom: string;
  makeOrBuy: string | null;
  drawingNo: string | null;
  standardCost: number | null;
  supplier: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

// Create a Zod schema for validation
const formSchema = z.object({
  itemCode: z.string()
    .min(1, { message: "Item Code is required" })
    .max(50, { message: "Item Code must be 50 characters or less" }),
  description: z.string()
    .min(1, { message: "Description is required" })
    .max(200, { message: "Description must be 200 characters or less" }),
  specification: z.string().nullable().optional(),
  uom: z.string()
    .min(1, { message: "Unit of Measurement is required" })
    .max(20, { message: "UOM must be 20 characters or less" }),
  makeOrBuy: z.enum(["Make", "Buy"]).nullable().optional(),
  drawingNo: z.string().nullable().optional(),
  standardCost: z.number().nullable().optional(),
  supplier: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

type FormValues = z.infer<typeof formSchema>;

const ItemMasterManagement: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [, navigate] = useLocation();
  
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentItem, setCurrentItem] = useState<MasterItem | null>(null);
  const [deleteDialogItem, setDeleteDialogItem] = useState<MasterItem | null>(null);
  const [activeTab, setActiveTab] = useState<string>("details");
  const [isDeleting, setIsDeleting] = useState<number | null>(null);
  
  // Drawing upload state
  const [drawingRevision, setDrawingRevision] = useState('');
  const [drawingDescription, setDrawingDescription] = useState('');
  const [drawingFile, setDrawingFile] = useState<File | null>(null);
  const [isUploadingDrawing, setIsUploadingDrawing] = useState(false);
  const [selectedDrawingItem, setSelectedDrawingItem] = useState<{ id: number, code: string, drawingNo?: string | null } | null>(null);
  
  // Query for item components when viewing the components tab
  const itemComponentsQuery = useQuery({
    queryKey: ['item-components', currentItem?.id],
    queryFn: async () => {
      if (!currentItem) return [];
      const response = await fetch(`/api/master-items/${currentItem.id}/components`);
      if (!response.ok) {
        throw new Error('Failed to fetch components');
      }
      return response.json();
    },
    enabled: !!currentItem && activeTab === 'components',
  });
  
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      itemCode: "",
      description: "",
      specification: "",
      uom: "Nos",
      makeOrBuy: null,
      drawingNo: "",
      standardCost: null,
      supplier: "",
      notes: "",
    },
  });
  
  const editForm = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      itemCode: "",
      description: "",
      specification: "",
      uom: "Nos",
      makeOrBuy: null,
      drawingNo: "",
      standardCost: null,
      supplier: "",
      notes: "",
    },
  });
  
  // Fetch all master items
  const { data: items, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/master-items'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/master-items');
      return response.json();
    }
  });
  
  // Handle create master item
  const createMutation = useMutation({
    mutationFn: async (data: FormValues) => {
      const response = await apiRequest('POST', '/api/master-items', data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create master item');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/master-items'] });
      toast({
        title: "Success",
        description: "Master item created successfully",
      });
      setIsCreateDialogOpen(false);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Handle update master item
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number, data: FormValues }) => {
      const response = await apiRequest('PUT', `/api/master-items/${id}`, data);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update master item');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/master-items'] });
      toast({
        title: "Success",
        description: "Master item updated successfully",
      });
      setIsEditDialogOpen(false);
      editForm.reset();
      setCurrentItem(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Handle delete master item
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/master-items/${id}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete master item');
      }
      return true;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/master-items'] });
      toast({
        title: "Success",
        description: "Master item deleted successfully",
      });
      setDeleteDialogItem(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
  
  // Handle delete component
  const deleteComponentMutation = useMutation({
    mutationFn: async (componentId: number) => {
      const response = await apiRequest('DELETE', `/api/item-components/${componentId}`);
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete component');
      }
      return true;
    },
    onSuccess: () => {
      if (currentItem) {
        queryClient.invalidateQueries({ queryKey: ['item-components', currentItem.id] });
      }
      toast({
        title: "Success",
        description: "Component deleted successfully",
      });
      setIsDeleting(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setIsDeleting(null);
    },
  });
  

  
  // Check for editMasterItemId in sessionStorage and open edit dialog
  useEffect(() => {
    const editItemId = sessionStorage.getItem('editMasterItemId');
    if (editItemId && items) {
      const itemToEdit = items.find((item: any) => item.id === parseInt(editItemId));
      if (itemToEdit) {
        setCurrentItem(itemToEdit);
        setActiveTab("details");
        setIsEditDialogOpen(true);
        // Clear the session storage so it doesn't reopen on refresh
        sessionStorage.removeItem('editMasterItemId');
      }
    }
  }, [items]);

  // Set form values when editing an item
  useEffect(() => {
    if (currentItem && isEditDialogOpen) {
      editForm.reset({
        itemCode: currentItem.itemCode,
        description: currentItem.description,
        specification: currentItem.specification || "",
        uom: currentItem.uom,
        makeOrBuy: currentItem.makeOrBuy as "Make" | "Buy" | null,
        drawingNo: currentItem.drawingNo || "",
        standardCost: currentItem.standardCost,
        supplier: currentItem.supplier || "",
        notes: currentItem.notes || "",
      });
    }
  }, [currentItem, isEditDialogOpen, editForm]);
  
  const onSubmitCreate = (data: FormValues) => {
    createMutation.mutate(data);
  };
  
  const onSubmitEdit = (data: FormValues) => {
    if (currentItem) {
      updateMutation.mutate({ id: currentItem.id, data });
    }
  };
  
  const handleEdit = (item: MasterItem) => {
    setCurrentItem(item);
    setActiveTab("details");
    setIsEditDialogOpen(true);
  };
  
  const handleDelete = (item: MasterItem) => {
    setDeleteDialogItem(item);
  };
  
  const confirmDelete = () => {
    if (deleteDialogItem) {
      deleteMutation.mutate(deleteDialogItem.id);
    }
  };
  
  const handleDeleteComponent = (componentId: number) => {
    setIsDeleting(componentId);
    deleteComponentMutation.mutate(componentId);
  };
  
  // Check user permissions
  const canCreate = user && canManageContent(user.role, 'Manager');
  const canEdit = user && canManageContent(user.role, 'Manager');
  const canDelete = user && canManageContent(user.role, 'Senior Manager');
  
  if (error) {
    return <div className="p-4 text-red-500">Error loading master items: {(error as Error).message}</div>;
  }
  
  return (
    <div className="container mx-auto p-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Item Master</CardTitle>
              <CardDescription>Manage master items in the system</CardDescription>
            </div>
            <div className="flex gap-2">
              {canCreate && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" /> Create Item
                </Button>
              )}
              {canCreate && <MasterItemsImport />}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-4">
              <div className="animate-spin h-8 w-8 border-t-2 border-b-2 border-primary rounded-full"></div>
            </div>
          ) : (
            <Table>
              <TableCaption>List of master items</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Item Code</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>UOM</TableHead>
                  <TableHead>Make/Buy</TableHead>
                  <TableHead>Drawing No.</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items && items.length > 0 ? (
                  items.map((item: MasterItem) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.itemCode}</TableCell>
                      <TableCell>{item.description}</TableCell>
                      <TableCell>{item.uom}</TableCell>
                      <TableCell>{item.makeOrBuy || '-'}</TableCell>
                      <TableCell>{item.drawingNo || '-'}</TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          {canEdit && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleEdit(item)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => handleDelete(item)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">
                      No items found. Create your first item to get started.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      
      {/* Create Dialog */}
      <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Create New Master Item</DialogTitle>
            <DialogDescription>
              Add a new item to the master items catalog
            </DialogDescription>
          </DialogHeader>
          
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmitCreate)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="itemCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Item Code*</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter item code" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="uom"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unit of Measurement*</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select UOM" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Nos">Nos</SelectItem>
                          <SelectItem value="Kg">Kg</SelectItem>
                          <SelectItem value="Meter">Meter</SelectItem>
                          <SelectItem value="Liter">Liter</SelectItem>
                          <SelectItem value="Set">Set</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Description*</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter item description" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="specification"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Specification</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter specifications"
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="makeOrBuy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Make/Buy</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value || ''}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Make/Buy" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="Make">Make</SelectItem>
                          <SelectItem value="Buy">Buy</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="drawingNo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Drawing No.</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter drawing number"
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="standardCost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Standard Cost</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="Enter standard cost"
                          {...field}
                          onChange={(e) => {
                            const value = e.target.value;
                            field.onChange(value ? parseFloat(value) : null);
                          }}
                          value={field.value === null ? '' : field.value}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="supplier"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Supplier</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Enter supplier name"
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem className="col-span-2">
                      <FormLabel>Notes</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Enter notes or comments"
                          {...field}
                          value={field.value || ''}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createMutation.isPending}
                >
                  {createMutation.isPending ? 'Creating...' : 'Create Item'}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
      
      {/* Edit Dialog */}
      <Dialog 
        open={isEditDialogOpen} 
        onOpenChange={(open) => {
          setIsEditDialogOpen(open);
          if (!open) {
            setActiveTab("details");
          }
        }}>
        <DialogContent className="sm:max-w-[95%]">
          <DialogHeader>
            <DialogTitle>Edit Master Item</DialogTitle>
            <DialogDescription>
              Update the details of this master item
            </DialogDescription>
          </DialogHeader>
          
          <Tabs 
            value={activeTab} 
            onValueChange={setActiveTab} 
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-5 mb-4">
              <TabsTrigger value="details">Item Details</TabsTrigger>
              <TabsTrigger value="components">Sub-Assembly Components</TabsTrigger>
              <TabsTrigger value="drawings">Drawing Management</TabsTrigger>
              <TabsTrigger value="ecr">ECR & ECN Management</TabsTrigger>
              <TabsTrigger value="files">File Storage</TabsTrigger>
            </TabsList>
            
            <TabsContent value="details">
              <Form {...editForm}>
                <form onSubmit={editForm.handleSubmit(onSubmitEdit)} className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={editForm.control}
                      name="itemCode"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Item Code*</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Enter item code" 
                              {...field} 
                              readOnly 
                              disabled
                              className="bg-muted"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={editForm.control}
                      name="uom"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Unit of Measurement*</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select UOM" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Nos">Nos</SelectItem>
                              <SelectItem value="Kg">Kg</SelectItem>
                              <SelectItem value="Meter">Meter</SelectItem>
                              <SelectItem value="Liter">Liter</SelectItem>
                              <SelectItem value="Set">Set</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={editForm.control}
                      name="description"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Description*</FormLabel>
                          <FormControl>
                            <Input 
                              placeholder="Enter item description" 
                              {...field}
                              readOnly 
                              disabled
                              className="bg-muted"
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={editForm.control}
                      name="specification"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Specification</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Enter specifications"
                              {...field}
                              value={field.value || ''}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={editForm.control}
                      name="makeOrBuy"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Make/Buy</FormLabel>
                          <Select
                            onValueChange={field.onChange}
                            defaultValue={field.value || ''}
                          >
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select Make/Buy" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Make">Make</SelectItem>
                              <SelectItem value="Buy">Buy</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={editForm.control}
                      name="drawingNo"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Drawing No.</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter drawing number"
                              {...field}
                              value={field.value || ''}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={editForm.control}
                      name="standardCost"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Standard Cost</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              placeholder="Enter standard cost"
                              {...field}
                              onChange={(e) => {
                                const value = e.target.value;
                                field.onChange(value ? parseFloat(value) : null);
                              }}
                              value={field.value === null ? '' : field.value}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={editForm.control}
                      name="supplier"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Supplier</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter supplier name"
                              {...field}
                              value={field.value || ''}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    
                    <FormField
                      control={editForm.control}
                      name="notes"
                      render={({ field }) => (
                        <FormItem className="col-span-2">
                          <FormLabel>Notes</FormLabel>
                          <FormControl>
                            <Textarea
                              placeholder="Enter notes or comments"
                              {...field}
                              value={field.value || ''}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  
                  <DialogFooter className="flex justify-between">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => navigate('/')}
                      >
                        Back to Dashboard
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => navigate('/projects')}
                      >
                        Back to Projects
                      </Button>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setIsEditDialogOpen(false);
                          setCurrentItem(null);
                          setActiveTab("details");
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        disabled={updateMutation.isPending}
                      >
                        {updateMutation.isPending ? 'Updating...' : 'Update Item'}
                      </Button>
                    </div>
                  </DialogFooter>
                </form>
              </Form>
            </TabsContent>
            
            <TabsContent value="components">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Sub-Assembly Components</h3>
                  <Button size="sm">
                    <Plus className="h-4 w-4 mr-1" /> Add Component
                  </Button>
                </div>
                
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Component Item Code</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Quantity</TableHead>
                        <TableHead>UOM</TableHead>
                        <TableHead>Make/Buy</TableHead>
                        <TableHead>Drawing No.</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itemComponentsQuery.isLoading ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-4">
                            <div className="flex justify-center">
                              <div className="animate-spin h-6 w-6 border-t-2 border-b-2 border-primary rounded-full"></div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : itemComponentsQuery.error ? (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-red-500">
                            Error loading components: {(itemComponentsQuery.error as Error).message}
                          </TableCell>
                        </TableRow>
                      ) : itemComponentsQuery.data && itemComponentsQuery.data.length > 0 ? (
                        itemComponentsQuery.data.map((component: any) => (
                          <TableRow key={component.id}>
                            <TableCell>{component.componentItemCode}</TableCell>
                            <TableCell>{component.componentDescription}</TableCell>
                            <TableCell>{component.quantity}</TableCell>
                            <TableCell>{component.componentUom}</TableCell>
                            <TableCell>{component.componentMakeOrBuy || '-'}</TableCell>
                            <TableCell>{component.componentDrawingNo || '-'}</TableCell>
                            <TableCell>
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleDeleteComponent(component.id)}
                                disabled={isDeleting === component.id}
                              >
                                {isDeleting === component.id ? (
                                  <Loader2 className="h-4 w-4 animate-spin text-red-500" />
                                ) : (
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                )}
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-6">
                            <div className="flex flex-col items-center justify-center text-sm text-muted-foreground">
                              <Package className="h-8 w-8 mb-2" />
                              <p>No components added yet</p>
                              <p className="text-xs mt-1">Add components to this assembly by importing from Excel</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
                
                {currentItem && (
                  <ItemComponentsImport 
                    parentItemId={currentItem.id} 
                    parentItemCode={currentItem.itemCode}
                    onImportComplete={() => {
                      // Refresh the components data after import
                      itemComponentsQuery.refetch();
                      toast({
                        title: "Components imported",
                        description: "The component list has been updated successfully.",
                      });
                    }}
                  />
                )}
                
                <div className="flex justify-between mt-6">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate('/')}
                    >
                      Back to Dashboard
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate('/projects')}
                    >
                      Back to Projects
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditDialogOpen(false);
                      setCurrentItem(null);
                      setActiveTab("details");
                    }}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="drawings">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">Drawing Management</h3>
                  <Dialog>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Plus className="h-4 w-4 mr-1" /> Upload Drawing
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="sm:max-w-md">
                      <DialogHeader>
                        <DialogTitle>Upload Drawing</DialogTitle>
                        <DialogDescription>
                          Upload a drawing file for {currentItem?.itemCode}
                        </DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="drawing-item">Select Item</Label>
                          <Select
                            value={selectedDrawingItem ? `${selectedDrawingItem.id}` : ''}
                            onValueChange={(value) => {
                              if (value === 'parent') {
                                // Parent item selected
                                setSelectedDrawingItem({
                                  id: currentItem!.id,
                                  code: currentItem!.itemCode,
                                  drawingNo: currentItem!.drawingNo
                                });
                              } else if (value) {
                                // Component item selected
                                const component = itemComponentsQuery.data?.find(c => c.id === parseInt(value));
                                if (component) {
                                  setSelectedDrawingItem({
                                    id: component.id,
                                    code: component.itemCode,
                                    drawingNo: component.drawingNo
                                  });
                                }
                              }
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select the item for this drawing" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="parent">
                                {currentItem?.itemCode} (Parent Item)
                              </SelectItem>
                              {itemComponentsQuery.data && itemComponentsQuery.data.length > 0 && (
                                <>
                                  <SelectSeparator />
                                  <SelectLabel>Sub-Assembly Components</SelectLabel>
                                  {itemComponentsQuery.data.map(component => (
                                    <SelectItem key={component.id} value={component.id.toString()}>
                                      {component.itemCode}
                                    </SelectItem>
                                  ))}
                                </>
                              )}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="drawing-revision">Revision</Label>
                          <Input
                            id="drawing-revision"
                            placeholder="e.g. A, B, 1.0, 2.0"
                            className="col-span-3"
                            value={drawingRevision}
                            onChange={(e) => setDrawingRevision(e.target.value)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="drawing-description">Description</Label>
                          <Input
                            id="drawing-description"
                            placeholder="Brief description of this drawing version"
                            className="col-span-3"
                            value={drawingDescription}
                            onChange={(e) => setDrawingDescription(e.target.value)}
                          />
                        </div>
                        <div className="grid gap-2">
                          <Label htmlFor="drawing-file">Drawing File</Label>
                          <Input
                            id="drawing-file"
                            type="file"
                            accept=".pdf,.dwg,.dxf,.dwf"
                            className="col-span-3"
                            onChange={(e) => {
                              if (e.target.files && e.target.files.length > 0) {
                                setDrawingFile(e.target.files[0]);
                              }
                            }}
                          />
                          {drawingFile && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Selected file: {drawingFile.name}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground">
                            Accepted formats: PDF, DWG, DXF, DWF
                          </p>
                        </div>
                        
                        {selectedDrawingItem && (
                          <div className="bg-muted p-3 rounded-md mt-2">
                            <h4 className="text-sm font-medium mb-1">Storage Path:</h4>
                            <p className="text-xs text-muted-foreground break-all">
                              THERMOPAC_INVENTORY/{selectedDrawingItem.drawingNo || selectedDrawingItem.code}/{selectedDrawingItem.drawingNo || selectedDrawingItem.code}.pdf
                            </p>
                          </div>
                        )}
                      </div>
                      <DialogFooter>
                        <DialogClose asChild>
                          <Button variant="outline">Cancel</Button>
                        </DialogClose>
                        <Button 
                          type="button" 
                          onClick={() => {
                            if (!drawingFile) {
                              toast({
                                title: "Error",
                                description: "Please select a file to upload",
                                variant: "destructive",
                              });
                              return;
                            }

                            // Here we'll upload the drawing
                            setIsUploadingDrawing(true);
                            
                            const formData = new FormData();
                            formData.append('file', drawingFile);
                            formData.append('revision', drawingRevision);
                            formData.append('description', drawingDescription);
                            formData.append('drawingNumber', currentItem?.drawingNo || '');
                            formData.append('itemId', currentItem?.id.toString() || '');
                            formData.append('itemCode', currentItem?.itemCode || '');
                            
                            // Use path similar to the FileStorage component
                            const path = `drawings/${currentItem?.itemCode}`;
                            formData.append('path', path);
                            
                            // Use apiRequest to call an upload endpoint
                            apiRequest('POST', '/api/storage/upload', formData)
                              .then(response => {
                                if (!response.ok) {
                                  throw new Error('Failed to upload drawing');
                                }
                                return response.json();
                              })
                              .then(() => {
                                toast({
                                  title: "Success",
                                  description: "Drawing uploaded successfully",
                                });
                                // Reset the form
                                setDrawingFile(null);
                                setDrawingRevision('');
                                setDrawingDescription('');
                                // Close the dialog
                                const dialogCloseButton = document.querySelector('[data-state="open"] button[type="button"]') as HTMLButtonElement;
                                if (dialogCloseButton) dialogCloseButton.click();
                              })
                              .catch(error => {
                                toast({
                                  title: "Error",
                                  description: error.message,
                                  variant: "destructive",
                                });
                              })
                              .finally(() => {
                                setIsUploadingDrawing(false);
                              });
                          }}
                          disabled={isUploadingDrawing}
                        >
                          {isUploadingDrawing ? (
                            <>
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Uploading...
                            </>
                          ) : (
                            "Upload Drawing"
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
                
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Drawing No.</TableHead>
                        <TableHead>Revision</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Upload Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell colSpan={5} className="text-center py-6">
                          <div className="flex flex-col items-center justify-center text-sm text-muted-foreground">
                            <FileIcon className="h-8 w-8 mb-2" />
                            <p>No drawings uploaded yet</p>
                            <p className="text-xs mt-1">Upload drawings using the Upload Drawing button</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                
                <div className="flex justify-between mt-6">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate('/')}
                    >
                      Back to Dashboard
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate('/projects')}
                    >
                      Back to Projects
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditDialogOpen(false);
                      setCurrentItem(null);
                      setActiveTab("details");
                    }}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="ecr">
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-medium">ECR & ECN Management</h3>
                  <div className="space-x-2">
                    <Button size="sm" variant="outline">
                      <Plus className="h-4 w-4 mr-1" /> Create ECR
                    </Button>
                    <Button size="sm">
                      <Plus className="h-4 w-4 mr-1" /> Create ECN
                    </Button>
                  </div>
                </div>
                
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Doc No.</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-6">
                          <div className="flex flex-col items-center justify-center text-sm text-muted-foreground">
                            <ClipboardList className="h-8 w-8 mb-2" />
                            <p>No ECR/ECN documents yet</p>
                            <p className="text-xs mt-1">Use the buttons above to create ECR or ECN documents</p>
                          </div>
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
                
                <div className="flex justify-between mt-6">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate('/')}
                    >
                      Back to Dashboard
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate('/projects')}
                    >
                      Back to Projects
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditDialogOpen(false);
                      setCurrentItem(null);
                      setActiveTab("details");
                    }}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </TabsContent>
            
            <TabsContent value="files">
              <div className="space-y-4">
                {currentItem && (
                  <ItemFileStorage 
                    itemId={currentItem.id}
                    itemCode={currentItem.itemCode}
                  />
                )}
                
                <div className="flex justify-between mt-6">
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate('/')}
                    >
                      Back to Dashboard
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => navigate('/projects')}
                    >
                      Back to Projects
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditDialogOpen(false);
                      setCurrentItem(null);
                      setActiveTab("details");
                    }}
                  >
                    Close
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteDialogItem} onOpenChange={(open) => !open && setDeleteDialogItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the master item "{deleteDialogItem?.itemCode}".
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteMutation.isPending ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      

    </div>
  );
};

export default ItemMasterManagement;
