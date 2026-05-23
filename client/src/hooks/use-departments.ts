import { useQuery } from "@tanstack/react-query";

// GET /api/departments is a public endpoint (no auth required — C1).
// Returns only active departments sorted by sort_order.
// Hook returns names only (string[]) for drop-in compatibility with existing dept lists.
export function useDepartments(): string[] {
  const { data } = useQuery<{ id: number; name: string; code: string | null; sortOrder: number }[]>({
    queryKey: ["/api/departments"],
    staleTime: 5 * 60 * 1000,  // 5 min — departments are stable reference data
    gcTime:    30 * 60 * 1000, // 30 min garbage-collect time
  });
  return (data ?? []).map(d => d.name);
}
