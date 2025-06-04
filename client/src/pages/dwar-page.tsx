import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
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
  Award
} from "lucide-react";
import { format } from "date-fns";

interface Activity {
  type: string;
  description: string;
  timeSpent: number;
  priority: 'low' | 'medium' | 'high';
  status: 'completed' | 'in_progress' | 'pending';
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
}

export default function DwarPage() {
  const { toast } = useToast();
  const [isAddActivityOpen, setIsAddActivityOpen] = useState(false);
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [editingActivity, setEditingActivity] = useState<number | null>(null);
  const [newActivity, setNewActivity] = useState<Activity>({
    type: '',
    description: '',
    timeSpent: 0,
    priority: 'medium',
    status: 'pending'
  });
  const [newTask, setNewTask] = useState<PriorityTask>({
    task: '',
    priority: 'medium',
    estimatedTime: 0
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dwar/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dwar/my-reports"] });
      toast({
        title: "Report Submitted",
        description: "Your daily work report has been submitted for approval",
      });
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
    if (!todayReport) return;

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
      priority: 'medium',
      status: 'pending'
    });
    setIsAddActivityOpen(false);
  };

  const handleRemoveActivity = (index: number) => {
    if (!todayReport) return;

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

  const handleAddPriorityTask = () => {
    if (!todayReport) return;

    const updatedTasks = [...(todayReport.priorityTasks || []), newTask];
    updateReportMutation.mutate({
      priorityTasks: updatedTasks
    });

    setNewTask({
      task: '',
      priority: 'medium',
      estimatedTime: 0
    });
    setIsAddTaskOpen(false);
  };

  const handleRemovePriorityTask = (index: number) => {
    if (!todayReport) return;

    const updatedTasks = todayReport.priorityTasks.filter((_, i) => i !== index);
    updateReportMutation.mutate({
      priorityTasks: updatedTasks
    });
  };

  const handleUpdateText = (field: string, value: string) => {
    if (!todayReport) return;
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
                    <Label>Time Spent (hours)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={newActivity.timeSpent}
                      onChange={(e) => setNewActivity({...newActivity, timeSpent: parseFloat(e.target.value) || 0})}
                    />
                  </div>
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
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setIsAddActivityOpen(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleAddActivity}>Add Activity</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
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
                      <Badge variant={activity.status === 'completed' ? 'default' : activity.status === 'in_progress' ? 'secondary' : 'outline'}>
                        {activity.status.replace('_', ' ')}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{activity.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">{activity.timeSpent}h spent</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveActivity(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
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
            <Dialog open={isAddTaskOpen} onOpenChange={setIsAddTaskOpen}>
              <DialogTrigger asChild>
                <Button size="sm">
                  <PlusCircle className="h-4 w-4 mr-2" />
                  Add Task
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Priority Task</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Task</Label>
                    <Textarea
                      value={newTask.task}
                      onChange={(e) => setNewTask({...newTask, task: e.target.value})}
                      placeholder="Describe the task for tomorrow..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Priority</Label>
                      <Select value={newTask.priority} onValueChange={(value: any) => setNewTask({...newTask, priority: value})}>
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
                      <Label>Estimated Time (hours)</Label>
                      <Input
                        type="number"
                        step="0.5"
                        value={newTask.estimatedTime || ''}
                        onChange={(e) => setNewTask({...newTask, estimatedTime: parseFloat(e.target.value) || undefined})}
                      />
                    </div>
                  </div>
                  <div className="flex justify-end space-x-2">
                    <Button variant="outline" onClick={() => setIsAddTaskOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={handleAddPriorityTask}>Add Task</Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
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
    </div>
  );
}