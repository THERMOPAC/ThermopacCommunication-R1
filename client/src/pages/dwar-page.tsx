import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PlusCircle,
  Edit,
  Trash2,
  Send,
  CheckCircle,
  Clock,
  BarChart3,
  Target,
  TrendingUp,
  Calendar,
  FileText,
  Award,
  Plus
} from "lucide-react";
import { format } from "date-fns";

interface Activity {
  type: string;
  description: string;
  timeSpent: number;
  plannedHours?: number;
  priority: 'low' | 'medium' | 'high';
  status: 'completed' | 'in_progress' | 'pending' | 'blocked';
  taskId?: number;
  blockedReason?: string;
}

interface PriorityTask {
  task: string;
  priority: 'low' | 'medium' | 'high';
  estimatedTime?: number;
}

interface DailyWorkReport {
  id: number;
  reportDate: string;
  tasksCompleted: number;
  tasksInProgress: number;
  hoursWorked: number;
  productivityScore: number;
  activities: Activity[];
  challenges?: string;
  issuesEncountered?: string;
  supportRequired?: string;
  tomorrowPlans?: string;
  priorityTasks: PriorityTask[];
  qualityScore: number;
  efficiencyRating: number;
  collaborationScore: number;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  managerFeedback?: string;
  managerRating?: number;
  satisfactionRating?: number;
  challengeLevel?: number;
  blockedTasks?: number;
}

interface AvailableTask {
  id: number;
  title: string;
  description: string;
  priority: string;
  status: string;
  dueDate?: string;
  startDate: string;
  finishDate: string;
}

