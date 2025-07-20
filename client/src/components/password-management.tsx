import { useState } from "react";
import { User } from "@shared/schema";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage, FormDescription } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Search, ShieldAlert, KeyRound, Check, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { roles, roleHierarchy } from "@shared/roles";

const passwordSchema = z.object({
  newPassword: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(100, "Password is too long")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
    .regex(/[^A-Za-z0-9]/, "Password must contain at least one special character"),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type PasswordChangeForm = z.infer<typeof passwordSchema>;

export function PasswordManagement() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterRole, setFilterRole] = useState<string | null>(null);

  // Fetch all users
  const { data: users = [], isLoading: isLoadingUsers } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  const form = useForm<PasswordChangeForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      newPassword: "",
      confirmPassword: "",
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async ({ userId, newPassword }: { userId: number; newPassword: string }) => {
      const res = await apiRequest("POST", "/api/admin/change-password", {
        userId,
        newPassword,
      });
      return res;
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: `Password has been updated for ${selectedUser?.username}`,
      });
      setSelectedUser(null);
      form.reset();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Filter users based on search query and role filter
  const filteredUsers = users.filter((user) => {
    const matchesSearch = searchQuery 
      ? user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
        user.email.toLowerCase().includes(searchQuery.toLowerCase())
      : true;
    
    const matchesRole = filterRole 
      ? user.role === filterRole
      : true;
    
    return matchesSearch && matchesRole;
  });

  // Password strength indicator
  const getPasswordStrength = (password: string) => {
    if (!password) return { strength: 0, label: "None" };
    
    let strength = 0;
    if (password.length >= 8) strength += 1;
    if (/[A-Z]/.test(password)) strength += 1;
    if (/[a-z]/.test(password)) strength += 1;
    if (/[0-9]/.test(password)) strength += 1;
    if (/[^A-Za-z0-9]/.test(password)) strength += 1;
    
    const labels = ["Very Weak", "Weak", "Fair", "Good", "Strong", "Very Strong"];
    return { 
      strength, 
      label: labels[strength],
      color: ["bg-red-500", "bg-orange-500", "bg-yellow-500", "bg-blue-500", "bg-green-500", "bg-purple-500"][strength]
    };
  };

  // Get strength of current password
  const currentPassword = form.watch("newPassword") || "";
  const strength = getPasswordStrength(currentPassword);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-semibold">User Password Management</h3>
          <p className="text-muted-foreground">Manage password security for all users</p>
        </div>
        <ShieldAlert className="h-8 w-8 text-primary" />
      </div>

      <div className="flex items-center space-x-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search users..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex space-x-2">
          {roles.map((role) => (
            <Button
              key={role}
              variant={filterRole === role ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterRole(filterRole === role ? null : role)}
            >
              {role}
            </Button>
          ))}
        </div>
      </div>

      {isLoadingUsers ? (
        <div className="flex justify-center my-8">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filteredUsers.map((user) => (
            <Card key={user.id} className="overflow-hidden">
              <CardContent className="p-4">
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{user.username}</p>
                      <p className="text-sm text-muted-foreground">{user.email}</p>
                    </div>
                    <Badge variant="outline">{user.role}</Badge>
                  </div>
                  <div className="mt-4">
                    <Button 
                      onClick={() => setSelectedUser(user)}
                      className="w-full"
                      variant="outline"
                    >
                      <KeyRound className="mr-2 h-4 w-4" />
                      Change Password
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={selectedUser !== null} onOpenChange={(open) => !open && setSelectedUser(null)}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Change Password for {selectedUser?.username}</DialogTitle>
            <DialogDescription>
              Create a secure password that meets all the requirements below.
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit((data) => {
                if (selectedUser) {
                  changePasswordMutation.mutate({
                    userId: selectedUser.id,
                    newPassword: data.newPassword,
                  });
                }
              })}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>New Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormDescription>
                      <div className="mt-1">
                        <div className="flex items-center mb-1">
                          <span className="text-sm mr-2">Strength:</span>
                          <span className="text-sm font-medium">{strength.label}</span>
                        </div>
                        <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className={`h-full ${strength.color}`} 
                            style={{ width: `${(strength.strength / 5) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                      <ul className="text-xs space-y-1 mt-2">
                        <li className={`flex items-center ${/[A-Z]/.test(currentPassword) ? 'text-green-600' : 'text-gray-500'}`}>
                          {/[A-Z]/.test(currentPassword) ? <Check className="h-3 w-3 mr-1" /> : '•'} At least one uppercase letter
                        </li>
                        <li className={`flex items-center ${/[a-z]/.test(currentPassword) ? 'text-green-600' : 'text-gray-500'}`}>
                          {/[a-z]/.test(currentPassword) ? <Check className="h-3 w-3 mr-1" /> : '•'} At least one lowercase letter
                        </li>
                        <li className={`flex items-center ${/[0-9]/.test(currentPassword) ? 'text-green-600' : 'text-gray-500'}`}>
                          {/[0-9]/.test(currentPassword) ? <Check className="h-3 w-3 mr-1" /> : '•'} At least one number
                        </li>
                        <li className={`flex items-center ${/[^A-Za-z0-9]/.test(currentPassword) ? 'text-green-600' : 'text-gray-500'}`}>
                          {/[^A-Za-z0-9]/.test(currentPassword) ? <Check className="h-3 w-3 mr-1" /> : '•'} At least one special character
                        </li>
                        <li className={`flex items-center ${currentPassword.length >= 8 ? 'text-green-600' : 'text-gray-500'}`}>
                          {currentPassword.length >= 8 ? <Check className="h-3 w-3 mr-1" /> : '•'} Minimum 8 characters
                        </li>
                      </ul>
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirm Password</FormLabel>
                    <FormControl>
                      <Input type="password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button
                type="submit"
                className="w-full"
                disabled={changePasswordMutation.isPending}
              >
                {changePasswordMutation.isPending ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Updating...
                  </>
                ) : (
                  "Update Password"
                )}
              </Button>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
