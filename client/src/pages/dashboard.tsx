import { useAuth } from "@/hooks/use-auth";
import { useQuery } from "@tanstack/react-query";
import { User } from "@shared/schema";
import UserManagement from "@/components/user-management";
import HomeDashboard from "@/components/home-dashboard";
import TaskDashboard from "@/components/task-dashboard";
import MessagesComponent from "@/components/messages";
import ExchangeRateManager from "@/components/exchange-rate-manager";
import {
  Mail,
  Phone,
  ChevronDown,
  ChevronRight,
  Users
} from "lucide-react";
import { useLocation } from "wouter";
import { roles, roleHierarchy } from "@shared/roles";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { useState } from "react";
import Layout from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Dashboard() {
  const { user } = useAuth();
  const [location] = useLocation();

  const { data: subordinates = [] } = useQuery<User[]>({
    queryKey: ["/api/subordinates"],
  });

  const { data: allUsers = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
    enabled: user?.role === "Superuser", // Only fetch all users for superuser
  });

  // Determine which view to show based on the route
  const showUserManagement = location === "/users" && user?.role === "Superuser";
  const showTeam = location === "/team";
  const showMessages = location === "/messages";
  const showTasks = location === "/tasks";

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
    // Initialize with all sections closed
    return sortedRoles.reduce((acc, role) => {
      acc[role] = false; // Initial collapsed state
      return acc;
    }, {} as Record<string, boolean>);
  });

  return (
    <Layout>
      {showUserManagement ? (
        <UserManagement />
      ) : showTeam ? (
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
      ) : showMessages ? (
        <MessagesComponent />
      ) : showTasks ? (
        <TaskDashboard />
      ) : (
        <HomeDashboard />
      )}
    </Layout>
  );
}