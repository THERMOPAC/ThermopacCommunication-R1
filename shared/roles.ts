export const roles = [
  "Superuser",
  "General Manager",
  "Senior Manager",
  "Manager",
  "Senior Executive",
  "Employee"
] as const;

export const roleHierarchy: Record<string, number> = {
  "Superuser": 0,
  "General Manager": 1,
  "Senior Manager": 2,
  "Manager": 3,
  "Senior Executive": 4,
  "Employee": 5
};

export function canManage(managerRole: string | undefined, subordinateRole: string | undefined): boolean {
  if (!managerRole || !subordinateRole || 
      roleHierarchy[managerRole] === undefined || roleHierarchy[subordinateRole] === undefined) {
    return false;
  }
  return roleHierarchy[managerRole] < roleHierarchy[subordinateRole];
}
