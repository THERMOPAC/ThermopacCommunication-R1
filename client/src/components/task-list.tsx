import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Task, User, insertTaskSchema } from "@shared/schema";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card } from "@/components/ui/card";
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
import { Plus } from "lucide-react";
import { roles, roleHierarchy } from "@shared/roles";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

type TaskListProps = {
  tasks: Task[];
  subordinates: User[];
};

export default function TaskList({ tasks, subordinates }: TaskListProps) {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const { toast } = useToast();

  // Debug log to verify tasks data
  console.log('Current tasks:', tasks);

  // Get unique list of users involved in tasks
  const taskUserIds = new Set([
    ...tasks.map(t => t.assignedTo),
    ...tasks.map(t => t.createdBy)
  ].filter(Boolean));

  // Fetch reporting hierarchy data.  Note: The original code doesn't fetch this, so we're assuming an API endpoint exists.
  const { data: reportingSubordinates = [] } = useQuery<User[]>({
    queryKey: ["/api/subordinates"],
  });

  // Check if the current user is viewing tasks as a manager
  const isManager = reportingSubordinates.length > 0;

  // Add filters state
  const [filters, setFilters] = useState({
    showAll: true,
    showAssigned: false,
    showCreated: false,
    showSubordinates: false
  });

  // Filter tasks based on user role and filters
  const filteredTasks = tasks.filter(task => {
    if (filters.showAll) return true;
    if (filters.showAssigned && task.assignedTo === user!.id) return true;
    if (filters.showCreated && task.createdBy === user!.id) return true;
    if (filters.showSubordinates && reportingSubordinates.some(s => s.id === task.assignedTo)) return true;
    return false;
  });

  // Fetch all users for task assignment
  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Group users by role
  const groupedUsers = roles
    .sort((a, b) => roleHierarchy[a] - roleHierarchy[b])
    .reduce((acc, role) => {
      const usersInRole = allUsers.filter(u => u.role === role);
      if (usersInRole.length > 0) {
        acc[role] = usersInRole;
      }
      return acc;
    }, {} as Record<string, User[]>);

  const createTaskMutation = useMutation({
    mutationFn: async (data: Omit<Task, "id">) => {
      // Add createdAt field
      const taskData = {
        ...data,
        createdAt: new Date().toISOString()
      };
      const res = await apiRequest("POST", "/api/tasks", taskData);
      return res.json();
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
      startDate: new Date().toISOString().split('T')[0], // Today's date
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

      <Card className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[500px]">Title</TableHead>
              <TableHead className="w-[500px]">Description</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Start Date</TableHead>
              <TableHead>Due Date</TableHead>
              <TableHead>Assigned To</TableHead>
              <TableHead>Assigned By</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredTasks && filteredTasks.length > 0 ? (
              filteredTasks.map((task) => (
                <TableRow key={task.id}>
                  <TableCell className="font-medium w-[500px]">{task.title}</TableCell>
                  <TableCell className="w-[500px] truncate">{task.description}</TableCell>
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
                  <TableCell>
                    {allUsers.find(u => u.id === task.assignedTo)?.username || 'Unassigned'}
                  </TableCell>
                  <TableCell>
                    {allUsers.find(u => u.id === task.createdBy)?.username}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {task.status}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-4">
                  No tasks found
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}