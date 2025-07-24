import { useAuth } from "@/hooks/use-auth";
import { useAutofillSetting } from "@/hooks/useAutofillSetting";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import { Shield, AlertTriangle } from "lucide-react";
import { PasswordChangeDialog } from "@/components/password-change-dialog";
import { ForgotPasswordForm } from "@/components/forgot-password-form";

export default function AuthPage() {
  const { user, loginMutation } = useAuth();
  const [, setLocation] = useLocation();
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [userNeedsPasswordUpdate, setUserNeedsPasswordUpdate] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);

  // Use useEffect to handle redirection after render
  useEffect(() => {
    if (user) {
      // Check if user needs password update
      if (user.requiresPasswordUpdate || user.passwordNeedsUpdate) {
        setUserNeedsPasswordUpdate(true);
        setShowPasswordDialog(true);
      } else {
        setLocation("/");
      }
    }
  }, [user, setLocation]);
  
  // If user is already logged in but doesn't need password update, show a loading state
  if (user && !userNeedsPasswordUpdate) {
    return <div className="flex items-center justify-center h-screen">Redirecting...</div>;
  }

  const handlePasswordUpdateSuccess = () => {
    setShowPasswordDialog(false);
    setUserNeedsPasswordUpdate(false);
    setLocation("/");
  };

  return (
    <div className="min-h-screen bg-background flex">
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md space-y-4">
          {/* Security Update Banner */}
          <Alert className="border-blue-200 bg-blue-50">
            <Shield className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800">
              <strong>Security Enhancement:</strong> We've implemented stronger password requirements 
              to better protect your account. All users must update their passwords.
            </AlertDescription>
          </Alert>

          <Card>
            <CardHeader className="flex flex-col items-center">
              <img 
                src="/images/thermopac-logo.jpg" 
                alt="Thermopac Logo" 
                className="h-24 mb-4"
              />
              <CardTitle>Enterprise Resource Planning</CardTitle>
            </CardHeader>
            <CardContent>
              {showForgotPassword ? (
                <ForgotPasswordForm onBackToLogin={() => setShowForgotPassword(false)} />
              ) : (
                <LoginForm 
                  loginMutation={loginMutation} 
                  onForgotPassword={() => setShowForgotPassword(true)}
                />
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Password Change Dialog */}
      {showPasswordDialog && userNeedsPasswordUpdate && (
        <PasswordChangeDialog
          isRequired={true}
          onSuccess={handlePasswordUpdateSuccess}
        />
      )}

      <div className="hidden lg:flex flex-1 bg-white items-center justify-center p-12 relative overflow-hidden">
        <div className="max-w-lg relative z-10 flex flex-col items-center">
          <img 
            src="/images/thermopac-logo.jpg" 
            alt="Thermopac Logo" 
            className="h-20 mb-6"
          />
          <h1 className="text-4xl font-bold mb-6 text-gray-800 text-center">Welcome to THERMOPAC ERP</h1>
          <p className="text-lg text-gray-600 text-center">
            A comprehensive enterprise resource planning platform for financial management, 
            quality control, production planning, HR administration, and business operations.
          </p>
        </div>
      </div>
    </div>
  );
}

// The LoginForm is now a component that receives the loginMutation as a prop
function LoginForm({ loginMutation, onForgotPassword }: { loginMutation: any; onForgotPassword: () => void }) {
  const { disableAutofill } = useAutofillSetting();
  const [readOnlyFields, setReadOnlyFields] = useState({ username: true, password: true });
  
  const form = useForm({
    defaultValues: {
      username: "",
      password: "",
    },
  });

  const handleFieldFocus = (fieldName: 'username' | 'password') => {
    if (disableAutofill) {
      setReadOnlyFields(prev => ({ ...prev, [fieldName]: false }));
    }
  };

  return (
    <Form {...form}>
      <form 
        onSubmit={form.handleSubmit((data) => loginMutation.mutate(data))} 
        className="space-y-4"
        autoComplete={disableAutofill ? "off" : "on"}
      >
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input 
                  {...field} 
                  autoComplete={disableAutofill ? "off" : "username"}
                  readOnly={disableAutofill ? readOnlyFields.username : false}
                  onFocus={() => handleFieldFocus('username')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="password"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Password</FormLabel>
              <FormControl>
                <Input 
                  type="password" 
                  {...field} 
                  autoComplete={disableAutofill ? "new-password" : "current-password"}
                  readOnly={disableAutofill ? readOnlyFields.password : false}
                  onFocus={() => handleFieldFocus('password')}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button 
          type="submit" 
          className="w-full bg-gradient-to-r from-blue-600 to-red-600 hover:from-blue-700 hover:to-red-700" 
          disabled={loginMutation.isPending}
        >
          Login
        </Button>
        
        <div className="text-center">
          <Button 
            type="button"
            variant="link"
            onClick={onForgotPassword}
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            Forgot your password?
          </Button>
        </div>
      </form>
    </Form>
  );
}