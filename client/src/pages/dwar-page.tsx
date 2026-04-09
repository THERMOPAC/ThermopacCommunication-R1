import { useState, useEffect, useRef } from "react";
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
  Plus,
  Save,
  Users,
  AlertTriangle,
  Copy,
  ArrowRight,
  History,
  ChevronRight,
  Bell,
  ListTodo,
  X
} from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
  collaborative?: boolean;
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
  planFollowThroughScore?: number;
  planFollowThroughDetails?: any;
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
  source?: 'recurring';
  plannedHours?: number;
}

export default function DwarPage() {
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [isAddActivityOpen, setIsAddActivityOpen] = useState(false);
  const [taskSearchTerm, setTaskSearchTerm] = useState('');
  const [taskDropdownOpen, setTaskDropdownOpen] = useState(false);
  const taskSearchRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (taskSearchRef.current && !taskSearchRef.current.contains(e.target as Node)) {
        setTaskDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const [gratitudeDialog, setGratitudeDialog] = useState<{
    open: boolean;
    message: string;
    workingHours: number;
  }>({ open: false, message: '', workingHours: 0 });

  const [editingActivity, setEditingActivity] = useState<number | null>(null);
  
  // Local state for text fields to prevent API calls on every keystroke
  const [localChallenges, setLocalChallenges] = useState('');
  const [localIssuesEncountered, setLocalIssuesEncountered] = useState('');
  const [localSupportRequired, setLocalSupportRequired] = useState('');
  const [localTomorrowPlans, setLocalTomorrowPlans] = useState('');
  
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
    blockedReason: '',
    collaborative: false
  });
  const [plannedHoursAutoFilled, setPlannedHoursAutoFilled] = useState(false);


  const [showPreviousDay, setShowPreviousDay] = useState(false);
  const [showSubmitWarning, setShowSubmitWarning] = useState(false);
  const [submitWarnings, setSubmitWarnings] = useState<string[]>([]);

  // Get today's DWAR
  const { data: todayReport, isLoading } = useQuery<DailyWorkReport>({
    queryKey: ["/api/dwar/today"],
    refetchInterval: 60000,
  });

  // Get yesterday's DWAR for carry-forward, quick duplicate, and sidebar
  const { data: yesterdayData } = useQuery<{ report: DailyWorkReport | null; date: string }>({
    queryKey: ["/api/dwar/yesterday"],
  });

  // Sync local state with todayReport when it loads
  useEffect(() => {
    if (todayReport) {
      setLocalChallenges(todayReport.challenges || '');
      setLocalIssuesEncountered(todayReport.issuesEncountered || '');
      setLocalSupportRequired(todayReport.supportRequired || '');
      setLocalTomorrowPlans(todayReport.tomorrowPlans || '');
    }
  }, [todayReport?.id]);

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

  const { data: followThrough } = useQuery<{
    score: number;
    details: {
      hasYesterdayPlans: boolean;
      yesterdayPlannedItems?: { text: string; matched: boolean; matchedActivity?: string }[];
      todayUnplannedItems?: string[];
      matchRate: number;
      plannedCount: number;
      matchedCount: number;
      message?: string;
    };
    yesterdayDate?: string;
    todayDate?: string;
  }>({
    queryKey: ["/api/dwar/plan-follow-through"],
    refetchInterval: 120000,
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
      await apiRequest("PUT", `/api/dwar/update/${todayReport?.id}`, {
        challenges: localChallenges,
        issuesEncountered: localIssuesEncountered,
        supportRequired: localSupportRequired,
        tomorrowPlans: localTomorrowPlans,
      });
      return await apiRequest("POST", `/api/dwar/submit/${todayReport?.id}`, {});
    },
    onSuccess: (response: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/dwar/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dwar/my-reports"] });
      // Also invalidate attendance queries to refresh checkout availability
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/my-records"] });
      queryClient.invalidateQueries({ queryKey: ["/api/attendance/my-summary"] });
      
      // Debug: Log the response to see what we're getting
      console.log('DWAR Submit Response:', response);
      
      // Handle auto-checkout result
      if (response.autoCheckout) {
        console.log('Auto-checkout result:', response.autoCheckout);
        if (response.autoCheckout.success) {
          console.log('Setting gratitude dialog with message:', response.autoCheckout.gratitudeMessage);
          // Use setTimeout to ensure dialog shows after state updates
          setTimeout(() => {
            setGratitudeDialog({
              open: true,
              message: response.autoCheckout.gratitudeMessage || `Work day completed successfully. Total hours: ${response.autoCheckout.workingHours}`,
              workingHours: response.autoCheckout.workingHours || 0
            });
          }, 100);
        } else {
          toast({
            title: "DWAR Submitted",
            description: response.autoCheckout.error || "Please complete checkout manually",
            variant: "default",
          });
        }
      } else {
        console.log('No autoCheckout in response');
        toast({
          title: "Report Submitted",
          description: isFromCheckout 
            ? "Your daily work report has been submitted. You can now complete checkout."
            : "Your daily work report has been submitted for approval",
        });
      }
      
      // If coming from checkout flow, redirect to attendance (but not for auto-checkout to allow gratitude dialog)
      if (isFromCheckout && !(response.autoCheckout && response.autoCheckout.success)) {
        setTimeout(() => {
          setLocation('/attendance');
        }, 2000);
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
      blockedReason: '',
      collaborative: false
    });
    setPlannedHoursAutoFilled(false);
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

  const handleCarryForward = () => {
    if (!todayReport || todayReport.status !== 'draft' || !yesterdayData?.report) return;
    const yesterdayTasks = yesterdayData.report.priorityTasks || [];
    if (yesterdayTasks.length === 0) {
      toast({ title: "Nothing to carry forward", description: "Yesterday has no priority tasks.", variant: "default" });
      return;
    }
    const existingDescriptions = (todayReport.activities || []).map((a: Activity) => a.description.toLowerCase().trim());
    const newActivities: Activity[] = [];
    for (const pt of yesterdayTasks) {
      if (existingDescriptions.includes(pt.task.toLowerCase().trim())) continue;
      newActivities.push({
        type: 'Planned Task',
        description: pt.task,
        timeSpent: 0,
        plannedHours: pt.estimatedTime || 0,
        priority: pt.priority,
        status: 'pending',
        collaborative: false,
      });
    }
    if (newActivities.length === 0) {
      toast({ title: "Already carried forward", description: "All yesterday's planned tasks are already in today's activities." });
      return;
    }
    const updatedActivities = [...(todayReport.activities || []), ...newActivities];
    updateReportMutation.mutate({
      activities: updatedActivities,
      hoursWorked: updatedActivities.reduce((sum, a) => sum + a.timeSpent, 0),
      tasksCompleted: updatedActivities.filter(a => a.status === 'completed').length,
      tasksInProgress: updatedActivities.filter(a => a.status === 'in_progress').length
    });
    toast({ title: "Carried Forward", description: `${newActivities.length} planned tasks added from yesterday.` });
  };

  const handleQuickDuplicate = () => {
    if (!todayReport || todayReport.status !== 'draft' || !yesterdayData?.report) return;
    const yesterdayActivities = yesterdayData.report.activities || [];
    if (yesterdayActivities.length === 0) {
      toast({ title: "Nothing to duplicate", description: "Yesterday has no activities.", variant: "default" });
      return;
    }
    const existingDescriptions = (todayReport.activities || []).map((a: Activity) => a.description.toLowerCase().trim());
    const newActivities: Activity[] = [];
    for (const a of yesterdayActivities) {
      if (existingDescriptions.includes(a.description.toLowerCase().trim())) continue;
      newActivities.push({
        type: a.type,
        description: a.description,
        timeSpent: 0,
        plannedHours: a.plannedHours || 0,
        priority: a.priority,
        status: 'pending',
        taskId: a.taskId,
        collaborative: a.collaborative || false,
      });
    }
    if (newActivities.length === 0) {
      toast({ title: "Already duplicated", description: "All yesterday's activities are already in today's report." });
      return;
    }
    const updatedActivities = [...(todayReport.activities || []), ...newActivities];
    updateReportMutation.mutate({
      activities: updatedActivities,
      hoursWorked: updatedActivities.reduce((sum, a) => sum + a.timeSpent, 0),
      tasksCompleted: updatedActivities.filter(a => a.status === 'completed').length,
      tasksInProgress: updatedActivities.filter(a => a.status === 'in_progress').length
    });
    toast({ title: "Activities Duplicated", description: `${newActivities.length} activities copied from yesterday (time reset to 0).` });
  };

  const handleSubmitWithValidation = () => {
    if (!todayReport) return;
    const warnings: string[] = [];
    const activities = todayReport.activities || [];
    const totalHours = activities.reduce((sum, a) => sum + a.timeSpent, 0);
    if (totalHours < 4) warnings.push(`Low hours recorded (${totalHours}h). Consider if all work time is accounted for.`);
    const zeroTimeActivities = activities.filter(a => a.status === 'completed' && a.timeSpent === 0);
    if (zeroTimeActivities.length > 0) warnings.push(`${zeroTimeActivities.length} completed activities have 0 hours logged.`);
    const shortDescriptions = activities.filter(a => (a.description || '').length <= 10);
    if (shortDescriptions.length > 0) warnings.push(`${shortDescriptions.length} activities have very short descriptions.`);
    if (!localTomorrowPlans && (!todayReport.priorityTasks || todayReport.priorityTasks.length === 0)) {
      warnings.push("No tomorrow's plans or priority tasks set.");
    }
    if (warnings.length > 0) {
      setSubmitWarnings(warnings);
      setShowSubmitWarning(true);
    } else {
      submitReportMutation.mutate();
    }
  };

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
                onClick={handleSubmitWithValidation}
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
            <div className="flex items-center gap-2">
              {yesterdayData?.report && (
                <>
                  <Button size="sm" variant="outline" onClick={handleCarryForward} title="Carry forward yesterday's planned tasks as pending activities">
                    <ArrowRight className="h-4 w-4 mr-1" />
                    Carry Forward
                  </Button>
                  <Button size="sm" variant="outline" onClick={handleQuickDuplicate} title="Copy yesterday's activities with time reset to 0">
                    <Copy className="h-4 w-4 mr-1" />
                    Duplicate Yesterday
                  </Button>
                </>
              )}
              <Button size="sm" variant="outline" onClick={() => setShowPreviousDay(!showPreviousDay)} title="View yesterday's report">
                <History className="h-4 w-4 mr-1" />
                Previous Day
              </Button>
            <Dialog open={isAddActivityOpen} onOpenChange={(open) => {
              setIsAddActivityOpen(open);
              if (open) { setTaskSearchTerm(''); setTaskDropdownOpen(false); }
            }}>
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
                <div className="relative" ref={taskSearchRef}>
                  <Label>Link to Existing Task</Label>
                  <div className="relative">
                    <Input
                      value={taskSearchTerm}
                      onChange={(e) => {
                        setTaskSearchTerm(e.target.value);
                        setTaskDropdownOpen(true);
                      }}
                      onFocus={() => setTaskDropdownOpen(true)}
                      placeholder={newActivity.taskId ? availableTasks.find(t => t.id === newActivity.taskId)?.title || 'Search tasks...' : 'Search tasks...'}
                      className={newActivity.taskId ? 'pr-8' : ''}
                    />
                    {newActivity.taskId && (
                      <button
                        type="button"
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                        onClick={() => {
                          setNewActivity({...newActivity, taskId: undefined, plannedHours: 0, priority: 'medium'});
                          setTaskSearchTerm('');
                          setPlannedHoursAutoFilled(false);
                        }}
                      >✕</button>
                    )}
                  </div>
                  {taskDropdownOpen && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {(() => {
                        const term = taskSearchTerm.toLowerCase();
                        const filtered = availableTasks.filter(t =>
                          t.title.toLowerCase().includes(term) ||
                          t.priority.toLowerCase().includes(term) ||
                          (t.dueDate && t.dueDate.includes(term))
                        );
                        if (filtered.length === 0) return (
                          <div className="px-3 py-2 text-sm text-muted-foreground">No tasks found</div>
                        );
                        return filtered.map((task) => (
                          <div
                            key={task.id}
                            className="px-3 py-2 text-sm cursor-pointer hover:bg-accent truncate"
                            onMouseDown={(e) => {
                              e.preventDefault();
                            }}
                            onClick={() => {
                              let autoPlannedHours = 0;
                              let wasAutoFilled = false;
                              if (task.source === 'recurring') {
                                if (task.plannedHours && task.plannedHours > 0) {
                                  autoPlannedHours = task.plannedHours;
                                  wasAutoFilled = true;
                                }
                              } else {
                                const startStr = task.startDate;
                                const endStr = task.dueDate || task.finishDate;
                                if (startStr && endStr) {
                                  const start = new Date(startStr);
                                  const end = new Date(endStr);
                                  if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
                                    let businessDays = 0;
                                    const cur = new Date(start);
                                    while (cur <= end) {
                                      const day = cur.getDay();
                                      if (day !== 0 && day !== 6) businessDays++;
                                      cur.setDate(cur.getDate() + 1);
                                    }
                                    if (businessDays > 0) {
                                      autoPlannedHours = businessDays * 8;
                                      wasAutoFilled = true;
                                    }
                                  }
                                }
                              }
                              setPlannedHoursAutoFilled(wasAutoFilled);
                              setNewActivity({
                                ...newActivity,
                                taskId: task.id,
                                type: 'Task Work',
                                description: task.title,
                                plannedHours: wasAutoFilled ? autoPlannedHours : newActivity.plannedHours,
                                priority: task.priority.toLowerCase() as 'low' | 'medium' | 'high',
                              });
                              setTaskSearchTerm(task.title);
                              setTaskDropdownOpen(false);
                            }}
                          >
                            {task.title} <span className="text-muted-foreground">({task.priority})</span>
                            {task.dueDate ? <span className="text-muted-foreground"> — Due {task.dueDate}</span> : ''}
                          </div>
                        ));
                      })()}
                    </div>
                  )}
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
                      step="0.01"
                      value={newActivity.plannedHours || ''}
                      readOnly
                      className="bg-muted cursor-not-allowed"
                      placeholder="0.00"
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
                    <Select value={newActivity.priority} disabled>
                      <SelectTrigger className="bg-muted cursor-not-allowed">
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
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="collaborative"
                    checked={newActivity.collaborative || false}
                    onCheckedChange={(checked) => setNewActivity({...newActivity, collaborative: checked === true})}
                  />
                  <Label htmlFor="collaborative" className="text-sm font-normal cursor-pointer">
                    <Users className="h-3.5 w-3.5 inline mr-1" />
                    This activity involved others
                  </Label>
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
            </div>
          )}
        </CardHeader>
        <CardContent>
          {/* Previous Day Sidebar */}
          {showPreviousDay && yesterdayData?.report && (
            <div className="mb-4 p-4 bg-muted/50 border rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Previous Day ({yesterdayData.date})
                </h4>
                <Button size="sm" variant="ghost" onClick={() => setShowPreviousDay(false)}>
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-3 mb-3 text-sm">
                <div className="text-center p-2 bg-background rounded">
                  <div className="font-bold text-green-600">{yesterdayData.report.tasksCompleted}</div>
                  <div className="text-xs text-muted-foreground">Completed</div>
                </div>
                <div className="text-center p-2 bg-background rounded">
                  <div className="font-bold text-purple-600">{yesterdayData.report.hoursWorked}h</div>
                  <div className="text-xs text-muted-foreground">Hours</div>
                </div>
                <div className="text-center p-2 bg-background rounded">
                  <div className="font-bold text-blue-600">{Number(yesterdayData.report.productivityScore || 0).toFixed(0)}</div>
                  <div className="text-xs text-muted-foreground">Productivity</div>
                </div>
              </div>
              {yesterdayData.report.activities && yesterdayData.report.activities.length > 0 && (
                <div className="space-y-1">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Activities:</div>
                  {yesterdayData.report.activities.map((a: Activity, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs p-1.5 bg-background rounded">
                      <Badge variant={a.status === 'completed' ? 'default' : a.status === 'blocked' ? 'destructive' : 'outline'} className="text-[10px] px-1.5 py-0">
                        {a.status.replace('_', ' ')}
                      </Badge>
                      <span className="flex-1 truncate">{a.description}</span>
                      <span className="text-muted-foreground">{a.timeSpent}h</span>
                    </div>
                  ))}
                </div>
              )}
              {yesterdayData.report.priorityTasks && yesterdayData.report.priorityTasks.length > 0 && (
                <div className="mt-2 space-y-1">
                  <div className="text-xs font-medium text-muted-foreground mb-1">Tomorrow's Plans (from yesterday):</div>
                  {yesterdayData.report.priorityTasks.map((pt: PriorityTask, i: number) => (
                    <div key={i} className="flex items-center gap-2 text-xs p-1.5 bg-background rounded">
                      <Badge variant={pt.priority === 'high' ? 'destructive' : pt.priority === 'medium' ? 'secondary' : 'outline'} className="text-[10px] px-1.5 py-0">
                        {pt.priority}
                      </Badge>
                      <span className="flex-1 truncate">{pt.task}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {showPreviousDay && !yesterdayData?.report && (
            <div className="mb-4 p-4 bg-muted/50 border rounded-lg text-center text-sm text-muted-foreground">
              <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
              No report found for the previous working day.
              <Button size="sm" variant="ghost" onClick={() => setShowPreviousDay(false)} className="ml-2">
                <X className="h-4 w-4" />
              </Button>
            </div>
          )}
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
                      {activity.collaborative && (
                        <Badge variant="outline" className="text-blue-600 border-blue-300">
                          <Users className="h-3 w-3 mr-1" />
                          Collaborative
                        </Badge>
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
                      <div className="mt-1">
                        <p className="text-xs text-red-600">Blocked: {activity.blockedReason}</p>
                        {todayReport?.status === 'draft' && (
                          <div className="flex gap-2 mt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() => {
                                const tomorrow = new Date();
                                tomorrow.setDate(tomorrow.getDate() + 1);
                                const tomorrowISO = tomorrow.toISOString().split('T')[0];
                                setLocation(`/tasks?action=create&title=${encodeURIComponent(activity.description + ' (Blocked)')}&dueDate=${tomorrowISO}&description=${encodeURIComponent(activity.blockedReason || '')}&source=dwar`);
                              }}
                            >
                              <ListTodo className="h-3 w-3 mr-1" />
                              Create Task
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() => {
                                setLocation(`/alerts?action=create&title=${encodeURIComponent('Blocked: ' + activity.description)}&description=${encodeURIComponent(activity.blockedReason || '')}&source=dwar`);
                              }}
                            >
                              <Bell className="h-3 w-3 mr-1" />
                              Create Alert
                            </Button>
                          </div>
                        )}
                      </div>
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
              {todaysCompletedTasks.map((task, index) => {
                const alreadyAdded = (todayReport?.activities || []).some(
                  (a: any) => a.taskId === task.id || (a.description === task.title && a.status === 'completed')
                );
                return (
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
                      {alreadyAdded && (
                        <Badge variant="outline" className="text-green-700 border-green-300 bg-green-100">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Added
                        </Badge>
                      )}
                    </div>
                    {task.description && (
                      <p className="text-sm text-muted-foreground">{task.description}</p>
                    )}
                    <p className="text-xs text-green-600 mt-1">✓ Task completed today</p>
                  </div>
                  {todayReport?.status === 'draft' && !alreadyAdded && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newActivity = {
                          type: 'Task Work',
                          description: task.title,
                          timeSpent: 1,
                          plannedHours: 1,
                          priority: task.priority?.toLowerCase() || 'medium',
                          status: 'completed' as const,
                          taskId: task.id,
                          blockedReason: '',
                          collaborative: false
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
                );
              })}
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
                value={localChallenges}
                onChange={(e) => setLocalChallenges(e.target.value)}
                placeholder="Describe any challenges you faced today..."
                disabled={todayReport?.status !== 'draft'}
              />
            </div>
            <div>
              <Label>Issues Encountered</Label>
              <Textarea
                value={localIssuesEncountered}
                onChange={(e) => setLocalIssuesEncountered(e.target.value)}
                placeholder="Any technical or process issues..."
                disabled={todayReport?.status !== 'draft'}
              />
            </div>
            <div>
              <Label>Support Required</Label>
              <Textarea
                value={localSupportRequired}
                onChange={(e) => setLocalSupportRequired(e.target.value)}
                placeholder="What support do you need from your team or manager..."
                disabled={todayReport?.status !== 'draft'}
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
            
            {todayReport?.priorityTasks && todayReport.priorityTasks.length > 5 && (
              <div className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                Recommended: Keep to 5 or fewer focused tasks for better planning discipline.
              </div>
            )}

            <div className="mt-4">
              <Label>Tomorrow's Plans</Label>
              <Textarea
                value={localTomorrowPlans}
                onChange={(e) => setLocalTomorrowPlans(e.target.value)}
                placeholder="Be specific — e.g. 'Complete weld inspection for WO-1234' instead of 'Do inspections'"
                disabled={todayReport?.status !== 'draft'}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Write clear, specific task descriptions to improve follow-through tracking accuracy.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plan Follow-Through Analysis */}
      {followThrough && followThrough.details?.hasYesterdayPlans && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Plan Follow-Through
              <Badge variant={followThrough.score >= 75 ? "default" : followThrough.score >= 50 ? "secondary" : "destructive"}>
                {followThrough.score}%
              </Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Comparing yesterday's plans ({followThrough.yesterdayDate}) with today's activities
            </p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 bg-blue-50 rounded-lg">
                <div className="text-xl font-bold text-blue-700">{followThrough.details.plannedCount}</div>
                <div className="text-xs text-blue-600">Planned Items</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-lg">
                <div className="text-xl font-bold text-green-700">{followThrough.details.matchedCount}</div>
                <div className="text-xs text-green-600">Followed Through</div>
              </div>
              <div className="text-center p-3 bg-amber-50 rounded-lg">
                <div className="text-xl font-bold text-amber-700">{(followThrough.details.todayUnplannedItems || []).length}</div>
                <div className="text-xs text-amber-600">Unplanned Tasks</div>
              </div>
            </div>

            {followThrough.details.yesterdayPlannedItems && followThrough.details.yesterdayPlannedItems.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium text-muted-foreground">Yesterday's Plans vs Today's Work</h4>
                {followThrough.details.yesterdayPlannedItems.map((item, idx) => (
                  <div key={idx} className={`flex items-start gap-2 p-2 rounded-lg text-sm ${item.matched ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    <span className="mt-0.5">
                      {item.matched ? (
                        <CheckCircle className="h-4 w-4 text-green-600" />
                      ) : (
                        <Clock className="h-4 w-4 text-red-500" />
                      )}
                    </span>
                    <div className="flex-1">
                      <div className={item.matched ? 'text-green-800' : 'text-red-800'}>{item.text}</div>
                      {item.matched && item.matchedActivity && (
                        <div className="text-xs text-green-600 mt-0.5">Matched: {item.matchedActivity}</div>
                      )}
                      {!item.matched && (
                        <div className="text-xs text-red-500 mt-0.5">Not found in today's activities</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {followThrough.details.todayUnplannedItems && followThrough.details.todayUnplannedItems.length > 0 && (
              <div className="mt-3 space-y-1">
                <h4 className="text-sm font-medium text-muted-foreground">Unplanned Activities (not in yesterday's plans)</h4>
                {followThrough.details.todayUnplannedItems.map((item, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg text-sm">
                    <PlusCircle className="h-4 w-4 text-amber-600" />
                    <span className="text-amber-800">{item}</span>
                  </div>
                ))}
              </div>
            )}

            {followThrough.details.yesterdayPlannedItems?.some((item: any) => !item.matched) && (
              <p className="text-xs text-muted-foreground mt-3 italic">
                Tip: Tasks not completed today can be re-added to tomorrow's plan to maintain continuity.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {followThrough && !followThrough.details?.hasYesterdayPlans && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Plan Follow-Through
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-4 text-muted-foreground">
              <Target className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">{followThrough.details?.message || "No plans were recorded in yesterday's DWAR."}</p>
              <p className="text-xs mt-1">Fill in Tomorrow's Plans in your daily report to enable follow-through tracking.</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Daily Work Indicators */}
      {todayReport && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5" />
              Daily Work Indicators
            </CardTitle>
            <p className="text-xs text-muted-foreground">Daily work indicators used in monthly KPI calculations. These scores feed into your performance summary but are separate from the formal appraisal process.</p>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-600">{Number(todayReport.productivityScore || 0).toFixed(1)}</div>
                <div className="text-sm text-muted-foreground">Productivity</div>
              </div>
              <div className="text-center group relative">
                <div className="text-2xl font-bold text-green-600">{Number(todayReport.qualityScore || 0).toFixed(1)}</div>
                <div className="text-sm text-muted-foreground">Quality</div>
                {todayReport.managerRating && (
                  <div className="text-[10px] text-amber-600 font-medium">Manager Override</div>
                )}
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-purple-600">{Number(todayReport.efficiencyRating || 0).toFixed(1)}</div>
                <div className="text-sm text-muted-foreground">Efficiency</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600">{Number(todayReport.collaborationScore || 0).toFixed(1)}</div>
                <div className="text-sm text-muted-foreground">Collaboration</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-teal-600">{Number(todayReport.planFollowThroughScore || 0).toFixed(1)}</div>
                <div className="text-sm text-muted-foreground">Follow-Through</div>
              </div>
            </div>
            
            {!todayReport.managerRating && todayReport.activities && todayReport.activities.length > 0 && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
                <div className="text-xs font-medium text-green-700 mb-2">Quality Score Breakdown (System)</div>
                {(() => {
                  const ftScore = todayReport.planFollowThroughScore;
                  const hasFollowThrough = ftScore !== null && ftScore !== undefined && Number(ftScore) > 0;
                  const compWeight = hasFollowThrough ? '40%' : '50%';
                  const lqWeight = hasFollowThrough ? '20%' : '50%';
                  const acts = todayReport.activities || [];
                  const t = acts.length;
                  const d = t > 0 ? acts.filter(a => (a.description || '').length > 10).length : 0;
                  const h = t > 0 ? acts.filter(a => (a.timeSpent || 0) > 0).length : 0;
                  const p = t > 0 ? acts.filter(a => ['high','medium','low'].includes(a.priority)).length : 0;
                  const logQuality = t > 0 ? ((d/t)*33.33 + (h/t)*33.33 + (p/t)*33.34) : 0;
                  return (
                    <div className={`grid ${hasFollowThrough ? 'grid-cols-3' : 'grid-cols-2'} gap-3 text-xs`}>
                      <div className="text-center">
                        <div className="font-semibold text-green-700">{Number(todayReport.productivityScore || 0).toFixed(0)}</div>
                        <div className="text-green-600">Completion ({compWeight})</div>
                      </div>
                      {hasFollowThrough && (
                        <div className="text-center">
                          <div className="font-semibold text-green-700">{Number(ftScore).toFixed(0)}</div>
                          <div className="text-green-600">Follow-Through (40%)</div>
                        </div>
                      )}
                      <div className="text-center">
                        <div className="font-semibold text-green-700">{logQuality.toFixed(0)}</div>
                        <div className="text-green-600">Log Quality ({lqWeight})</div>
                        <div className="text-[10px] text-gray-400">desc + time + priority</div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

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
              <div className="flex gap-3">
                <Button 
                  variant="outline"
                  onClick={() => {
                    updateReportMutation.mutate({
                      challenges: localChallenges,
                      issuesEncountered: localIssuesEncountered,
                      supportRequired: localSupportRequired,
                      tomorrowPlans: localTomorrowPlans,
                    });
                  }}
                  disabled={updateReportMutation.isPending}
                >
                  <Save className="h-4 w-4 mr-2" />
                  {updateReportMutation.isPending ? 'Saving...' : 'Update DWAR'}
                </Button>
                <Button 
                  onClick={handleSubmitWithValidation}
                  disabled={submitReportMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  <Send className="h-4 w-4 mr-2" />
                  {submitReportMutation.isPending ? 'Submitting...' : 'Submit DWAR'}
                </Button>
              </div>
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

      {/* Submission Warning Dialog */}
      <Dialog open={showSubmitWarning} onOpenChange={setShowSubmitWarning}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Review Before Submitting
            </DialogTitle>
            <DialogDescription>
              The following items may need attention. You can still submit if these are intentional.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-3">
            {submitWarnings.map((warning, idx) => (
              <div key={idx} className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded text-sm">
                <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                <span className="text-amber-800">{warning}</span>
              </div>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setShowSubmitWarning(false)}>
              Go Back & Fix
            </Button>
            <Button
              onClick={() => {
                setShowSubmitWarning(false);
                submitReportMutation.mutate();
              }}
              className="bg-green-600 hover:bg-green-700"
            >
              Submit Anyway
            </Button>
          </div>
        </DialogContent>
      </Dialog>

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
              onClick={() => {
                setGratitudeDialog(prev => ({ ...prev, open: false }));
                // Navigate to attendance page after closing gratitude dialog
                setTimeout(() => setLocation('/attendance'), 500);
              }}
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