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
import { useToast } from "@/hooks/use-toast";
import { 
  FileText, 
  Clock, 
  User, 
  Filter, 
  Plus, 
  Eye, 
  MessageSquare, 
  CheckCircle, 
  AlertCircle, 
  XCircle,
  Search,
  Calendar,
  FileImage,
  Users,
  TrendingUp
} from 'lucide-react';
import { format } from 'date-fns';

// Types based on existing schema
interface DesignReview {
  id: number;
  drawingId: number;
  versionId: number;
  reviewType: string;
  reviewStage: string;
  reviewTitle: string;
  reviewerId: number;
  reviewerRole: string;
  status: string;
  priority: string;
  reviewComments?: string;
  markupFileUrl?: string;
  requestedDate: string;
  dueDate?: string;
  startedDate?: string;
  completedDate?: string;
  recommendation?: string;
  createdBy: number;
  createdAt: string;
  updatedAt: string;
  
  // Joined data
  drawing?: {
    drawingNumber: string;
    drawingTitle: string;
    category: string;
    disciplineCode: string;
    status: string;
  };
  reviewer?: {
    id: number;
    username: string;
    firstName?: string;
    lastName?: string;
    role: string;
  };
  creator?: {
    id: number;
    username: string;
    firstName?: string;
    lastName?: string;
  };
}

interface ReviewFilters {
  status: string;
  priority: string;
  discipline: string;
  reviewer: string;
  project: string;
  searchTerm: string;
}

