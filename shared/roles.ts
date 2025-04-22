export const roles = [
  "Superuser",
  "General Manager",
  "Senior Manager",
  "Manager", 
  "Employee"
] as const;

export const roleHierarchy: Record<string, number> = {
  "Superuser": 0,
  "General Manager": 1,
  "Senior Manager": 2,
  "Manager": 3,
  "Employee": 4
};

export function canManage(managerRole: string | undefined, subordinateRole: string | undefined): boolean {
  // If either role is missing or doesn't exist in the hierarchy, default to false
  if (!managerRole || !subordinateRole || 
      roleHierarchy[managerRole] === undefined || roleHierarchy[subordinateRole] === undefined) {
    return false;
  }
  return roleHierarchy[managerRole] < roleHierarchy[subordinateRole];
}
