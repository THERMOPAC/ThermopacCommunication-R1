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
  Send, 
  Search, 
  Download, 
  Eye, 
  FileText,
  Package,
  Clock,
  CheckCircle,
  AlertTriangle,
  Mail,
  Calendar,
  Building,
  User
} from 'lucide-react';
import { format } from 'date-fns';

// Types
interface DrawingTransmittal {
  id: number;
  transmittalNumber: string;
  designProjectId: number;
  clientName: string;
  clientContactPerson?: string;
  clientEmail?: string;
  subject: string;
  transmissionType: string;
  status: string;
  totalDrawings: number;
  submittedDate?: string;
  acknowledgmentReceived: boolean;
  acknowledgmentDate?: string;
  remarks?: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  
  project?: {
    designProjectName: string;
    projectName: string;
    projectCode: string;
  };
  creator?: {
    username: string;
    firstName?: string;
    lastName?: string;
  };
}

export default function TransmittalsPage() {
  const [selectedTab, setSelectedTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch transmittals with filters
  const { data: transmittals = [], isLoading: transmittalsLoading } = useQuery({
    queryKey: ['/api/design/transmittals', searchTerm, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (searchTerm) params.append('search', searchTerm);
      if (statusFilter) params.append('status', statusFilter);
      
      const response = await fetch(`/api/design/transmittals?${params}`);
      if (!response.ok) throw new Error('Failed to fetch transmittals');
      return response.json();
    }
  });

  // Fetch design projects for dropdown
  const { data: designProjects = [] } = useQuery({
    queryKey: ['/api/design/projects'],
    queryFn: async () => {
      const response = await fetch('/api/design/projects');
      if (!response.ok) throw new Error('Failed to fetch design projects');
      return response.json();
    }
  });

  // Create transmittal mutation
  const createTransmittalMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/design/transmittals', {
        method: 'POST',
        body: formData
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create transmittal');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/design/transmittals'] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Transmittal Created",
        description: "The drawing transmittal has been successfully created."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleCreateSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    createTransmittalMutation.mutate(formData);
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'submitted': return 'bg-blue-100 text-blue-800';
      case 'acknowledged': return 'bg-green-100 text-green-800';
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'draft': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'submitted': return <Send className="w-4 h-4" />;
      case 'acknowledged': return <CheckCircle className="w-4 h-4" />;
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'draft': return <FileText className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const getTransmissionTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'email': return <Mail className="w-4 h-4" />;
      case 'hardcopy': return <Package className="w-4 h-4" />;
      case 'digital': return <FileText className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const statusCounts = {
    all: transmittals.length,
    pending: transmittals.filter((t: DrawingTransmittal) => t.status === 'Pending').length,
    submitted: transmittals.filter((t: DrawingTransmittal) => t.status === 'Submitted').length,
    acknowledged: transmittals.filter((t: DrawingTransmittal) => t.status === 'Acknowledged').length
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Drawing Transmittals</h1>
            <p className="text-gray-600 mt-1">Client submission tracking and document distribution</p>
          </div>
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700">
                <Send className="w-4 h-4 mr-2" />
                Create Transmittal
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Drawing Transmittal</DialogTitle>
                <DialogDescription>
                  Create a new transmittal for client submission
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={handleCreateSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="designProjectId">Design Project</Label>
                    <Select name="designProjectId" required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select project" />
                      </SelectTrigger>
                      <SelectContent>
                        {designProjects.map((project: any) => (
                          <SelectItem key={project.id} value={project.id.toString()}>
                            {project.designProjectName} - {project.projectName}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="transmittalNumber">Transmittal Number</Label>
                    <Input name="transmittalNumber" placeholder="e.g., TX-2025-001" required />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="clientName">Client Name</Label>
                    <Input name="clientName" placeholder="e.g., ADNOC, Shell" required />
                  </div>
                  <div>
                    <Label htmlFor="clientContactPerson">Contact Person</Label>
                    <Input name="clientContactPerson" placeholder="Contact person name" />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="clientEmail">Client Email</Label>
                  <Input name="clientEmail" type="email" placeholder="client@company.com" />
                </div>
                
                <div>
                  <Label htmlFor="subject">Subject</Label>
                  <Input name="subject" placeholder="e.g., Design Documents Submission for Approval" required />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="transmissionType">Transmission Type</Label>
                    <Select name="transmissionType" required>
                      <SelectTrigger>
                        <SelectValue placeholder="Select type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Email">Email</SelectItem>
                        <SelectItem value="Digital">Digital Portal</SelectItem>
                        <SelectItem value="Hardcopy">Hardcopy</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="totalDrawings">Total Drawings</Label>
                    <Input name="totalDrawings" type="number" min="1" placeholder="Number of drawings" required />
                  </div>
                </div>
                
                <div>
                  <Label htmlFor="remarks">Remarks (Optional)</Label>
                  <Textarea name="remarks" placeholder="Additional notes or comments..." rows={3} />
                </div>
                
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={createTransmittalMutation.isPending}>
                    {createTransmittalMutation.isPending ? 'Creating...' : 'Create Transmittal'}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Status Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Transmittals</p>
                  <p className="text-2xl font-bold">{statusCounts.all}</p>
                </div>
                <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-4 h-4 text-gray-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending</p>
                  <p className="text-2xl font-bold text-yellow-600">{statusCounts.pending}</p>
                </div>
                <div className="w-8 h-8 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <Clock className="w-4 h-4 text-yellow-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Submitted</p>
                  <p className="text-2xl font-bold text-blue-600">{statusCounts.submitted}</p>
                </div>
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Send className="w-4 h-4 text-blue-600" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          <Card className="hover:shadow-md transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Acknowledged</p>
                  <p className="text-2xl font-bold text-green-600">{statusCounts.acknowledged}</p>
                </div>
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <CheckCircle className="w-4 h-4 text-green-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="all">All Transmittals</TabsTrigger>
            <TabsTrigger value="pending">Pending ({statusCounts.pending})</TabsTrigger>
            <TabsTrigger value="submitted">Submitted ({statusCounts.submitted})</TabsTrigger>
            <TabsTrigger value="acknowledged">Acknowledged ({statusCounts.acknowledged})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-4">
            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-gray-400" />
                    <Input
                      placeholder="Search transmittals..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger>
                      <SelectValue placeholder="All Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Status</SelectItem>
                      <SelectItem value="Draft">Draft</SelectItem>
                      <SelectItem value="Pending">Pending</SelectItem>
                      <SelectItem value="Submitted">Submitted</SelectItem>
                      <SelectItem value="Acknowledged">Acknowledged</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => { setSearchTerm(''); setStatusFilter(''); }}>
                    Clear Filters
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Transmittals Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Send className="w-5 h-5" />
                  Drawing Transmittals ({transmittals.length} transmittals)
                </CardTitle>
              </CardHeader>
              <CardContent>
                {transmittalsLoading ? (
                  <div className="text-center py-8">Loading transmittals...</div>
                ) : transmittals.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    No transmittals found. Create your first transmittal to get started.
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Transmittal #</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Drawings</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {transmittals.map((transmittal: DrawingTransmittal) => (
                        <TableRow key={transmittal.id}>
                          <TableCell className="font-medium">
                            {transmittal.transmittalNumber}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="font-medium">{transmittal.project?.projectName}</div>
                              <div className="text-gray-500">{transmittal.project?.designProjectName}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">
                              <div className="font-medium">{transmittal.clientName}</div>
                              {transmittal.clientContactPerson && (
                                <div className="text-gray-500">{transmittal.clientContactPerson}</div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="max-w-xs">
                            <div className="truncate" title={transmittal.subject}>
                              {transmittal.subject}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getTransmissionTypeIcon(transmittal.transmissionType)}
                              <span className="text-sm">{transmittal.transmissionType}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {transmittal.totalDrawings} dwgs
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {getStatusIcon(transmittal.status)}
                              <Badge className={getStatusBadgeColor(transmittal.status)}>
                                {transmittal.status}
                              </Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-gray-500">
                            {format(new Date(transmittal.createdAt), 'MMM dd, yyyy')}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <Button size="sm" variant="outline">
                                <Eye className="w-3 h-3" />
                              </Button>
                              <Button size="sm" variant="outline">
                                <Download className="w-3 h-3" />
                              </Button>
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

          {/* Status-specific tabs with filtered content */}
          {['pending', 'submitted', 'acknowledged'].map(status => (
            <TabsContent key={status} value={status} className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 capitalize">
                    {getStatusIcon(status)}
                    {status} Transmittals
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {transmittals
                      .filter((t: DrawingTransmittal) => t.status.toLowerCase() === status)
                      .map((transmittal: DrawingTransmittal) => (
                        <Card key={transmittal.id} className="hover:shadow-lg transition-shadow">
                          <CardHeader className="pb-3">
                            <CardTitle className="text-base flex items-center justify-between">
                              <span>{transmittal.transmittalNumber}</span>
                              <Badge className={getStatusBadgeColor(transmittal.status)}>
                                {transmittal.status}
                              </Badge>
                            </CardTitle>
                            <CardDescription className="text-sm">
                              {transmittal.project?.projectName}
                            </CardDescription>
                          </CardHeader>
                          <CardContent className="space-y-3">
                            <div className="space-y-2">
                              <div className="flex items-center gap-2 text-sm">
                                <Building className="w-4 h-4 text-gray-400" />
                                <span>{transmittal.clientName}</span>
                              </div>
                              <div className="flex items-center gap-2 text-sm">
                                {getTransmissionTypeIcon(transmittal.transmissionType)}
                                <span>{transmittal.transmissionType}</span>
                                <Badge variant="outline" className="ml-auto">
                                  {transmittal.totalDrawings} dwgs
                                </Badge>
                              </div>
                            </div>
                            <div className="text-sm text-gray-600 line-clamp-2">
                              {transmittal.subject}
                            </div>
                            <div className="flex items-center justify-between text-sm text-gray-500">
                              <span>{format(new Date(transmittal.createdAt), 'MMM dd, yyyy')}</span>
                              {transmittal.acknowledgmentReceived && (
                                <div className="flex items-center gap-1">
                                  <CheckCircle className="w-3 h-3 text-green-500" />
                                  <span className="text-green-600">ACK</span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2 pt-2">
                              <Button size="sm" variant="outline" className="flex-1">
                                <Eye className="w-3 h-3 mr-1" />
                                View
                              </Button>
                              <Button size="sm" variant="outline" className="flex-1">
                                <Download className="w-3 h-3 mr-1" />
                                Download
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                  </div>
                  {transmittals.filter((t: DrawingTransmittal) => t.status.toLowerCase() === status).length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                      No {status} transmittals found.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </div>
  );
}