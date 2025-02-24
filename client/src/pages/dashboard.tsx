import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Task, User } from "@shared/schema";
import TaskList from "@/components/task-list";
import UserProfile from "@/components/user-profile";
import UserManagement from "@/components/user-management";
import { Separator } from "@/components/ui/separator";
import { 
  LayoutDashboard, 
  Users, 
  CheckSquare, 
  MessageSquare,
  UserCog,
  User as UserIcon
} from "lucide-react";
import { Link, useLocation } from "wouter";

export default function Dashboard() {
  const { user } = useAuth();
  const [location] = useLocation();

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: subordinates = [] } = useQuery<User[]>({
    queryKey: ["/api/subordinates"],
  });

  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", href: "/" },
    { icon: CheckSquare, label: "Tasks", href: "/tasks" },
    { icon: Users, label: "Team", href: "/team" },
    { icon: MessageSquare, label: "Messages", href: "/messages" },
    { icon: UserIcon, label: "Profile", href: "/profile" },
    ...(user?.role === "Superuser" ? [
      { icon: UserCog, label: "User Management", href: "/users" }
    ] : [])
  ];

  // Show user management when on /users route and user is superuser
  const showUserManagement = location === "/users" && user?.role === "Superuser";

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="p-6">
          <h2 className="text-lg font-semibold mb-4">THERMOPAC</h2>
          <UserProfile user={user!} />
        </div>
        <Separator />
        <nav className="flex-1 p-4">
          <ul className="space-y-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              return (
                <li key={item.href}>
                  <Link href={item.href}>
                    <button 
                      className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors w-full text-left
                        ${isActive 
                          ? 'bg-primary text-primary-foreground' 
                          : 'hover:bg-accent hover:text-accent-foreground'
                        }`}
                    >
                      <Icon className="h-4 w-4" />
                      <span>{item.label}</span>
                    </button>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-8">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-8">
            <h1 className="text-3xl font-bold">Welcome, {user!.username}</h1>
          </div>

          <div className="grid gap-6">
            {showUserManagement ? (
              <UserManagement />
            ) : (
              <>
                {/* Tasks Section */}
                <section>
                  <TaskList tasks={tasks} subordinates={subordinates} />
                </section>

                {/* Team Section */}
                <section className="bg-card rounded-lg p-6">
                  <h2 className="text-xl font-semibold mb-4">Your Team</h2>
                  <div className="grid gap-4">
                    {subordinates.map((subordinate) => (
                      <div 
                        key={subordinate.id}
                        className="flex items-center gap-4 p-4 bg-background rounded-lg"
                      >
                        <div>
                          <p className="font-medium">{subordinate.username}</p>
                          <p className="text-sm text-muted-foreground">{subordinate.role}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}