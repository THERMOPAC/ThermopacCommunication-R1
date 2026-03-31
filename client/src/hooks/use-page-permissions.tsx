import { useQuery } from "@tanstack/react-query";

export function usePagePermissions() {
  const { data: pagePermissions = {}, isLoading } = useQuery<Record<string, boolean>>({
    queryKey: ["/api/my-page-permissions"],
    queryFn: async () => {
      const response = await fetch("/api/my-page-permissions");
      if (!response.ok) return {};
      return response.json();
    },
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const hasPageAccess = (pageKey: string): boolean => {
    if (isLoading) return true;
    return pagePermissions[pageKey] !== false;
  };

  return { pagePermissions, hasPageAccess, isLoading };
}
