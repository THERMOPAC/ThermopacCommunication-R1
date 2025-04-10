// Role hierarchy from lowest to highest
const roleHierarchy = ['Employee', 'Manager', 'Senior Manager', 'General Manager', 'Superuser'];

/**
 * Checks if a user can manage content based on their role and the minimum required role
 * @param userRole The user's role
 * @param minRole The minimum role required for the action
 * @returns boolean indicating if the user has permission
 */
export function canManageContent(userRole: string, minRole: string): boolean {
  const userRoleIndex = roleHierarchy.indexOf(userRole);
  const minRoleIndex = roleHierarchy.indexOf(minRole);
  
  // If role is not found, deny access
  if (userRoleIndex === -1 || minRoleIndex === -1) {
    return false;
  }
  
  // Check if user role is equal to or higher than the minimum required role
  return userRoleIndex >= minRoleIndex;
}