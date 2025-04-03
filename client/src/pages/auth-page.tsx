import { useAuth } from "@/hooks/use-auth";
import { useForm } from "react-hook-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { useLocation } from "wouter";

export default function AuthPage() {
  const { user, loginMutation } = useAuth();
  const [, setLocation] = useLocation();

  if (user) {
    setLocation("/");
    return null;
  }

  return (
    <div className="min-h-screen bg-background flex">
      <div className="flex-1 flex items-center justify-center p-8">
        <Card className="w-full max-w-md">
          <CardHeader className="flex flex-col items-center">
            <img 
              src="/images/thermopac-logo.jpg" 
              alt="Thermopac Logo" 
              className="h-24 mb-4"
            />
            <CardTitle>Communication System</CardTitle>
          </CardHeader>
          <CardContent>
            <LoginForm />
          </CardContent>
        </Card>
      </div>

      <div className="hidden lg:flex flex-1 bg-white items-center justify-center p-12 relative overflow-hidden">
        <div className="max-w-lg relative z-10 flex flex-col items-center">
          <img 
            src="/images/thermopac-logo.jpg" 
            alt="Thermopac Logo" 
            className="h-20 mb-6"
          />
          <h1 className="text-4xl font-bold mb-6 text-gray-800 text-center">Welcome to THERMOPAC</h1>
          <p className="text-lg text-gray-600 text-center">
            A comprehensive platform for intercompany communication and task management.
            Connect with your team, manage tasks, and stay productive.
          </p>
        </div>
      </div>
    </div>
  );
}

function LoginForm() {
  const { loginMutation } = useAuth();
  const form = useForm({
    defaultValues: {
      username: "",
      password: "",
    },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit((data) => loginMutation.mutate(data))} className="space-y-4">
        <FormField
          control={form.control}
          name="username"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Username</FormLabel>
              <FormControl>
                <Input {...field} />
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
                <Input type="password" {...field} />
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
      </form>
    </Form>
  );
}