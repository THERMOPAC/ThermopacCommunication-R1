import { User } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { LogOut } from "lucide-react";
import { Separator } from "@/components/ui/separator";

type UserProfileProps = {
  user: User;
};

export default function UserProfile({ user }: UserProfileProps) {
  const { logoutMutation } = useAuth();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-semibold">{user.username}</h3>
        <p className="text-sm text-muted-foreground">{user.role}</p>
      </div>

      <Separator />

      <div className="space-y-2 text-sm">
        <div>
          <p className="text-muted-foreground">Email</p>
          <p className="font-medium">{user.email}</p>
        </div>

        <div>
          <p className="text-muted-foreground">Phone</p>
          <p className="font-medium">{user.countryCode} {user.mobileNumber}</p>
        </div>
      </div>

      <Button 
        variant="outline" 
        className="w-full" 
        onClick={() => logoutMutation.mutate()}
        disabled={logoutMutation.isPending}
      >
        <LogOut className="h-4 w-4 mr-2" />
        Logout
      </Button>
    </div>
  );
}