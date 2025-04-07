import { useState, useMemo, useCallback } from "react";
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
import { Plus, ChevronDown, ChevronRight, CheckCircle, Circle, Forward, Search, Filter, X, Edit as EditIcon } from "lucide-react";
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
};

const forwardTaskSchema = z.object({
  assigneeId: z.string().min(1, "Please select a team member")
});

type ForwardTaskForm = z.infer<typeof forwardTaskSchema>;

export default function TaskList({ tasks, subordinates, initialShowCompleted = false }: TaskListProps) {
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
  const [showCompletedTasks, setShowCompletedTasks] = useState(initialShowCompleted);
  const [isFilterOpen, setIsFilterOpen] = useState(false);

  // State for collapsible sections
  const [openSections, setOpenSections] = useState<Record<number, boolean>>({});

  // State for task completion confirmation
  const [taskToComplete, setTaskToComplete] = useState<{id: number, completing: boolean} | null>(null);

  // Fetch all users for task assignment
  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Safely memoize the grouped users to prevent recalculation during renders
  const groupedUsers = useMemo(() => {
    // Return empty object if no users are loaded yet
    if (allUsers.length === 0) return {} as Record<string, User[]>;
    
    return Array.from(roles)
      .sort((a, b) => roleHierarchy[a] - roleHierarchy[b])
      .reduce((acc: Record<string, User[]>, role) => {
        const usersInRole = allUsers.filter(u => u.role === role);
        if (usersInRole.length > 0) {
          acc[role] = usersInRole;
        }
        return acc;
      }, {} as Record<string, User[]>);
  }, [allUsers]); // Only recalculate when allUsers changes

  // Wait for allUsers to be loaded before performing filtering that depends on it
  const isDataReady = allUsers.length > 0;
  
  // Get creator's name helper function - memoized to prevent recreation
  const getCreatorName = useCallback((creatorId: number) => {
    if (!isDataReady) return 'Loading...';
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
  
  // Filter and search tasks - memoized to avoid unnecessary recalculations
  const filteredTasks = useMemo(() => {
    return tasks.filter(task => {
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
  }, [tasks, showCompletedTasks, filterPriority, filterStatus, filterAssignee, searchQuery, isDataReady, getAssigneeName]);

  // Group tasks by creator for display - memoized to prevent recalculation
  const tasksByCreator = useMemo(() => {
    return filteredTasks.reduce((acc, task) => {
      const creatorId = task.createdBy || 0; // Use 0 as fallback if creatorId is null
      if (!acc[creatorId]) {
        acc[creatorId] = [];
      }
      acc[creatorId].push(task);
      return acc;
    }, {} as Record<number, Task[]>);
  }, [filteredTasks]);

  // Mutation for completing tasks
  const completeTaskMutation = useMutation({
    mutationFn: async ({ taskId, completed }: { taskId: number; completed: boolean }) => {
      const status = completed ? "completed" : "pending";
      const res = await apiRequest("PATCH", `/api/tasks/${taskId}`, { status });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
      toast({
        title: "Success",
        description: "Task status updated",
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

  const createTaskMutation = useMutation({
    mutationFn: async (data: Omit<Task, "id">) => {
      const taskData = {
        ...data,
        createdAt: new Date().toISOString(),
        completedAt: null,
        category: null
      };
      const res = await apiRequest("POST", "/api/tasks", taskData);
      return await res.json();
    },
    onSuccess: () => {
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
      const res = await apiRequest("POST", `/api/tasks/${taskId}/forward`, { newAssignee });
      return await res.json();
    },
    onSuccess: () => {
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

  const form = useForm({
    resolver: zodResolver(insertTaskSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "pending",
      priority: "Medium",
      startDate: new Date().toISOString().split('T')[0],
      finishDate: "",
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
      const res = await apiRequest("PATCH", `/api/tasks/${taskId}`, taskData);
      return await res.json();
    },
    onSuccess: () => {
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
                    <FormLabel>Due Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
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
                  <p className="text-sm font-medium">Assigned To</p>
                  <Select
                    value={filterAssignee !== null ? filterAssignee.toString() : "all"}
                    onValueChange={(value) => setFilterAssignee(value === "all" ? null : Number(value))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Filter by assignee" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Assignees</SelectItem>
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
                          <FormLabel>Due Date</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
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
              open={openSections[Number(creatorId)]}
              onOpenChange={(isOpen) => {
                setOpenSections(prev => ({
                  ...prev,
                  [creatorId]: isOpen
                }));
              }}
            >
              <CollapsibleTrigger className="flex items-center gap-2 w-full p-4 hover:bg-accent">
                <div className="flex items-center gap-2">
                  {openSections[Number(creatorId)] ? (
                    <ChevronDown className="h-5 w-5" />
                  ) : (
                    <ChevronRight className="h-5 w-5" />
                  )}
                  <span className="font-medium">
                    Tasks Assigned by: {getCreatorName(Number(creatorId))}
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
                      <TableHead className="w-[300px]">Title</TableHead>
                      <TableHead className="w-[300px]">Description</TableHead>
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
                        <TableCell className="font-medium">{task.title}</TableCell>
                        <TableCell className="max-w-[300px] whitespace-pre-wrap break-words">
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
                        <TableCell>{new Date(task.startDate).toLocaleDateString()}</TableCell>
                        <TableCell>{new Date(task.finishDate).toLocaleDateString()}</TableCell>
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
                        </TableCell>
                        <TableCell>
                          <EditTaskDialog task={task} />
                        </TableCell>
                        <TableCell>
                          <ForwardTaskDialog task={task} />
                        </TableCell>
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
                  completeTaskMutation.mutate({
                    taskId: taskToComplete.id,
                    completed: taskToComplete.completing
                  });
                }
              }}
            >
              Confirm
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}