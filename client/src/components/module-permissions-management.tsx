import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest, getQueryFn } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, AlertCircle, CheckCircle2, RefreshCw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

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
    queryFn: getQueryFn()
  });
  
  // Fetch all users
  const { data: users, isLoading: isLoadingUsers } = useQuery<User[], Error>({
    queryKey: ['/api/users'],
    queryFn: getQueryFn()
  });
  
  // Fetch role-based module permissions
  const { data: rolePermissions, isLoading: isLoadingRolePermissions } = useQuery<Record<string, Record<string, ModulePermission>>, Error>({
    queryKey: ['/api/role-module-permissions'],
    queryFn: getQueryFn(),
    enabled: selectedTab === 'roles',
  });
  
  // Fetch user-specific module permissions
  const { data: userPermissions, isLoading: isLoadingUserPermissions } = useQuery<Record<string, ModulePermission>, Error>({
    queryKey: ['/api/users', selectedUser, 'module-permissions'],
    queryFn: async () => {
      return await getQueryFn()({ queryKey: [`/api/users/${selectedUser}/module-permissions`] });
    },
    enabled: !!selectedUser && selectedTab === 'users',
  });
  
  // Set custom permissions for a user
  const updatePermissionMutation = useMutation<any, Error, { userId: number, moduleName: string, permissions: Partial<ModulePermission> }>({
    mutationFn: async ({ userId, moduleName, permissions }: { userId: number, moduleName: string, permissions: Partial<ModulePermission> }) => {
      // apiRequest automatically handles response properly
      return await apiRequest('POST', `/api/users/${userId}/module-permissions/${moduleName}`, permissions);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', selectedUser, 'module-permissions'] });
      toast({
        title: "Permissions updated",
        description: "The user's permissions have been successfully updated.",
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Error updating permissions",
        description: error.message,
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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/users', selectedUser, 'module-permissions'] });
      toast({
        title: "Permissions reset",
        description: "The user's permissions have been reset to role defaults.",
      });
    },
    onError: (error: Error) => {
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
    
    updatePermissionMutation.mutate({
      userId: selectedUser,
      moduleName,
      permissions: {
        [permissionType]: value
      }
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
                      {/* Superusers */}
                      <SelectItem value="superusers_header" disabled className="font-semibold text-primary">
                        Superusers
                      </SelectItem>
                      {users?.filter(user => user.role === 'Superuser').map((user: User) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.username}
                        </SelectItem>
                      ))}
                      
                      {/* General Managers */}
                      <SelectItem value="general_managers_header" disabled className="font-semibold text-primary mt-2">
                        General Managers
                      </SelectItem>
                      {users?.filter(user => user.role === 'General Manager').map((user: User) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.username}
                        </SelectItem>
                      ))}
                      
                      {/* Senior Managers */}
                      <SelectItem value="senior_managers_header" disabled className="font-semibold text-primary mt-2">
                        Senior Managers
                      </SelectItem>
                      {users?.filter(user => user.role === 'Senior Manager').map((user: User) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.username}
                        </SelectItem>
                      ))}
                      
                      {/* Managers */}
                      <SelectItem value="managers_header" disabled className="font-semibold text-primary mt-2">
                        Managers
                      </SelectItem>
                      {users?.filter(user => user.role === 'Manager').map((user: User) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.username}
                        </SelectItem>
                      ))}
                      
                      {/* Employees */}
                      <SelectItem value="employees_header" disabled className="font-semibold text-primary mt-2">
                        Employees
                      </SelectItem>
                      {users?.filter(user => user.role === 'Employee').map((user: User) => (
                        <SelectItem key={user.id} value={user.id.toString()}>
                          {user.username}
                        </SelectItem>
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
                  {isLoadingUserPermissions ? (
                    <div className="flex justify-center my-8">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    modules
                      ?.filter((module: string) => !selectedModule || selectedModule === "all_modules" || module === selectedModule)
                      .map((module: string) => {
                        const permission = userPermissions?.[module];
                        if (!permission) return null;
                        
                        return (
                          <Card key={module} className="overflow-hidden">
                            <CardHeader className="bg-muted/50 py-3">
                              <div className="flex justify-between items-center">
                                <CardTitle className="text-lg">{module}</CardTitle>
                                {permission.isCustom ? (
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
                                  />
                                  <Label htmlFor={`${module}-delete`}>Delete</Label>
                                </div>
                              </div>
                              
                              {permission.isCustom && (
                                <div className="mt-4 text-right">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => handlePermissionReset(module)}
                                    className="gap-1"
                                  >
                                    <RefreshCw className="h-4 w-4" />
                                    Reset to Default
                                  </Button>
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        );
                      })
                  )}
                
                  {!isLoadingUserPermissions && modules?.length > 0 && !Object.keys(userPermissions || {}).length && (
                    <Alert>
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>No permissions found</AlertTitle>
                      <AlertDescription>
                        The selected user has no customized permissions.
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
                    Please select a user to view and manage their permissions.
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
                <div className="space-y-8">
                  {['Superuser', 'General Manager', 'Senior Manager', 'Manager', 'Employee'].map(role => (
                    <div key={role} className="space-y-4">
                      <h3 className="text-xl font-medium">{role}</h3>
                      <Separator />
                      
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {modules
                          ?.filter((module: string) => !selectedModule || selectedModule === "all_modules" || module === selectedModule)
                          .map((module: string) => {
                            const permission = rolePermissions?.find(
                              (p: RolePermission) => p.moduleName === module && p.role === role
                            );
                            
                            return (
                              <Card key={`${role}-${module}`} className="overflow-hidden">
                                <CardHeader className="bg-muted/50 py-3">
                                  <CardTitle className="text-lg">{module}</CardTitle>
                                </CardHeader>
                                <CardContent className="pt-4">
                                  <div className="grid grid-cols-2 gap-3">
                                    <div className="flex items-center space-x-2">
                                      <div className={`w-4 h-4 rounded ${permission?.canView ? 'bg-green-500' : 'bg-red-500'}`} />
                                      <span>View: {permission?.canView ? 'Yes' : 'No'}</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <div className={`w-4 h-4 rounded ${permission?.canCreate ? 'bg-green-500' : 'bg-red-500'}`} />
                                      <span>Create: {permission?.canCreate ? 'Yes' : 'No'}</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <div className={`w-4 h-4 rounded ${permission?.canEdit ? 'bg-green-500' : 'bg-red-500'}`} />
                                      <span>Edit: {permission?.canEdit ? 'Yes' : 'No'}</span>
                                    </div>
                                    <div className="flex items-center space-x-2">
                                      <div className={`w-4 h-4 rounded ${permission?.canDelete ? 'bg-green-500' : 'bg-red-500'}`} />
                                      <span>Delete: {permission?.canDelete ? 'Yes' : 'No'}</span>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            );
                          })
                        }
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {!isLoadingRolePermissions && (!rolePermissions || rolePermissions.length === 0) && (
                <Alert>
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>No role permissions defined</AlertTitle>
                  <AlertDescription>
                    Role-based permissions have not been configured.
                  </AlertDescription>
                </Alert>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default ModulePermissionsManagement;