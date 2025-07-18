import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Search, FileCheck, Send, Eye, Download } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

export default function DesignTransmittalsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all drawing transmittals
  const { data: transmittals = [], isLoading } = useQuery({
    queryKey: ['/api/design/transmittals'],
    staleTime: 5 * 60 * 1000,
  });

  // Fetch projects for dropdown
  const { data: projects = [] } = useQuery({
    queryKey: ['/api/design/projects-with-integration'],
    staleTime: 5 * 60 * 1000,
  });

  // Fetch drawings for dropdown
  const { data: drawings = [] } = useQuery({
    queryKey: ['/api/design/drawings'],
    staleTime: 5 * 60 * 1000,
  });

  // Create transmittal mutation
  const createTransmittalMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/design/transmittals', {
      method: 'POST',
      body: data,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/design/transmittals'] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Success",
        description: "Drawing transmittal created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create drawing transmittal",
        variant: "destructive",
      });
    },
  });

  // Filter transmittals based on search term and status
  const filteredTransmittals = transmittals.filter((transmittal: any) => {
    const matchesSearch = transmittal.transmittal_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         transmittal.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         transmittal.client_name?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || transmittal.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateTransmittal = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    
    const data = {
      project_id: parseInt(formData.get('project_id') as string),
      transmittal_number: formData.get('transmittal_number'),
      subject: formData.get('subject'),
      client_name: formData.get('client_name'),
      client_contact: formData.get('client_contact'),
      transmittal_type: formData.get('transmittal_type'),
      purpose: formData.get('purpose'),
      notes: formData.get('notes'),
      status: 'draft',
    };

    createTransmittalMutation.mutate(data);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'bg-gray-100 text-gray-800';
      case 'pending_approval': return 'bg-yellow-100 text-yellow-800';
      case 'approved': return 'bg-blue-100 text-blue-800';
      case 'transmitted': return 'bg-green-100 text-green-800';
      case 'acknowledged': return 'bg-purple-100 text-purple-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'for_approval': return 'bg-orange-100 text-orange-800';
      case 'for_information': return 'bg-blue-100 text-blue-800';
      case 'for_construction': return 'bg-green-100 text-green-800';
      case 'for_review': return 'bg-yellow-100 text-yellow-800';
      case 'as_built': return 'bg-purple-100 text-purple-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading transmittals...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Drawing Transmittals</h1>
          <p className="text-gray-600">Manage client document submissions and approvals</p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Transmittal
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Drawing Transmittal</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateTransmittal} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="project_id">Project</Label>
                  <Select name="project_id" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select project" />
                    </SelectTrigger>
                    <SelectContent>
                      {projects.map((project: any) => (
                        <SelectItem key={project.id} value={project.id.toString()}>
                          {project.projectCode} - {project.projectName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label htmlFor="transmittal_number">Transmittal Number</Label>
                  <Input
                    id="transmittal_number"
                    name="transmittal_number"
                    placeholder="e.g., TXL-2025-001"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="subject">Subject</Label>
                <Input
                  id="subject"
                  name="subject"
                  placeholder="Enter transmittal subject"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="client_name">Client Name</Label>
                  <Input
                    id="client_name"
                    name="client_name"
                    placeholder="Enter client/recipient name"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="client_contact">Client Contact</Label>
                  <Input
                    id="client_contact"
                    name="client_contact"
                    placeholder="Enter contact person"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="transmittal_type">Transmittal Type</Label>
                  <Select name="transmittal_type" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="for_approval">For Approval</SelectItem>
                      <SelectItem value="for_information">For Information</SelectItem>
                      <SelectItem value="for_construction">For Construction</SelectItem>
                      <SelectItem value="for_review">For Review</SelectItem>
                      <SelectItem value="as_built">As Built</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="purpose">Purpose</Label>
                  <Select name="purpose">
                    <SelectTrigger>
                      <SelectValue placeholder="Select purpose" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="initial_submission">Initial Submission</SelectItem>
                      <SelectItem value="resubmission">Resubmission</SelectItem>
                      <SelectItem value="revision">Revision</SelectItem>
                      <SelectItem value="final_submission">Final Submission</SelectItem>
                      <SelectItem value="information_only">Information Only</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="notes">Notes/Comments</Label>
                <Textarea
                  id="notes"
                  name="notes"
                  placeholder="Enter any additional notes or comments"
                  rows={3}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createTransmittalMutation.isPending}>
                  {createTransmittalMutation.isPending ? 'Creating...' : 'Create Transmittal'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Draft</p>
                <p className="text-2xl font-bold text-gray-600">
                  {transmittals.filter((t: any) => t.status === 'draft').length}
                </p>
              </div>
              <FileCheck className="h-8 w-8 text-gray-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {transmittals.filter((t: any) => t.status === 'pending_approval').length}
                </p>
              </div>
              <FileCheck className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Approved</p>
                <p className="text-2xl font-bold text-blue-600">
                  {transmittals.filter((t: any) => t.status === 'approved').length}
                </p>
              </div>
              <FileCheck className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Transmitted</p>
                <p className="text-2xl font-bold text-green-600">
                  {transmittals.filter((t: any) => t.status === 'transmitted').length}
                </p>
              </div>
              <Send className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total</p>
                <p className="text-2xl font-bold text-gray-900">
                  {transmittals.length}
                </p>
              </div>
              <FileCheck className="h-8 w-8 text-gray-600" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex gap-4 items-center">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search transmittals by number, subject, or client..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="pending_approval">Pending Approval</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                  <SelectItem value="transmitted">Transmitted</SelectItem>
                  <SelectItem value="acknowledged">Acknowledged</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transmittals List */}
      <div className="grid gap-4">
        {filteredTransmittals.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <FileCheck className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No transmittals found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || statusFilter !== 'all' 
                  ? 'No transmittals match your current filters'
                  : 'Get started by creating your first drawing transmittal'
                }
              </p>
              {!searchTerm && statusFilter === 'all' && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Transmittal
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredTransmittals.map((transmittal: any) => (
            <Card key={transmittal.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {transmittal.transmittal_number}
                      </h3>
                      <Badge className={getStatusColor(transmittal.status)}>
                        {transmittal.status?.replace('_', ' ').toUpperCase()}
                      </Badge>
                      {transmittal.transmittal_type && (
                        <Badge className={getTypeColor(transmittal.transmittal_type)}>
                          {transmittal.transmittal_type?.replace('_', ' ').toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    
                    <p className="text-gray-900 font-medium mb-2">{transmittal.subject}</p>
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-3">
                      {transmittal.project_name && (
                        <div>
                          <span className="text-gray-500">Project:</span>
                          <p className="font-medium">{transmittal.project_name}</p>
                        </div>
                      )}
                      {transmittal.client_name && (
                        <div>
                          <span className="text-gray-500">Client:</span>
                          <p className="font-medium">{transmittal.client_name}</p>
                        </div>
                      )}
                      {transmittal.client_contact && (
                        <div>
                          <span className="text-gray-500">Contact:</span>
                          <p className="font-medium">{transmittal.client_contact}</p>
                        </div>
                      )}
                      {transmittal.created_at && (
                        <div>
                          <span className="text-gray-500">Created:</span>
                          <p className="font-medium">
                            {new Date(transmittal.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                    </div>
                    
                    {transmittal.notes && (
                      <div className="text-sm text-gray-600 bg-gray-50 p-2 rounded">
                        <p>{transmittal.notes}</p>
                      </div>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm">
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}