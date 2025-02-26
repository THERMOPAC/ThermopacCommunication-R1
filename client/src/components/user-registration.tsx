import { useAuth } from "@/hooks/use-auth";
import { roles } from "@shared/roles";

// Helper function to get allowed roles based on user's role
function getAllowedRoles(currentRole: string | undefined): string[] {
  if (!currentRole) {
    return ['Employee']; // Non-authenticated users can only register as Employee
  }

  const roleLevels = {
    'Superuser': 0,
    'General Manager': 1,
    'Senior Manager': 2,
    'Manager': 3,
    'Employee': 4
  };

  const currentLevel = roleLevels[currentRole];

  // Employee cannot create any roles
  if (currentRole === 'Employee') {
    return [];
  }

  // Return all roles of lower rank
  return roles.filter(role => roleLevels[role] > currentLevel);
}

// Use this in your registration form's role selection:
export function UserRegistrationForm() {
  const { user } = useAuth();
  const allowedRoles = getAllowedRoles(user?.role);

  return (
    <FormField
      control={form.control}
      name="role"
      render={({ field }) => (
        <FormItem>
          <FormLabel>Role</FormLabel>
          <Select onValueChange={field.onChange} defaultValue={field.value}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select role" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {allowedRoles.map((role) => (
                <SelectItem key={role} value={role}>
                  {role}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
