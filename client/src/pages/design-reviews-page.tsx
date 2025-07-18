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
import { Plus, Search, CheckSquare, Eye, MessageSquare, Users } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

export default function DesignReviewsPage() {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch all design reviews
  const { data: reviews = [], isLoading } = useQuery({
    queryKey: ['/api/design/reviews'],
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

  // Fetch users for reviewer assignment
  const { data: users = [] } = useQuery({
    queryKey: ['/api/users'],
    staleTime: 5 * 60 * 1000,
  });

  // Create review mutation
  const createReviewMutation = useMutation({
    mutationFn: (data: any) => apiRequest('/api/design/reviews', {
      method: 'POST',
      body: data,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/design/reviews'] });
      setIsCreateDialogOpen(false);
      toast({
        title: "Success",
        description: "Design review created successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create design review",
        variant: "destructive",
      });
    },
  });

  // Filter reviews based on search term and status
  const filteredReviews = reviews.filter((review: any) => {
    const matchesSearch = review.review_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         review.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         review.drawing_number?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || review.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleCreateReview = (e: React.FormEvent) => {
    e.preventDefault();
    const formData = new FormData(e.target as HTMLFormElement);
    
    const data = {
      project_id: parseInt(formData.get('project_id') as string),
      drawing_id: formData.get('drawing_id') ? parseInt(formData.get('drawing_id') as string) : null,
      review_title: formData.get('review_title'),
      description: formData.get('description'),
      review_type: formData.get('review_type'),
      due_date: formData.get('due_date'),
      assigned_reviewers: formData.getAll('assigned_reviewers').map(id => parseInt(id as string)),
      status: 'pending',
    };

    createReviewMutation.mutate(data);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'in_progress': return 'bg-blue-100 text-blue-800';
      case 'completed': return 'bg-green-100 text-green-800';
      case 'rejected': return 'bg-red-100 text-red-800';
      case 'on_hold': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getReviewTypeColor = (type: string) => {
    switch (type) {
      case 'design_review': return 'bg-blue-100 text-blue-800';
      case 'peer_review': return 'bg-green-100 text-green-800';
      case 'client_review': return 'bg-purple-100 text-purple-800';
      case 'regulatory_review': return 'bg-orange-100 text-orange-800';
      case 'final_review': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Loading design reviews...</p>
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
          <h1 className="text-3xl font-bold text-gray-900">Design Reviews</h1>
          <p className="text-gray-600">Manage design review processes and approvals</p>
        </div>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Review
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Create New Design Review</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleCreateReview} className="space-y-4">
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
                  <Label htmlFor="drawing_id">Drawing (Optional)</Label>
                  <Select name="drawing_id">
                    <SelectTrigger>
                      <SelectValue placeholder="Select drawing" />
                    </SelectTrigger>
                    <SelectContent>
                      {drawings.map((drawing: any) => (
                        <SelectItem key={drawing.id} value={drawing.id.toString()}>
                          {drawing.drawing_number} - {drawing.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label htmlFor="review_title">Review Title</Label>
                <Input
                  id="review_title"
                  name="review_title"
                  placeholder="Enter review title"
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  placeholder="Enter review description and objectives"
                  rows={3}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="review_type">Review Type</Label>
                  <Select name="review_type" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="design_review">Design Review</SelectItem>
                      <SelectItem value="peer_review">Peer Review</SelectItem>
                      <SelectItem value="client_review">Client Review</SelectItem>
                      <SelectItem value="regulatory_review">Regulatory Review</SelectItem>
                      <SelectItem value="final_review">Final Review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="due_date">Due Date</Label>
                  <Input
                    id="due_date"
                    name="due_date"
                    type="date"
                    required
                  />
                </div>
              </div>

              <div>
                <Label htmlFor="assigned_reviewers">Assigned Reviewers</Label>
                <Select name="assigned_reviewers" required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select reviewers" />
                  </SelectTrigger>
                  <SelectContent>
                    {users.map((user: any) => (
                      <SelectItem key={user.id} value={user.id.toString()}>
                        {user.firstName && user.lastName 
                          ? `${user.firstName} ${user.lastName}` 
                          : user.username}
                        {user.role && ` (${user.role})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsCreateDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={createReviewMutation.isPending}>
                  {createReviewMutation.isPending ? 'Creating...' : 'Create Review'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Pending Reviews</p>
                <p className="text-2xl font-bold text-yellow-600">
                  {reviews.filter((r: any) => r.status === 'pending').length}
                </p>
              </div>
              <CheckSquare className="h-8 w-8 text-yellow-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">In Progress</p>
                <p className="text-2xl font-bold text-blue-600">
                  {reviews.filter((r: any) => r.status === 'in_progress').length}
                </p>
              </div>
              <Users className="h-8 w-8 text-blue-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Completed</p>
                <p className="text-2xl font-bold text-green-600">
                  {reviews.filter((r: any) => r.status === 'completed').length}
                </p>
              </div>
              <CheckSquare className="h-8 w-8 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Reviews</p>
                <p className="text-2xl font-bold text-gray-900">
                  {reviews.length}
                </p>
              </div>
              <MessageSquare className="h-8 w-8 text-gray-600" />
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
                  placeholder="Search reviews by title, description, or drawing..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            <div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="on_hold">On Hold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Reviews List */}
      <div className="grid gap-4">
        {filteredReviews.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <CheckSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No design reviews found</h3>
              <p className="text-gray-600 mb-4">
                {searchTerm || statusFilter !== 'all' 
                  ? 'No reviews match your current filters'
                  : 'Get started by creating your first design review'
                }
              </p>
              {!searchTerm && statusFilter === 'all' && (
                <Button onClick={() => setIsCreateDialogOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Review
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          filteredReviews.map((review: any) => (
            <Card key={review.id} className="hover:shadow-md transition-shadow">
              <CardContent className="py-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-gray-900">
                        {review.review_title}
                      </h3>
                      <Badge className={getStatusColor(review.status)}>
                        {review.status?.replace('_', ' ').toUpperCase()}
                      </Badge>
                      <Badge className={getReviewTypeColor(review.review_type)}>
                        {review.review_type?.replace('_', ' ').toUpperCase()}
                      </Badge>
                    </div>
                    
                    {review.description && (
                      <p className="text-gray-600 text-sm mb-3">{review.description}</p>
                    )}
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      {review.project_name && (
                        <div>
                          <span className="text-gray-500">Project:</span>
                          <p className="font-medium">{review.project_name}</p>
                        </div>
                      )}
                      {review.drawing_number && (
                        <div>
                          <span className="text-gray-500">Drawing:</span>
                          <p className="font-medium">{review.drawing_number}</p>
                        </div>
                      )}
                      {review.due_date && (
                        <div>
                          <span className="text-gray-500">Due Date:</span>
                          <p className="font-medium">
                            {new Date(review.due_date).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                      {review.reviewer_count && (
                        <div>
                          <span className="text-gray-500">Reviewers:</span>
                          <p className="font-medium">{review.reviewer_count} assigned</p>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="sm">
                      <MessageSquare className="h-4 w-4" />
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