import { createContext, ReactNode, useContext, useState } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useLocation } from "wouter";

type TwoFactorChallenge = {
  challengeToken: string;
  message: string;
};

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  loginMutation: UseMutationResult<any, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
  twoFactorChallenge: TwoFactorChallenge | null;
  clearTwoFactorChallenge: () => void;
  verify2FAMutation: UseMutationResult<any, Error, { challengeToken: string; code: string }>;
  verifyBackup2FAMutation: UseMutationResult<any, Error, { challengeToken: string; backupCode: string }>;
};

type LoginData = Pick<InsertUser, "username" | "password">;

export const AuthContext = createContext<AuthContextType | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const [twoFactorChallenge, setTwoFactorChallenge] = useState<TwoFactorChallenge | null>(null);

  const {
    data: user,
    error,
    isLoading,
  } = useQuery<SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      const response = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.message || `Error ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    },
    onSuccess: (data: any) => {
      if (data.requires2FA) {
        setTwoFactorChallenge({
          challengeToken: data.challengeToken,
          message: data.message,
        });
        return;
      }
      queryClient.setQueryData(["/api/user"], data);
    },
    onError: (error: any) => {
      toast({
        title: "Login failed",
        description: error.message || "Failed to authenticate. Please try again.",
        variant: "destructive",
      });
    },
  });

  const verify2FAMutation = useMutation({
    mutationFn: async ({ challengeToken, code }: { challengeToken: string; code: string }) => {
      const response = await fetch("/api/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, code }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `Error ${response.status}`);
      }

      return await response.json();
    },
    onSuccess: (data: any) => {
      setTwoFactorChallenge(null);
      queryClient.setQueryData(["/api/user"], data.user);
      toast({
        title: "Login successful",
        description: "Two-factor authentication verified.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Verification failed",
        description: error.message || "Invalid code. Please try again.",
        variant: "destructive",
      });
    },
  });

  const verifyBackup2FAMutation = useMutation({
    mutationFn: async ({ challengeToken, backupCode }: { challengeToken: string; backupCode: string }) => {
      const response = await fetch("/api/2fa/verify-backup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ challengeToken, backupCode }),
        credentials: "include",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error || `Error ${response.status}`);
      }

      return await response.json();
    },
    onSuccess: (data: any) => {
      setTwoFactorChallenge(null);
      queryClient.setQueryData(["/api/user"], data.user);
      if (data.warning) {
        toast({
          title: "Warning",
          description: data.warning,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Login successful",
          description: "Backup code verified.",
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: "Verification failed",
        description: error.message || "Invalid backup code.",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      const response = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(credentials),
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Error ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
    },
    onError: (error: any) => {
      toast({
        title: "Registration failed",
        description: error.message || "Failed to create account. Please try again.",
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || `Error ${response.status}: ${response.statusText}`);
      }

      return response;
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
      queryClient.clear();
      setTimeout(() => setLocation("/auth"), 100);
      toast({
        title: "Logged out",
        description: "You have been successfully logged out",
        variant: "default",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Logout failed",
        description: error.message || "Could not log out. Please try again.",
        variant: "destructive",
      });
    },
  });

  const clearTwoFactorChallenge = () => setTwoFactorChallenge(null);

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        loginMutation,
        logoutMutation,
        registerMutation,
        twoFactorChallenge,
        clearTwoFactorChallenge,
        verify2FAMutation,
        verifyBackup2FAMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
