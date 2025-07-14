import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Lock } from "lucide-react";
import { PasswordChangeDialog } from "@/components/password-change-dialog";

export function PasswordChangeMenuItem({ className }: { className?: string }) {
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);

  const handlePasswordChangeSuccess = () => {
    setShowPasswordDialog(false);
    // Optionally show a success message or refresh user data
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setShowPasswordDialog(true)}
        className={`flex items-center gap-2 ${className}`}
      >
        <Lock className="w-4 h-4" />
        Change Password
      </Button>

      {showPasswordDialog && (
        <PasswordChangeDialog
          isRequired={false}
          onSuccess={handlePasswordChangeSuccess}
          onCancel={() => setShowPasswordDialog(false)}
        />
      )}
    </>
  );
}