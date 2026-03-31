import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/queryClient";

export function isProjectAccessDenied(error: unknown): boolean {
  return error instanceof ApiError && error.errorCode === "PROJECT_ACCESS_DENIED";
}

export function ProjectAccessDenied() {
  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardContent className="flex items-center gap-3 py-6">
        <ShieldAlert className="h-8 w-8 text-destructive flex-shrink-0" />
        <div>
          <h3 className="font-semibold text-destructive">Project Access Restricted</h3>
          <p className="text-sm text-muted-foreground mt-1">
            You are not a member of this project. Contact your administrator to request access.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
