import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Task, User } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import TaskList from "@/components/task-list-new";
// Due date filter import removed
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { 
  Calendar,
  CheckCircle,
  Clock,
  AlertCircle,
  Filter,
  ChevronDown,
  SortAsc,
  SortDesc
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function TaskDashboard() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("all");
  // Removed due date filter as per requirement
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("asc");
  const [sortBy, setSortBy] = useState<"dueDate" | "priority" | "title">("dueDate");

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: subordinates = [] } = useQuery<User[]>({
    queryKey: ["/api/subordinates"],
  });

  // Filter tasks based on selected filters
  const filterTasks = (tasks: Task[]) => {
    let filteredTasks = [...tasks];
    
    // Filter by tab
    if (activeTab === "pending") {
      filteredTasks = filteredTasks.filter(task => task.status === "pending");
    } else if (activeTab === "completed") {
      filteredTasks = filteredTasks.filter(task => task.status === "completed");
    } else if (activeTab === "overdue") {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      filteredTasks = filteredTasks.filter(task => {
        if (!task.dueDate) return false;
        const dueDate = new Date(task.dueDate);
        return task.status === "pending" && dueDate < today;
      });
    }
    
    // Due date filter has been removed as per requirement
    
    // Filter by priority
    if (priorityFilter) {
      filteredTasks = filteredTasks.filter(task => task.priority === priorityFilter);
    }
    
    // Sort tasks
    filteredTasks.sort((a, b) => {
      if (sortBy === "dueDate") {
        const dateA = a.dueDate ? new Date(a.dueDate) : new Date(0);
        const dateB = b.dueDate ? new Date(b.dueDate) : new Date(0);
        return sortOrder === "asc" ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();
      } else if (sortBy === "priority") {
        const priorityValues = { "Low": 1, "Medium": 2, "High": 3 };
        const priorityA = priorityValues[a.priority as keyof typeof priorityValues] || 0;
        const priorityB = priorityValues[b.priority as keyof typeof priorityValues] || 0;
        return sortOrder === "asc" ? priorityA - priorityB : priorityB - priorityA;
      } else {
        // Sort by title
        return sortOrder === "asc" 
          ? a.title.localeCompare(b.title) 
          : b.title.localeCompare(a.title);
      }
    });
    
    return filteredTasks;
  };

  const filteredTasks = filterTasks(tasks);

  // Count tasks by status
  const pendingCount = tasks.filter(task => task.status === "pending").length;
  const completedCount = tasks.filter(task => task.status === "completed").length;
  
  // Count overdue tasks
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const overdueCount = tasks.filter(task => {
    const dueDate = task.dueDate ? new Date(task.dueDate) : null;
    return task.status === "pending" && dueDate && dueDate < today;
  }).length;

  // Tasks stats
  const tasksByPriority = {
    "High": tasks.filter(t => t.priority === "High").length,
    "Medium": tasks.filter(t => t.priority === "Medium").length,
    "Low": tasks.filter(t => t.priority === "Low").length,
  };

  // Helper to get proper icon for the priority
  const getPriorityIcon = (priority: string) => {
    switch(priority) {
      case "High":
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      case "Medium":
        return <Clock className="h-4 w-4 text-amber-500" />;
      case "Low":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      default:
        return <CheckCircle className="h-4 w-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">Task Management</h1>
        
        <div className="flex items-center gap-2">
          {/* Sort dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="flex items-center gap-1">
                {sortOrder === "asc" ? <SortAsc className="h-4 w-4" /> : <SortDesc className="h-4 w-4" />}
                Sort by: {sortBy.charAt(0).toUpperCase() + sortBy.slice(1)}
                <ChevronDown className="h-4 w-4 ml-1" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuLabel>Sort Options</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSortBy("dueDate")}>
                <Calendar className="h-4 w-4 mr-2" />
                Due Date
                {sortBy === "dueDate" && (sortOrder === "asc" ? <SortAsc className="h-4 w-4 ml-2" /> : <SortDesc className="h-4 w-4 ml-2" />)}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("priority")}>
                <AlertCircle className="h-4 w-4 mr-2" />
                Priority
                {sortBy === "priority" && (sortOrder === "asc" ? <SortAsc className="h-4 w-4 ml-2" /> : <SortDesc className="h-4 w-4 ml-2" />)}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setSortBy("title")}>
                <span className="mr-2">A-Z</span>
                Title
                {sortBy === "title" && (sortOrder === "asc" ? <SortAsc className="h-4 w-4 ml-2" /> : <SortDesc className="h-4 w-4 ml-2" />)}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}>
                {sortOrder === "asc" ? (
                  <>
                    <SortAsc className="h-4 w-4 mr-2" />
                    Ascending
                  </>
                ) : (
                  <>
                    <SortDesc className="h-4 w-4 mr-2" />
                    Descending
                  </>
                )}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          
          {/* Due date filter removed as per requirement */}
          
          {/* Priority filter */}
          <Select
            value={priorityFilter || "all"}
            onValueChange={(value) => setPriorityFilter(value === "all" ? null : value)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Priority" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Priorities</SelectItem>
              <SelectItem value="High">
                <div className="flex items-center">
                  <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
                  High
                </div>
              </SelectItem>
              <SelectItem value="Medium">
                <div className="flex items-center">
                  <Clock className="h-4 w-4 text-amber-500 mr-2" />
                  Medium
                </div>
              </SelectItem>
              <SelectItem value="Low">
                <div className="flex items-center">
                  <CheckCircle className="h-4 w-4 text-green-500 mr-2" />
                  Low
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      
      {/* Task stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="shadow-sm">
          <CardContent className="p-4 flex justify-between items-center">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Tasks</p>
              <p className="text-2xl font-bold">{tasks.length}</p>
            </div>
            <div className="p-2 bg-primary/10 rounded-full">
              <Calendar className="h-5 w-5 text-primary" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm">
          <CardContent className="p-4 flex justify-between items-center">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold">{pendingCount}</p>
            </div>
            <div className="p-2 bg-amber-100 rounded-full">
              <Clock className="h-5 w-5 text-amber-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm">
          <CardContent className="p-4 flex justify-between items-center">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Completed</p>
              <p className="text-2xl font-bold">{completedCount}</p>
            </div>
            <div className="p-2 bg-green-100 rounded-full">
              <CheckCircle className="h-5 w-5 text-green-600" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="shadow-sm">
          <CardContent className="p-4 flex justify-between items-center">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Overdue</p>
              <p className="text-2xl font-bold">{overdueCount}</p>
            </div>
            <div className="p-2 bg-red-100 rounded-full">
              <AlertCircle className="h-5 w-5 text-red-600" />
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* Task filters by status */}
      <Tabs defaultValue="all" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="all" className="flex items-center justify-center gap-2">
            All Tasks
            <Badge variant="secondary">{tasks.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="pending" className="flex items-center justify-center gap-2">
            Pending
            <Badge variant="secondary">{pendingCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="completed" className="flex items-center justify-center gap-2">
            Completed
            <Badge variant="secondary">{completedCount}</Badge>
          </TabsTrigger>
          <TabsTrigger value="overdue" className="flex items-center justify-center gap-2">
            Overdue
            <Badge variant="secondary" className={overdueCount > 0 ? "bg-red-500 text-white" : ""}>
              {overdueCount}
            </Badge>
          </TabsTrigger>
        </TabsList>
        
        <div className="mt-4">
          {filteredTasks.length > 0 ? (
            <TaskList 
              tasks={filteredTasks} 
              subordinates={subordinates} 
              initialShowCompleted={activeTab === "completed"}
            />
          ) : (
            <Card>
              <CardContent className="p-8 text-center">
                <div className="flex flex-col items-center gap-2">
                  <Filter className="h-10 w-10 text-muted-foreground opacity-30" />
                  <h3 className="text-lg font-medium">No tasks found</h3>
                  <p className="text-sm text-muted-foreground">
                    Try adjusting your filters to find what you're looking for.
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </Tabs>
      
      {/* Task Breakdown */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Task Breakdown by Priority</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {Object.entries(tasksByPriority).map(([priority, count]) => (
              <div key={priority} className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {getPriorityIcon(priority)}
                    <span>{priority} Priority</span>
                  </div>
                  <span className="font-medium">{count}</span>
                </div>
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${
                      priority === "High" ? "bg-red-500" : 
                      priority === "Medium" ? "bg-amber-500" : "bg-green-500"
                    }`}
                    style={{ width: `${(count / tasks.length) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}