export default function DwarPage() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [isAddActivityOpen, setIsAddActivityOpen] = useState(false);
  const [gratitudeDialog, setGratitudeDialog] = useState<{
    open: boolean;
    message: string;
    workingHours: number;
  }>({ open: false, message: '', workingHours: 0 });

  const [editingActivity, setEditingActivity] = useState<number | null>(null);
  
  // Check if coming from checkout flow
  const isFromCheckout = new URLSearchParams(window.location.search).get('checkout') === 'true';
  const [newActivity, setNewActivity] = useState<Activity>({
    type: '',
    description: '',
    timeSpent: 0,
    plannedHours: 0,
    priority: 'medium',
    status: 'pending',
    taskId: undefined,
    blockedReason: ''
  });


  // Get today's DWAR
  const { data: todayReport, isLoading } = useQuery<DailyWorkReport>({
    queryKey: ["/api/dwar/today"],
    refetchInterval: 60000, // Refresh every minute
  });

  // Get recent reports for history
  const { data: recentReports = [] } = useQuery({
    queryKey: ["/api/dwar/my-reports"],
    queryParams: { limit: 5 }
  });

  // Get available tasks for auto-association
  const { data: availableTasks = [] } = useQuery<AvailableTask[]>({
    queryKey: ["/api/dwar/available-tasks"],
  });

  // Get today's completed tasks
  const { data: todaysCompletedTasks = [] } = useQuery<AvailableTask[]>({
    queryKey: ["/api/dwar/todays-completed-tasks"],
  });

  // Update DWAR mutation
  const updateReportMutation = useMutation({
    mutationFn: async (data: Partial<DailyWorkReport>) => {
      return await apiRequest("PUT", `/api/dwar/update/${todayReport?.id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dwar/today"] });
      toast({
        title: "Report Updated",
        description: "Your daily work report has been updated successfully",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Submit DWAR mutation
  const submitReportMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", `/api/dwar/submit/${todayReport?.id}`, {});
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dwar/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dwar/my-reports"] });
      // Also invalidate attendance queries to refresh checkout availability
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/my-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/my-summary"] });
      
      // Handle auto-checkout result
      if (response.autoCheckout) {
        if (response.autoCheckout.success) {
          // Show gratitude dialog instead of toast
          setGratitudeDialog({
            open: true,
            message: response.autoCheckout.gratitudeMessage || `Work day completed successfully. Total hours: ${response.autoCheckout.workingHours}`,
            workingHours: response.autoCheckout.workingHours || 0
          });
        } else {
          toast({
            title: "DWAR Submitted",
            description: response.autoCheckout.error || "Please complete checkout manually",
            variant: "default",
          });
        }
      } else {
        toast({
          title: "Report Submitted",
          description: isFromCheckout 
            ? "Your daily work report has been submitted. You can now complete checkout."
            : "Your daily work report has been submitted for approval",
        });
      }
      
      // If coming from checkout flow or auto-checkout succeeded, redirect to attendance
      if (isFromCheckout || (response.autoCheckout && response.autoCheckout.success)) {
        setTimeout(() => {
          setLocation('/attendance');
        }, 2000); // 2 second delay to show the toast
      }
    },
    onError: (error: any) => {
      toast({
        title: "Submission Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleAddActivity = () => {
    if (!todayReport || todayReport.status !== 'draft') return;

    const updatedActivities = [...(todayReport.activities || []), newActivity];
    const totalHours = updatedActivities.reduce((sum, a) => sum + a.timeSpent, 0);
    const completedTasks = updatedActivities.filter(a => a.status === 'completed').length;
    const inProgressTasks = updatedActivities.filter(a => a.status === 'in_progress').length;

    updateReportMutation.mutate({
      activities: updatedActivities,
      hoursWorked: totalHours,
      tasksCompleted: completedTasks,
      tasksInProgress: inProgressTasks
    });

    setNewActivity({
      type: '',
      description: '',
      timeSpent: 0,
      plannedHours: 0,
      priority: 'medium',
      status: 'pending',
      taskId: undefined,
      blockedReason: ''
    });
    setIsAddActivityOpen(false);
  };

  const handleRemoveActivity = (index: number) => {
    if (!todayReport || todayReport.status !== 'draft') return;

    const updatedActivities = todayReport.activities.filter((_, i) => i !== index);
    const totalHours = updatedActivities.reduce((sum, a) => sum + a.timeSpent, 0);
    const completedTasks = updatedActivities.filter(a => a.status === 'completed').length;
    const inProgressTasks = updatedActivities.filter(a => a.status === 'in_progress').length;

    updateReportMutation.mutate({
      activities: updatedActivities,
      hoursWorked: totalHours,
      tasksCompleted: completedTasks,
      tasksInProgress: inProgressTasks
    });
  };

  const handleRemovePriorityTask = (index: number) => {
    if (!todayReport || todayReport.status !== 'draft') return;

    const updatedTasks = todayReport.priorityTasks.filter((_, i) => i !== index);
    updateReportMutation.mutate({
      priorityTasks: updatedTasks
    });
  };

  const handleUpdateText = (field: string, value: string | number) => {
    if (!todayReport || todayReport.status !== 'draft') return;
    updateReportMutation.mutate({ [field]: value });
  };

  const canSubmit = todayReport && 
    todayReport.status === 'draft' && 
    todayReport.activities.length > 0 && 
    todayReport.hoursWorked > 0;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Daily Work Activity Report
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              {format(new Date(), "EEEE, MMMM dd, yyyy")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {todayReport && (
              <Badge variant={
                todayReport.status === 'draft' ? 'outline' :
                todayReport.status === 'submitted' ? 'secondary' :
                todayReport.status === 'approved' ? 'default' : 'destructive'
              }>
                {todayReport.status.charAt(0).toUpperCase() + todayReport.status.slice(1)}
              </Badge>
            )}
            {canSubmit && (
              <Button 
                onClick={() => submitReportMutation.mutate()}
                disabled={submitReportMutation.isPending}
              >
                <Send className="h-4 w-4 mr-2" />
                {submitReportMutation.isPending ? "Submitting..." : "Submit Report"}
              </Button>
            )}
          </div>
        </CardHeader>
        
        {todayReport && (
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{todayReport.tasksCompleted}</div>
                <div className="text-sm text-muted-foreground">Tasks Completed</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{todayReport.tasksInProgress}</div>
                <div className="text-sm text-muted-foreground">In Progress</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{todayReport.hoursWorked}h</div>
                <div className="text-sm text-muted-foreground">Hours Worked</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{Number(todayReport.productivityScore || 0).toFixed(1)}</div>
                <div className="text-sm text-muted-foreground">Productivity Score</div>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Activities Section */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Today's Activities
          </CardTitle>
          {todayReport?.status === 'draft' && (
            <Dialog open={isAddActivityOpen} onOpenChange={setIsAddActivityOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Add Activity
                </Button>
              </DialogTrigger>
              <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Activity</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Link to Existing Task (Optional)</Label>
                  <Select value={newActivity.taskId?.toString() || 'none'} onValueChange={(value) => {
                    const taskId = value === 'none' ? undefined : parseInt(value);
                    const selectedTask = availableTasks.find(t => t.id === taskId);
                    setNewActivity({
                      ...newActivity, 
                      taskId,
                      type: selectedTask ? 'Task Work' : newActivity.type,
                      description: selectedTask ? selectedTask.title : newActivity.description
                    });
                  }}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a task (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No task selected</SelectItem>
                      {availableTasks.map((task) => (
                        <SelectItem key={task.id} value={task.id.toString()}>
                          {task.title} ({task.priority})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <Label>Activity Type</Label>
                  <Input
                    value={newActivity.type}
                    onChange={(e) => setNewActivity({...newActivity, type: e.target.value})}
                    placeholder="e.g., Meeting, Development, Analysis"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={newActivity.description}
                    onChange={(e) => setNewActivity({...newActivity, description: e.target.value})}
                    placeholder="Describe what you worked on..."
                  />
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Planned Hours</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={newActivity.plannedHours || ''}
                      onChange={(e) => setNewActivity({...newActivity, plannedHours: parseFloat(e.target.value) || 0})}
                      placeholder="0.0"
                    />
                  </div>
                  <div>
                    <Label>Actual Time Spent (hours)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={newActivity.timeSpent}
                      onChange={(e) => setNewActivity({...newActivity, timeSpent: parseFloat(e.target.value) || 0})}
                    />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Priority</Label>
                    <Select value={newActivity.priority} onValueChange={(value: any) => setNewActivity({...newActivity, priority: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="low">Low</SelectItem>
                        <SelectItem value="medium">Medium</SelectItem>
                        <SelectItem value="high">High</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={newActivity.status} onValueChange={(value: any) => setNewActivity({...newActivity, status: value})}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="blocked">Blocked</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {newActivity.status === 'blocked' && (
                  <div>
                    <Label>Reason for Blocking</Label>
                    <Textarea
                      value={newActivity.blockedReason || ''}
                      onChange={(e) => setNewActivity({...newActivity, blockedReason: e.target.value})}
                      placeholder="Explain why this task is blocked..."
                    />
                  </div>
                )}
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setIsAddActivityOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddActivity}>Add Activity</Button>
                </div>
              </div>
              </DialogContent>
            </Dialog>
          )}
        </CardHeader>
        <CardContent>
          {todayReport?.activities && todayReport.activities.length > 0 ? (
            <div className="space-y-3">
              {todayReport.activities.map((activity, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{activity.type}</span>
                      <Badge variant={activity.priority === 'high' ? 'destructive' : activity.priority === 'medium' ? 'secondary' : 'outline'}>
                        {activity.priority}
                      </Badge>
                      <Badge variant={
                        activity.status === 'completed' ? 'default' : 
                        activity.status === 'in_progress' ? 'secondary' : 
                        activity.status === 'blocked' ? 'destructive' : 'outline'
                      }>
                        {activity.status.replace('_', ' ')}
                      </Badge>
                      {activity.taskId && (
                        <Badge variant="outline">Task #{activity.taskId}</Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">{activity.description}</p>
                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                      <span>Actual: {activity.timeSpent}h</span>
                      {activity.plannedHours && (
                        <span>Planned: {activity.plannedHours}h</span>
                      )}
                      {activity.plannedHours && activity.timeSpent && (
                        <span className={
                          activity.timeSpent <= activity.plannedHours ? 'text-green-600' : 'text-red-600'
                        }>
                          {activity.timeSpent <= activity.plannedHours ? 'On track' : 'Over estimate'}
                        </span>
                      )}
                    </div>
                    {activity.status === 'blocked' && activity.blockedReason && (
                      <p className="text-xs text-red-600 mt-1">Blocked: {activity.blockedReason}</p>
                    )}
                  </div>
                  {todayReport?.status === 'draft' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveActivity(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No activities added yet. Start by adding your first activity.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Today's Completed Tasks from Project Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Today's Completed Tasks
          </CardTitle>
        </CardHeader>
        <CardContent>
          {todaysCompletedTasks && todaysCompletedTasks.length > 0 ? (
            <div className="space-y-3">
              {todaysCompletedTasks.map((task, index) => (
                <div key={index} className="flex items-center justify-between p-3 border rounded-lg bg-green-50">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-medium">{task.title}</span>
                      <Badge variant={task.priority === 'high' ? 'destructive' : task.priority === 'medium' ? 'secondary' : 'outline'}>
                        {task.priority}
                      </Badge>
                      <Badge variant="default" className="bg-green-600">
                        Completed
                      </Badge>
                    </div>
                    {task.description && (
                      <p className="text-sm text-muted-foreground">{task.description}</p>
                    )}
                    <p className="text-xs text-green-600 mt-1">✓ Task completed today</p>
                  </div>
                  {todayReport?.status === 'draft' && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        // Auto-add this completed task as an activity
                        const newActivity = {
                          type: 'Task Work',
                          description: task.title,
                          timeSpent: 1, // Default 1 hour, user can edit
                          plannedHours: 1,
                          priority: task.priority?.toLowerCase() || 'medium',
                          status: 'completed' as const,
                          taskId: task.id,
                          blockedReason: ''
                        };
                        
                        const updatedActivities = [...(todayReport.activities || []), newActivity];
                        const totalHours = updatedActivities.reduce((sum, a) => sum + a.timeSpent, 0);
                        const completedTasks = updatedActivities.filter(a => a.status === 'completed').length;
                        const inProgressTasks = updatedActivities.filter(a => a.status === 'in_progress').length;

                        updateReportMutation.mutate({
                          activities: updatedActivities,
                          hoursWorked: totalHours,
                          tasksCompleted: completedTasks,
                          tasksInProgress: inProgressTasks
                        });
                      }}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Add to DWAR
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No tasks completed today yet.</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Satisfaction and Challenge Ratings */}
      <Card>
        <CardHeader>
          <CardTitle>Daily Reflection</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>How satisfied are you with today's work? (1-5)</Label>
              <Select 
                value={todayReport?.satisfactionRating?.toString() || ''} 
                onValueChange={(value) => handleUpdateText('satisfactionRating', parseInt(value))}
                disabled={todayReport?.status !== 'draft'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Rate your satisfaction" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 - Very Unsatisfied</SelectItem>
                  <SelectItem value="2">2 - Unsatisfied</SelectItem>
                  <SelectItem value="3">3 - Neutral</SelectItem>
                  <SelectItem value="4">4 - Satisfied</SelectItem>
                  <SelectItem value="5">5 - Very Satisfied</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>How challenging was today's work? (1-5)</Label>
              <Select 
                value={todayReport?.challengeLevel?.toString() || ''} 
                onValueChange={(value) => handleUpdateText('challengeLevel', parseInt(value))}
                disabled={todayReport?.status !== 'draft'}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Rate the challenge level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 - Very Easy</SelectItem>
                  <SelectItem value="2">2 - Easy</SelectItem>
                  <SelectItem value="3">3 - Moderate</SelectItem>
                  <SelectItem value="4">4 - Challenging</SelectItem>
                  <SelectItem value="5">5 - Very Challenging</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          
          {todayReport?.satisfactionRating && todayReport?.challengeLevel && (
            <div className="mt-4 p-3 bg-muted rounded-lg">
              <p className="text-sm">
                <strong>Satisfaction:</strong> {todayReport.satisfactionRating}/5 • 
                <strong> Challenge Level:</strong> {todayReport.challengeLevel}/5
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Issues and Planning Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Challenges & Support</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Challenges Faced</Label>
              <Textarea
                value={todayReport?.challenges || ''}
                onChange={(e) => handleUpdateText('challenges', e.target.value)}
                placeholder="Describe any challenges you faced today..."
              />
            </div>
            <div>
              <Label>Issues Encountered</Label>
              <Textarea
                value={todayReport?.issuesEncountered || ''}
                onChange={(e) => handleUpdateText('issuesEncountered', e.target.value)}
                placeholder="Any technical or process issues..."
              />
            </div>
            <div>
              <Label>Support Required</Label>
              <Textarea
                value={todayReport?.supportRequired || ''}
                onChange={(e) => handleUpdateText('supportRequired', e.target.value)}
                placeholder="What support do you need from your team or manager..."
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Tomorrow's Priority Tasks
            </CardTitle>
            <Button 
              size="sm"
              onClick={() => {
                // Navigate to tasks page with context for creating a task due tomorrow
                const tomorrow = new Date();
                tomorrow.setDate(tomorrow.getDate() + 1);
                const tomorrowISO = tomorrow.toISOString().split('T')[0];
                setLocation(`/tasks?action=create&dueDate=${tomorrowISO}&source=dwar`);
              }}
            >
              <PlusCircle className="h-4 w-4 mr-2" />
              Add Task
            </Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {todayReport?.priorityTasks && todayReport.priorityTasks.length > 0 ? (
              <div className="space-y-2">
                {todayReport.priorityTasks.map((task, index) => (
                  <div key={index} className="flex items-center justify-between p-2 border rounded">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={task.priority === 'high' ? 'destructive' : task.priority === 'medium' ? 'secondary' : 'outline'}>
                          {task.priority}
                        </Badge>
                        {task.estimatedTime && (
                          <span className="text-xs text-muted-foreground">{task.estimatedTime}h</span>
                        )}
                      </div>
                      <p className="text-sm">{task.task}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemovePriorityTask(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-4 text-muted-foreground">
                <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No priority tasks set for tomorrow.</p>
              </div>
            )}
            
            <div className="mt-4">
              <Label>Tomorrow's Plans</Label>
              <Textarea
                value={todayReport?.tomorrowPlans || ''}
                onChange={(e) => handleUpdateText('tomorrowPlans', e.target.value)}
                placeholder="Describe your overall plans for tomorrow..."
              />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* KPI Display */}
      {todayReport && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Performance KPIs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{Number(todayReport.productivityScore || 0).toFixed(1)}</div>
                <div className="text-sm text-muted-foreground">Productivity</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-600">{Number(todayReport.qualityScore || 0).toFixed(1)}</div>
                <div className="text-sm text-muted-foreground">Quality</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{Number(todayReport.efficiencyRating || 0).toFixed(1)}</div>
                <div className="text-sm text-muted-foreground">Efficiency</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{Number(todayReport.collaborationScore || 0).toFixed(1)}</div>
                <div className="text-sm text-muted-foreground">Collaboration</div>
              </div>
            </div>
            
            {todayReport.managerFeedback && (
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="font-medium">Manager Feedback</span>
                  {todayReport.managerRating && (
                    <Badge>{todayReport.managerRating}/5 ⭐</Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">{todayReport.managerFeedback}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Submit DWAR */}
      {todayReport && todayReport.status === 'draft' && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-lg font-semibold">Ready to Submit?</h3>
                <p className="text-sm text-muted-foreground">
                  Once submitted, you cannot make changes to today's report.
                </p>
              </div>
              <Button 
                onClick={() => {
                  submitReportMutation.mutate(todayReport.id);
                }}
                disabled={submitReportMutation.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                <Send className="h-4 w-4 mr-2" />
                {submitReportMutation.isPending ? 'Submitting...' : 'Submit DWAR'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {todayReport && todayReport.status === 'submitted' && (
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <CheckCircle className="h-12 w-12 mx-auto mb-4 text-green-600" />
              <h3 className="text-lg font-semibold text-green-600">DWAR Submitted Successfully</h3>
              <p className="text-sm text-muted-foreground">
                Your Daily Work Activity Report for {format(new Date(), "MMMM d, yyyy")} has been submitted.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Gratitude Dialog */}
      <Dialog open={gratitudeDialog.open} onOpenChange={(open) => setGratitudeDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-semibold text-green-600">
              DWAR Submitted & Auto Checkout Complete
            </DialogTitle>
            <DialogDescription className="text-center text-muted-foreground">
              Your work day has been completed successfully
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center space-y-4 py-6">
            <div className="text-6xl">🙏</div>
            <div className="text-center space-y-3">
              <p className="text-base font-medium leading-relaxed">{gratitudeDialog.message}</p>
              <p className="text-sm text-muted-foreground">
                Total working hours: {gratitudeDialog.workingHours} hours
              </p>
            </div>
            <Button 
              onClick={() => setGratitudeDialog(prev => ({ ...prev, open: false }))}
              className="w-full mt-4"
            >
              Thank You
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}