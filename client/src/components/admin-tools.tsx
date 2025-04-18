import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";

const AdminTools = () => {
  const { user } = useAuth();
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  
  const handleReset = async () => {
    // Double-check user is a Superuser for additional security
    if (user?.role !== 'Superuser') {
      toast({
        title: "Permission Denied",
        description: "Only Superusers can reset the master items database",
        variant: "destructive",
      });
      return;
    }
    
    if (confirmText !== "RESET") {
      toast({
        title: "Error",
        description: "Please type RESET to confirm",
        variant: "destructive",
      });
      return;
    }
    
    setIsResetting(true);
    
    try {
      const response = await fetch('/api/db-maintenance/reset-master-items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include' // Important: include cookies for authentication
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        toast({
          title: "Reset Failed",
          description: errorData.error + (errorData.details ? `: ${errorData.details}` : ""),
          variant: "destructive",
        });
        return;
      }
      
      const data = await response.json();
      toast({
        title: "Reset Successful",
        description: data.message + (data.details ? `: ${data.details}` : ""),
      });
      
      // Reload after successful reset
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      toast({
        title: "Reset Error",
        description: `Network or server error: ${error instanceof Error ? error.message : "Unknown error"}`,
        variant: "destructive",
      });
    } finally {
      setIsResetting(false);
      setIsDialogOpen(false);
      setConfirmText("");
    }
  };
  
  // Only Superusers should be able to see these tools
  if (user?.role !== 'Superuser') {
    return null;
  }
  
  return (
    <div className="mb-8">
      <h2 className="text-2xl font-bold mb-4">Administrator Tools</h2>
      <div className="p-4 border rounded-md bg-gray-50">
        <h3 className="text-lg font-semibold mb-3">Database Maintenance</h3>
        <p className="text-sm text-gray-500 mb-4">
          These tools perform critical operations on the database. Use with caution.
        </p>
        <Button 
          variant="destructive"
          onClick={() => setIsDialogOpen(true)}
        >
          Reset Master Items Database
        </Button>
        
        <AlertDialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="text-red-600">Database Reset Confirmation</AlertDialogTitle>
              <AlertDialogDescription className="space-y-4">
                <p className="font-medium text-gray-700">
                  You are about to perform a critical operation that will:
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Delete <span className="font-semibold">ALL</span> master items from the database</li>
                  <li>Nullify references from project items to master items</li> 
                  <li>Reset the auto-increment counter</li>
                </ul>
                <p className="font-medium text-red-500">
                  This action cannot be undone and will affect all project items that reference master items.
                </p>
                <p>
                  Type <span className="font-mono bg-gray-100 px-2 py-1 rounded">RESET</span> below to confirm:
                </p>
                <input 
                  type="text" 
                  className="border-2 border-gray-300 p-2 w-full mt-2 rounded-md"
                  placeholder="Type RESET to confirm"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                />
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleReset}
                className="bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={confirmText !== "RESET" || isResetting}
              >
                {isResetting ? 'Resetting...' : 'Reset Database'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default AdminTools;