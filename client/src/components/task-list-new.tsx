import { useState, useMemo, useCallback, useEffect } from "react";
import { fmtDate } from "@/lib/date-format";
import { useAuth } from "@/hooks/use-auth";
import { Task, User, insertTaskSchema } from "@shared/schema";
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import { Plus, ChevronDown, ChevronRight, CheckCircle, Circle, Forward, Search, Filter, X, Edit as EditIcon, Trash2 } from "lucide-react";
import { roles, roleHierarchy } from "@shared/roles";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

const FORWARD_ALLOWED_ROLES = ["Superuser", "General Manager", "Senior Manager", "Manager"];

// Schema for task editing with just the allowed fields
const editTaskSchema = z.object({
  title: z.string().min(3, "Title must be at least 3 characters").max(100),
  description: z.string().min(10, "Description must be at least 10 characters"),
  priority: z.enum(["Low", "Medium", "High"]),
  finishDate: z.string(),
  assignedTo: z.number()
});

type TaskListProps = {
  tasks: Task[];
  subordinates: User[];
  initialShowCompleted?: boolean;
  urlParams?: URLSearchParams | null;
};

const forwardTaskSchema = z.object({
  assigneeId: z.string().min(1, "Please select a team member")
});

type ForwardTaskForm = z.infer<typeof forwardTaskSchema>;

