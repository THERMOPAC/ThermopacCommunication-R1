import React, { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Task, User, WorkflowRecommendation, GmailMessage } from "@shared/schema";
import { apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import WorkflowRecommendations from "@/components/workflow-recommendations";
import { Link } from "wouter";
import { 
  Calendar, 
  Clock,
  AlertCircle,
  CheckCircle,
  BarChart3,
  Activity,
  TrendingUp,
  Users,
  ArrowRight,
  Bell,
  Mail,
  Lightbulb,
  Award
} from "lucide-react";

export default function HomeDashboard() {
  const { user } = useAuth();
  const [progress, setProgress] = useState(0);
  
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });
  
  const { data: subordinates = [] } = useQuery<User[]>({
    queryKey: ["/api/subordinates"],
  });
  
  const { data: recommendations = [] } = useQuery<WorkflowRecommendation[]>({
    queryKey: ["/api/recommendations/active"],
  });
  
  // Fetch Gmail messages (excluding spam)
  const { data: gmailMessages = [] } = useQuery({
    queryKey: ["/api/gmail/messages"],
    queryFn: async () => {
      // Add excludeSpam filter parameter to ensure spam messages are not included in counts
      const queryParams = new URLSearchParams();
      queryParams.set("excludeSpam", "true");
      
      // apiRequest already returns the parsed JSON data, no need to call .json() on it
      const data = await apiRequest("GET", `/api/gmail/messages?${queryParams.toString()}`);
      return data as GmailMessage[];
    }
  });
  
  // Gmail stats
  const unreadEmailCount = gmailMessages.filter(m => !m.isRead).length;

  // Animation for progress bars
  useEffect(() => {
    const timer = setTimeout(() => setProgress(66), 500);
    return () => clearTimeout(timer);
  }, []);

  // Task statistics
  const pendingTasks = tasks.filter(t => t.status === "pending");
  const completedTasks = tasks.filter(t => t.status === "completed");
  const totalTasks = tasks.length;
  
  // Get today's date
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  // Calculate overdue tasks
  console.log('Today date:', today.toISOString());
  console.log('Tasks with due dates:', pendingTasks.filter(t => t.dueDate).map(t => ({
    id: t.id,
    title: t.title,
    dueDate: t.dueDate,
    isBeforeToday: new Date(t.dueDate!) < today
  })));
  
  const overdueTasks = pendingTasks.filter(task => {
    // Check both dueDate and finishDate for overdue tasks
    const dueDate = task.dueDate ? new Date(task.dueDate) : null;
    const finishDate = task.finishDate ? new Date(task.finishDate) : null;
    
    // If either date exists and is before today, the task is overdue
    const isDueOverdue = dueDate && dueDate < today;
    const isFinishOverdue = finishDate && finishDate < today;
    
    return isDueOverdue || isFinishOverdue;
  });
  
  // Calculate tasks due today
  const tasksDueToday = pendingTasks.filter(task => {
    // Check both dueDate and finishDate for tasks due today
    const dueDate = task.dueDate ? new Date(task.dueDate) : null;
    const finishDate = task.finishDate ? new Date(task.finishDate) : null;
    
    // Normalize dates to midnight for comparison
    if (dueDate) dueDate.setHours(0, 0, 0, 0);
    if (finishDate) finishDate.setHours(0, 0, 0, 0);
    
    // Task is due today if either date matches today
    const isDueToday = dueDate && dueDate.getTime() === today.getTime();
    const isFinishToday = finishDate && finishDate.getTime() === today.getTime();
    
    return isDueToday || isFinishToday;
  });
  
  // Calculate tasks due this week
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + 7);
  
  const tasksDueThisWeek = pendingTasks.filter(task => {
    // Check both dueDate and finishDate for tasks due this week
    const dueDate = task.dueDate ? new Date(task.dueDate) : null;
    const finishDate = task.finishDate ? new Date(task.finishDate) : null;
    
    // Task is due this week if either date is within this week
    const isDueThisWeek = dueDate && dueDate >= today && dueDate <= endOfWeek;
    const isFinishThisWeek = finishDate && finishDate >= today && finishDate <= endOfWeek;
    
    return isDueThisWeek || isFinishThisWeek;
  });
  
  // Calculate completion rate
  const completionRate = totalTasks > 0 
    ? Math.round((completedTasks.length / totalTasks) * 100) 
    : 0;
  
  // Format date for display
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    }).format(date);
  };
  
  // Get upcoming tasks (next 7 days)
  const upcomingTasks = [...pendingTasks]
    .filter(task => {
      // Consider both dueDate and finishDate
      const dueDate = task.dueDate ? new Date(task.dueDate) : null;
      const finishDate = task.finishDate ? new Date(task.finishDate) : null;
      
      // Use either date, prioritizing finishDate if available
      const effectiveDate = finishDate || dueDate;
      
      // If neither date exists, exclude the task
      if (!effectiveDate) return false;
      
      return effectiveDate >= today && effectiveDate <= endOfWeek;
    })
    .sort((a, b) => {
      // Sort by effective date (finishDate or dueDate)
      const dateA = a.finishDate ? new Date(a.finishDate) : (a.dueDate ? new Date(a.dueDate) : new Date());
      const dateB = b.finishDate ? new Date(b.finishDate) : (b.dueDate ? new Date(b.dueDate) : new Date());
      return dateA.getTime() - dateB.getTime();
    })
    .slice(0, 5); // Get top 5 upcoming
  
  // Priority colors
  const getPriorityColor = (priority: string) => {
    switch(priority) {
      case "High": return "text-red-500";
      case "Medium": return "text-amber-500";
      case "Low": return "text-green-500";
      default: return "";
    }
  };
  
  // Priority icons
  const getPriorityIcon = (priority: string) => {
    switch(priority) {
      case "High": return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "Medium": return <Clock className="h-4 w-4 text-amber-500" />;
      case "Low": return <CheckCircle className="h-4 w-4 text-green-500" />;
      default: return <CheckCircle className="h-4 w-4" />;
    }
  };
  
  // Format due date relative to today
  const getRelativeDueDate = (dateStr: string) => {
    const date = new Date(dateStr);
    date.setHours(0, 0, 0, 0);
    
    if (date.getTime() === today.getTime()) {
      return "Today";
    }
    
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    if (date.getTime() === tomorrow.getTime()) {
      return "Tomorrow";
    }
    
    // Calculate days difference
    const diffTime = Math.abs(date.getTime() - today.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (date < today) {
      return `${diffDays} day${diffDays !== 1 ? 's' : ''} overdue`;
    } else {
      return `In ${diffDays} day${diffDays !== 1 ? 's' : ''}`;
    }
  };
  
  // Mock productivity score and rank (in real app, these would come from API)
  const productivityScore = 84;
  const userRank = 3;
  const totalUsers = subordinates.length + 1; // Including the current user

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {user?.username}! Here's what's happening today.</p>
      </div>
      
      {/* Date and notifications row */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <span className="text-muted-foreground">{formatDate(new Date())}</span>
        </div>
        
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" className="flex items-center gap-1" asChild>
            <Link href="/messages">
              <Bell className="h-4 w-4" />
              <Badge className="h-5 w-5 flex items-center justify-center rounded-full text-xs p-0 bg-primary text-white">
                {recommendations.length}
              </Badge>
            </Link>
          </Button>
          
          <Button variant="ghost" size="sm" className="flex items-center gap-1" asChild>
            <Link href="/emails">
              <Mail className="h-4 w-4" />
              <Badge className="h-5 w-5 flex items-center justify-center rounded-full text-xs p-0 bg-primary text-white">
                {unreadEmailCount}
              </Badge>
            </Link>
          </Button>
        </div>
      </div>
      
      {/* Task summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-primary/10">
              <Clock className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Pending Tasks</p>
              <p className="text-2xl font-bold">{pendingTasks.length}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-amber-100">
              <AlertCircle className="h-6 w-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Due Today</p>
              <p className="text-2xl font-bold">{tasksDueToday.length}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-red-100">
              <AlertCircle className="h-6 w-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Overdue</p>
              <p className="text-2xl font-bold">{overdueTasks.length}</p>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-card shadow-sm">
          <CardContent className="p-4 flex items-center gap-4">
            <div className="p-3 rounded-full bg-green-100">
              <CheckCircle className="h-6 w-6 text-green-600" />
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold">{completedTasks.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Main content grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Progress Overview */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Activity className="h-5 w-5 text-primary" />
                Progress Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between mb-1">
                    <p className="text-sm font-medium">Task Completion Rate</p>
                    <p className="text-sm font-medium">{completionRate}%</p>
                  </div>
                  <Progress value={completionRate} className="h-2" />
                </div>
                
                <div>
                  <div className="flex justify-between mb-1">
                    <p className="text-sm font-medium">Weekly Tasks Progress</p>
                    <p className="text-sm font-medium">
                      {tasksDueThisWeek.filter(t => t.status === "completed").length}/{tasksDueThisWeek.length}
                    </p>
                  </div>
                  <Progress 
                    value={tasksDueThisWeek.length > 0 
                      ? (tasksDueThisWeek.filter(t => t.status === "completed").length / tasksDueThisWeek.length) * 100 
                      : 0
                    } 
                    className="h-2" 
                  />
                </div>
                
                <div>
                  <div className="flex justify-between mb-1">
                    <p className="text-sm font-medium">Monthly Productivity</p>
                    <p className="text-sm font-medium">{productivityScore}%</p>
                  </div>
                  <Progress value={productivityScore} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
          
          {/* Upcoming Tasks */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  Upcoming Tasks
                </CardTitle>
                <Button variant="ghost" size="sm" asChild className="gap-1">
                  <Link href="/tasks">
                    View All 
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {upcomingTasks.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <CheckCircle className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p>No upcoming tasks for the next 7 days</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {upcomingTasks.map((task) => (
                    <div key={task.id} className="border-b pb-3 last:border-0 last:pb-0">
                      <div className="flex justify-between items-start">
                        <div className="flex gap-2 items-start">
                          {getPriorityIcon(task.priority || "")}
                          <div>
                            <p className="font-medium">{task.title}</p>
                            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                              <Calendar className="h-3 w-3" />
                              <span>
                                {task.finishDate 
                                  ? getRelativeDueDate(task.finishDate) 
                                  : (task.dueDate 
                                     ? getRelativeDueDate(task.dueDate) 
                                     : "No due date")}
                              </span>
                              {task.category && (
                                <Badge variant="outline" className="text-xs">
                                  {task.category}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                        <Badge variant={
                          (task.finishDate && new Date(task.finishDate) < today) || 
                          (task.dueDate && new Date(task.dueDate) < today) 
                            ? "destructive" 
                            : "outline"
                        }>
                          {(task.finishDate && new Date(task.finishDate) < today) || 
                           (task.dueDate && new Date(task.dueDate) < today) 
                            ? "Overdue" 
                            : task.priority}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Active Recommendations */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Lightbulb className="h-5 w-5 text-yellow-500" />
                  Workflow Recommendations
                </CardTitle>
                <Button variant="ghost" size="sm" asChild className="gap-1">
                  <Link href="/recommendations">
                    View All
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <WorkflowRecommendations />
            </CardContent>
          </Card>
        </div>
        
        {/* Right column */}
        <div className="space-y-6">
          {/* User Performance */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold flex items-center gap-2">
                <Award className="h-5 w-5 text-primary" />
                Performance Overview
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-center py-4">
                <div className="relative h-36 w-36 flex items-center justify-center">
                  <svg className="h-full w-full" viewBox="0 0 100 100">
                    {/* Background circle */}
                    <circle
                      className="text-muted-foreground/20"
                      strokeWidth="8"
                      stroke="currentColor"
                      fill="transparent"
                      r="40"
                      cx="50"
                      cy="50"
                    />
                    {/* Progress circle */}
                    <circle
                      className="text-primary"
                      strokeWidth="8"
                      strokeDasharray={`${productivityScore * 2.51} 251.2`}
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="transparent"
                      r="40"
                      cx="50"
                      cy="50"
                      transform="rotate(-90 50 50)"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-3xl font-bold">{productivityScore}</span>
                    <span className="text-sm text-muted-foreground">Productivity</span>
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium">Your Rank</p>
                  <Badge variant="outline" className="font-semibold">
                    #{userRank} of {totalUsers}
                  </Badge>
                </div>
                
                <Separator />
                
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium">Tasks Completed</p>
                  <p className="font-medium">{completedTasks.length}</p>
                </div>
                
                <Separator />
                
                <div className="flex justify-between items-center">
                  <p className="text-sm font-medium">On-time Completion</p>
                  <p className="font-medium">
                    {totalTasks > 0
                      ? `${Math.round((completedTasks.filter(t => {
                          // Check both finishDate and dueDate for on-time completion
                          const hasCompletedAt = !!t.completedAt;
                          
                          // If no completion date or no deadline dates, it's considered on-time
                          if (!hasCompletedAt || (!t.dueDate && !t.finishDate)) return true;
                          
                          // Get completed date
                          const completedDate = new Date(t.completedAt);
                          
                          // Check against finishDate if it exists
                          if (t.finishDate) {
                            const finishDate = new Date(t.finishDate);
                            if (completedDate <= finishDate) return true;
                          }
                          
                          // Check against dueDate if it exists and wasn't already determined to be on time
                          if (t.dueDate) {
                            const dueDate = new Date(t.dueDate);
                            if (completedDate <= dueDate) return true;
                          }
                          
                          // If we get here, the task was completed after both deadline dates
                          return false;
                        }).length / totalTasks) * 100)}%`
                      : "0%"
                    }
                  </p>
                </div>
              </div>
              
              <Button variant="outline" className="w-full gap-1" asChild>
                <Link href="/leaderboard">
                  <TrendingUp className="h-4 w-4" />
                  View Full Leaderboard
                </Link>
              </Button>
            </CardContent>
          </Card>
          
          {/* Team Quick View */}
          <Card>
            <CardHeader className="pb-2">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  Team Status
                </CardTitle>
                <Button variant="ghost" size="sm" asChild className="gap-1">
                  <Link href="/team">
                    View Team
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {subordinates.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <Users className="h-10 w-10 mx-auto mb-2 opacity-20" />
                  <p>You have no team members</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {subordinates.slice(0, 3).map((member) => (
                    <div key={member.id} className="flex items-center gap-3">
                      <Avatar>
                        <AvatarFallback>{member.username.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <div className="flex justify-between">
                          <p className="font-medium">{member.username}</p>
                          <Badge variant="outline">{member.role}</Badge>
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <Mail className="h-3 w-3" />
                          {member.email}
                        </div>
                      </div>
                    </div>
                  ))}
                  
                  {subordinates.length > 3 && (
                    <Button variant="ghost" className="w-full text-primary" asChild>
                      <Link href="/team">
                        View {subordinates.length - 3} more team members
                      </Link>
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
          
          {/* Quick Links */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg font-semibold">Quick Links</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                <Link href="/tasks">
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <Calendar className="h-4 w-4" />
                    All Tasks
                  </Button>
                </Link>
                <Link href="/recurring-tasks">
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <Clock className="h-4 w-4" />
                    Recurring Tasks
                  </Button>
                </Link>
                <Link href="/emails">
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <Mail className="h-4 w-4" />
                    Emails
                  </Button>
                </Link>
                <Link href="/profile">
                  <Button variant="outline" className="w-full justify-start gap-2">
                    <Users className="h-4 w-4" />
                    Profile
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}