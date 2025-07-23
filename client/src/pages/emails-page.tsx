import React, { useEffect, useState } from "react";
import GmailMessages from "@/components/gmail-messages";
import Layout from "@/components/layout";
import { useToast } from "@/hooks/use-toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { AlertCircle } from "lucide-react";
import { useLocation } from "wouter";

function EmailsPage() {
  const { toast } = useToast();
  const [location] = useLocation();
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    // Check for OAuth error parameters in URL
    const urlParams = new URLSearchParams(window.location.search);
    const error = urlParams.get('error');
    const message = urlParams.get('message');

    if (error) {
      let errorTitle: string;
      let errorMessage: string;

      // Provide specific error messages based on error type
      switch (error) {
        case 'redirect_uri_mismatch':
          errorTitle = "Authentication Error";
          errorMessage = "The redirect URI configured in Google Cloud Console doesn't match the one used by this application. Please contact your administrator.";
          break;
        case 'invalid_grant':
          errorTitle = "Authorization Expired";
          errorMessage = "The authorization request has expired or was revoked. Please try connecting again.";
          break;
        case 'invalid_client':
          errorTitle = "Invalid Client";
          errorMessage = "The OAuth client ID or secret is invalid. Please contact your administrator.";
          break;
        case 'not_authenticated':
          errorTitle = "Not Authenticated";
          errorMessage = "You must be logged in to connect Gmail. Please log in first.";
          break;
        default:
          errorTitle = "Gmail Connection Error";
          errorMessage = message || "An error occurred while connecting to Gmail. Please try again.";
      }

      setAuthError(`${errorTitle}: ${errorMessage}`);

      // Also show a toast for visibility
      toast({
        title: errorTitle,
        description: errorMessage,
        variant: "destructive"
      });

      // Clean up the URL
      window.history.replaceState({}, document.title, '/emails');
    }
  }, [location, toast]);

  return (
    <Layout>
      <div className="container py-6">
        <h1 className="text-3xl font-bold mb-6 pl-4">External Emails</h1>
        {authError && (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Gmail Authentication Error</AlertTitle>
            <AlertDescription>
              {authError}
            </AlertDescription>
          </Alert>
        )}
        <GmailMessages />
      </div>
    </Layout>
  );
}

export default EmailsPage;