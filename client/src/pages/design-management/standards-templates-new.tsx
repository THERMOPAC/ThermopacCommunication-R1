import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { 
  FileText, 
  Upload, 
  Search, 
  Download, 
  Eye, 
  FolderOpen,
  Bookmark,
  Award,
  CheckCircle,
  Clock,
  User,
  Calendar,
  Edit,
  Archive
} from 'lucide-react';
import { format } from 'date-fns';

// Types
interface DesignStandard {
  id: number;
  standardType: string;
  standardName: string;
  description: string;
  version: string;
  category: string;
  disciplineCode: string;
  status: string;
  approvalStatus: string;
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  tags?: string[];
  createdBy: number;
  approvedBy?: number;
  createdAt: string;
  approvedAt?: string;
  updatedAt: string;
  
  creator?: {
    username: string;
    firstName?: string;
    lastName?: string;
  };
  approver?: {
    username: string;
    firstName?: string;
    lastName?: string;
  };
}

export default function StandardsTemplatesPage() {
  const [selectedTab, setSelectedTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch standards with filters
  const { data: standards = [], isLoading: standardsLoading } = useQuery({
    queryKey: ['/api/design/standards', searchTerm, categoryFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (categoryFilter) params.append('category', categoryFilter);
      if (statusFilter) params.append('status', statusFilter);
      
      const response = await fetch(`/api/design/standards?${params}`);
      if (!response.ok) throw new Error('Failed to fetch standards');
      return response.json();
    }
  });

  // Upload standard mutation
  const uploadStandardMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/design/standards/upload', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to upload standard');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/design/standards'] });
      setIsUploadDialogOpen(false);
      toast({
        title: "Standard Uploaded",
        description: "The design standard has been successfully uploaded."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleUploadSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    uploadStandardMutation.mutate(formData);
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'draft': return 'bg-yellow-100 text-yellow-800';
      case 'archived': return 'bg-gray-100 text-gray-800';
      case 'under review': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getApprovalBadgeColor = (approvalStatus: string) => {
    switch (approvalStatus.toLowerCase()) {
      case 'approved': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'under review': return 'bg-blue-100 text-blue-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category.toLowerCase()) {
      case 'drawing_template': return <FileText className="w-4 h-4" />;
      case 'cad_standard': return <Award className="w-4 h-4" />;
      case 'design_specification': return <Bookmark className="w-4 h-4" />;
      case 'symbol_library': return <FolderOpen className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const formatCategoryDisplay = (category: string) => {
    return category.split('_').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
  };

  const groupedStandards = {
    drawing_template: standards.filter((s: DesignStandard) => s.category === 'drawing_template'),
    cad_standard: standards.filter((s: DesignStandard) => s.category === 'cad_standard'),
    design_specification: standards.filter((s: DesignStandard) => s.category === 'design_specification'),
    symbol_library: standards.filter((s: DesignStandard) => s.category === 'symbol_library')
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Standards & Templates</h1>
            <p className="text-gray-600 mt-1">Repository of design standards and drawing templates</p>
          </div>
          <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Upload className="w-4 h-4 mr-2" />
                Upload Standard
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Upload New Standard/Template</DialogTitle>
                <DialogDescription>
                  Upload a design standard, template, or specification
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleUploadSubmit} className="space-y-4">
                <div>
                  <Label htmlFor="standardType">Standard Type</Label>
                  <Select name="standardType" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Template">Template</SelectItem>
                      <SelectItem value="Standard">Standard</SelectItem>
                      <SelectItem value="Specification">Specification</SelectItem>
                      <SelectItem value="Guideline">Guideline</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="standardName">Standard Name</Label>
                  <Input name="standardName" placeholder="e.g., P&ID Drawing Template v2.0" required />
                </div>
                <div>
                  <Label htmlFor="description">Description</Label>
                  <Textarea 
                    name="description" 
                    placeholder="Brief description of the standard/template..."
                    rows={3}
                    required 
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="category">Category</Label>
                    <Select name="category" required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="drawing_template">Drawing Template</SelectItem>
                        <SelectItem value="cad_standard">CAD Standard</SelectItem>
                        <SelectItem value="design_specification">Design Specification</SelectItem>
                        <SelectItem value="symbol_library">Symbol Library</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="disciplineCode">Discipline</Label>
                    <Select name="disciplineCode" required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select discipline" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ALL">All Disciplines</SelectItem>
                        <SelectItem value="PROC">Process</SelectItem>
                        <SelectItem value="MECH">Mechanical</SelectItem>
                        <SelectItem value="ELEC">Electrical</SelectItem>
                        <SelectItem value="INST">Instrumentation</SelectItem>
                        <SelectItem value="CIVIL">Civil</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="version">Version</Label>
                  <Input name="version" placeholder="e.g., 1.0" required />
                </div>
                <div>
                  <Label htmlFor="tags">Tags (comma-separated)</Label>
                  <Input name="tags" placeholder="e.g., process, piping, template" />
                </div>
                <div>
                  <Label htmlFor="file">File (Optional)</Label>
                  <Input name="file" type="file" accept=".dwg,.pdf,.doc,.docx,.xls,.xlsx" />
                  <p className="text-xs text-gray-500 mt-1">Supported: DWG, PDF, DOC, DOCX, XLS, XLSX</p>
                </div>
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsUploadDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={uploadStandardMutation.isPending}>
                    {uploadStandardMutation.isPending ? 'Uploading...' : 'Upload'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="all">All Standards</TabsTrigger>
            <TabsTrigger value="templates">Templates</TabsTrigger>
            <TabsTrigger value="standards">CAD Standards</TabsTrigger>
            <TabsTrigger value="specifications">Specifications</TabsTrigger>
            <TabsTrigger value="symbols">Symbol Libraries</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                    <Input
                      placeholder="Search standards..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      <SelectItem value="drawing_template">Drawing Templates</SelectItem>
                      <SelectItem value="cad_standard">CAD Standards</SelectItem>
                      <SelectItem value="design_specification">Design Specifications</SelectItem>
                      <SelectItem value="symbol_library">Symbol Libraries</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="Active">Active</SelectItem>
                      <SelectItem value="Draft">Draft</SelectItem>
                      <SelectItem value="Under Review">Under Review</SelectItem>
                      <SelectItem value="Archived">Archived</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => { setSearchTerm(''); setCategoryFilter(''); setStatusFilter(''); }}>
                    Clear Filters
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Standards Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="w-5 h-5" />
                  All Standards & Templates ({standards.length} items)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {standardsLoading ? (
                  <div className="text-center py-8">Loading standards...</div>
                ) : standards.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No standards found. Upload your first standard to get started.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Standard Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Version</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Approval</TableHead>
                        <TableHead>Updated</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {standards.map((standard: DesignStandard) => (
                        <TableRow key={standard.id}>
                          <TableCell>
                            <div>
                              <div className="font-medium">{standard.standardName}</div>
                              <div className="text-sm text-gray-500">{standard.description}</div>
                            </div>
                          </TableCell>
                          <TableCell>{standard.standardType}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getCategoryIcon(standard.category)}
                              <span>{formatCategoryDisplay(standard.category)}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">v{standard.version}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusBadgeColor(standard.status)}>
                              {standard.status}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Badge className={getApprovalBadgeColor(standard.approvalStatus)}>
                              {standard.approvalStatus}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {format(new Date(standard.updatedAt), 'MMM dd, yyyy')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {standard.fileUrl && (
                                <>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => window.open(standard.fileUrl!, '_blank')}
                                  >
                                    <Eye className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => {
                                      const link = document.createElement('a');
                                      link.href = standard.fileUrl!;
                                      link.download = standard.fileName || 'standard';
                                      link.click();
                                    }}
                                  >
                                    <Download className="w-3 h-3" />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Category-specific tabs */}
          {Object.entries(groupedStandards).map(([category, categoryStandards]) => (
            <TabsContent 
              key={category} 
              value={category === 'drawing_template' ? 'templates' : 
                     category === 'cad_standard' ? 'standards' :
                     category === 'design_specification' ? 'specifications' : 'symbols'} 
              className="space-y-4"
            >
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {categoryStandards.length === 0 ? (
                  <Card className="col-span-full">
                    <CardContent className="text-center py-8">
                      <div className="text-gray-500">
                        No {formatCategoryDisplay(category).toLowerCase()} found.
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  categoryStandards.map((standard: DesignStandard) => (
                    <Card key={standard.id} className="hover:shadow-lg transition-shadow">
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                          {getCategoryIcon(standard.category)}
                          <span className="truncate">{standard.standardName}</span>
                          <Badge variant="outline" className="ml-auto">
                            v{standard.version}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <p className="text-sm text-gray-600 line-clamp-2">
                          {standard.description}
                        </p>
                        <div className="flex items-center justify-between">
                          <Badge className={getStatusBadgeColor(standard.status)}>
                            {standard.status}
                          </Badge>
                          <Badge className={getApprovalBadgeColor(standard.approvalStatus)}>
                            {standard.approvalStatus}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-sm text-gray-500">
                          <span>Updated: {format(new Date(standard.updatedAt), 'MMM dd')}</span>
                          <span>{standard.disciplineCode}</span>
                        </div>
                        {standard.tags && standard.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {standard.tags.slice(0, 3).map((tag, index) => (
                              <Badge key={index} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                            {standard.tags.length > 3 && (
                              <Badge variant="secondary" className="text-xs">
                                +{standard.tags.length - 3}
                              </Badge>
                            )}
                          </div>
                        )}
                        {standard.fileUrl && (
                          <div className="flex items-center gap-2 pt-2">
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => window.open(standard.fileUrl!, '_blank')}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              View
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="flex-1"
                              onClick={() => {
                                const link = document.createElement('a');
                                link.href = standard.fileUrl!;
                                link.download = standard.fileName || 'standard';
                                link.click();
                              }}
                            >
                              <Download className="w-3 h-3 mr-1" />
                              Download
                            </Button>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}