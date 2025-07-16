import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, getQueryFn } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { roles, roleHierarchy } from "@shared/roles";

interface ModulePermission {
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  isCustom: boolean;
}

interface User {
  id: number;
  username: string;
  role: string;
}

interface RolePermission {
  id: number;
  role: string;
  moduleName: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

const ModulePermissionsManagement: React.FC = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTab, setSelectedTab] = useState("users");
  const [selectedUser, setSelectedUser] = useState<number | null>(null);
  const [selectedModule, setSelectedModule] = useState<string | null>(null);
  
  // Fetch all modules
  const { data: modules, isLoading: isLoadingModules } = useQuery<string[], Error>({
    queryKey: ['/api/modules'],
    queryFn: getQueryFn({ on401: "throw" })
  });
  
  // Fetch all users
  const { data: users, isLoading: isLoadingUsers } = useQuery<User[], Error>({
    queryKey: ['/api/users'],
    queryFn: getQueryFn({ on401: "throw" })
  });

  // Group users by role with proper hierarchy
  const groupedUsers = useMemo(() => {
    if (!users || users.length === 0) return {} as Record<string, User[]>;
    
    return Array.from(roles)
      .sort((a, b) => roleHierarchy[a] - roleHierarchy[b])
      .reduce((acc: Record<string, User[]>, role) => {
        const usersInRole = users.filter(u => u.role === role);
        if (usersInRole.length > 0) {
          acc[role] = usersInRole;
        }
        return acc;
      }, {} as Record<string, User[]>);
  }, [users]);
  
  // Fetch role-based module permissions
  const { data: rolePermissions, isLoading: isLoadingRolePermissions } = useQuery<Record<string, Record<string, ModulePermission>>, Error>({
    queryKey: ['/api/role-module-permissions'],
    queryFn: getQueryFn({ on401: "throw" }),
    enabled: selectedTab === 'roles',
  });
  
  // Fetch user-specific module permissions
  const { 
    data: userPermissions = {}, // Provide empty object as default
    isLoading: isLoadingUserPermissions,
    refetch: refetchUserPermissions
  } = useQuery<Record<string, ModulePermission>, Error>({
    queryKey: ['/api/users', selectedUser, 'module-permissions'],
    queryFn: async ({ queryKey }) => {
      if (!selectedUser) return {};
      const response = await apiRequest("GET", `/api/users/${selectedUser}/module-permissions`);
      return response;
    },
    enabled: !!selectedUser && selectedTab === 'users',
  });
  
  // Set custom permissions for a user
  const updatePermissionMutation = useMutation<any, Error, { userId: number, moduleName: string, permissions: Partial<ModulePermission> }>({
    mutationFn: async ({ userId, moduleName, permissions }: { userId: number, moduleName: string, permissions: Partial<ModulePermission> }) => {
      // Create a proper permissions object to send to the API
      // Include isCustom field to ensure server knows this is a custom permission
      const permissionsToSend = {
        ...permissions,
        isCustom: true
      };
      
      // Using apiRequest to handle the response
      return await apiRequest('POST', `/api/users/${userId}/module-permissions/${moduleName}`, permissionsToSend);
    },
    // We're removing the optimistic update as it might be causing issues
    onSuccess: async (data, variables) => {
      // After successful update, get the latest permissions from server
      await refetchUserPermissions();
      
      toast({
        title: "Permissions updated",
        description: "The user's permissions have been successfully updated.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error updating permissions",
        description: error.message || "Failed to update permissions. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  // Reset permissions for a user
  const resetPermissionMutation = useMutation<any, Error, { userId: number, moduleName: string }>({
    mutationFn: async ({ userId, moduleName }: { userId: number, moduleName: string }) => {
      // apiRequest automatically handles response properly
      return await apiRequest('DELETE', `/api/users/${userId}/module-permissions/${moduleName}`);
    },
    onSuccess: async () => {
      // After successful reset, get the latest permissions from server
      await refetchUserPermissions();
      
      toast({
        title: "Permissions reset",
        description: "The user's permissions have been reset to role defaults.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error resetting permissions",
        description: error.message,
        variant: "destructive",
      });
    }
  });
  
  // Handle permission change
  const handlePermissionChange = (moduleName: string, permissionType: keyof ModulePermission, value: boolean) => {
    if (!selectedUser) return;
    
    // Get current permissions for this module or use default empty permission object
    const currentPermissions = userPermissions?.[moduleName] || {
      canView: false,
      canCreate: false,
      canEdit: false,
      canDelete: false,
      isCustom: false
    };
    
    // Create new permissions object with all current values plus the changed one
    const updatedPermissions = {
      ...currentPermissions,
      [permissionType]: value,
      isCustom: true // Make sure to mark as custom
    };
    
    // Send the complete permissions object
    updatePermissionMutation.mutate({
      userId: selectedUser,
      moduleName,
      permissions: updatedPermissions
    });
  };
  
  // Handle permission reset
  const handlePermissionReset = (moduleName: string) => {
    if (!selectedUser) return;
    
    resetPermissionMutation.mutate({
      userId: selectedUser,
      moduleName
    });
  };
  
  // Render loading state
  if (isLoadingModules || isLoadingUsers) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Module Permissions Management</CardTitle>
          <CardDescription>
            Manage user access to different modules of the application.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs value={selectedTab} onValueChange={setSelectedTab}>
            <TabsList className="mb-4">
              <TabsTrigger value="users">User Permissions</TabsTrigger>
              <TabsTrigger value="roles">Role Defaults</TabsTrigger>
            </TabsList>
            
            <TabsContent value="users" className="space-y-6">
              <div className="flex flex-col lg:flex-row gap-4">
                <div className="flex-1">
                  <Label htmlFor="user-select">Select User</Label>
                  <Select 
                    value={selectedUser?.toString() || ""} 
                    onValueChange={(value) => setSelectedUser(parseInt(value))}
                  >
                    <SelectTrigger id="user-select">
                      <SelectValue placeholder="Select a user" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(groupedUsers).map(([role, roleUsers]) => (
                        <SelectGroup key={role}>
                          <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                            {role}s
                          </SelectLabel>
                          {roleUsers.map((user: User) => (
                            <SelectItem key={user.id} value={user.id.toString()}>
                              {user.username}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div className="flex-1">
                  <Label htmlFor="module-select">Filter by Module</Label>
                  <Select 
                    value={selectedModule || "all_modules"} 
                    onValueChange={(value) => setSelectedModule(value === "all_modules" ? null : value)}
                  >
                    <SelectTrigger id="module-select">
                      <SelectValue placeholder="All modules" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all_modules">All modules</SelectItem>
                      {modules?.map((module: string) => (
                        <SelectItem key={module} value={module}>
                          {module}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {selectedUser && (
                <div className="space-y-6">
                  {/* Show special info for Superuser */}
                  {users?.find(u => u.id === selectedUser)?.role === 'Superuser' && (
                    <Alert className="bg-green-50 border-green-200">
                      <AlertCircle className="h-4 w-4 text-green-600" />
                      <AlertTitle className="text-green-800">Superuser Permissions</AlertTitle>
                      <AlertDescription className="text-green-700">
                        Superusers automatically have full access to all modules. Their permissions cannot be modified.
                      </AlertDescription>
                    </Alert>
                  )}
                  
                  {isLoadingUserPermissions ? (
                    <div className="flex justify-center my-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    modules
                      ?.filter((module: string) => !selectedModule || selectedModule === "all_modules" || module === selectedModule)
                      .map((module: string) => {
                        // Handle Superuser special case - Superusers have full access to all modules
                        let permission;
                        const selectedUserData = users?.find(u => u.id === selectedUser);
                        const isSuperUser = selectedUserData?.role === 'Superuser';
                        
                        if (isSuperUser) {
                          // For Superusers, display all permissions as enabled by default
                          permission = {
                            canView: true, 
                            canCreate: true,
                            canEdit: true,
                            canDelete: true,
                            isCustom: false
                          };
                        } else {
                          // For other users, get existing permission or create a default one
                          permission = userPermissions?.[module] || {
                            canView: false,
                            canCreate: false, 
                            canEdit: false,
                            canDelete: false,
                            isCustom: false
                          };
                        }
                        
                        return (
                          <Card key={module} className="overflow-hidden">
                            <CardHeader className="bg-muted/50 py-3">
                              <div className="flex justify-between items-center">
                                <CardTitle className="text-lg">{module}</CardTitle>
                                {isSuperUser ? (
                                  <Badge variant="outline" className="bg-green-100 text-green-800 border-green-200">
                                    Superuser
                                  </Badge>
                                ) : permission.isCustom ? (
                                  <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">
                                    Custom
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">
                                    Default
                                  </Badge>
                                )}
                              </div>
                            </CardHeader>
                            <CardContent className="pt-4">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="flex items-center space-x-2">
                                  <Checkbox 
                                    id={`${module}-view`} 
                                    checked={permission.canView}
                                    onCheckedChange={(checked) => 
                                      handlePermissionChange(module, 'canView', !!checked)
                                    }
                                    disabled={updatePermissionMutation.isPending || isSuperUser}
                                  />
                                  <Label htmlFor={`${module}-view`}>View</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox 
                                    id={`${module}-create`} 
                                    checked={permission.canCreate}
                                    onCheckedChange={(checked) => 
                                      handlePermissionChange(module, 'canCreate', !!checked)
                                    }
                                    disabled={updatePermissionMutation.isPending || isSuperUser}
                                  />
                                  <Label htmlFor={`${module}-create`}>Create</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox 
                                    id={`${module}-edit`} 
                                    checked={permission.canEdit}
                                    onCheckedChange={(checked) => 
                                      handlePermissionChange(module, 'canEdit', !!checked)
                                    }
                                    disabled={updatePermissionMutation.isPending || isSuperUser}
                                  />
                                  <Label htmlFor={`${module}-edit`}>Edit</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox 
                                    id={`${module}-delete`} 
                                    checked={permission.canDelete}
                                    onCheckedChange={(checked) => 
                                      handlePermissionChange(module, 'canDelete', !!checked)
                                    }
                                    disabled={updatePermissionMutation.isPending || isSuperUser}
                                  />
                                  <Label htmlFor={`${module}-delete`}>Delete</Label>
                                </div>
                              </div>
                              
                              {/* Reset button */}
                              <div className="flex justify-end mt-4">
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={() => handlePermissionReset(module)}
                                  disabled={resetPermissionMutation.isPending || !permission.isCustom || isSuperUser}
                                  className="text-xs"
                                >
                                  <RefreshCw className="h-3 w-3 mr-1" />
                                  Reset to defaults
                                </Button>
                              </div>
                            </CardContent>
                          </Card>
                        );
                      })
                  )}
                  
                  {modules?.length === 0 && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>No modules found</AlertTitle>
                      <AlertDescription>
                        There are no modules configured in the system.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
              
              {!selectedUser && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No user selected</AlertTitle>
                  <AlertDescription>
                    Please select a user to manage their module permissions.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
            
            <TabsContent value="roles" className="space-y-6">
              {isLoadingRolePermissions ? (
                <div className="flex justify-center my-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div>
                  <Alert className="mb-6">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>Read-only view</AlertTitle>
                    <AlertDescription>
                      Role-based default permissions can only be modified by database administrators.
                    </AlertDescription>
                  </Alert>
                  
                  {rolePermissions && Object.entries(rolePermissions).map(([role, modules]) => (
                    <div key={role} className="mb-8">
                      <h3 className="text-xl font-bold mb-4">{role}</h3>
                      <div className="grid gap-4">
                        {Object.entries(modules).map(([moduleName, permissions]) => (
                          <Card key={`${role}-${moduleName}`}>
                            <CardHeader className="py-3">
                              <CardTitle className="text-lg">{moduleName}</CardTitle>
                            </CardHeader>
                            <CardContent>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="flex items-center space-x-2">
                                  <Checkbox 
                                    id={`${role}-${moduleName}-view`} 
                                    checked={permissions.canView}
                                    disabled={true}
                                  />
                                  <Label htmlFor={`${role}-${moduleName}-view`}>View</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox 
                                    id={`${role}-${moduleName}-create`} 
                                    checked={permissions.canCreate}
                                    disabled={true}
                                  />
                                  <Label htmlFor={`${role}-${moduleName}-create`}>Create</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox 
                                    id={`${role}-${moduleName}-edit`} 
                                    checked={permissions.canEdit}
                                    disabled={true}
                                  />
                                  <Label htmlFor={`${role}-${moduleName}-edit`}>Edit</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                  <Checkbox 
                                    id={`${role}-${moduleName}-delete`} 
                                    checked={permissions.canDelete}
                                    disabled={true}
                                  />
                                  <Label htmlFor={`${role}-${moduleName}-delete`}>Delete</Label>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default ModulePermissionsManagement;