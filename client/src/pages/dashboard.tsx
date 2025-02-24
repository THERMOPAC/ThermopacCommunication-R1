import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Task, User } from "@shared/schema";
import TaskList from "@/components/task-list";
import UserProfile from "@/components/user-profile";
import { Separator } from "@/components/ui/separator";

export default function Dashboard() {
  const { user } = useAuth();
  
  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: subordinates = [] } = useQuery<User[]>({
    queryKey: ["/api/subordinates"],
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="grid lg:grid-cols-[300px_1fr] gap-8">
          {/* Sidebar */}
          <div className="space-y-6">
            <UserProfile user={user!} />
            <Separator />
            <div>
              <h3 className="font-semibold mb-4">Team Members</h3>
              <div className="space-y-2">
                {subordinates.map((subordinate) => (
                  <div 
                    key={subordinate.id}
                    className="p-3 bg-card rounded-lg flex items-center gap-3"
                  >
                    <div>
                      <p className="font-medium">{subordinate.username}</p>
                      <p className="text-sm text-muted-foreground">{subordinate.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div>
            <h2 className="text-3xl font-bold mb-8">Task Management</h2>
            <TaskList tasks={tasks} subordinates={subordinates} />
          </div>
        </div>
      </div>
    </div>
  );
}
