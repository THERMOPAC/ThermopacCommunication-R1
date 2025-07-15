import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription 
} from "@/components/ui/dialog";
import { 
  AlertCircle, 
  CheckCircle, 
  Eye, 
  EyeOff, 
  Lock, 
  Shield, 
  X 
} from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { queryClient } from "@/lib/queryClient";
import { useLocation } from "wouter";

interface PasswordChangeDialogProps {
  isRequired?: boolean;
  onSuccess?: () => void;
  onCancel?: () => void;
}

interface PasswordRequirement {
  test: (password: string) => boolean;
  message: string;
  met: boolean;
}

export function PasswordChangeDialog({ 
  isRequired = false, 
  onSuccess, 
  onCancel 
}: PasswordChangeDialogProps) {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const { toast } = useToast();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  const passwordRequirements: PasswordRequirement[] = [
    {
      test: (password: string) => password.length >= 12,
      message: 'At least 12 characters long',
      met: newPassword.length >= 12
    },
    {
      test: (password: string) => /[A-Z]/.test(password),
      message: 'Contains uppercase letter',
      met: /[A-Z]/.test(newPassword)
    },
    {
      test: (password: string) => /[a-z]/.test(password),
      message: 'Contains lowercase letter',
      met: /[a-z]/.test(newPassword)
    },
    {
      test: (password: string) => /\d/.test(password),
      message: 'Contains at least one number',
      met: /\d/.test(newPassword)
    },
    {
      test: (password: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password),
      message: 'Contains special character',
      met: /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword)
    }
  ];

  const passwordChangeModal = useMutation({
    mutationFn: async (data: { currentPassword: string; newPassword: string; confirmPassword: string }) => {
      const response = await apiRequest('POST', '/api/change-password', data);
      return response;
    },
    onSuccess: async (response) => {
      toast({
        title: "Password Updated",
        description: "Your password has been successfully updated. You will receive an email confirmation.",
      });
      
      // Clear form
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setError(null);
      
      // If this was a required password update, update the user's auth state
      if (isRequired && user) {
        try {
          // Invalidate user queries to refresh authentication state
          await queryClient.invalidateQueries({ queryKey: ["/api/user"] });
          
          // The backend now updates the session, so we can redirect immediately
          // Call onSuccess callback if provided
          if (onSuccess) {
            onSuccess();
          } else {
            // Default behavior: redirect to dashboard for required updates
            setLocation("/");
          }
        } catch (error) {
          console.error('Error updating auth state:', error);
          // Fallback: still redirect even if auth update fails
          if (onSuccess) {
            onSuccess();
          } else {
            setLocation("/");
          }
        }
      } else {
        // For non-required password changes, just call onSuccess
        if (onSuccess) {
          onSuccess();
        }
      }
    },
    onError: (error: any) => {
      console.error('Password change error:', error);
      
      if (error.response?.data?.errors) {
        setError(error.response.data.errors.join(', '));
      } else if (error.response?.data?.message) {
        setError(error.response.data.message);
      } else {
        setError('Failed to update password. Please try again.');
      }
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Client-side validation
    if (!isRequired && !currentPassword) {
      setError('Current password is required');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match');
      return;
    }

    const allRequirementsMet = passwordRequirements.every(req => req.met);
    if (!allRequirementsMet) {
      setError('Please meet all password requirements');
      return;
    }

    passwordChangeModal.mutate({
      currentPassword: isRequired ? '' : currentPassword,
      newPassword,
      confirmPassword
    });
  };

  const handleCancel = () => {
    if (onCancel) {
      onCancel();
    }
  };

  return (
    <Dialog open={true} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            {isRequired ? 'Security Update Required' : 'Change Password'}
          </DialogTitle>
          <DialogDescription>
            {isRequired 
              ? 'Due to security enhancements, you must update your password to continue using the system.'
              : 'Update your password to maintain account security.'
            }
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Current Password (only if not required) */}
          {!isRequired && (
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showCurrentPassword ? "text" : "password"}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  className="pr-10"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                >
                  {showCurrentPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </div>
          )}

          {/* New Password */}
          <div className="space-y-2">
            <Label htmlFor="newPassword">New Password</Label>
            <div className="relative">
              <Input
                id="newPassword"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                className="pr-10"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowNewPassword(!showNewPassword)}
              >
                {showNewPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Confirm Password */}
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <div className="relative">
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                className="pr-10"
                required
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Password Requirements */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Password Requirements</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {passwordRequirements.map((req, index) => (
                <div key={index} className="flex items-center gap-2">
                  {req.met ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-gray-400" />
                  )}
                  <span className={`text-sm ${req.met ? 'text-green-600' : 'text-gray-500'}`}>
                    {req.message}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Password Match Indicator */}
          {newPassword && confirmPassword && (
            <div className="flex items-center gap-2">
              {newPassword === confirmPassword ? (
                <>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-600">Passwords match</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4 text-red-600" />
                  <span className="text-sm text-red-600">Passwords do not match</span>
                </>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Security Info */}
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-4">
              <div className="flex items-start gap-3">
                <Lock className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-blue-800">Enhanced Security</p>
                  <p className="text-xs text-blue-700 mt-1">
                    Your password will be encrypted and your last 5 passwords will be tracked to prevent reuse.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            {!isRequired ? (
              <Button 
                type="button" 
                variant="outline" 
                onClick={handleCancel}
                disabled={passwordChangeModal.isPending}
              >
                Cancel
              </Button>
            ) : (
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  // Allow user to skip mandatory update if they already have a secure password
                  if (onCancel) {
                    onCancel();
                  } else {
                    setLocation("/");
                  }
                }}
                disabled={passwordChangeModal.isPending}
                className="text-gray-600 hover:text-gray-800"
              >
                Skip for Now
              </Button>
            )}
            <Button 
              type="submit" 
              disabled={passwordChangeModal.isPending}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {passwordChangeModal.isPending ? 'Updating...' : 'Update Password'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}