import { User } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { LogOut } from "lucide-react";

type UserProfileProps = {
  user: User;
};

export default function UserProfile({ user }: UserProfileProps) {
  const { logoutMutation } = useAuth();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">Username</p>
          <p className="font-medium">{user.username}</p>
        </div>
        
        <div>
          <p className="text-sm text-muted-foreground">Email</p>
          <p className="font-medium">{user.email}</p>
        </div>
        
        <div>
          <p className="text-sm text-muted-foreground">Phone</p>
          <p className="font-medium">{user.countryCode} {user.mobileNumber}</p>
        </div>
        
        <div>
          <p className="text-sm text-muted-foreground">Role</p>
          <p className="font-medium">{user.role}</p>
        </div>

        <Button 
          variant="destructive" 
          className="w-full" 
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
      </CardContent>
    </Card>
  );
}
