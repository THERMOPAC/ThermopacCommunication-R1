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

export function canManage(managerRole: string, subordinateRole: string): boolean {
  return roleHierarchy[managerRole] < roleHierarchy[subordinateRole];
}
