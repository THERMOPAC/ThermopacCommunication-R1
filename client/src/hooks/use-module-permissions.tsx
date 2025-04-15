import { useQuery } from "@tanstack/react-query";
import { Module } from "@shared/schema";

/**
 * Custom hook to check if the current user has a specific permission for a module
 */
export function useModulePermission(moduleName: Module, permission: 'view' | 'create' | 'edit' | 'delete') {
  return useQuery({
    queryKey: ["/api/my-permissions", moduleName, permission],
    queryFn: async () => {
      const response = await fetch(`/api/my-permissions/${encodeURIComponent(moduleName)}/${permission}`);
      if (!response.ok) {
        return { hasPermission: false };
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false
  });
}

/**
 * Custom hook to get all module permissions for the current user
 */
export function useAllModulePermissions() {
  return useQuery({
    queryKey: ["/api/my-permissions"],
    queryFn: async () => {
      const response = await fetch(`/api/my-permissions`);
      if (!response.ok) {
        return {};
      }
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    refetchOnWindowFocus: false
  });
}