import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { ResetPasswordForm } from '@/components/reset-password-form';

export default function ResetPasswordPage() {
  const [location, setLocation] = useLocation();
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<{
    type: 'loading' | 'success' | 'error' | 'form';
    message: string;
  }>({ type: 'loading', message: '' });

  useEffect(() => {
    try {
      // Extract token from URL query parameters
      const urlParams = new URLSearchParams(window.location.search);
      const tokenParam = urlParams.get('token');
      
      console.log('Reset password page loaded');
      console.log('Current URL:', window.location.href);
      console.log('Token parameter:', tokenParam);
      
      if (!tokenParam) {
        console.log('No token found in URL parameters');
        setStatus({
          type: 'error',
          message: 'Invalid reset link. Please request a new password reset.'
        });
        return;
      }

      if (tokenParam.length < 10) {
        console.log('Token too short:', tokenParam.length);
        setStatus({
          type: 'error',
          message: 'Invalid reset token format. Please request a new password reset.'
        });
        return;
      }

      console.log('Valid token found, showing form');
      setToken(tokenParam);
      setStatus({ type: 'form', message: '' });
    } catch (error) {
      console.error('Error parsing reset URL:', error);
      setStatus({
        type: 'error',
        message: 'Error loading reset page. Please try again or request a new reset link.'
      });
    }
  }, []);

  const handleSuccess = () => {
    setStatus({
      type: 'success',
      message: 'Password reset successful! You can now login with your new password.'
    });
  };

  const handleError = (message: string) => {
    setStatus({
      type: 'error',
      message: message
    });
  };

  const handleBackToLogin = () => {
    setLocation('/auth');
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* THERMOPAC Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-blue-600 mb-2">THERMOPAC</h1>
          <p className="text-gray-600">Enterprise Resource Planning System</p>
        </div>

        {status.type === 'loading' && (
          <Card>
            <CardContent className="p-6 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Validating reset link...</p>
            </CardContent>
          </Card>
        )}

        {status.type === 'form' && token && (
          <ResetPasswordForm
            token={token}
            onSuccess={handleSuccess}
            onError={handleError}
          />
        )}

        {status.type === 'success' && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <CardTitle className="text-2xl font-bold text-green-600">Password Reset Successful</CardTitle>
              <CardDescription>
                Your password has been successfully reset. You can now login with your new password.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <Button 
                onClick={handleBackToLogin}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Continue to Login
              </Button>
            </CardContent>
          </Card>
        )}

        {status.type === 'error' && (
          <Card>
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-100">
                <XCircle className="h-6 w-6 text-red-600" />
              </div>
              <CardTitle className="text-2xl font-bold text-red-600">Password Reset Failed</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert className="border-red-200 bg-red-50">
                <AlertCircle className="h-4 w-4 text-red-600" />
                <AlertDescription className="text-red-700">
                  {status.message}
                </AlertDescription>
              </Alert>
              
              <div className="text-center">
                <Button 
                  onClick={handleBackToLogin}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Back to Login
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}