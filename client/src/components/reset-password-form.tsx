import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Eye, EyeOff, Shield, AlertCircle, Check, Clock } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

interface ResetPasswordFormProps {
  token: string;
  onSuccess: () => void;
  onError: (message: string) => void;
}

export function ResetPasswordForm({ token, onSuccess, onError }: ResetPasswordFormProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Password validation
  const validatePassword = (password: string) => {
    const errors: string[] = [];
    
    if (password.length < 12) {
      errors.push('Password must be at least 12 characters long');
    }
    
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }
    
    return errors;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate passwords match
    if (password !== confirmPassword) {
      setErrors(['Passwords do not match']);
      return;
    }

    // Validate password strength
    const validationErrors = validatePassword(password);
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsLoading(true);
    setErrors([]);

    try {
      const response = await apiRequest('POST', '/api/reset-password', { 
        token,
        newPassword: password 
      });
      
      onSuccess();
    } catch (error: any) {
      const message = error.message || 'An error occurred while resetting your password';
      if (error.errors) {
        setErrors(error.errors);
      } else {
        onError(message);
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl font-bold text-blue-600">Create New Password</CardTitle>
        <CardDescription>
          Please enter your new password. Make sure it meets all security requirements.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <div className="relative">
              <Shield className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                placeholder="Enter new password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 pr-12"
                required
                disabled={isLoading}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Confirm New Password</Label>
            <div className="relative">
              <Shield className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="confirmPassword"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="Confirm new password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="pl-10 pr-12"
                required
                disabled={isLoading}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>

          {/* Password Requirements */}
          <div className="bg-blue-50 p-3 rounded-md">
            <h4 className="text-sm font-semibold text-blue-800 mb-2">Password Requirements:</h4>
            <ul className="text-xs text-blue-700 space-y-1">
              <li className="flex items-center">
                <Check className={`h-3 w-3 mr-2 ${password.length >= 12 ? 'text-green-600' : 'text-gray-400'}`} />
                At least 12 characters
              </li>
              <li className="flex items-center">
                <Check className={`h-3 w-3 mr-2 ${/[A-Z]/.test(password) ? 'text-green-600' : 'text-gray-400'}`} />
                One uppercase letter
              </li>
              <li className="flex items-center">
                <Check className={`h-3 w-3 mr-2 ${/[a-z]/.test(password) ? 'text-green-600' : 'text-gray-400'}`} />
                One lowercase letter
              </li>
              <li className="flex items-center">
                <Check className={`h-3 w-3 mr-2 ${/\d/.test(password) ? 'text-green-600' : 'text-gray-400'}`} />
                One number
              </li>
              <li className="flex items-center">
                <Check className={`h-3 w-3 mr-2 ${/[!@#$%^&*(),.?":{}|<>]/.test(password) ? 'text-green-600' : 'text-gray-400'}`} />
                One special character
              </li>
            </ul>
          </div>

          {errors.length > 0 && (
            <Alert className="border-red-200 bg-red-50">
              <AlertCircle className="h-4 w-4 text-red-600" />
              <AlertDescription className="text-red-700">
                <ul className="list-disc ml-4 space-y-1">
                  {errors.map((error, index) => (
                    <li key={index}>{error}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          )}

          <Button 
            type="submit" 
            className="w-full bg-blue-600 hover:bg-blue-700"
            disabled={isLoading}
          >
            {isLoading ? 'Resetting Password...' : 'Reset Password'}
          </Button>
        </form>

        <div className="text-center">
          <div className="flex items-center justify-center text-sm text-gray-600">
            <Clock className="h-4 w-4 mr-1" />
            This link expires in 15 minutes
          </div>
        </div>
      </CardContent>
    </Card>
  );
}