const ReviewsDashboard: React.FC = () => {
  const [activeTab, setActiveTab] = useState("active");
  const [filters, setFilters] = useState<ReviewFilters>({
    status: '',
    priority: '',
    discipline: '',
    reviewer: '',
    project: '',
    searchTerm: ''
  });
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch active reviews with filters
  const { data: reviews = [], isLoading: reviewsLoading } = useQuery<DesignReview[]>({
    queryKey: ['/api/design/reviews', filters],
    queryFn: async () => {
      const params = new URLSearchParams();
      Object.entries(filters).forEach(([key, value]) => {
        if (value) params.append(key, value);
      });
      const response = await fetch(`/api/design/reviews?${params}`);
      if (!response.ok) throw new Error('Failed to fetch reviews');
      return response.json();
    },
  });

  // Fetch available projects for filters
  const { data: projects = [] } = useQuery({
    queryKey: ['/api/design/projects'],
  });

  // Fetch available users for reviewer filter
  const { data: users = [] } = useQuery({
    queryKey: ['/api/users'],
  });

  // Get priority badge styling
  const getPriorityBadge = (priority: string) => {
    switch (priority?.toLowerCase()) {
      case 'high':
        return <Badge variant="destructive">{priority}</Badge>;
      case 'medium':
        return <Badge variant="default">{priority}</Badge>;
      case 'low':
        return <Badge variant="secondary">{priority}</Badge>;
      default:
        return <Badge variant="outline">{priority || 'Medium'}</Badge>;
    }
  };

  // Get status badge styling
  const getStatusBadge = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'pending':
        return <Badge variant="outline"><Clock className="w-3 h-3 mr-1" />{status}</Badge>;
      case 'in progress':
        return <Badge variant="default"><AlertCircle className="w-3 h-3 mr-1" />{status}</Badge>;
      case 'under review':
        return <Badge variant="secondary"><Eye className="w-3 h-3 mr-1" />{status}</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-green-500"><CheckCircle className="w-3 h-3 mr-1" />{status}</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><XCircle className="w-3 h-3 mr-1" />{status}</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Filter reset function
  const resetFilters = () => {
    setFilters({
      status: '',
      priority: '',
      discipline: '',
      reviewer: '',
      project: '',
      searchTerm: ''
    });
  };

  // Active Reviews Tab Content
  const ActiveReviewsTab = () => (
    <div className="space-y-6">
      {/* Filter Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="w-5 h-5" />
            Filter Reviews
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">Search</Label>
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder="Search reviews..."
                  value={filters.searchTerm}
                  onChange={(e) => setFilters(prev => ({ ...prev, searchTerm: e.target.value }))}
                  className="pl-10"
                />
              </div>
            </div>
            
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Status</SelectItem>
                  <SelectItem value="Pending">Pending</SelectItem>
                  <SelectItem value="In Progress">In Progress</SelectItem>
                  <SelectItem value="Under Review">Under Review</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Rejected">Rejected</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={filters.priority} onValueChange={(value) => setFilters(prev => ({ ...prev, priority: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All Priorities" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Priorities</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Medium">Medium</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Discipline</Label>
              <Select value={filters.discipline} onValueChange={(value) => setFilters(prev => ({ ...prev, discipline: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All Disciplines" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Disciplines</SelectItem>
                  <SelectItem value="P&ID">P&ID</SelectItem>
                  <SelectItem value="Equipment_Layout">Equipment Layout</SelectItem>
                  <SelectItem value="Piping">Piping</SelectItem>
                  <SelectItem value="Electrical">Electrical</SelectItem>
                  <SelectItem value="Civil">Civil</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Reviewer</Label>
              <Select value={filters.reviewer} onValueChange={(value) => setFilters(prev => ({ ...prev, reviewer: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All Reviewers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Reviewers</SelectItem>
                  {users.map((user: any) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Project</Label>
              <Select value={filters.project} onValueChange={(value) => setFilters(prev => ({ ...prev, project: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="All Projects" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Projects</SelectItem>
                  {projects.map((project: any) => (
                    <SelectItem key={project.id} value={project.id.toString()}>
                      {project.designProjectName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex justify-between items-center mt-4">
            <div className="text-sm text-muted-foreground">
              {reviews.length} review{reviews.length !== 1 ? 's' : ''} found
            </div>
            <Button variant="outline" onClick={resetFilters} size="sm">
              Clear Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Reviews Grid */}
      {reviewsLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-4 bg-muted rounded w-3/4"></div>
                <div className="h-3 bg-muted rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-muted rounded"></div>
                  <div className="h-3 bg-muted rounded w-2/3"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Reviews Found</h3>
            <p className="text-muted-foreground mb-4">
              {Object.values(filters).some(f => f) 
                ? "No reviews match your current filters. Try adjusting your search criteria."
                : "No design reviews have been created yet. Start by creating your first review."}
            </p>
            <Button onClick={() => setIsCreateDialogOpen(true)}>
              <Plus className="w-4 h-4 mr-2" />
              Create New Review
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reviews.map((review) => (
            <ReviewCard key={review.id} review={review} />
          ))}
        </div>
      )}
    </div>
  );

  // Review Card Component
  const ReviewCard: React.FC<{ review: DesignReview }> = ({ review }) => (
    <Card className="hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <CardTitle className="text-lg line-clamp-2">
              {review.reviewTitle || `Review: ${review.drawing?.drawingNumber}`}
            </CardTitle>
            <CardDescription className="flex items-center gap-2 mt-1">
              <FileImage className="w-4 h-4" />
              {review.drawing?.drawingNumber} • {review.drawing?.category}
            </CardDescription>
          </div>
          <div className="flex flex-col gap-1 items-end">
            {getPriorityBadge(review.priority)}
            {getStatusBadge(review.status)}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <div className="font-medium text-muted-foreground">Review Type</div>
            <div>{review.reviewType}</div>
          </div>
          <div>
            <div className="font-medium text-muted-foreground">Stage</div>
            <div>{review.reviewStage || 'Not specified'}</div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <User className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">Reviewer:</span>
          <span>
            {review.reviewer?.firstName && review.reviewer?.lastName 
              ? `${review.reviewer.firstName} ${review.reviewer.lastName}`
              : review.reviewer?.username || 'Unassigned'}
          </span>
        </div>

        <div className="flex items-center gap-2 text-sm">
          <Calendar className="w-4 h-4 text-muted-foreground" />
          <span className="font-medium">Due:</span>
          <span className={review.dueDate && new Date(review.dueDate) < new Date() ? 'text-red-500 font-medium' : ''}>
            {review.dueDate ? format(new Date(review.dueDate), 'MMM dd, yyyy') : 'No due date'}
          </span>
        </div>

        <div className="flex gap-2 mt-4">
          <Button size="sm" variant="default" className="flex-1">
            <Eye className="w-4 h-4 mr-1" />
            View Details
          </Button>
          <Button size="sm" variant="outline">
            <MessageSquare className="w-4 h-4 mr-1" />
            Comments
          </Button>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Review & Approval</h1>
          <p className="text-muted-foreground mt-1">
            Design review workflow and approval process
          </p>
        </div>
        <Button onClick={() => setIsCreateDialogOpen(true)}>
          <Plus className="w-4 h-4 mr-2" />
          Start Review
        </Button>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="active" className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4" />
            Active Reviews
          </TabsTrigger>
          <TabsTrigger value="history" className="flex items-center gap-2">
            <FileText className="w-4 h-4" />
            Review History
          </TabsTrigger>
          <TabsTrigger value="assignments" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            My Assignments
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Review Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active" className="space-y-6">
          <ActiveReviewsTab />
        </TabsContent>

        <TabsContent value="history" className="space-y-6">
          <Card>
            <CardContent className="text-center py-12">
              <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Review History</h3>
              <p className="text-muted-foreground">
                Review History tab will be implemented in Phase 3
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="assignments" className="space-y-6">
          <Card>
            <CardContent className="text-center py-12">
              <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">My Assignments</h3>
              <p className="text-muted-foreground">
                My Assignments tab will be implemented in Phase 3
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="analytics" className="space-y-6">
          <Card>
            <CardContent className="text-center py-12">
              <TrendingUp className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">Review Analytics</h3>
              <p className="text-muted-foreground">
                Review Analytics tab will be implemented in Phase 4
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ReviewsDashboard;