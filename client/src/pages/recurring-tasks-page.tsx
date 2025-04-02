import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/hooks/use-auth";
import RecurringTaskManager from "@/components/recurring-task-manager";
import Layout from "@/components/layout";
import { User } from "@shared/schema";
import { Loader2 } from "lucide-react";

export default function RecurringTasksPage() {
  const { user } = useAuth();

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

  // Fetch users based on role permissions
  const { data: assignableUsers = [], isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await fetch("/api/users");
      if (!res.ok) {
        throw new Error("Failed to fetch users");
      }
      return res.json();
    },
    enabled: !!user && (user.role === "Superuser" || user.role === "General Manager"),
  });

  // Combine user lists based on role
  const getUsers = () => {
    if (!user) return [];
    
    // For Superuser and General Manager, use all users
    if (user.role === "Superuser" || user.role === "General Manager") {
      return assignableUsers;
    }
    
    // For other roles, use subordinates plus themselves
    const userList = [...subordinates];
    if (user) {
      // Check if the user is already in the list
      if (!userList.some(u => u.id === user.id)) {
        userList.push(user);
      }
    }
    return userList;
  };

  const isLoading = subordinatesLoading || usersLoading;

  return (
    <Layout>
      <div className="container mx-auto py-6">
        <h1 className="text-3xl font-bold mb-6">Recurring Tasks Management</h1>
        
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <RecurringTaskManager users={getUsers()} />
        )}
      </div>
    </Layout>
  );
}