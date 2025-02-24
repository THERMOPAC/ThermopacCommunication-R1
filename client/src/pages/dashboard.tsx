import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { Task, User } from "@shared/schema";
import TaskList from "@/components/task-list";
import UserProfile from "@/components/user-profile";
import UserManagement from "@/components/user-management";
import { Separator } from "@/components/ui/separator";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Users,
  CheckSquare,
  MessageSquare,
  UserCog,
  User as UserIcon,
  Mail,
  Phone,
  ChevronDown,
  ChevronRight
} from "lucide-react";
import { Link, useLocation } from "wouter";
import { roles, roleHierarchy } from "@shared/roles";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";

export default function Dashboard() {
  const { user } = useAuth();
  const [location] = useLocation();

  const { data: tasks = [] } = useQuery<Task[]>({
    queryKey: ["/api/tasks"],
  });

  const { data: subordinates = [] } = useQuery<User[]>({
    queryKey: ["/api/subordinates"],
  });

  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: user?.role === "Superuser", // Only fetch all users for superuser
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

  // Show team view when on /team route
  const showTeam = location === "/team";

  // Helper function to get reporting manager name
  const getManagerName = (managerId: number | null) => {
    const manager = allUsers.find(u => u.id === managerId);
    return manager ? manager.username : 'N/A';
  };

  // Sort roles by hierarchy
  const sortedRoles = [...roles].sort((a, b) => roleHierarchy[a] - roleHierarchy[b]);

  // Group users by role
  const groupedUsers = sortedRoles.reduce((acc, role) => {
    const usersInRole = (user?.role === "Superuser" ? allUsers : subordinates)
      .filter(u => u.role === role)
      .sort((a, b) => a.username.localeCompare(b.username));
    if (usersInRole.length > 0) {
      acc[role] = usersInRole;
    }
    return acc;
  }, {} as Record<string, User[]>);

  // State for collapsible sections
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    // Initialize with all sections open
    return sortedRoles.reduce((acc, role) => {
      acc[role] = true;
      return acc;
    }, {} as Record<string, boolean>);
  });

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
            ) : showTeam ? (
              // Team View
              <section>
                <Card>
                  <CardHeader>
                    <CardTitle>Organization Structure</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid gap-8">
                      {/* Display reporting manager if not superuser */}
                      {user?.role !== "Superuser" && user?.reportingManagerId && (
                        <div>
                          <h3 className="text-sm font-medium text-muted-foreground mb-3">Your Manager</h3>
                          <Card className="bg-muted">
                            <CardContent className="p-4">
                              <div className="flex items-center justify-between">
                                <div>
                                  <p className="font-medium">{getManagerName(user.reportingManagerId)}</p>
                                  <p className="text-sm text-muted-foreground">Reporting Manager</p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      )}

                      {/* Team Members by Role */}
                      {sortedRoles.map(role => {
                        const usersInRole = groupedUsers[role];
                        if (!usersInRole) return null;

                        return (
                          <Collapsible
                            key={role}
                            open={openSections[role]}
                            onOpenChange={(isOpen) => {
                              setOpenSections(prev => ({
                                ...prev,
                                [role]: isOpen
                              }));
                            }}
                          >
                            <CollapsibleTrigger className="flex items-center gap-2 w-full">
                              <div className="flex items-center gap-2 text-lg font-semibold">
                                {openSections[role] ? (
                                  <ChevronDown className="h-5 w-5" />
                                ) : (
                                  <ChevronRight className="h-5 w-5" />
                                )}
                                <Users className="h-5 w-5" />
                                {role}s
                                <Badge variant="secondary" className="ml-2">
                                  {usersInRole.length}
                                </Badge>
                              </div>
                            </CollapsibleTrigger>
                            <CollapsibleContent className="mt-4">
                              <div className="grid gap-4 pl-9">
                                {usersInRole.map((member) => (
                                  <Card key={member.id}>
                                    <CardContent className="p-4">
                                      <div className="flex flex-col gap-2">
                                        <div className="flex justify-between items-start">
                                          <div>
                                            <p className="font-medium">{member.username}</p>
                                            <Badge variant="outline" className="mt-1">
                                              {member.role}
                                            </Badge>
                                          </div>
                                          {member.reportingManagerId && member.reportingManagerId !== member.id && (
                                            <p className="text-sm text-muted-foreground">
                                              Reports to: {getManagerName(member.reportingManagerId)}
                                            </p>
                                          )}
                                        </div>
                                        <div className="flex gap-4 mt-2 text-sm text-muted-foreground">
                                          <div className="flex items-center gap-1">
                                            <Mail className="h-4 w-4" />
                                            {member.email}
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <Phone className="h-4 w-4" />
                                            {member.countryCode} {member.mobileNumber}
                                          </div>
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </section>
            ) : (
              <>
                {/* Tasks Section */}
                <section>
                  <TaskList tasks={tasks} subordinates={subordinates} />
                </section>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}