export default function TaskList({ tasks, subordinates, initialShowCompleted = false, urlParams }: TaskListProps) {
  const [open, setOpen] = useState(false);
  const { user, isLoading } = useAuth();
  const { toast } = useToast();
  
  // Show a loading state if the user data is still loading
  if (isLoading || !user) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
      </div>
    );
  }

  // Search and filter states
  const [searchQuery, setSearchQuery] = useState("");
  const [filterPriority, setFilterPriority] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterAssignee, setFilterAssignee] = useState<number | null>(null);
  const [filterAssignedBy, setFilterAssignedBy] = useState<string | null>(null);
  const [showCompletedTasks, setShowCompletedTasks] = useState(initialShowCompleted);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // State for collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  // State for task completion confirmation
  const [taskToComplete, setTaskToComplete] = useState<{id: number, completing: boolean} | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<{id: number, title: string} | null>(null);
  const [taskToReject, setTaskToReject] = useState<{id: number, title: string} | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  // Fetch all users for task assignment
  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Safely memoize the grouped users to prevent recalculation during renders
  const groupedUsers = useMemo(() => {
    // Return empty object if no users are loaded yet
    if (allUsers.length === 0) return {} as Record<string, User[]>;
    // Only show users at the same level or below in the hierarchy
    const myRoleLevel = roleHierarchy[user?.role ?? ''] ?? 99;
    return Array.from(roles)
      .sort((a, b) => roleHierarchy[a] - roleHierarchy[b])
      .reduce((acc: Record<string, User[]>, role) => {
        const usersInRole = allUsers.filter(u => u.role === role && (roleHierarchy[u.role] ?? 99) >= myRoleLevel);
        if (usersInRole.length > 0) {
          // Sort alphabetically within each group
          usersInRole.sort((a, b) => {
            const nameA = a.firstName && a.lastName ? `${a.firstName} ${a.lastName}` : a.username;
            const nameB = b.firstName && b.lastName ? `${b.firstName} ${b.lastName}` : b.username;
            return nameA.localeCompare(nameB);
          });
          acc[role] = usersInRole;
        }
        return acc;
      }, {} as Record<string, User[]>);
  }, [allUsers, user]); // Only recalculate when allUsers or current user changes

  // Wait for allUsers to be loaded before performing filtering that depends on it
  const isDataReady = allUsers.length > 0;

  // Handle automatic dialog opening from URL parameters
  useEffect(() => {
    if (urlParams && urlParams.get('action') === 'create' && isDataReady) {
      setOpen(true);
    }
  }, [urlParams, isDataReady]);
  
  // Get creator's name helper function - memoized to prevent recreation
  const agentDisplayNames: Record<string, string> = {
    'communicator': 'Communications Agent',
    'communications': 'Communications Agent',
    'project_controller': 'Project Control Agent',
    'project_control': 'Project Control Agent',
    'predictive_project_controller': 'Predictive Project Control Agent',
    'finance_controller': 'Finance Control Agent',
    'finance_control': 'Finance Control Agent',
    'executive_mis': 'Executive MIS Agent',
    'production_manager': 'Production Management Agent',
    'production_management': 'Production Management Agent',
    'quality_controller': 'Quality Management Agent',
    'quality_management': 'Quality Management Agent',
    'sales_marketer': 'Sales & Marketing Agent',
    'sales_marketing': 'Sales & Marketing Agent',
  };

  const getCreatorName = useCallback((creatorKey: string) => {
    if (!isDataReady) return 'Loading...';
    if (creatorKey.startsWith('agent:')) {
      const agentKey = creatorKey.replace('agent:', '');
      return agentDisplayNames[agentKey] || agentKey;
    }
    const creatorId = Number(creatorKey);
    const creator = allUsers.find(u => u.id === creatorId);
    return creator ? creator.username : 'Unknown';
  }, [allUsers, isDataReady]);

  // Get assignee's name helper function - memoized to prevent recreation
  const getAssigneeName = useCallback((assigneeId: number | null) => {
    if (!assigneeId) return 'Unassigned';
    if (!isDataReady) return 'Loading...';
    const assignee = allUsers.find(u => u.id === assigneeId);
    return assignee ? assignee.username : 'Unknown';
  }, [allUsers, isDataReady]);
  
  const uniqueAssigners = useMemo(() => {
    const map = new Map<string, string>();
    tasks.forEach(task => {
      const key = task.sourceAgent ? `agent:${task.sourceAgent}` : String(task.createdBy || 0);
      if (!map.has(key)) {
        map.set(key, getCreatorName(key));
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [tasks, getCreatorName]);

  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
      if (!showCompletedTasks && task.status === 'completed') {
        return false;
      }
      
      if (filterPriority && task.priority !== filterPriority) {
        return false;
      }
      
      if (filterStatus && task.status !== filterStatus) {
        return false;
      }
      
      if (filterAssignee !== null && task.assignedTo !== filterAssignee) {
        return false;
      }

      if (filterAssignedBy !== null) {
        const taskKey = task.sourceAgent ? `agent:${task.sourceAgent}` : String(task.createdBy || 0);
        if (taskKey !== filterAssignedBy) return false;
      }
      
      // Apply search query - only when allUsers is loaded
      if (searchQuery.trim() !== '' && isDataReady) {
        const search = searchQuery.toLowerCase();
        return (
          task.title.toLowerCase().includes(search) ||
          task.description.toLowerCase().includes(search) ||
          getAssigneeName(task.assignedTo).toLowerCase().includes(search)
        );
      } else if (searchQuery.trim() !== '' && !isDataReady) {
        // If searching but data not ready, only search title and description
        const search = searchQuery.toLowerCase();
        return (
          task.title.toLowerCase().includes(search) ||
          task.description.toLowerCase().includes(search)
        );
      }
      
      return true;
    });
  }, [tasks, showCompletedTasks, filterPriority, filterStatus, filterAssignee, filterAssignedBy, searchQuery, isDataReady, getAssigneeName]);

  const tasksByCreator = useMemo(() => {
    return filteredTasks.reduce((acc, task) => {
      const key = task.sourceAgent ? `agent:${task.sourceAgent}` : String(task.createdBy || 0);
      if (!acc[key]) {
        acc[key] = [];
      }
      acc[key].push(task);
      return acc;
    }, {} as Record<string, Task[]>);
  }, [filteredTasks]);

  // Mutation for completing tasks
  const completeTaskMutation = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: number; completed: boolean }) => {
      try {
        const status = completed ? "completed" : "pending";
        return await apiRequest("PATCH", `/api/tasks/${taskId}`, { status });
      } catch (error) {
        console.error("Task completion error:", error);
        throw error;
      }
    },
    onMutate: async ({ taskId, completed }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/tasks"] });
      const previousTasks = queryClient.getQueryData<Task[]>(["/api/tasks"]);
      queryClient.setQueryData<Task[]>(["/api/tasks"], (old) =>
        old?.map((t) =>
          t.id === taskId
            ? { ...t, status: completed ? "completed" : "pending", completedAt: completed ? new Date().toISOString() : null }
            : t
        )
      );
      return { previousTasks };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Success",
        description: "Task status updated",
      });
      setTaskToComplete(null);
    },
    onError: (error: Error, _variables, context) => {
      if (context?.previousTasks) {
        queryClient.setQueryData(["/api/tasks"], context.previousTasks);
      }
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setTaskToComplete(null);
    },
  });

  const createTaskMutation = useMutation({
    mutationFn: async (data: Omit<Task, "id">) => {
      try {
        const taskData = {
          ...data,
          dueDate: data.finishDate || data.dueDate,
          createdAt: new Date().toISOString(),
          completedAt: null,
          category: null
        };
        // Use our enhanced apiRequest that handles empty responses better
        return await apiRequest("POST", "/api/tasks", taskData);
      } catch (error) {
        console.error("Task creation error:", error);
        throw error;
      }
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      setOpen(false);
      form.reset();
      toast({
        title: "Success",
        description: "Task created successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const forwardTaskMutation = useMutation({
    mutationFn: async ({ taskId, newAssignee }: { taskId: number; newAssignee: number }) => {
      try {
        // Use our enhanced apiRequest that handles empty responses better
        return await apiRequest("POST", `/api/tasks/${taskId}/forward`, { newAssignee });
      } catch (error) {
        console.error("Task forwarding error:", error);
        throw error;
      }
    },
    onSuccess: (response) => {
      // Invalidate all task-related queries to refresh the data
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Success",
        description: "Task forwarded successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to forward task",
        variant: "destructive",
      });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      return await apiRequest("DELETE", `/api/tasks/${taskId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Deleted",
        description: "Agent task deleted successfully",
      });
      setTaskToDelete(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete task",
        variant: "destructive",
      });
      setTaskToDelete(null);
    },
  });

  const submitCompletionMutation = useMutation({
    mutationFn: async (taskId: number) => {
      return await apiRequest("POST", `/api/tasks/${taskId}/submit-completion`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Task Completed", description: "Task marked as completed. The creator has been notified." });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to submit completion", variant: "destructive" });
    },
  });

  const rejectCompletionMutation = useMutation({
    mutationFn: async ({ taskId, reason }: { taskId: number; reason: string }) => {
      return await apiRequest("POST", `/api/tasks/${taskId}/reject-completion`, { reason });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({ title: "Completion Rejected", description: "Task has been reopened and the assignee has been notified." });
      setTaskToReject(null);
      setRejectionReason("");
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to reject completion", variant: "destructive" });
    },
  });

  const defaultDueDate = urlParams?.get('dueDate') || new Date().toISOString().split('T')[0];
  const form = useForm({
    resolver: zodResolver(insertTaskSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "pending",
      priority: "Medium",
      startDate: new Date().toISOString().split('T')[0],
      finishDate: defaultDueDate,
      dueDate: defaultDueDate,
      assignedTo: null,
      createdBy: user!.id,
      createdAt: new Date().toISOString(),
      completedAt: null,
      category: null
    },
  });

  // Mutation for editing tasks
  const editTaskMutation = useMutation({
    mutationFn: async ({ taskId, taskData }: { taskId: number; taskData: z.infer<typeof editTaskSchema> }) => {
      try {
        // Use our enhanced apiRequest that handles empty responses better
        return await apiRequest("PATCH", `/api/tasks/${taskId}`, taskData);
      } catch (error) {
        console.error("Task update error:", error);
        throw error;
      }
    },
    onSuccess: (response) => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Success",
        description: "Task updated successfully",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update task",
        variant: "destructive",
      });
    },
  });

  // Component for editing tasks
  function EditTaskDialog({ task }: { task: Task }) {
    const [isOpen, setIsOpen] = useState(false);
    const form = useForm<z.infer<typeof editTaskSchema>>({
      resolver: zodResolver(editTaskSchema),
      defaultValues: {
        title: task.title,
        description: task.description,
        priority: task.priority as "Low" | "Medium" | "High",
        finishDate: task.finishDate,
        assignedTo: task.assignedTo || undefined
      }
    });
    
    // Check if current user can edit this task
    const canEdit = user!.role === "Superuser" || task.createdBy === user!.id;
    
    // Don't attempt to render if user data isn't ready
    if (!isDataReady) {
      return (
        <Button
          variant="ghost"
          size="icon"
          className="ml-2"
          disabled={true}
        >
          <EditIcon className="h-4 w-4" />
        </Button>
      );
    }

    return (
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="ml-2"
            disabled={!canEdit}
          >
            <EditIcon className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Task</DialogTitle>
          </DialogHeader>
          <Form {...form}>
            <form 
              onSubmit={form.handleSubmit((data) => {
                editTaskMutation.mutate({
                  taskId: task.id,
                  taskData: data
                });
                setIsOpen(false);
              })} 
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="priority"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Priority</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select priority" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="Low">Low</SelectItem>
                        <SelectItem value="Medium">Medium</SelectItem>
                        <SelectItem value="High">High</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="finishDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Due Date <span className="text-red-500">*</span></FormLabel>
                    <FormControl>
                      <Input type="date" {...field} required onChange={(e) => { field.onChange(e); form.setValue("dueDate", e.target.value); }} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <FormField
                control={form.control}
                name="assignedTo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Assigned To</FormLabel>
                    <Select 
                      onValueChange={(value) => field.onChange(Number(value))}
                      value={field.value?.toString() || ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select team member" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(groupedUsers).length > 0 ? (
                          Object.entries(groupedUsers).map(([role, users]) => (
                            <SelectGroup key={role}>
                              <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                                {role}s
                              </SelectLabel>
                              {users.map((userItem) => (
                                <SelectItem key={userItem.id} value={userItem.id.toString()}>
                                  {userItem.username}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))
                        ) : (
                          <SelectItem value="loading" disabled>Loading users...</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              <Button
                type="submit"
                className="w-full"
                disabled={editTaskMutation.isPending}
              >
                Save Changes
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  }

  // Component for forwarding tasks
  function ForwardTaskDialog({ task }: { task: Task }) {
    const [isOpen, setIsOpen] = useState(false);
    const form = useForm<ForwardTaskForm>({
      resolver: zodResolver(forwardTaskSchema),
      defaultValues: {
        assigneeId: ""
      }
    });

    // Don't attempt to render if user data isn't ready
    if (!isDataReady) {
      return (
        <Button
          variant="ghost"
          size="icon"
          className="ml-2"
          disabled={true}
        >
          <Forward className="h-4 w-4" />
        </Button>
      );
    }

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
            <DialogTitle>Forward Task</DialogTitle>
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
                        {Object.entries(groupedUsers).length > 0 ? (
                          Object.entries(groupedUsers).map(([role, users]) => (
                            <SelectGroup key={role}>
                              <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                                {role}s
                              </SelectLabel>
                              {users.map((userItem) => (
                                <SelectItem key={userItem.id} value={userItem.id.toString()}>
                                  {userItem.username}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))
                        ) : (
                          <SelectItem value="loading" disabled>Loading users...</SelectItem>
                        )}
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
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Tasks</h3>
        <div className="flex items-center gap-2">
          {/* Search Box */}
          <div className="relative">
            <Input
              type="text"
              placeholder="Search tasks..."
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
                      variant={filterStatus === 'in_progress' ? 'default' : 'outline'} 
                      size="sm"
                      onClick={() => setFilterStatus(prev => prev === 'in_progress' ? null : 'in_progress')}
                    >
                      In Progress
                    </Button>
                  </div>
                </div>
                
                <div className="space-y-2">
                  <p className="text-sm font-medium">Assigned By</p>
                  <Select
                    value={filterAssignedBy !== null ? filterAssignedBy : "all"}
                    onValueChange={(value) => setFilterAssignedBy(value === "all" ? null : value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by assigner" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {uniqueAssigners.map(([key, name]) => (
                        <SelectItem key={key} value={key}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium">Assigned To</p>
                  <Select
                    value={filterAssignee !== null ? filterAssignee.toString() : "all"}
                    onValueChange={(value) => setFilterAssignee(value === "all" ? null : Number(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      {isDataReady ? (
                        allUsers.map((userItem) => (
                          <SelectItem key={userItem.id} value={userItem.id.toString()}>
                            {userItem.username}
                          </SelectItem>
                        ))
                      ) : (
                        <SelectItem value="loading" disabled>Loading users...</SelectItem>
                      )}
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
                      setFilterAssignedBy(null);
                      setShowCompletedTasks(false);
                      setSearchQuery('');
                    }}
                  >
                    Reset Filters
                  </Button>
                  <Button size="sm" onClick={() => setIsFilterOpen(false)}>
                    Apply Filters
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
          
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                New Task
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Task</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((data) => createTaskMutation.mutate(data as any))} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="title"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Title</FormLabel>
                        <FormControl>
                          <Input {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Textarea {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="priority"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Priority</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select priority" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Low">Low</SelectItem>
                            <SelectItem value="Medium">Medium</SelectItem>
                            <SelectItem value="High">High</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Start Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="finishDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Due Date <span className="text-red-500">*</span></FormLabel>
                          <FormControl>
                            <Input type="date" {...field} required />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  <FormField
                    control={form.control}
                    name="assignedTo"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Assign To</FormLabel>
                        <Select onValueChange={(value) => field.onChange(Number(value))}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select team member" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {isDataReady ? (
                              Object.entries(groupedUsers).map(([role, users]) => (
                                <SelectGroup key={role}>
                                  <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                                    {role}s
                                  </SelectLabel>
                                  {users.map((userItem) => (
                                    <SelectItem key={userItem.id} value={userItem.id.toString()}>
                                      {userItem.username}
                                    </SelectItem>
                                  ))}
                                </SelectGroup>
                              ))
                            ) : (
                              <SelectItem value="loading" disabled>Loading users...</SelectItem>
                            )}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <Button type="submit" className="w-full" disabled={createTaskMutation.isPending}>
                    Create Task
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <Card>
        {Object.entries(tasksByCreator).length > 0 ? (
          Object.entries(tasksByCreator).map(([creatorId, creatorTasks]) => (
            <Collapsible
              key={creatorId}
              open={openSections[creatorId]}
              onOpenChange={(isOpen) => {
                setOpenSections(prev => ({
                  ...prev,
                  [creatorId]: isOpen
                }));
              }}
            >
              <CollapsibleTrigger className="flex items-center gap-2 w-full p-4 hover:bg-accent">
                <div className="flex items-center gap-2">
                  {openSections[creatorId] ? (
                    <ChevronDown className="h-5 w-5" />
                  ) : (
                    <ChevronRight className="h-5 w-5" />
                  )}
                  <span className="font-medium">
                    Tasks Assigned by: {getCreatorName(creatorId)}
                  </span>
                  <Badge variant="secondary" className="ml-2">
                    {creatorTasks.length}
                  </Badge>
                </div>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[60px]">ID</TableHead>
                      <TableHead className="w-[250px]">Title</TableHead>
                      <TableHead className="w-[600px]">Description</TableHead>
                      <TableHead>Priority</TableHead>
                      <TableHead>Start Date</TableHead>
                      <TableHead>Due Date</TableHead>
                      <TableHead>Assigned To</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Complete</TableHead>
                      <TableHead>Edit</TableHead>
                      <TableHead>Forward</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {creatorTasks.map((task) => (
                      <TableRow key={task.id}>
                        <TableCell className="text-muted-foreground text-xs font-mono">{task.id}</TableCell>
                        <TableCell className="font-medium">{task.title}</TableCell>
                        <TableCell className="max-w-[600px] whitespace-pre-wrap break-words">
                          {task.description}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              task.priority === 'High'
                                ? 'destructive'
                                : task.priority === 'Low'
                                  ? 'secondary'
                                  : 'default'
                            }
                          >
                            {task.priority}
                          </Badge>
                        </TableCell>
                        <TableCell>{fmtDate(task.startDate)}</TableCell>
                        <TableCell>{fmtDate(task.finishDate)}</TableCell>
                        <TableCell>{getAssigneeName(task.assignedTo)}</TableCell>
                        <TableCell>
                          <Badge 
                            variant={task.status === 'completed' ? 'default' : 'outline'} 
                            className="capitalize"
                          >
                            {task.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {task.sourceType !== 'agent_task' ? (
                            <div className="flex items-center gap-1">
                              {task.status !== 'completed' && task.assignedTo === user.id && (
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  title="Mark Complete"
                                  onClick={() => setTaskToComplete({ id: task.id, completing: true })}
                                  disabled={submitCompletionMutation.isPending}
                                >
                                  <Circle className="h-5 w-5" />
                                </Button>
                              )}
                              {task.status === 'completed' && task.createdBy === user.id && task.createdBy !== task.assignedTo && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-red-500 hover:text-red-700 hover:bg-red-50 text-xs"
                                  title="Reject Completion"
                                  onClick={() => { setTaskToReject({ id: task.id, title: task.title }); setRejectionReason(""); }}
                                  disabled={rejectCompletionMutation.isPending}
                                >
                                  Reject
                                </Button>
                              )}
                              {task.status === 'completed' && (
                                <CheckCircle className="h-5 w-5 text-green-500" />
                              )}
                            </div>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => setTaskToComplete({
                                id: task.id,
                                completing: task.status !== 'completed'
                              })}
                              disabled={completeTaskMutation.isPending}
                            >
                              {task.status === 'completed' ? (
                                <CheckCircle className="h-5 w-5 text-green-500" />
                              ) : (
                                <Circle className="h-5 w-5" />
                              )}
                            </Button>
                          )}
                          {task.completionRejectionReason && task.status !== 'completed' && (
                            <p className="text-xs text-red-500 mt-1" title={task.completionRejectionReason}>
                              Rejected: {task.completionRejectionReason.length > 30 ? task.completionRejectionReason.slice(0, 30) + '...' : task.completionRejectionReason}
                            </p>
                          )}
                        </TableCell>
                        <TableCell>
                          <EditTaskDialog task={task} />
                        </TableCell>
                        <TableCell>
                          <ForwardTaskDialog task={task} />
                        </TableCell>
                        {task.sourceType === 'agent_task' && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                              onClick={() => setTaskToDelete({ id: task.id, title: task.title })}
                              disabled={deleteTaskMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CollapsibleContent>
            </Collapsible>
          ))
        ) : (
          <div className="flex items-center justify-center p-8 text-gray-500">
            <p>No tasks found matching your filters</p>
          </div>
        )}
      </Card>

      {/* Confirmation Dialog */}
      <AlertDialog 
        open={taskToComplete !== null}
        onOpenChange={(open) => !open && setTaskToComplete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {taskToComplete?.completing ? 'Complete Task' : 'Reopen Task'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to mark this task as {taskToComplete?.completing ? 'completed' : 'pending'}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (taskToComplete) {
                  const matchedTask = tasks.find(t => t.id === taskToComplete.id);
                  if (matchedTask && matchedTask.sourceType !== 'agent_task' && taskToComplete.completing) {
                    submitCompletionMutation.mutate(taskToComplete.id);
                  } else {
                    completeTaskMutation.mutate({
                      taskId: taskToComplete.id,
                      completed: taskToComplete.completing
                    });
                  }
                  setTaskToComplete(null);
                }
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={taskToReject !== null}
        onOpenChange={(open) => { if (!open) { setTaskToReject(null); setRejectionReason(""); } }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Task Completion</AlertDialogTitle>
            <AlertDialogDescription>
              This will reopen the task and notify the assignee. Please provide a reason for rejection.
              <br /><br />
              <strong>{taskToReject?.title}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Enter rejection reason (mandatory)..."
            value={rejectionReason}
            onChange={e => setRejectionReason(e.target.value)}
            className="mt-2"
            rows={3}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={!rejectionReason.trim() || rejectCompletionMutation.isPending}
              onClick={() => {
                if (taskToReject && rejectionReason.trim()) {
                  rejectCompletionMutation.mutate({ taskId: taskToReject.id, reason: rejectionReason.trim() });
                }
              }}
            >
              Reject Completion
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog 
        open={taskToDelete !== null}
        onOpenChange={(open) => !open && setTaskToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Agent Task</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to permanently delete this agent-generated task? This action cannot be undone.
              <br /><br />
              <strong>{taskToDelete?.title}</strong>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (taskToDelete) {
                  deleteTaskMutation.mutate(taskToDelete.id);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}