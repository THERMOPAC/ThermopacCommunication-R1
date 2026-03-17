import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import RecurringTaskManager from "@/components/recurring-task-manager";
import RecurringTaskList from "@/components/recurring-task-list";
import Layout from "@/components/layout";
import { DueDateFilter } from "@/components/due-date-filter";
import { User, RecurringTask } from "@shared/schema";
import { Loader2, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { apiRequest, getQueryFn } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

export default function RecurringTasksPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("patterns");
  const [dueDateFilter, setDueDateFilter] = useState<number>(30);
  const [assignedToFilter, setAssignedToFilter] = useState<string>("all");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch user permissions
  const { data: userPermissions = {} } = useQuery({
    queryKey: ['/api/my-permissions'],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: !!user,
  });

  // Process recurring patterns mutation
  const processPatternsMutation = useMutation({
    mutationFn: async () => {
      try {
        // The apiRequest function already handles JSON parsing
        const response = await apiRequest("POST", "/api/process-recurring-patterns");
        console.log("Process response:", response);
        return response || {};
      } catch (error) {
        console.error("Error in processPatternsMutation:", error);
        throw error;
      }
    },
    onSuccess: (data) => {
      const tasksGenerated = data?.tasksGenerated || 0;
      toast({
        title: "Success",
        description: `Recurring patterns processed successfully. ${tasksGenerated} tasks were generated.`,
        variant: "default",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/recurring-tasks"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: `Failed to process recurring patterns: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Fetch subordinates for task assignment
  const { data: subordinates = [], isLoading: subordinatesLoading } = useQuery<User[]>({
    queryKey: ["/api/subordinates"],
    queryFn: async () => {
      const res = await fetch(`/api/subordinates?managerId=${user?.id}`);
      if (!res.ok) {
        throw new Error("Failed to fetch subordinates");
      }
      return res.json();
    },
    enabled: !!user,
  });

  // Fetch all users for assignment dropdown
  const { data: assignableUsers = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) {
        throw new Error("Failed to fetch users");
      }
      return res.json();
    },
    enabled: !!user,
  });

  // Fetch recurring tasks
  const { data: recurringTasks = [], isLoading: tasksLoading } = useQuery<RecurringTask[]>({
    queryKey: ["/api/recurring-tasks"],
    enabled: !!user,
  });

  // All users can assign tasks to anyone
  const getUsers = () => {
    if (!user) return [];
    
    if (assignableUsers.length > 0) {
      return assignableUsers;
    }
    
    // Fallback: use subordinates plus themselves
    const userList = [...subordinates];
    if (user) {
      if (!userList.some(u => u.id === user.id)) {
        userList.push(user);
      }
    }
    return userList;
  };

  const isLoading = subordinatesLoading || usersLoading || tasksLoading;

  // Check if user has permission to process recurring patterns
  const canProcessPatterns = userPermissions?.["Task Management"]?.canEdit || user?.role === "Superuser";

  return (
    <Layout>
      <div className="container mx-auto py-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold pl-4">Recurring Tasks Management</h1>
          {canProcessPatterns && (
            <Button 
              onClick={() => processPatternsMutation.mutate()}
              disabled={processPatternsMutation.isPending}
              className="flex items-center gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${processPatternsMutation.isPending ? 'animate-spin' : ''}`} />
              Process Recurring Patterns
            </Button>
          )}
        </div>
        
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="patterns" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="mb-6">
              <TabsTrigger value="patterns">Recurring Patterns</TabsTrigger>
              <TabsTrigger value="tasks">Recurring Tasks</TabsTrigger>
            </TabsList>
            <TabsContent value="patterns">
              <RecurringTaskManager users={getUsers()} />
            </TabsContent>
            <TabsContent value="tasks">
              <div className="mb-4">
                <div className="flex flex-wrap gap-4 items-start">
                  <div className="flex-grow">
                    <h3 className="text-lg font-semibold mb-2">Recurring Tasks</h3>
                    <p className="text-sm text-muted-foreground">
                      View and manage tasks that recur on a regular schedule
                    </p>
                  </div>
                  <div className="w-48">
                    <Select value={assignedToFilter} onValueChange={setAssignedToFilter}>
                      <SelectTrigger>
                        <SelectValue placeholder="Assigned To" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Users</SelectItem>
                        {getUsers()
                          .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
                          .map(u => (
                            <SelectItem key={u.id} value={String(u.id)}>
                              {u.firstName} {u.lastName}
                            </SelectItem>
                          ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="w-64">
                    <DueDateFilter 
                      defaultValue={dueDateFilter} 
                      onChange={(days) => setDueDateFilter(days || 30)} 
                    />
                  </div>
                </div>
              </div>
              <RecurringTaskList 
                recurringTasks={recurringTasks.filter(task => {
                  const today = new Date();
                  const dueDate = new Date(task.dueDate);
                  const daysDifference = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                  const dueDateMatch = daysDifference <= dueDateFilter || daysDifference <= 0;
                  const assigneeMatch = assignedToFilter === "all" || String(task.assignedTo) === assignedToFilter;
                  return dueDateMatch && assigneeMatch;
                })} 
                subordinates={subordinates} 
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </Layout>
  );
}