import { useQuery } from "@tanstack/react-query";

// GET /api/departments — public endpoint (no auth, C1).
// Returns only active departments, sorted by sort_order.
//
// Amendment A (approved 2026-05-23):
//   isError + filter consumers  → departments = DEPT_CLIENT_FALLBACK, visible warning shown
//   isError + form consumers    → department Select disabled, submit blocked, no fallback shown
//   isLoading + any consumer    → departments = [], Select disabled
//
const DEPT_CLIENT_FALLBACK: string[] = [
  "Accounts", "Administration", "After Sales", "Design", "Marketing",
  "Production", "Projects", "Purchase", "Quality Control", "Stores",
];

export interface UseDepartmentsResult {
  departments: string[];
  isLoading: boolean;
  isError: boolean;
}

export function useDepartments(): UseDepartmentsResult {
  const { data, isLoading, isError } = useQuery<
    { id: number; name: string; code: string | null; sortOrder: number }[]
  >({
    queryKey: ["/api/departments"],
    staleTime: 5 * 60 * 1000,
    gcTime:    30 * 60 * 1000,
  });

  return {
    departments: isError ? DEPT_CLIENT_FALLBACK : (data ?? []).map(d => d.name),
    isLoading,
    isError,
  };
}
