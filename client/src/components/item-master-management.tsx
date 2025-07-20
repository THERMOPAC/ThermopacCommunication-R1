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
import { Badge } from '@/components/ui/badge';

import EngineeringChangeManagement from './engineering-change-management';
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
  SelectSeparator,
  SelectLabel,
  SelectGroup,
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
  AlertTriangle,
  ArrowUpRight,
  ClipboardList, 
  Download,
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
  latestRevision?: number; // camelCase version for Development environment
  latest_revision?: number; // snake_case version for Production environment
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
  
  // Search state
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("all");
  
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
  
  // Enhanced error tracking for drawing uploads
  const [drawingUploadError, setDrawingUploadError] = useState<{
    message: string;
    details?: string;
    errorType?: string;
    suggestion?: string;
    shouldRetry?: boolean;
  } | null>(null);
  const [selectedDrawingItem, setSelectedDrawingItem] = useState<{ id: number, code: string, drawingNo?: string | null } | null>(null);
  const [isDrawingDialogOpen, setIsDrawingDialogOpen] = useState(false);
  // Track the latest revision number for each drawing number
  const [latestRevisions, setLatestRevisions] = useState<Record<string, number>>({});
  
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
    enabled: !!currentItem && (activeTab === 'components' || activeTab === 'drawings'),
  });
  
  // Query to fetch drawings for the current item and its components
  const itemDrawingsQuery = useQuery({
    queryKey: ['item-drawings', currentItem?.id, currentItem?.drawingNo, itemComponentsQuery.data],
    queryFn: async () => {
      if (!currentItem) return [];
      
      // Build a list of drawing numbers to search for
      let drawingNumbers: string[] = [];
      
      // Add the parent item's drawing number if it exists
      if (currentItem.drawingNo) {
        drawingNumbers.push(currentItem.drawingNo);
        console.log(`Added parent item drawing number: ${currentItem.drawingNo}`);
      } else {
        console.log(`Parent item has no drawing number. Using item code: ${currentItem.itemCode}`);
        // If no drawing number, use the item code as a fallback
        drawingNumbers.push(currentItem.itemCode);
      }
      
      // Add component drawing numbers if they exist
      if (itemComponentsQuery.data && itemComponentsQuery.data.length > 0) {
        console.log(`Found ${itemComponentsQuery.data.length} components to check for drawings`);
        for (const component of itemComponentsQuery.data) {
          if (component.drawingNo || component.componentDrawingNo) {
            const componentDrawingNo = component.componentDrawingNo || component.drawingNo;
            if (componentDrawingNo && !drawingNumbers.includes(componentDrawingNo)) {
              drawingNumbers.push(componentDrawingNo);
              console.log(`Added component drawing number: ${componentDrawingNo}`);
            }
          } else {
            console.log(`Component ${component.componentItemCode || component.itemCode} has no drawing number.`);
          }
        }
      }
      
      if (drawingNumbers.length === 0) {
        console.log('No drawing numbers found to search for');
        return [];
      }
      
      console.log(`Fetching drawings for numbers: ${drawingNumbers.join(', ')}`);
      
      // Try multiple search paths to handle both Development and Production environments
      const searchPaths = [
        'THERMOPAC_INVENTORY',  // Standard path for inventory items
        'THERMOPAC_INVENTORY/drawings',  // Path with drawings subdirectory
        'THERMOPAC_PROJECTS/drawings'  // Legacy path in some environments
      ];
      
      let allFoundFiles: any[] = [];
      
      // Attempt to search in all potential paths
      for (const searchPath of searchPaths) {
        try {
          console.log(`Searching in path: ${searchPath}`);
          
          // Use recursive search to find all files
          const response = await fetch(`/api/storage/files?path=${encodeURIComponent(searchPath)}&recursive=true`);
          
          if (response.ok) {
            const pathFiles = await response.json();
            console.log(`Found ${pathFiles.length} total files in ${searchPath}`);
            
            if (pathFiles.length > 0) {
              // For diagnostic purposes, log the structure of a few files
              if (pathFiles.length > 0) {
                console.log(`Sample file structure in ${searchPath}:`, 
                  pathFiles.slice(0, 2).map((f: any) => ({
                    path: f.path,
                    name: f.name,
                    isDir: f.isDirectory
                  }))
                );
              }
              
              allFoundFiles = [...allFoundFiles, ...pathFiles];
            }
          } else {
            console.log(`API returned non-OK status for ${searchPath}: ${response.status}`);
          }
        } catch (error) {
          console.error(`Error searching in path ${searchPath}:`, error);
        }
      }
      
      // For each drawing number, also try a direct path search as fallback
      for (const drawingNo of drawingNumbers) {
        try {
          const directPath = `THERMOPAC_INVENTORY/${drawingNo}`;
          console.log(`Searching direct drawing path: ${directPath}`);
          
          const response = await fetch(`/api/storage/files?path=${encodeURIComponent(directPath)}&recursive=true`);
          
          if (response.ok) {
            const directFiles = await response.json();
            console.log(`Found ${directFiles.length} files in direct path ${directPath}`);
            
            if (directFiles.length > 0) {
              allFoundFiles = [...allFoundFiles, ...directFiles];
            }
          }
        } catch (error) {
          console.error(`Error searching direct path for ${drawingNo}:`, error);
        }
      }
      
      console.log(`Found ${allFoundFiles.length} total files across all search paths`);
      
      if (allFoundFiles.length === 0) {
        console.log('No files found in storage - returning empty array');
        return [];
      }
      
      // Log the first few files to understand the structure
      console.log('Sample of files found:', allFoundFiles.slice(0, 3).map(file => ({
        path: file.path,
        name: file.name,
        isDirectory: file.isDirectory,
        contentType: file.contentType
      })));
      
      // Filter to show only drawing files related to our drawing numbers
      const drawingFiles = allFoundFiles.filter((file: any) => {
        // Skip directories
        if (file.isDirectory) return false;
        
        // Get full path and filename
        const fullPath = file.path || file.name || '';
        
        // Skip non-drawing files
        const isPdfOrDrawing = 
          (file.contentType && (
            file.contentType.includes('pdf') || 
            file.contentType.includes('image') || 
            file.contentType.includes('dwg')
          )) ||
          fullPath.toLowerCase().endsWith('.pdf') ||
          fullPath.toLowerCase().endsWith('.dwg') ||
          fullPath.toLowerCase().endsWith('.dxf');
        
        if (!isPdfOrDrawing) {
          // console.log(`Skipping non-drawing file: ${fullPath}`);
          return false;
        }
        
        // Check if any of our drawing numbers are in the path
        for (const drawingNo of drawingNumbers) {
          // Search for various possible path patterns to be more forgiving:
          // 1. /{drawingNo}/ - Drawing number as a directory
          // 2. /{drawingNo}_ - Drawing number followed by underscore (like in filename)
          // 3. /drawings/{drawingNo}/ - With 'drawings' subfolder (old format)
          // 4. Simply contains the drawing number (least specific, fallback)
          if (
            fullPath.includes(`/${drawingNo}/`) || 
            fullPath.includes(`/${drawingNo}_`) ||
            fullPath.includes(`/drawings/${drawingNo}/`) || 
            fullPath.includes(`/drawings/${drawingNo}_`) ||
            fullPath.includes(drawingNo) // Simpler check to catch more possibilities
          ) {
            console.log(`Match found: Drawing ${drawingNo} in file: ${fullPath}`);
            return true;
          }
        }
        
        return false;
      });
      
      console.log(`Found ${drawingFiles.length} drawing files for all drawing numbers`);
      
      if (drawingFiles.length === 0) {
        return [];
      }
      
      // Process the files and extract information
      const drawingNoRevisions = new Map(); // Track highest revision for each drawing number
      const processedFilesByDrawingNo = new Map(); // Group files by drawing number
      
      // First pass: find highest revision for each drawing number
      drawingFiles.forEach((file: any) => {
        // Get path and filename components
        const fullPath = file.path || file.name || '';
        const pathParts = fullPath.split('/');
        const fileName = pathParts[pathParts.length - 1] || '';
        
        // Skip directories
        if (file.isDirectory) return;
        
        // Initialize with default values
        let revision = 'N/A';
        let fileDescription = fileName;
        let matchedDrawingNo: string | null = null;
        
        // Find which drawing number this file belongs to
        for (const drawingNo of drawingNumbers) {
          // Use the same path patterns as in the filter function above
          if (
            fullPath.includes(`/${drawingNo}/`) || 
            fullPath.includes(`/${drawingNo}_`) ||
            fullPath.includes(`/drawings/${drawingNo}/`) || 
            fullPath.includes(`/drawings/${drawingNo}_`) ||
            fullPath.includes(drawingNo)
          ) {
            matchedDrawingNo = drawingNo;
            break;
          }
        }
        
        if (!matchedDrawingNo) {
          return; // Skip if we can't determine the drawing number
        }
        
        // Extract revision from filename using various patterns
        const revPatterns = [
          /_R(\d+)/, // DrawingNo_R1.pdf
          /Rev\.?(\d+)/i, // Rev1 or Rev.1
          /Revision[_\s-]?(\d+)/i, // Revision 1
          /V(\d+)/, // V1
          /-R(\d+)/, // DrawingNo-R1.pdf
          /_Rev(\d+)/, // DrawingNo_Rev1.pdf
          /[_-](\d+)$/, // Ends with _1 or -1 before extension
          /(\d+)$/ // Last digits in the filename before extension
        ];
        
        let foundRevision = false;
        for (const pattern of revPatterns) {
          // First check in the filename
          const fileMatch = fileName.match(pattern);
          if (fileMatch && fileMatch[1]) {
            revision = fileMatch[1];
            foundRevision = true;
            console.log(`Found revision ${revision} in filename: ${fileName} using pattern: ${pattern}`);
            break;
          }
          
          // Also check in the full path which might contain revision info
          const pathMatch = fullPath.match(pattern);
          if (pathMatch && pathMatch[1]) {
            revision = pathMatch[1];
            foundRevision = true;
            console.log(`Found revision ${revision} in path: ${fullPath} using pattern: ${pattern}`);
            break;
          }
        }
        
        // If no revision found in the filename, try extracting it from the path
        if (!foundRevision) {
          // Look for revision in parent directory name
          if (pathParts.length >= 2) {
            const parentDir = pathParts[pathParts.length - 2];
            const parentDirMatch = parentDir.match(/R(\d+)$/);
            if (parentDirMatch && parentDirMatch[1]) {
              revision = parentDirMatch[1];
              console.log(`Found revision ${revision} in parent directory: ${parentDir}`);
            }
          }
          
          // If still no revision found, check if revision might be in file's metadata
          if (file.metadata && file.metadata.revision) {
            revision = file.metadata.revision.toString();
            console.log(`Found revision ${revision} in file metadata`);
          }
        }
        
        // Use file description if available, otherwise use filename
        if (file.description) {
          fileDescription = file.description;
        }
        
        const revisionNumber = revision !== 'N/A' ? parseInt(revision, 10) : -1;
        
        // Check for component info
        const isComponent = matchedDrawingNo !== currentItem.drawingNo;
        const componentInfo = isComponent ? 
          itemComponentsQuery.data?.find((c: any) => 
            (c.drawingNo === matchedDrawingNo || c.componentDrawingNo === matchedDrawingNo)
          ) : null;
        
        // Create an identifier for the file that includes component information
        // This ensures we get the latest revision for each component separately
        const componentIdentifier = isComponent && componentInfo ? 
          `${matchedDrawingNo}_${componentInfo.componentItemCode || componentInfo.itemCode}` : 
          matchedDrawingNo;
          
        // Get the current highest revision for this drawing/component
        const currentHighestRev = drawingNoRevisions.get(componentIdentifier) || -1;
        
        // Update if this revision is higher
        if (revisionNumber > currentHighestRev) {
          drawingNoRevisions.set(componentIdentifier, revisionNumber);
          
          // Store the processed file data
          processedFilesByDrawingNo.set(componentIdentifier, {
            ...file,
            drawingNo: matchedDrawingNo,
            revision: revision,
            name: fileDescription,
            revisionNumber: revisionNumber,
            uploadDate: new Date(file.created || file.updated || Date.now()).toLocaleString(),
            isComponent,
            componentInfo
          });
        }
      });
      
      // Convert the Map to an array, taking only the highest revision of each
      const processedFiles = Array.from(processedFilesByDrawingNo.values());
      
      // Sort first by drawing number, then by revision (highest first)
      processedFiles.sort((a: any, b: any) => {
        // First sort by drawing number
        if (a.drawingNo !== b.drawingNo) {
          // Put parent drawings first
          if (a.drawingNo === currentItem.drawingNo) return -1;
          if (b.drawingNo === currentItem.drawingNo) return 1;
          // Then alphabetically by drawing number
          return a.drawingNo.localeCompare(b.drawingNo);
        }
        // Then sort by revision number (highest first)
        return b.revisionNumber - a.revisionNumber;
      });
      
      // Update the latestRevisions state
      const highestRevisions: Record<string, number> = {};
      
      processedFiles.forEach((file: any) => {
        const { drawingNo, revisionNumber } = file;
        if (revisionNumber > 0 && (!highestRevisions[drawingNo] || highestRevisions[drawingNo] < revisionNumber)) {
          highestRevisions[drawingNo] = revisionNumber;
        }
      });
      
      // Update our tracking state with the highest revisions we found
      if (Object.keys(highestRevisions).length > 0) {
        setLatestRevisions(prev => {
          const newState = { ...prev, ...highestRevisions };
          console.log('Updated latestRevisions:', newState);
          return newState;
        });
      }
      
      console.log('Processed drawing files:', processedFiles);
      
      return processedFiles;
    },
    enabled: !!currentItem && activeTab === 'drawings' && !itemComponentsQuery.isLoading
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
  
  // Fetch all projects for the filter dropdown
  const { data: projects } = useQuery({
    queryKey: ['/api/projects'],
    queryFn: async () => {
      const response = await fetch('/api/projects');
      if (!response.ok) {
        throw new Error('Failed to fetch projects');
      }
      return response.json();
    }
  });

  // Fetch master items (with optional project filter)
  const { data: items, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/master-items', selectedProjectId],
    queryFn: async () => {
      const url = selectedProjectId === 'all' ? 
        '/api/master-items' : 
        `/api/master-items?projectId=${selectedProjectId}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch master items');
      }
      return response.json();
    }
  });
  
  // Filter items based on search query
  const filteredItems = items ? items.filter((item: MasterItem) => {
    if (!searchQuery) return true; // If no search query, show all items
    
    const query = searchQuery.toLowerCase();
    return (
      item.itemCode.toLowerCase().includes(query) ||
      item.description.toLowerCase().includes(query) ||
      (item.specification && item.specification.toLowerCase().includes(query)) ||
      item.uom.toLowerCase().includes(query) ||
      (item.makeOrBuy && item.makeOrBuy.toLowerCase().includes(query)) ||
      (item.drawingNo && item.drawingNo.toLowerCase().includes(query)) ||
      (item.supplier && item.supplier.toLowerCase().includes(query))
    );
  }) : [];
  
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
      // Use the parseJson parameter set to true (default) to automatically parse the response
      return await apiRequest('PUT', `/api/master-items/${id}`, data);
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
      // Use parseJson: false since we don't need to parse the response for DELETE
      await apiRequest('DELETE', `/api/master-items/${id}`, undefined, false, false);
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
      // Use parseJson: false since we don't need to parse the response for DELETE
      await apiRequest('DELETE', `/api/item-components/${componentId}`, undefined, false, false);
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

  // Check for component ID in session storage when component mounts
  useEffect(() => {
    const storedItemId = sessionStorage.getItem('editMasterItemId');
    if (storedItemId) {
      // Parse the ID from session storage
      const itemId = parseInt(storedItemId);
      
      if (!isNaN(itemId)) {
        // Fetch the master item details
        const fetchItemDetails = async () => {
          try {
            const response = await fetch(`/api/master-items/${itemId}`);
            if (!response.ok) {
              throw new Error('Failed to fetch item details');
            }
            
            const itemData = await response.json();
            // Set as current item and open edit dialog
            setCurrentItem(itemData);
            setIsEditDialogOpen(true);
            
            // Clear the session storage so it doesn't trigger again on refresh
            sessionStorage.removeItem('editMasterItemId');
          } catch (error) {
            console.error('Error fetching item from sessionStorage ID:', error);
            toast({
              title: "Error",
              description: "Failed to load the component's master item details",
              variant: "destructive",
            });
            // Clear the session storage on error too
            sessionStorage.removeItem('editMasterItemId');
          }
        };
        
        fetchItemDetails();
      }
    }
  }, []); // Empty dependency array means this runs once on mount
  
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
          {/* Search and Filter fields */}
          <div className="mb-4 flex gap-4 flex-wrap items-center">
            {/* Project Filter */}
            <div className="flex-shrink-0">
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder="Filter by Project" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects?.map((project: any) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.name} ({project.code}) {project.customerName ? `- ${project.customerName}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Search field */}
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500" />
              <Input
                type="search"
                placeholder="Search items by code, description, make/buy..."
                className="pl-8 w-full"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            
            {/* Clear buttons */}
            {(searchQuery || selectedProjectId !== 'all') && (
              <Button 
                variant="ghost" 
                size="sm" 
                className="flex-shrink-0" 
                onClick={() => {
                  setSearchQuery('');
                  setSelectedProjectId('all');
                }}
              >
                Clear All Filters
              </Button>
            )}
          </div>
          
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
                {filteredItems.length > 0 ? (
                  filteredItems.map((item: MasterItem) => (
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
                    <TableCell colSpan={6} className="text-center py-6">
                      {searchQuery ? (
                        <div className="flex flex-col items-center gap-2">
                          <Search className="h-12 w-12 text-muted-foreground mb-2" />
                          <p className="text-lg font-medium">No items match your search</p>
                          <p className="text-muted-foreground">
                            Try adjusting your search query or clear the search to see all items.
                          </p>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-2">
                          <Package className="h-12 w-12 text-muted-foreground mb-2" />
                          <p className="text-lg font-medium">No items found</p>
                          <p className="text-muted-foreground">
                            Create your first item to get started.
                          </p>
                        </div>
                      )}
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
                        <TableHead></TableHead>
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
                          <TableCell colSpan={8} className="text-center py-4">
                            <div className="flex justify-center">
                              <div className="animate-spin h-6 w-6 border-t-2 border-b-2 border-primary rounded-full"></div>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : itemComponentsQuery.error ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-red-500">
                            Error loading components: {(itemComponentsQuery.error as Error).message}
                          </TableCell>
                        </TableRow>
                      ) : itemComponentsQuery.data && itemComponentsQuery.data.length > 0 ? (
                        itemComponentsQuery.data.map((component: any) => (
                          <TableRow key={component.id}>
                            <TableCell className="w-12">
                              {/* Golden arrow button to navigate to component master item */}
                              <Button 
                                variant="ghost" 
                                size="sm"
                                className="text-amber-500 hover:text-amber-600 font-bold border border-amber-500"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  
                                  // Add debug log
                                  console.log("Golden arrow clicked for component:", component);
                                  
                                  // Store the component's master item ID in sessionStorage
                                  if (component.componentItemId) {
                                    console.log("Setting componentItemId in sessionStorage:", component.componentItemId);
                                    
                                    // Store ID and navigate
                                    sessionStorage.setItem('editMasterItemId', component.componentItemId.toString());
                                    
                                    // Use window.location for navigation instead of wouter's navigate
                                    // This ensures a full page reload which helps with the session storage handling
                                    window.location.href = "/item-master";
                                  } else {
                                    console.error("Component item ID not found:", component);
                                    toast({
                                      title: "Error",
                                      description: "Could not find master item information for this component",
                                      variant: "destructive",
                                    });
                                  }
                                }}
                                title="Edit Component Master Item"
                              >
                                <ArrowUpRight className="h-4 w-4" />
                              </Button>
                            </TableCell>
                            <TableCell>{component.componentItemCode}</TableCell>
                            <TableCell>{component.componentDescription}</TableCell>
                            <TableCell>{component.quantity}</TableCell>
                            <TableCell>{component.componentUom}</TableCell>
                            <TableCell>{component.componentMakeOrBuy || '-'}</TableCell>
                            <TableCell>{component.componentDrawingNo || '-'}</TableCell>
                            <TableCell>
                              {/* Delete button */}
                              <Button 
                                variant="ghost" 
                                size="sm" 
                                onClick={() => handleDeleteComponent(component.id)}
                                disabled={isDeleting === component.id}
                                title="Delete Component"
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
                          <TableCell colSpan={8} className="text-center py-6">
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
                  <Dialog open={isDrawingDialogOpen} onOpenChange={(open) => {
                    setIsDrawingDialogOpen(open);
                    
                    // Clear any previous error state regardless of open/close
                    setDrawingUploadError(null);
                    
                    // When opening the dialog, initialize with the parent item selected
                    if (open && currentItem) {
                      console.log('Current latestRevisions state when opening dialog:', latestRevisions);
                      console.log('Current item from database:', currentItem);
                      
                      const newSelectedItem = {
                        id: currentItem.id,
                        code: currentItem.itemCode,
                        drawingNo: currentItem.drawingNo
                      };
                      setSelectedDrawingItem(newSelectedItem);
                      
                      // Auto-populate the revision field with the next revision number
                      const drawingNo = newSelectedItem.drawingNo || newSelectedItem.code;
                      
                      // First try to use the latestRevision from the database (most reliable source)
                      // Then fallback to the latestRevisions state object if needed
                      let latestRev = -1;
                      
                      if (currentItem.latestRevision !== undefined && currentItem.latestRevision !== null) {
                        // Use the database value if available (camelCase field)
                        latestRev = currentItem.latestRevision;
                        console.log(`Using latestRevision from database: ${latestRev}`);
                      } else if ((currentItem as any).latest_revision !== undefined && (currentItem as any).latest_revision !== null) {
                        // Use the database value if available (snake_case field)
                        latestRev = (currentItem as any).latest_revision;
                        console.log(`Using latest_revision (snake_case) from database: ${latestRev}`);
                      } else if (latestRevisions[drawingNo] !== undefined) {
                        // Fallback to the state object
                        latestRev = latestRevisions[drawingNo];
                        console.log(`Using latestRevision from state cache: ${latestRev}`);
                      } else {
                        console.log('No revision information found, defaulting to -1');
                      }
                      
                      const nextRev = (latestRev + 1).toString();
                      console.log(`Auto-populating revision on dialog open for ${drawingNo}: Latest revision = ${latestRev}, Next revision = ${nextRev}`);
                      setDrawingRevision(nextRev);
                    }
                  }}>
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
                      {/* Display detailed error information if there's an error */}
                      {drawingUploadError && (
                        <div className="bg-destructive/10 border border-destructive text-destructive rounded-md px-4 py-3 mb-4">
                          <div className="flex items-start">
                            <AlertTriangle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
                            <div>
                              <h4 className="font-medium text-sm">{drawingUploadError.message}</h4>
                              {drawingUploadError.details && (
                                <p className="text-xs mt-1">{drawingUploadError.details}</p>
                              )}
                              {drawingUploadError.suggestion && (
                                <p className="text-xs mt-2 font-medium">{drawingUploadError.suggestion}</p>
                              )}
                              {drawingUploadError.shouldRetry && (
                                <p className="text-xs mt-2">The system will automatically retry the upload.</p>
                              )}
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="mt-2 h-7 text-xs" 
                                onClick={() => setDrawingUploadError(null)}
                              >
                                Dismiss
                              </Button>
                            </div>
                          </div>
                        </div>
                      )}
                      
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label htmlFor="drawing-item">Select Item</Label>
                          <Select
                            value={selectedDrawingItem ? 
                              selectedDrawingItem.id === currentItem?.id ? 'parent' : `${selectedDrawingItem.id}` 
                              : ''}
                            onValueChange={(value) => {
                              if (value === 'parent') {
                                // Parent item selected
                                const newSelectedItem = {
                                  id: currentItem!.id,
                                  code: currentItem!.itemCode,
                                  drawingNo: currentItem!.drawingNo
                                };
                                setSelectedDrawingItem(newSelectedItem);
                                
                                // Auto-populate the revision field with the next revision number
                                const drawingNo = newSelectedItem.drawingNo || newSelectedItem.code;
                                
                                // Try to get the latest revision from various sources
                                let latestRev = -1;
                                
                                // First check if the item has a latestRevision field directly
                                // Production fix: log the parent item data to diagnose issues
                                console.log('Parent item data in dropdown selection:', currentItem);
                                
                                if (currentItem?.latestRevision !== undefined && currentItem?.latestRevision !== null) {
                                  // Use the database value if available (camelCase field)
                                  latestRev = currentItem!.latestRevision;
                                  console.log(`Using parent item latestRevision from database: ${latestRev}`);
                                } else if ((currentItem as any)?.latest_revision !== undefined && (currentItem as any)?.latest_revision !== null) {
                                  // Use the database value if available (snake_case field)
                                  latestRev = (currentItem as any).latest_revision;
                                  console.log(`Using parent item latest_revision (snake_case) from database: ${latestRev}`);
                                } else if (latestRevisions[drawingNo] !== undefined) {
                                  // Fallback to the state object
                                  latestRev = latestRevisions[drawingNo];
                                  console.log(`Using latestRevision from state cache: ${latestRev}`);
                                } else {
                                  console.log('No revision information found, defaulting to -1');
                                }
                                
                                const nextRev = (latestRev + 1).toString();
                                console.log(`Auto-populating revision for ${drawingNo}: Latest revision = ${latestRev}, Next revision = ${nextRev}`);
                                setDrawingRevision(nextRev);
                              } else if (value) {
                                // Component item selected
                                const component = itemComponentsQuery.data?.find((c: any) => c.id === parseInt(value));
                                if (component) {
                                  console.log('Found component data:', component);
                                  // Log ALL keys to see what naming format is used in Production
                                  console.log('Component keys:', Object.keys(component));
                                  
                                  const newSelectedItem = {
                                    id: component.id,
                                    code: component.componentItemCode || component.itemCode,
                                    drawingNo: component.componentDrawingNo || component.drawingNo
                                  };
                                  setSelectedDrawingItem(newSelectedItem);
                                  
                                  // Auto-populate the revision field with the next revision number
                                  const drawingNo = newSelectedItem.drawingNo || newSelectedItem.code;
                                  
                                  // For components, we need to find the component's latest revision
                                  let latestRev = -1;
                                  
                                  // Production fix: log the component data to diagnose issues
                                  console.log('Component data in dialog:', JSON.stringify(component, null, 2));
                                  
                                  // Try EVERY possible field name variation for latest revision
                                  // First check if the component has a latestRevision field (camelCase)
                                  if (component.latestRevision !== undefined && component.latestRevision !== null) {
                                    latestRev = component.latestRevision;
                                    console.log(`Using component latestRevision from database: ${latestRev}`);
                                  } else if ((component as any).latest_revision !== undefined && (component as any).latest_revision !== null) {
                                    // Try snake_case variation (sometimes data comes in this format in Production)
                                    latestRev = (component as any).latest_revision;
                                    console.log(`Using component latest_revision (snake_case) from database: ${latestRev}`);
                                  } else if ((component as any).latestrevision !== undefined && (component as any).latestrevision !== null) {
                                    // Try lowercase variation
                                    latestRev = (component as any).latestrevision;
                                    console.log(`Using component latestrevision (lowercase) from database: ${latestRev}`);
                                  } else if ((component as any).component_latest_revision !== undefined && (component as any).component_latest_revision !== null) {
                                    // Try component_latest_revision variation
                                    latestRev = (component as any).component_latest_revision;
                                    console.log(`Using component_latest_revision from database: ${latestRev}`);
                                  } else if (component.componentItem && component.componentItem.latestRevision !== undefined && component.componentItem.latestRevision !== null) {
                                    // Try nested object format
                                    latestRev = component.componentItem.latestRevision;
                                    console.log(`Using component.componentItem.latestRevision from database: ${latestRev}`);
                                  } else if (component.master_item && component.master_item.latest_revision !== undefined && component.master_item.latest_revision !== null) {
                                    // Try nested master_item object with snake_case
                                    latestRev = component.master_item.latest_revision;
                                    console.log(`Using component.master_item.latest_revision from database: ${latestRev}`);
                                  } else if ((component as any).masterItem && (component as any).masterItem.latestRevision !== undefined && (component as any).masterItem.latestRevision !== null) {
                                    // Try nested masterItem object with camelCase 
                                    latestRev = (component as any).masterItem.latestRevision;
                                    console.log(`Using component.masterItem.latestRevision from database: ${latestRev}`);
                                  } else if (latestRevisions[drawingNo] !== undefined) {
                                    // Fallback to the state object
                                    latestRev = latestRevisions[drawingNo];
                                    console.log(`Using component latestRevision from state cache: ${latestRev}`);
                                  } else {
                                    console.log('No component revision information found in component object, attempting direct API fetch');
                                    
                                    // As a last resort, we'll try to fetch the latest revision directly from the API
                                    // This is an advanced fallback for production environment where the component structure might vary
                                    // Use an IIFE to handle the async operation
                                    (async () => {
                                      try {
                                        // Find the component item code to use in the API call
                                        const componentItemCode = component.componentItemCode || component.itemCode;
                                        
                                        if (componentItemCode) {
                                          console.log(`Performing direct API query for component item: ${componentItemCode}`);
                                          const response = await fetch(`/api/master-items/by-code/${componentItemCode}`);
                                          
                                          if (response.ok) {
                                            const masterItem = await response.json();
                                            console.log('Direct API response for component item:', masterItem);
                                            
                                            // Check for latest revision in any possible format
                                            if (masterItem.latestRevision !== undefined && masterItem.latestRevision !== null) {
                                              latestRev = masterItem.latestRevision;
                                              console.log(`Found latestRevision in direct API call: ${latestRev}`);
                                            } else if (masterItem.latest_revision !== undefined && masterItem.latest_revision !== null) {
                                              latestRev = masterItem.latest_revision;
                                              console.log(`Found latest_revision in direct API call: ${latestRev}`);
                                            }
                                            
                                            // If we found a revision, update the state
                                            if (latestRev !== -1) {
                                              const nextRev = (latestRev + 1).toString();
                                              console.log(`Updating revision from direct API call to: ${nextRev}`);
                                              setDrawingRevision(nextRev);
                                            }
                                          }
                                        }
                                      } catch (error) {
                                        console.error('Error in direct API fallback:', error);
                                      }
                                    })();
                                    
                                    console.log('No revision information found in all available sources, defaulting to -1');
                                  }
                                  
                                  const nextRev = (latestRev + 1).toString();
                                  console.log(`Auto-populating revision for component ${drawingNo}: Latest revision = ${latestRev}, Next revision = ${nextRev}`);
                                  setDrawingRevision(nextRev);
                                }
                              }
                            }}
                          >
                            <SelectTrigger className="w-full">
                              <SelectValue placeholder="Select the item for this drawing" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectGroup>
                                <SelectLabel>Parent Item</SelectLabel>
                                <SelectItem value="parent">
                                  {currentItem?.itemCode} (Parent Item)
                                </SelectItem>
                              </SelectGroup>
                              {itemComponentsQuery.data && itemComponentsQuery.data.length > 0 && (
                                <>
                                  <SelectSeparator />
                                  <SelectGroup>
                                    <SelectLabel>Sub-Assembly Components</SelectLabel>
                                    {itemComponentsQuery.data.map((component: any) => (
                                      <SelectItem key={component.id} value={component.id.toString()}>
                                        {component.componentItemCode || component.itemCode}
                                      </SelectItem>
                                    ))}
                                  </SelectGroup>
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
                        
                        {selectedDrawingItem && drawingFile && (
                          <div className="bg-muted p-3 rounded-md mt-2">
                            <h4 className="text-sm font-medium mb-1">Storage Path:</h4>
                            <p className="text-xs text-muted-foreground break-all">
                              THERMOPAC_INVENTORY/{selectedDrawingItem.drawingNo || selectedDrawingItem.code}/{selectedDrawingItem.drawingNo || selectedDrawingItem.code}_R{drawingRevision || '0'}.{drawingFile.name.split('.').pop()}
                            </p>
                            <p className="text-xs text-blue-500 mt-1">
                              (Using the standard path format for drawings)
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
                            
                            if (!selectedDrawingItem) {
                              toast({
                                title: "Error",
                                description: "Please select an item for this drawing",
                                variant: "destructive",
                              });
                              return;
                            }
                            
                            // Check for duplicate revisions
                            const drawingNo = selectedDrawingItem.drawingNo || selectedDrawingItem.code;
                            const currentRevNum = parseInt(drawingRevision || "0", 10);
                            
                            // Check if this exact revision already exists in the list of drawings
                            const isDuplicateRevision = itemDrawingsQuery.data && itemDrawingsQuery.data.some((drawing: any) => {
                              // Only check drawings with the same drawing number
                              if (drawing.drawingNo === drawingNo) {
                                const drawingRev = drawing.revision !== undefined ? parseInt(drawing.revision, 10) : 0;
                                return drawingRev === currentRevNum;
                              }
                              return false;
                            });
                            
                            if (isDuplicateRevision) {
                              toast({
                                title: "Error",
                                description: `Revision ${currentRevNum} already exists for this drawing. Please use a different revision number.`,
                                variant: "destructive",
                              });
                              return;
                            }

                            // Here we'll upload the drawing
                            setIsUploadingDrawing(true);
                            
                            // Use the selected item information instead of current item
                            // drawingNo already declared above
                            
                            // Get the file extension
                            const originalFileName = drawingFile.name;
                            const fileExtension = originalFileName.split('.').pop() || 'pdf';
                            
                            // Create a new file with the correct naming pattern: "Drawing No_RX.pdf"
                            // Always include revision in the filename, using 0 as default if not provided
                            const revisionNumber = drawingRevision || '0';
                            const newFileName = `${drawingNo}_R${revisionNumber}.${fileExtension}`;
                            console.log("Uploading file with name:", newFileName);
                            // Create a new file object with the correct name pattern
                            const newFile = new File([drawingFile], newFileName, { type: drawingFile.type });
                            
                            // Create FormData with the required parameters for /api/storage/upload
                            const formData = new FormData();
                            formData.append('file', newFile);
                            
                            // Add the required parameters for file-storage-routes.ts upload endpoint
                            formData.append('financialYear', 'THERMOPAC_INVENTORY'); // Using a fixed value for inventory items
                            formData.append('projectCode', drawingNo); // Using drawing number as project code
                            formData.append('department', ''); // Keep empty for drawings path pattern THERMOPAC_INVENTORY/{drawingNo}/{drawingNo}_R{revisionNumber}.{fileExtension}
                            formData.append('subDirectory', ''); // Using empty string for proper path construction
                            formData.append('projectId', '3'); // Using valid project ID from database
                            formData.append('description', drawingDescription || `Drawing for ${drawingNo}`);
                            formData.append('type', 'drawing');
                            formData.append('isPublic', 'false');
                            
                            // Log the complete path that will be created for the drawing - helps debug Production vs Development issues
                            console.log(`Drawing upload path structure: THERMOPAC_INVENTORY/${drawingNo}/${newFileName}`);
                            console.log(`Environment: ${import.meta.env.MODE}`);
                            console.log(`Upload parameters:`, {
                                financialYear: 'THERMOPAC_INVENTORY',
                                projectCode: drawingNo,
                                department: '',
                                subDirectory: '',
                                projectId: '3',
                                description: drawingDescription || `Drawing for ${drawingNo}`,
                                type: 'drawing',
                                isPublic: 'false',
                                fileName: newFileName,
                                fileSize: newFile.size,
                                fileType: newFile.type
                            });
                            
                            // Use fetch API with async/await pattern in an IIFE
                            (async () => {
                              const maxRetries = 3; // Increase max retries
                              let lastError = null;
                              
                              // Enhanced upload function with intelligent retry logic
                              const uploadWithRetry = async (attempt: number) => {
                                try {
                                  if (attempt > 0) {
                                    // Calculate exponential backoff delay
                                    const delay = Math.min(Math.pow(2, attempt) * 1000, 10000); // Max 10 second delay
                                    console.log(`Retry attempt ${attempt} of ${maxRetries}... (Waiting ${delay}ms)`);
                                    
                                    toast({
                                      title: "Retrying upload",
                                      description: `Attempt ${attempt} of ${maxRetries}...`,
                                      duration: 3000, // Show toast for 3 seconds
                                    });
                                    
                                    // Wait before retry with exponential backoff
                                    await new Promise(resolve => setTimeout(resolve, delay));
                                  }
                                  
                                  console.log('Uploading drawing with fetch...');
                                  
                                  // Enhanced FormData logging for debugging
                                  if (formData.has('file')) {
                                    const file = formData.get('file') as File;
                                    console.log(`File name: ${file.name}, size: ${file.size} bytes, type: ${file.type}`);
                                  }
                                  
                                  console.log(`FormData contains file: ${formData.has('file')}`);
                                  console.log(`FormData financialYear: ${formData.get('financialYear')}`);
                                  console.log(`FormData projectCode: ${formData.get('projectCode')}`);
                                  console.log(`FormData department: ${formData.get('department')}`);
                                  console.log(`FormData description: ${formData.get('description')}`);
                                  console.log(`FormData type: ${formData.get('type')}`);
                                  console.log(`FormData projectId: ${formData.get('projectId')}`);
                                  
                                  // Send the upload request
                                  const response = await fetch('/api/storage/upload', {
                                    method: 'POST',
                                    body: formData
                                  });
                                  
                                  console.log('Upload response status:', response.status, response.statusText);
                                  
                                  if (!response.ok) {
                                    // Parse error response
                                    const errorText = await response.text();
                                    console.error('Upload error response text:', errorText);
                                    
                                    let errorData = {};
                                    let shouldRetry = false;
                                    let retryDelay = 0;
                                    
                                    try {
                                      // Try to parse as JSON
                                      errorData = JSON.parse(errorText);
                                      console.log('Parsed error data:', errorData);
                                      
                                      // Check if server explicitly tells us whether to retry
                                      if ((errorData as any).shouldRetry !== undefined) {
                                        shouldRetry = (errorData as any).shouldRetry;
                                        console.log(`Server indicates shouldRetry: ${shouldRetry}`);
                                      }
                                      
                                      // Use server-suggested retry delay if provided
                                      if ((errorData as any).retryDelay !== undefined) {
                                        retryDelay = (errorData as any).retryDelay;
                                        console.log(`Server suggests retry delay: ${retryDelay}ms`);
                                      }
                                    } catch (parseError) {
                                      console.log('Error response is not in JSON format:', parseError);
                                    }
                                    
                                    // If server didn't explicitly specify retry behavior,
                                    // determine it based on status code and error message
                                    if ((errorData as any).shouldRetry === undefined) {
                                      shouldRetry = 
                                        response.status >= 500 || 
                                        response.status === 429 ||
                                        errorText.includes('ECONNRESET') || 
                                        errorText.includes('ETIMEDOUT') ||
                                        errorText.includes('timeout') || 
                                        errorText.includes('network') || 
                                        (errorData as any)?.error?.includes('Failed to upload');
                                        
                                      console.log(`Determined shouldRetry=${shouldRetry} based on response`);
                                    }
                                    
                                    // For retriable errors, calculate retry delay if not specified by server
                                    if (shouldRetry && retryDelay === 0) {
                                      retryDelay = Math.min(Math.pow(2, attempt + 1) * 1000, 10000);
                                      console.log(`Calculated retry delay: ${retryDelay}ms`);
                                    }
                                    
                                    if (shouldRetry && attempt < maxRetries) {
                                      // Return object indicating retry needed with delay
                                      return { 
                                        success: false, 
                                        errorData, 
                                        errorText, 
                                        response, 
                                        shouldRetry: true,
                                        retryDelay
                                      };
                                    }
                                    
                                    // Handle specific error cases
                                    if (errorData && (errorData as any).error) {
                                      if (response.status === 409 && (errorData as any).suggestedRevision !== undefined) {
                                        // Update revision field with suggested value
                                        setDrawingRevision((errorData as any).suggestedRevision.toString());
                                        throw new Error(`${(errorData as any).error} Please use revision ${(errorData as any).suggestedRevision}.`);
                                      } else {
                                        throw new Error((errorData as any).error);
                                      }
                                    }
                                    
                                    // Structured error message with server response details
                                    const errorMessage = `Upload failed with status: ${response.status} ${response.statusText}.\n${errorText.substring(0, 150)}...`;
                                    console.error(errorMessage);
                                    throw new Error(errorMessage);
                                  }
                                  
                                  // Success - return true with response data
                                  let responseData = {};
                                  try {
                                    responseData = await response.json();
                                  } catch (jsonError) {
                                    console.log('No JSON in success response');
                                  }
                                  
                                  return { 
                                    success: true,
                                    data: responseData
                                  };
                                } catch (error) {
                                  lastError = error;
                                  console.error('Error in uploadWithRetry:', error);
                                  
                                  // Return error result
                                  return { 
                                    success: false, 
                                    error, 
                                    shouldRetry: false 
                                  };
                                }
                              };
                              
                              try {
                                // Attempt initial upload
                                let result = await uploadWithRetry(0);
                                
                                // Retry if needed with proper delay
                                let retryCount = 0;
                                while (!result.success && result.shouldRetry && retryCount < maxRetries) {
                                  const delay = result.retryDelay || Math.pow(2, retryCount + 1) * 1000;
                                  
                                  // Show toast with retry information
                                  toast({
                                    title: "Upload failed - Waiting to retry",
                                    description: `Will retry in ${Math.round(delay/1000)}s (Attempt ${retryCount+1}/${maxRetries})`,
                                    variant: "destructive",
                                    duration: delay - 500, // Show until just before retry
                                  });
                                  
                                  // Wait before retry
                                  await new Promise(resolve => setTimeout(resolve, delay));
                                  
                                  // Execute retry
                                  retryCount++;
                                  result = await uploadWithRetry(retryCount);
                                }
                                
                                // If we didn't succeed after all retries, throw the last error
                                if (!result.success) {
                                  throw lastError || new Error("Upload failed after all retry attempts");
                                }
                                
                                // Success path
                                console.log('Upload successful', result.data);
                                
                                toast({
                                  title: 'Success',
                                  description: 'Drawing uploaded successfully',
                                });
                                
                                // Update revision tracking
                                if (selectedDrawingItem) {
                                  const currentRevNum = parseInt(revisionNumber, 10);
                                  
                                  setLatestRevisions(prev => {
                                    const prevRev = prev[drawingNo] || 0;
                                    if (currentRevNum > prevRev) {
                                      return {
                                        ...prev,
                                        [drawingNo]: currentRevNum
                                      };
                                    }
                                    return prev;
                                  });
                                }
                                
                                // Refresh the drawings list
                                queryClient.invalidateQueries({ 
                                  queryKey: ['item-drawings', currentItem?.id, currentItem?.drawingNo, itemComponentsQuery.data] 
                                });
                                
                                // Reset form and close dialog
                                setDrawingFile(null);
                                setDrawingRevision('');
                                setDrawingDescription('');
                                setSelectedDrawingItem(null);
                                setIsDrawingDialogOpen(false);
                              } catch (error) {
                                console.error('Upload error:', error);
                                
                                // Classify the error and set detailed error state
                                let errorMessage = 'Failed to upload drawing';
                                let errorDetails = '';
                                let errorType = 'unknown';
                                let errorSuggestion = '';
                                let shouldRetry = false;
                                
                                if (error instanceof Error) {
                                  errorMessage = error.message;
                                  
                                  // Classify error type based on message content
                                  if (error.message.includes('revision')) {
                                    errorType = 'revision';
                                    errorSuggestion = 'Please use the suggested revision number and try again.';
                                  } else if (error.message.includes('permission') || error.message.includes('403')) {
                                    errorType = 'permission';
                                    errorSuggestion = 'You may not have permission to upload to this location. Contact your system administrator.';
                                  } else if (error.message.includes('network') || error.message.includes('connection') || 
                                             error.message.includes('timeout') || error.message.includes('ECONN')) {
                                    errorType = 'network';
                                    errorSuggestion = 'Check your internet connection and try again.';
                                    shouldRetry = true;
                                  } else if (error.message.includes('size') || error.message.includes('large')) {
                                    errorType = 'filesize';
                                    errorSuggestion = 'The file may be too large. Try compressing it or uploading a smaller file.';
                                  } else if (error.message.includes('format') || error.message.includes('type')) {
                                    errorType = 'format';
                                    errorSuggestion = 'The file format may not be supported. Try uploading a PDF or DWG file.';
                                  } else if (error.message.includes('storage') || error.message.includes('bucket')) {
                                    errorType = 'storage';
                                    errorDetails = 'There was an issue with the cloud storage service.';
                                    errorSuggestion = 'Please try again later or contact support if the issue persists.';
                                  }
                                  
                                  // Extract more details if available in nested error
                                  if ((error as any).cause || (error as any).originalError) {
                                    const nestedError = (error as any).cause || (error as any).originalError;
                                    if (nestedError && nestedError.message) {
                                      errorDetails = nestedError.message;
                                    }
                                  }
                                }
                                
                                // Set the detailed error state
                                setDrawingUploadError({
                                  message: errorMessage,
                                  details: errorDetails,
                                  errorType: errorType,
                                  suggestion: errorSuggestion,
                                  shouldRetry: shouldRetry
                                });
                                
                                // Still show toast for immediate feedback
                                toast({
                                  title: 'Upload Failed',
                                  description: errorMessage,
                                  variant: 'destructive',
                                });
                              } finally {
                                setIsUploadingDrawing(false);
                              }
                            })();
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
                        <TableHead>Type</TableHead>
                        <TableHead>Revision</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>Upload Date</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itemDrawingsQuery.isLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-6">
                            <div className="flex flex-col items-center justify-center">
                              <div className="animate-spin h-8 w-8 border-t-2 border-b-2 border-primary rounded-full mb-2"></div>
                              <p className="text-sm text-muted-foreground">Loading drawings...</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : itemDrawingsQuery.error ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-6">
                            <div className="flex flex-col items-center justify-center text-sm text-destructive">
                              <AlertTriangle className="h-8 w-8 mb-2" />
                              <p>Error loading drawings: {(itemDrawingsQuery.error as Error).message}</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      ) : itemDrawingsQuery.data && itemDrawingsQuery.data.length > 0 ? (
                        // Render drawings if we have data
                        itemDrawingsQuery.data.map((drawing: any, index: number) => {
                          // Get component info if this is a component drawing
                          const isComponent = drawing.isComponent;
                          const componentInfo = drawing.componentInfo;
                          
                          return (
                            <TableRow 
                              key={`${drawing.path}-${index}`}
                              className={isComponent ? "bg-muted/30" : ""}
                            >
                              <TableCell>
                                {drawing.drawingNo}
                                {isComponent && componentInfo && (
                                  <span className="text-xs text-muted-foreground block">
                                    Component: {componentInfo.componentItemCode || componentInfo.itemCode}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                {isComponent ? (
                                  <Badge variant="outline" className="bg-primary/10">
                                    Component
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-primary/20">
                                    Parent
                                  </Badge>
                                )}
                              </TableCell>
                              <TableCell>{drawing.revision || 'N/A'}</TableCell>
                              <TableCell>{drawing.name}</TableCell>
                              <TableCell>{drawing.uploadDate}</TableCell>
                              <TableCell>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      // Download drawing using its path
                                      fetch(`/api/storage/download-url?filePath=${encodeURIComponent(drawing.path)}`)
                                        .then(response => response.json())
                                        .then(data => {
                                          window.open(data.downloadUrl, '_blank');
                                        })
                                        .catch(error => {
                                          toast({
                                            title: "Error",
                                            description: "Failed to download drawing",
                                            variant: "destructive",
                                          });
                                        });
                                    }}
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })
                      ) : (
                        // Show message when no drawings are found
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-6">
                            <div className="flex flex-col items-center justify-center text-sm text-muted-foreground">
                              <FileIcon className="h-8 w-8 mb-2" />
                              <p>No drawings uploaded yet</p>
                              <p className="text-xs mt-1">Upload drawings using the Upload Drawing button</p>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
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
                {/* Import and use the dedicated EngineeringChangeManagement component */}
                <EngineeringChangeManagement 
                  itemId={currentItem?.id || 0} 
                  users={items?.map((item: any) => ({id: item.id, username: item.itemCode})) || []} 
                  onBack={() => {
                    // Handle back button click
                    setIsEditDialogOpen(false);
                    setCurrentItem(null);
                    setActiveTab("details");
                  }}
                />

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
