import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/queryClient";

export function isRecordAccessDenied(error: unknown): boolean {
  return error instanceof ApiError && error.errorCode === "RECORD_ACCESS_DENIED";
}

export function RecordAccessDenied() {
  return (
    <Card className="border-destructive/50 bg-destructive/5">
      <CardContent className="flex items-center gap-3 py-6">
        <ShieldAlert className="h-8 w-8 text-destructive flex-shrink-0" />
        <div>
          <h3 className="font-semibold text-destructive">Record Access Restricted</h3>
          <p className="text-sm text-muted-foreground mt-1">
            You do not have permission to view this record. Contact your administrator if you believe this is an error.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
