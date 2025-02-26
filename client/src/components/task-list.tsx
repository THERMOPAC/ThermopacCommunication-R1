import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Task, User, insertTaskSchema } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Plus, ChevronDown, ChevronRight, CheckCircle, Circle } from "lucide-react";
import { roles, roleHierarchy } from "@shared/roles";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type TaskListProps = {
  tasks: Task[];
  subordinates: User[];
};

export default function TaskList({ tasks, subordinates }: TaskListProps) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // State for collapsible sections
  const [openSections, setOpenSections] = useState<Record<number, boolean>>({});

  // State for task completion confirmation
  const [taskToComplete, setTaskToComplete] = useState<{id: number, completing: boolean} | null>(null);

  // Fetch all users for task assignment
  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Group users by role for the task assignment dropdown
  const groupedUsers = roles
    .sort((a, b) => roleHierarchy[a] - roleHierarchy[b])
    .reduce((acc, role) => {
      const usersInRole = allUsers.filter(u => u.role === role);
      if (usersInRole.length > 0) {
        acc[role] = usersInRole;
      }
      return acc;
    }, {} as Record<string, User[]>);

  // Group tasks by creator for display
  const tasksByCreator = tasks.reduce((acc, task) => {
    const creatorId = task.createdBy;
    if (!acc[creatorId]) {
      acc[creatorId] = [];
    }
    acc[creatorId].push(task);
    return acc;
  }, {} as Record<number, Task[]>);

  // Get creator's name helper function
  const getCreatorName = (creatorId: number) => {
    const creator = allUsers.find(u => u.id === creatorId);
    return creator ? creator.username : 'Unknown';
  };

  // Get assignee's name helper function
  const getAssigneeName = (assigneeId: number | null) => {
    if (!assigneeId) return 'Unassigned';
    const assignee = allUsers.find(u => u.id === assigneeId);
    return assignee ? assignee.username : 'Unknown';
  };

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
        createdAt: new Date().toISOString()
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

  const form = useForm({
    resolver: zodResolver(insertTaskSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "pending",
      priority: "Medium",
      startDate: new Date().toISOString().split('T')[0],
      finishDate: "",
      assignedTo: undefined,
      createdBy: user!.id,
      createdAt: new Date().toISOString()
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Tasks</h3>
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
              <form onSubmit={form.handleSubmit((data) => createTaskMutation.mutate(data))} className="space-y-4">
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
                          {Object.entries(groupedUsers).map(([role, users]) => (
                            <SelectGroup key={role}>
                              <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                                {role}s
                              </SelectLabel>
                              {users.map((user) => (
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

                <Button type="submit" className="w-full" disabled={createTaskMutation.isPending}>
                  Create Task
                </Button>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <Card>
        {Object.entries(tasksByCreator).map(([creatorId, creatorTasks]) => (
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
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {creatorTasks.map((task) => (
                    <TableRow key={task.id}>
                      <TableCell className="font-medium">{task.title}</TableCell>
                      <TableCell className="truncate max-w-[300px]">{task.description}</TableCell>
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
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CollapsibleContent>
          </Collapsible>
        ))}
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