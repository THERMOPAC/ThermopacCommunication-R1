import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { RecurringTask, User } from "@shared/schema";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, ChevronDown, ChevronRight, CheckCircle, Circle, Forward, Search, Filter, X, Calendar } from "lucide-react";
import { roles, roleHierarchy } from "@shared/roles";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";

const FORWARD_ALLOWED_ROLES = ["Superuser", "General Manager", "Senior Manager", "Manager"];

type RecurringTaskListProps = {
  recurringTasks: RecurringTask[];
  subordinates: User[];
};

const forwardTaskSchema = z.object({
  assigneeId: z.string().min(1, "Please select a team member")
});

type ForwardTaskForm = z.infer<typeof forwardTaskSchema>;

export default function RecurringTaskList({ recurringTasks, subordinates }: RecurringTaskListProps) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterAssignee, setFilterAssignee] = useState<number | null>(null);
  const [showCompletedTasks, setShowCompletedTasks] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // State for collapsible sections
  const [openSections, setOpenSections] = useState<Record<number, boolean>>({});

  // State for task completion confirmation
  const [taskToComplete, setTaskToComplete] = useState<{id: number, completing: boolean} | null>(null);

  // Fetch all users for task assignment
  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Group users by role for the task assignment dropdown
  const groupedUsers = [...roles]
    .sort((a, b) => roleHierarchy[a] - roleHierarchy[b])
    .reduce((acc: Record<string, User[]>, role: string) => {
      const usersInRole = allUsers.filter(u => u.role === role);
      if (usersInRole.length > 0) {
        acc[role] = usersInRole;
      }
      return acc;
    }, {} as Record<string, User[]>);
    
  // Get assignee's name helper function
  const getAssigneeName = (assigneeId: number | null) => {
    if (!assigneeId) return 'Unassigned';
    const assignee = allUsers.find(u => u.id === assigneeId);
    return assignee ? assignee.username : 'Unknown';
  };

  // Filter and search tasks
  const filteredTasks = recurringTasks
    .filter(task => {
      // Handle completed tasks filter
      if (!showCompletedTasks && task.status === 'completed') {
        return false;
      }
      
      // Apply priority filter if selected
      if (filterPriority && task.priority !== filterPriority) {
        return false;
      }
      
      // Apply status filter if selected
      if (filterStatus && task.status !== filterStatus) {
        return false;
      }
      
      // Apply assignee filter if selected
      if (filterAssignee !== null && task.assignedTo !== filterAssignee) {
        return false;
      }
      
      // Apply search query
      if (searchQuery.trim() !== '') {
        const search = searchQuery.toLowerCase();
        return (
          task.title.toLowerCase().includes(search) ||
          task.description.toLowerCase().includes(search) ||
          getAssigneeName(task.assignedTo).toLowerCase().includes(search)
        );
      }
      
      return true;
    })
    // Sort by due date, with earliest dates first
    .sort((a, b) => {
      const dateA = new Date(a.dueDate);
      const dateB = new Date(b.dueDate);
      return dateA.getTime() - dateB.getTime();
    });

  // Group recurring tasks by pattern for display
  const tasksByPattern = filteredTasks.reduce((acc, task) => {
    // Ensure the task has a valid recurringPatternId
    if (task.recurringPatternId === undefined || task.recurringPatternId === null) {
      console.warn('Task missing recurringPatternId:', task);
      // Skip this task or add to a "no pattern" group
      if (!acc[0]) {
        acc[0] = [];
      }
      acc[0].push(task);
    } else {
      const patternId = task.recurringPatternId;
      if (!acc[patternId]) {
        acc[patternId] = [];
      }
      acc[patternId].push(task);
    }
    return acc;
  }, {} as Record<number, RecurringTask[]>);
  
  // Initialize all patterns as collapsed by default
  useEffect(() => {
    const sections: Record<number, boolean> = {};
    Object.keys(tasksByPattern).forEach(patternId => {
      sections[parseInt(patternId)] = false; // Set each section to collapsed by default
    });
    setOpenSections(sections);
  }, [JSON.stringify(Object.keys(tasksByPattern))]);

  // Get pattern name helper function (using the first task in each group)
  const getPatternName = (patternId: number, tasks: RecurringTask[]) => {
    if (tasks.length === 0) return 'Unknown Pattern';
    return `${tasks[0].title} (Pattern #${patternId})`;
  };

  // Mutation for completing tasks
  const completeTaskMutation = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: number; completed: boolean }) => {
      const status = completed ? "completed" : "pending";
      const res = await apiRequest("PATCH", `/api/recurring-tasks/${taskId}`, { status });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-tasks"] });
      toast({
        title: "Success",
        description: "Recurring task status updated",
      });
      setTaskToComplete(null);  // Reset the task completion state
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setTaskToComplete(null);  // Reset on error too
    },
  });

  const forwardTaskMutation = useMutation({
    mutationFn: async ({ taskId, newAssignee }: { taskId: number; newAssignee: number }) => {
      const res = await apiRequest("POST", `/api/recurring-tasks/${taskId}/forward`, { newAssignee });
      return await res.json();
    },
    onSuccess: () => {
      // Invalidate all task-related queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-tasks"] });
      toast({
        title: "Success",
        description: "Recurring task forwarded successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to forward recurring task",
        variant: "destructive",
      });
    },
  });

  const ForwardTaskDialog = ({ task }: { task: RecurringTask }) => {
    const [isOpen, setIsOpen] = useState(false);
    const form = useForm<ForwardTaskForm>({
      resolver: zodResolver(forwardTaskSchema),
      defaultValues: {
        assigneeId: ""
      }
    });

    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="ml-2"
            disabled={!FORWARD_ALLOWED_ROLES.includes(user!.role)}
          >
            <Forward className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Forward Recurring Task</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form 
              onSubmit={form.handleSubmit((data) => {
                forwardTaskMutation.mutate({
                  taskId: task.id,
                  newAssignee: parseInt(data.assigneeId)
                });
                setIsOpen(false);
              })} 
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="assigneeId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Forward to</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select team member" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(groupedUsers).map(([role, users]) => (
                          <SelectGroup key={role}>
                            <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                              {role}s
                            </SelectLabel>
                            {(users as User[]).map((user: User) => (
                              <SelectItem key={user.id} value={user.id.toString()}>
                                {user.username}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={forwardTaskMutation.isPending}
              >
                Forward Task
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Recurring Tasks</h3>
        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative">
            <Input
              type="text"
              placeholder="Search recurring tasks..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pr-8 w-64"
            />
            {searchQuery && (
              <Button 
                variant="ghost" 
                size="icon" 
                className="absolute right-0 top-0 h-full" 
                onClick={() => setSearchQuery("")}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          
          {/* Filter Button */}
          <Popover open={isFilterOpen} onOpenChange={setIsFilterOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon">
                <Filter className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80">
              <div className="space-y-4">
                <h4 className="font-medium">Filter Tasks</h4>
                
                <div className="space-y-2">
                  <p className="text-sm font-medium">Priority</p>
                  <div className="flex gap-2">
                    <Button 
                      variant={filterPriority === 'High' ? 'default' : 'outline'} 
                      size="sm"
                      onClick={() => setFilterPriority(prev => prev === 'High' ? null : 'High')}
                    >
                      High
                    </Button>
                    <Button 
                      variant={filterPriority === 'Medium' ? 'default' : 'outline'} 
                      size="sm"
                      onClick={() => setFilterPriority(prev => prev === 'Medium' ? null : 'Medium')}
                    >
                      Medium
                    </Button>
                    <Button 
                      variant={filterPriority === 'Low' ? 'default' : 'outline'} 
                      size="sm"
                      onClick={() => setFilterPriority(prev => prev === 'Low' ? null : 'Low')}
                    >
                      Low
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm font-medium">Status</p>
                  <div className="flex gap-2">
                    <Button 
                      variant={filterStatus === 'pending' ? 'default' : 'outline'} 
                      size="sm"
                      onClick={() => setFilterStatus(prev => prev === 'pending' ? null : 'pending')}
                    >
                      Pending
                    </Button>
                    <Button 
                      variant={filterStatus === 'completed' ? 'default' : 'outline'} 
                      size="sm"
                      onClick={() => setFilterStatus(prev => prev === 'completed' ? null : 'completed')}
                    >
                      Completed
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm font-medium">Assigned To</p>
                  <Select
                    value={filterAssignee !== null ? filterAssignee.toString() : ""}
                    onValueChange={(value) => setFilterAssignee(value ? Number(value) : null)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">All Assignees</SelectItem>
                      {allUsers.map((user) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.username}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    id="show-completed"
                    checked={showCompletedTasks}
                    onChange={(e) => setShowCompletedTasks(e.target.checked)}
                    className="rounded border-gray-300"
                  />
                  <label htmlFor="show-completed" className="text-sm">
                    Show completed tasks
                  </label>
                </div>
                
                <div className="flex justify-between">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => {
                      setFilterPriority(null);
                      setFilterStatus(null);
                      setFilterAssignee(null);
                      setShowCompletedTasks(false);
                      setIsFilterOpen(false);
                    }}
                  >
                    Reset Filters
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={() => setIsFilterOpen(false)}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {Object.keys(tasksByPattern).length > 0 ? (
        <div className="space-y-4">
          {Object.entries(tasksByPattern).map(([patternIdStr, tasks]) => {
            const patternId = parseInt(patternIdStr);
            return (
              <Collapsible
                key={patternId}
                open={openSections[patternId] ?? false}
                onOpenChange={(isOpen) => {
                  setOpenSections((prev) => ({
                    ...prev,
                    [patternId]: isOpen,
                  }));
                }}
              >
                <Card>
                  <CardHeader className="py-3">
                    <CollapsibleTrigger className="flex w-full justify-between items-center">
                      <CardTitle className="text-base flex items-center gap-2">
                        {openSections[patternId] ? (
                          <ChevronDown className="h-5 w-5" />
                        ) : (
                          <ChevronRight className="h-5 w-5" />
                        )}
                        <Calendar className="h-5 w-5 text-primary" />
                        <span>
                          {getPatternName(patternId, tasks)}
                        </span>
                        <Badge variant="outline" className="ml-2">
                          {tasks.length} {tasks.length === 1 ? 'occurrence' : 'occurrences'}
                        </Badge>
                      </CardTitle>
                    </CollapsibleTrigger>
                  </CardHeader>
                  <CollapsibleContent>
                    <CardContent>
                      <div className="rounded-md border overflow-hidden">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead className="w-10"></TableHead>
                              <TableHead>Task</TableHead>
                              <TableHead>Priority</TableHead>
                              <TableHead>Due Date</TableHead>
                              <TableHead>Assigned To</TableHead>
                              <TableHead>Status</TableHead>
                              <TableHead className="w-14">Actions</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {/* Sort tasks by due date within each group */}
                            {[...tasks].sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()).map((task) => (
                              <TableRow key={task.id}>
                                <TableCell className="p-2">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    onClick={() => setTaskToComplete({ id: task.id, completing: true })}
                                    disabled={task.status === 'completed' || (task.assignedTo !== user?.id && user?.role !== 'Superuser')}
                                  >
                                    {task.status === 'completed' ? (
                                      <CheckCircle className="h-5 w-5 text-green-500" />
                                    ) : (
                                      <Circle className="h-5 w-5 text-muted-foreground" />
                                    )}
                                  </Button>
                                </TableCell>
                                <TableCell className="font-medium">
                                  <div>
                                    <span className={
                                      task.status === 'completed' 
                                        ? 'line-through text-muted-foreground' 
                                        : new Date(task.dueDate) < new Date() 
                                          ? 'text-red-600 font-medium'
                                          : ''
                                    }>
                                      {task.title}
                                    </span>
                                    <div className="text-xs text-muted-foreground mt-1 max-w-md">
                                      {task.description}
                                    </div>
                                    <div className="text-xs text-muted-foreground mt-1">
                                      Occurrence #{task.occurrenceNumber}
                                    </div>
                                  </div>
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant={
                                      task.priority === 'High' 
                                        ? 'destructive' 
                                        : task.priority === 'Medium' 
                                          ? 'default' 
                                          : 'secondary'
                                    }
                                  >
                                    {task.priority}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  {/* Show past due dates in red */}
                                  <span className={new Date(task.dueDate) < new Date() && task.status !== 'completed' ? 'text-red-600 font-medium' : ''}>
                                    {new Date(task.dueDate).toLocaleDateString()}
                                  </span>
                                </TableCell>
                                <TableCell>{getAssigneeName(task.assignedTo)}</TableCell>
                                <TableCell>
                                  <Badge variant={task.status === 'completed' ? 'outline' : 'default'}>
                                    {task.status === 'completed' ? 'Completed' : 'Pending'}
                                  </Badge>
                                </TableCell>
                                <TableCell>
                                  <div className="flex items-center">
                                    <ForwardTaskDialog task={task} />
                                  </div>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            );
          })}
        </div>
      ) : (
        <Card>
          <CardContent className="flex flex-col items-center justify-center h-32 p-6">
            <Calendar className="h-10 w-10 text-muted-foreground mb-2" />
            <p className="text-center text-muted-foreground">
              {searchQuery || filterPriority || filterStatus || filterAssignee ? 
                "No recurring tasks match your filters" : 
                "No recurring tasks available"
              }
            </p>
          </CardContent>
        </Card>
      )}
      
      {/* Task completion confirmation dialog */}
      <AlertDialog
        open={taskToComplete !== null}
        onOpenChange={(open) => {
          if (!open) setTaskToComplete(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Complete Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark this recurring task as completed?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (taskToComplete) {
                  completeTaskMutation.mutate({
                    taskId: taskToComplete.id,
                    completed: taskToComplete.completing,
                  });
                }
              }}
            >
              {completeTaskMutation.isPending ? 'Processing...' : 'Complete Task'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

