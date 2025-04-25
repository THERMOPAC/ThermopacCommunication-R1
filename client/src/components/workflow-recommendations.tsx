import { useState } from 'react';
import { useAuth } from '@/hooks/use-auth';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import type { WorkflowRecommendation } from '@shared/schema';
import { 
  Card, 
  CardContent, 
  CardDescription, 
  CardFooter, 
  CardHeader, 
  CardTitle 
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Accordion, 
  AccordionContent, 
  AccordionItem, 
  AccordionTrigger
} from '@/components/ui/accordion';
import { 
  Clock, 
  Check, 
  X, 
  AlertTriangle, 
  FileText,
  Zap,
  BarChart2, 
  Activity,
  Users,
  Calendar,
  Lightbulb
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';

// Map recommendation types to icons
const RECOMMENDATION_TYPE_ICONS = {
  'task_assignment': <Users className="h-5 w-5 text-blue-500" />,
  'priority_adjustment': <AlertTriangle className="h-5 w-5 text-orange-500" />,
  'follow_up': <Clock className="h-5 w-5 text-purple-500" />,
  'team_collaboration': <Users className="h-5 w-5 text-green-500" />,
  'deadline_reminder': <Calendar className="h-5 w-5 text-red-500" />
};

export default function WorkflowRecommendations() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<string>('pending');

  // Fetch recommendations
  const { data: recommendations, isLoading } = useQuery<WorkflowRecommendation[]>({
    queryKey: ['/api/recommendations'],
    enabled: !!user,
  });
  
  // For active dashboard view, fetch only pending recommendations
  const { data: activeRecommendations } = useQuery<WorkflowRecommendation[]>({
    queryKey: ['/api/recommendations/active'],
    enabled: !!user,
  });

  // Mutation to update a recommendation
  const updateRecommendationMutation = useMutation({
    mutationFn: async ({ id, updateData }: { id: number; updateData: Partial<WorkflowRecommendation> }) => {
      const response = await apiRequest('PATCH', `/api/recommendations/${id}`, updateData);
      // apiRequest already returns the parsed JSON response, so no need to call .json()
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/recommendations'] });
      queryClient.invalidateQueries({ queryKey: ['/api/recommendations/active'] });
    },
    onError: (error) => {
      toast({
        title: "Error updating recommendation",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Handle accept/reject actions
  const handleAccept = (recommendation: WorkflowRecommendation) => {
    updateRecommendationMutation.mutate({
      id: recommendation.id,
      updateData: { status: 'accepted' }
    });
    
    toast({
      title: "Recommendation Accepted",
      description: "The recommendation has been accepted.",
      variant: "default"
    });

    // Perform any specific actions based on recommendation type
    switch (recommendation.recommendationType) {
      case 'task_assignment':
        // Open task assignment form or redirect to tasks page
        toast({
          title: "Task Assignment",
          description: "Consider forwarding tasks as recommended.",
          variant: "default"
        });
        break;
      case 'priority_adjustment':
        // Update task priority if we have taskId
        if (recommendation.recommendationData && typeof recommendation.recommendationData === 'object' && 'taskId' in recommendation.recommendationData) {
          const taskId = recommendation.recommendationData.taskId as number;
          
          // Update task priority to High
          apiRequest('PATCH', `/api/tasks/${taskId}`, { 
            priority: 'High' 
          }).then(() => {
            toast({
              title: "Task Priority Updated",
              description: "Task priority has been updated to High.",
              variant: "default"
            });
            
            // Invalidate tasks query to refresh the task list
            queryClient.invalidateQueries({ queryKey: ['/api/tasks'] });
          }).catch(error => {
            toast({
              title: "Error updating task priority",
              description: error.message,
              variant: "destructive"
            });
          });
        }
        break;
      default:
        break;
    }
  };

  const handleReject = (id: number) => {
    updateRecommendationMutation.mutate({
      id,
      updateData: { status: 'rejected' }
    });
    
    toast({
      title: "Recommendation Rejected",
      description: "The recommendation has been rejected.",
      variant: "default"
    });
  };

  // Filter recommendations based on active tab
  const filteredRecommendations = recommendations?.filter(rec => {
    if (activeTab === 'all') return true;
    return rec.status === activeTab;
  });

  // For dashboard view, only show a limited number of active recommendations
  const dashboardRecommendations = activeRecommendations?.slice(0, 3);

  // Helper to format dates
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      year: 'numeric', 
      month: 'short', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  // Render the recommendation card based on type
  const renderRecommendationCard = (recommendation: WorkflowRecommendation) => {
    const icon = RECOMMENDATION_TYPE_ICONS[recommendation.recommendationType as keyof typeof RECOMMENDATION_TYPE_ICONS] || 
                <Lightbulb className="h-5 w-5 text-yellow-500" />;
    
    return (
      <Card key={recommendation.id} className={`mb-4 ${recommendation.isRead ? '' : 'border-l-4 border-l-blue-500'}`}>
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-2">
              {icon}
              <CardTitle className="text-lg">{recommendation.title}</CardTitle>
            </div>
            <Badge variant={
              recommendation.status === 'pending' ? 'outline' : 
              recommendation.status === 'accepted' ? 'default' : 
              'destructive'
            }>
              {recommendation.status.charAt(0).toUpperCase() + recommendation.status.slice(1)}
            </Badge>
          </div>
          <CardDescription>
            {formatDate(recommendation.createdAt)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm mb-4">{recommendation.description}</p>
          
          {/* Detailed information accordion */}
          <Accordion type="single" collapsible className="w-full">
            <AccordionItem value="details">
              <AccordionTrigger className="text-sm">View Details</AccordionTrigger>
              <AccordionContent>
                <div className="bg-muted p-4 rounded-md text-sm">
                  {recommendation.recommendationType === 'task_assignment' && recommendation.recommendationData && (
                    <div className="space-y-2">
                      <p><strong>Your current tasks:</strong> {typeof recommendation.recommendationData === 'object' && recommendation.recommendationData && 'taskCount' in recommendation.recommendationData ? String((recommendation.recommendationData as any).taskCount) : 'N/A'}</p>
                      <p><strong>Recommended assignee:</strong> {typeof recommendation.recommendationData === 'object' && recommendation.recommendationData && 'recommendedAssigneeName' in recommendation.recommendationData ? String((recommendation.recommendationData as any).recommendedAssigneeName) : 'N/A'}</p>
                      <p><strong>Their current tasks:</strong> {typeof recommendation.recommendationData === 'object' && recommendation.recommendationData && 'recommendedAssigneeTaskCount' in recommendation.recommendationData ? String((recommendation.recommendationData as any).recommendedAssigneeTaskCount) : 'N/A'}</p>
                    </div>
                  )}
                  
                  {recommendation.recommendationType === 'priority_adjustment' && recommendation.recommendationData && (
                    <div className="space-y-2">
                      <p><strong>Task:</strong> {typeof recommendation.recommendationData === 'object' && recommendation.recommendationData && 'taskTitle' in recommendation.recommendationData ? String((recommendation.recommendationData as any).taskTitle) : 'N/A'}</p>
                      <p><strong>Current priority:</strong> {typeof recommendation.recommendationData === 'object' && recommendation.recommendationData && 'currentPriority' in recommendation.recommendationData ? String((recommendation.recommendationData as any).currentPriority) : 'N/A'}</p>
                      <p><strong>Due date:</strong> {typeof recommendation.recommendationData === 'object' && recommendation.recommendationData && 'dueDate' in recommendation.recommendationData ? String((recommendation.recommendationData as any).dueDate) : 'N/A'}</p>
                      <p><strong>Days until due:</strong> {typeof recommendation.recommendationData === 'object' && recommendation.recommendationData && 'daysUntilDue' in recommendation.recommendationData ? String((recommendation.recommendationData as any).daysUntilDue) : 'N/A'}</p>
                    </div>
                  )}
                  
                  {recommendation.recommendationType === 'follow_up' && recommendation.recommendationData && (
                    <div className="space-y-2">
                      <p><strong>Task:</strong> {typeof recommendation.recommendationData === 'object' && recommendation.recommendationData && 'taskTitle' in recommendation.recommendationData ? String((recommendation.recommendationData as any).taskTitle) : 'N/A'}</p>
                      <p><strong>Assigned to:</strong> {typeof recommendation.recommendationData === 'object' && recommendation.recommendationData && 'assigneeName' in recommendation.recommendationData ? String((recommendation.recommendationData as any).assigneeName) : 'N/A'}</p>
                      <p><strong>Due date:</strong> {typeof recommendation.recommendationData === 'object' && recommendation.recommendationData && 'dueDate' in recommendation.recommendationData ? String((recommendation.recommendationData as any).dueDate) : 'N/A'}</p>
                      <p><strong>Days overdue:</strong> {typeof recommendation.recommendationData === 'object' && recommendation.recommendationData && 'daysOverdue' in recommendation.recommendationData ? String((recommendation.recommendationData as any).daysOverdue) : 'N/A'}</p>
                    </div>
                  )}

                  {recommendation.recommendationType === 'team_collaboration' && recommendation.recommendationData && (
                    <div className="space-y-2">
                      <p><strong>Team members:</strong> {typeof recommendation.recommendationData === 'object' && recommendation.recommendationData && 'teamMembers' in recommendation.recommendationData ? String((recommendation.recommendationData as any).teamMembers) : 'N/A'}</p>
                      <p><strong>Tasks with similar categories:</strong> {typeof recommendation.recommendationData === 'object' && recommendation.recommendationData && 'similarTaskCount' in recommendation.recommendationData ? String((recommendation.recommendationData as any).similarTaskCount) : 'N/A'}</p>
                    </div>
                  )}
                  
                  {recommendation.recommendationType === 'deadline_reminder' && recommendation.recommendationData && (
                    <div className="space-y-2">
                      <p><strong>Upcoming deadlines:</strong> {typeof recommendation.recommendationData === 'object' && recommendation.recommendationData && 'upcomingDeadlinesCount' in recommendation.recommendationData ? String((recommendation.recommendationData as any).upcomingDeadlinesCount) : 'N/A'}</p>
                      <p><strong>Next deadline:</strong> {typeof recommendation.recommendationData === 'object' && recommendation.recommendationData && 'nextDeadline' in recommendation.recommendationData ? String((recommendation.recommendationData as any).nextDeadline) : 'N/A'}</p>
                    </div>
                  )}
                </div>
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </CardContent>
        
        {recommendation.status === 'pending' && (
          <CardFooter className="flex justify-end space-x-2 pt-0">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => handleReject(recommendation.id)}
              disabled={updateRecommendationMutation.isPending}
            >
              <X className="mr-2 h-4 w-4" /> Dismiss
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              onClick={() => handleAccept(recommendation)}
              disabled={updateRecommendationMutation.isPending}
            >
              <Check className="mr-2 h-4 w-4" /> Accept
            </Button>
          </CardFooter>
        )}
      </Card>
    );
  };

  // Skeleton loader for recommendations
  const renderSkeletons = (count: number = 3) => {
    return Array(count).fill(0).map((_, i) => (
      <Card key={`skeleton-${i}`} className="mb-4">
        <CardHeader className="pb-2">
          <div className="flex justify-between items-start">
            <Skeleton className="h-6 w-[250px]" />
            <Skeleton className="h-5 w-[80px]" />
          </div>
          <Skeleton className="h-4 w-[150px] mt-2" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-full mb-2" />
          <Skeleton className="h-4 w-3/4 mb-4" />
        </CardContent>
        <CardFooter className="flex justify-end space-x-2 pt-0">
          <Skeleton className="h-9 w-[80px]" />
          <Skeleton className="h-9 w-[80px]" />
        </CardFooter>
      </Card>
    ));
  };

  // Dashboard view (compact version for main dashboard)
  if (dashboardRecommendations && !window.location.pathname.includes('/recommendations')) {
    if (isLoading) {
      return (
        <div className="space-y-4">
          {renderSkeletons(2)}
        </div>
      );
    }

    if (!dashboardRecommendations.length) {
      return (
        <div className="flex flex-col items-center justify-center py-6 text-center">
          <Lightbulb className="h-12 w-12 text-muted-foreground mb-3" />
          <h3 className="text-lg font-medium">No Active Recommendations</h3>
          <p className="text-muted-foreground mt-1">
            Your workflow is optimized! Check back later for new insights.
          </p>
        </div>
      );
    }

    return (
      <div>
        {dashboardRecommendations.map(renderRecommendationCard)}
        
        {activeRecommendations && activeRecommendations.length > 3 && (
          <div className="text-center mt-4">
            <Button variant="link" className="text-blue-600">
              View all {activeRecommendations.length} recommendations
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Full recommendations page view
  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold flex items-center">
            <Lightbulb className="mr-2 h-6 w-6 text-yellow-500" />
            Workflow Recommendations
          </h1>
          <p className="text-muted-foreground mt-1">
            Personalized insights to optimize your workflow and improve productivity
          </p>
        </div>
        
        <Button onClick={() => {
          // Generate new recommendations
          apiRequest('POST', '/api/recommendations/generate', {})
            .then(() => {
              queryClient.invalidateQueries({ queryKey: ['/api/recommendations'] });
              queryClient.invalidateQueries({ queryKey: ['/api/recommendations/active'] });
              
              toast({
                title: "Recommendations Generated",
                description: "New workflow recommendations have been generated based on your current tasks and team activity.",
                variant: "default"
              });
            })
            .catch(error => {
              toast({
                title: "Error Generating Recommendations",
                description: error.message,
                variant: "destructive"
              });
            });
        }}>
          <Zap className="mr-2 h-4 w-4" />
          Generate New Insights
        </Button>
      </div>

      <Tabs defaultValue="pending" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="pending" className="flex items-center">
            <Clock className="mr-2 h-4 w-4" />
            Pending
          </TabsTrigger>
          <TabsTrigger value="accepted" className="flex items-center">
            <Check className="mr-2 h-4 w-4" />
            Accepted
          </TabsTrigger>
          <TabsTrigger value="rejected" className="flex items-center">
            <X className="mr-2 h-4 w-4" />
            Rejected
          </TabsTrigger>
          <TabsTrigger value="all" className="flex items-center">
            <FileText className="mr-2 h-4 w-4" />
            All
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          {isLoading ? (
            renderSkeletons(4)
          ) : !filteredRecommendations?.length ? (
            <div className="bg-muted rounded-lg p-8 text-center">
              <Lightbulb className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <h3 className="text-xl font-medium">No {activeTab === 'all' ? '' : activeTab} recommendations</h3>
              <p className="text-muted-foreground mt-2 max-w-md mx-auto">
                {activeTab === 'pending' 
                  ? "You don't have any pending workflow recommendations. Generate new insights to get started."
                  : activeTab === 'accepted'
                  ? "You haven't accepted any recommendations yet. Review your pending recommendations to improve your workflow."
                  : activeTab === 'rejected'
                  ? "You haven't rejected any recommendations. Your workflow may be already optimized!"
                  : "There are no recommendations available. Generate new insights to get started."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredRecommendations?.map(renderRecommendationCard)}
            </div>
          )}
        </TabsContent>
      </Tabs>
      
      {/* Analytics and Insights Section */}
      {recommendations && recommendations.length > 0 && (
        <div className="mt-12">
          <h2 className="text-2xl font-bold mb-6 flex items-center">
            <BarChart2 className="mr-2 h-5 w-5 text-blue-500" />
            Productivity Insights
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Activity className="mr-2 h-5 w-5 text-green-500" />
                  Recommendation Stats
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Total Recommendations:</span>
                    <span className="font-medium">{recommendations.length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Pending:</span>
                    <span className="font-medium">{recommendations.filter(r => r.status === 'pending').length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Accepted:</span>
                    <span className="font-medium">{recommendations.filter(r => r.status === 'accepted').length}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Rejected:</span>
                    <span className="font-medium">{recommendations.filter(r => r.status === 'rejected').length}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <AlertTriangle className="mr-2 h-5 w-5 text-orange-500" />
                  Priority Focus
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Priority Adjustments:</span>
                    <span className="font-medium">
                      {recommendations.filter(r => r.recommendationType === 'priority_adjustment').length}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Task Assignments:</span>
                    <span className="font-medium">
                      {recommendations.filter(r => r.recommendationType === 'task_assignment').length}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Follow-ups:</span>
                    <span className="font-medium">
                      {recommendations.filter(r => r.recommendationType === 'follow_up').length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Users className="mr-2 h-5 w-5 text-purple-500" />
                  Team Insights
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Team Collaborations:</span>
                    <span className="font-medium">
                      {recommendations.filter(r => r.recommendationType === 'team_collaboration').length}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Deadline Reminders:</span>
                    <span className="font-medium">
                      {recommendations.filter(r => r.recommendationType === 'deadline_reminder').length}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}