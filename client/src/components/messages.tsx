import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { GmailMessage } from "@shared/schema";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  RotateCw,
  Mail,
  MailOpen,
  Star,
  Trash,
  AlertCircle,
  Filter,
  Settings,
  ArrowLeft,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { format } from "date-fns";

function Messages() {
  const { toast } = useToast();
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterImportance, setFilterImportance] = useState<string>("all");
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState("inbox");

  // Gmail connection status
  const { data: connectionStatus, isLoading: isLoadingStatus } = useQuery({
    queryKey: ["/api/gmail/status"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/gmail/status");
      return await res.json();
    }
  });

  // Gmail settings
  const { data: settings, isLoading: isLoadingSettings } = useQuery({
    queryKey: ["/api/gmail/settings"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/gmail/settings");
      return await res.json();
    },
    enabled: connectionStatus?.connected === true
  });

  // Gmail messages
  const { data: messages, isLoading: isLoadingMessages, error: messagesError } = useQuery({
    queryKey: ["/api/gmail/messages", filterStatus, filterImportance, searchTerm],
    queryFn: async () => {
      try {
        console.log('Fetching messages with filters:', { filterStatus, filterImportance, searchTerm });
        const queryParams = new URLSearchParams();
        
        if (filterStatus === "read") queryParams.set("isRead", "true");
        if (filterStatus === "unread") queryParams.set("isRead", "false");
        
        if (filterImportance === "important") queryParams.set("isImportant", "true");
        if (filterImportance === "notImportant") queryParams.set("isImportant", "false");
        
        if (searchTerm) {
          // Search across multiple fields
          if (searchTerm.includes("@")) {
            queryParams.set("from", searchTerm);
          } else {
            queryParams.set("subject", searchTerm);
          }
        }
        
        const res = await apiRequest("GET", `/api/gmail/messages?${queryParams.toString()}`);
        const data = await res.json();
        console.log('Messages fetched successfully:', data.length);
        return data;
      } catch (error) {
        console.error('Error fetching messages:', error);
        throw error;
      }
    },
    enabled: connectionStatus?.connected === true
  });

  // Selected message details
  const selectedMessage = selectedMessageId 
    ? messages?.find((m: GmailMessage) => m.id === selectedMessageId) 
    : null;

  // Mark message as read
  const markAsReadMutation = useMutation({
    mutationFn: async (messageId: number) => {
      const res = await apiRequest("PATCH", `/api/gmail/messages/${messageId}/read`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/messages"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to mark message as read",
        variant: "destructive"
      });
    }
  });

  // Toggle message importance
  const toggleImportanceMutation = useMutation({
    mutationFn: async ({ messageId, important }: { messageId: number, important: boolean }) => {
      const res = await apiRequest("PATCH", `/api/gmail/messages/${messageId}/important`, {
        important
      });
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/messages"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update message importance",
        variant: "destructive"
      });
    }
  });

  // Sync Gmail messages
  const syncMutation = useMutation({
    mutationFn: async () => {
      console.log('Starting sync mutation');
      try {
        const res = await apiRequest("POST", "/api/gmail/sync");
        
        if (!res.ok) {
          // Get the error message from the response
          const errorData = await res.json();
          console.error('Sync error:', errorData);
          throw new Error(errorData.error || 'Failed to sync Gmail messages');
        }
        
        console.log('Sync request successful, parsing response');
        const data = await res.json();
        console.log('Sync response data:', data);
        return data;
      } catch (error) {
        console.error('Sync mutation error:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('Sync successful:', data);
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/messages"] });
      toast({
        title: "Success",
        description: data.message || `Synced ${data.messageCount} messages from Gmail`,
      });
    },
    onError: (error: any) => {
      console.error('Sync mutation error in callback:', error);
      toast({
        title: "Gmail Sync Failed",
        description: error.message || "Failed to sync messages from Gmail. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Connect to Gmail
  const [manualMode, setManualMode] = useState(false);
  const [authCode, setAuthCode] = useState("");
  const [isSubmittingCode, setIsSubmittingCode] = useState(false);
  const [authUrl, setAuthUrl] = useState<string | null>(null);
  const [manualAuthError, setManualAuthError] = useState<string | null>(null); // Used for storing validation errors in the form
  
  // Manual auth mutation
  const manualAuthMutation = useMutation({
    mutationFn: async (code: string) => {
      const res = await apiRequest("POST", "/api/gmail/manual-auth", { code });
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Success",
        description: "Gmail account connected successfully!",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/status"] });
      setManualMode(false);
      setAuthCode("");
    },
    onError: (error: any) => {
      toast({
        title: "Authentication Failed",
        description: error.message || "Failed to authenticate with Google. Please try again with a new code.",
        variant: "destructive"
      });
    },
    onSettled: () => {
      setIsSubmittingCode(false); 
    }
  });
  
  const connectToGmail = async () => {
    try {
      console.log("Initiating Gmail connection...");
      
      // First attempt to get the URL
      const response = await fetch("/api/gmail/auth-url", {
        method: "GET",
        credentials: "include",
      });
      
      // Parse the response
      const data = await response.json();
      console.log("Auth URL response:", data);
      
      // Check if we got a URL or an error
      if (data.url) {
        // Save the URL for manual mode
        setAuthUrl(data.url);
        console.log("Auth URL received:", data.url.substring(0, 50) + "...");
        
        // Save the timestamp in localStorage to help diagnose redirect issues
        localStorage.setItem('gmailAuthAttempt', new Date().toISOString());
        
        // Log the complete URL for debugging (careful with sensitive data)
        console.log("Full auth URL for debugging:", data.url);
        
        // Open Google auth page in a new tab
        window.open(data.url, '_blank');
        
        toast({
          title: "Gmail Authorization",
          description: "Google authorization page has been opened in a new tab. Please complete the authorization there.",
        });
      } else if (data.error) {
        // Display specific error from the server
        console.error("OAuth configuration error:", data);
        toast({
          title: "OAuth Configuration Error",
          description: data.message || "Google OAuth is not properly configured on the server.",
          variant: "destructive"
        });
      }
    } catch (error) {
      // Handle any other errors
      console.error("Gmail connection error:", error);
      if (error instanceof Error) {
        console.error("Error details:", error.message, error.stack);
      }
      
      toast({
        title: "Gmail Connection Error",
        description: error instanceof Error 
          ? `Error: ${error.message}` 
          : "Failed to generate authentication URL. Please try again later.",
        variant: "destructive"
      });
    }
  };
  
  // Extract clean code from a URL or raw code string
  const extractAuthCode = (input: string): string => {
    if (!input) return '';
    
    console.log('Processing auth code input, length:', input.length);
    input = input.trim();
    
    // Handle direct Google auth codes (they typically start with "4/0A" for OAuth 2.0)
    if (/^4\/0A[a-zA-Z0-9_-]+$/.test(input)) {
      console.log('Detected direct Google OAuth code format');
      return input;
    }
    
    // Handle full URLs with code parameter
    if (input.includes('https://') && input.includes('code=')) {
      try {
        console.log('Detected full URL with code parameter');
        const match = input.match(/[?&]code=([^&]+)/);
        if (match && match[1]) {
          console.log('Extracted code from URL parameter');
          return match[1];
        }
      } catch (err) {
        console.error('Error extracting code from URL:', err);
      }
    }
    // Handle code parameter fragment (code=xxxx)
    else if (input.startsWith('code=')) {
      try {
        console.log('Detected code parameter fragment');
        const parts = input.split('=');
        if (parts.length > 1) {
          return parts[1];
        }
      } catch (err) {
        console.error('Error extracting code from fragment:', err);
      }
    }
    // Handle JSON-like objects that might be copied from DevTools
    else if (input.includes('"code":')) {
      try {
        console.log('Detected JSON-like string with code property');
        const match = input.match(/"code"\s*:\s*"([^"]+)"/);
        if (match && match[1]) {
          console.log('Extracted code from JSON');
          return match[1];
        }
      } catch (err) {
        console.error('Error extracting code from JSON:', err);
      }
    }
    // Handle just the code extracted from a URL (if it matches the Google pattern)
    else if (/^[a-zA-Z0-9_-]+$/.test(input) && input.length >= 20) {
      console.log('Input appears to be a raw authorization code');
      return input;
    }
    
    // If we couldn't parse it as a special format, return as is
    console.log('No special format detected, using as-is');
    return input;
  };
  
  // Track error state for manual auth - already declared at line 182
  // Handle manual auth submission
  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Clear any previous errors
    setManualAuthError(null);
    
    if (!authCode.trim()) {
      setManualAuthError("Please enter the authorization code or complete URL");
      toast({
        title: "Error",
        description: "Please enter the authorization code",
        variant: "destructive",
      });
      return;
    }
    
    // For direct code input (when it doesn't contain 'code=' but looks like a Google auth code)
    const isDirect4StyleCode = /^4\/0A[a-zA-Z0-9_-]+$/.test(authCode.trim());
    
    if (!isDirect4StyleCode && !authCode.includes('code=')) {
      setManualAuthError("Invalid authorization code format. Please enter either the code (starts with '4/0A...') or the complete callback URL.");
      toast({
        title: "Invalid Format",
        description: "Unrecognized authorization code format",
        variant: "destructive",
      });
      return;
    }
    
    // Process the code to ensure it's in the right format
    const cleanCode = extractAuthCode(authCode);
    console.log('Submitting cleaned auth code (first 10 chars):', cleanCode.substring(0, 10) + '...');
    
    if (cleanCode.length < 20) {
      setManualAuthError("The authorization code appears to be too short. Google authorization codes are typically longer.");
      toast({
        title: "Invalid Code",
        description: "Authorization code appears invalid",
        variant: "destructive",
      });
      return;
    }
    
    setIsSubmittingCode(true);
    manualAuthMutation.mutate(cleanCode);
  };

  // Disconnect from Gmail
  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/gmail/disconnect");
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/status"] });
      toast({
        title: "Success",
        description: "Disconnected from Gmail successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to disconnect from Gmail",
        variant: "destructive"
      });
    }
  });

  // Update Gmail settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (updateData: { autoSyncEnabled?: boolean, syncFrequencyMinutes?: number }) => {
      const res = await apiRequest("PATCH", "/api/gmail/settings", updateData);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/settings"] });
      toast({
        title: "Success",
        description: "Settings updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to update settings",
        variant: "destructive"
      });
    }
  });

  // Format date for display
  const formatDate = (dateString: string | null) => {
    if (!dateString) return "Unknown date";
    try {
      return format(new Date(dateString), "MMM d, yyyy h:mm a");
    } catch (e) {
      return dateString;
    }
  };

  // Handle view message
  const handleViewMessage = (messageId: number) => {
    setSelectedMessageId(messageId);
    
    // If the message is unread, mark it as read
    const message = messages?.find((m: GmailMessage) => m.id === messageId);
    if (message && !message.isRead) {
      markAsReadMutation.mutate(messageId);
    }
  };

  // Handle back button
  const handleBack = () => {
    setSelectedMessageId(null);
  };

  // Handle toggle importance
  const handleToggleImportance = (messageId: number, currentImportance: boolean) => {
    toggleImportanceMutation.mutate({
      messageId,
      important: !currentImportance
    });
  };

  if (isLoadingStatus) {
    return (
      <div className="flex items-center justify-center h-64">
        <RotateCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!connectionStatus?.connected) {
    return (
      <Card className="shadow-lg">
        <CardHeader className="text-center pb-0">
          <div className="mx-auto rounded-full bg-primary/10 p-4 w-16 h-16 flex items-center justify-center mb-3">
            <Mail className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-red-600 text-transparent bg-clip-text">
            Connect to Gmail
          </CardTitle>
          <CardDescription className="text-base max-w-md mx-auto mt-2">
            Connect your Gmail account to view and manage THERMOPAC emails directly in this dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 pb-8 text-center">
          <div className="space-y-6 mx-auto max-w-md">
            {!manualMode ? (
              /* Regular Connect Mode */
              <>
                <div className="grid grid-cols-1 gap-4 text-left">
                  <div className="flex items-start">
                    <div className="bg-primary/10 p-2 rounded mr-3 mt-1">
                      <MailOpen className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">Stay Connected</h3>
                      <p className="text-sm text-muted-foreground">
                        Access your Gmail inbox without leaving the THERMOPAC platform
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="bg-primary/10 p-2 rounded mr-3 mt-1">
                      <Star className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">Priority Handling</h3>
                      <p className="text-sm text-muted-foreground">
                        Mark important emails and manage priorities efficiently
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="bg-primary/10 p-2 rounded mr-3 mt-1">
                      <RotateCw className="h-4 w-4 text-primary" />
                    </div>
                    <div>
                      <h3 className="font-medium">Auto-Sync</h3>
                      <p className="text-sm text-muted-foreground">
                        Set up automatic synchronization to always stay up-to-date
                      </p>
                    </div>
                  </div>
                </div>
                <Button 
                  onClick={connectToGmail} 
                  className="w-full bg-gradient-to-r from-blue-600 to-red-600 hover:from-blue-700 hover:to-red-700"
                  size="lg"
                >
                  Connect Gmail Account
                </Button>
                <p className="text-xs text-muted-foreground">
                  Note: You'll be redirected to Google to authorize access and then returned to this page.
                </p>
                <Button 
                  variant="link" 
                  onClick={() => setManualMode(true)} 
                  className="text-sm w-full"
                >
                  Having problems? Try manual authentication
                </Button>
              </>
            ) : (
              /* Manual Connect Mode */
              <>
                <div className="text-left mb-6">
                  <h3 className="text-lg font-medium mb-2">Manual Gmail Authentication</h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    If automatic redirect isn't working, follow these steps carefully:
                  </p>
                  <div className="bg-yellow-50 border-l-4 border-yellow-500 p-4 mb-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <AlertTriangle className="h-5 w-5 text-yellow-500" />
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-yellow-700 font-medium">
                          IMPORTANT: You must complete these steps in order and act quickly!
                        </p>
                        <p className="text-xs text-yellow-600 mt-1">
                          Authorization codes expire after just a few minutes.
                        </p>
                      </div>
                    </div>
                  </div>
                  <ol className="list-decimal list-inside space-y-2 text-sm">
                    <li><strong>Step 1:</strong> Click the "Open Google Authorization Page" button below - this will open a new tab.</li>
                    <li><strong>Step 2:</strong> In the new tab, sign in to your Google account and grant the requested permissions.</li>
                    <li><strong>Step 3:</strong> After approval, you'll be redirected to a page that might show an error - this is expected.</li>
                    <li><strong>Step 4:</strong> <span className="font-bold text-primary">Immediately copy the COMPLETE URL</span> from your browser's address bar. It should look like:</li>
                    <li className="ml-5 list-none text-xs mt-2 mb-2">
                      <div className="bg-muted p-2 rounded-md font-mono text-[11px] break-all">
                        https://thermopac-communication-thermopacllp.replit.app/auth/google/callback?code=4/0AbCD...EfGhI&scope=email+https://www.googleapis.com/auth/gmail.modify
                      </div>
                    </li>
                    <li><strong>Step 5:</strong> Return to this tab immediately and paste the entire URL in the field below.</li>
                    <li><strong>Step 6:</strong> Click "Connect Account" right away - don't wait!</li>
                  </ol>
                  
                  <div className="mt-4 bg-red-50 border-l-4 border-red-400 p-4">
                    <div className="flex">
                      <div className="flex-shrink-0">
                        <AlertCircle className="h-5 w-5 text-red-500" />
                      </div>
                      <div className="ml-3">
                        <p className="text-sm text-red-700 font-medium">Common reasons for failure:</p>
                        <ul className="text-xs text-red-600 mt-1 list-disc list-inside">
                          <li>Waiting too long between authorization and pasting the code (they expire quickly)</li>
                          <li>Not copying the complete URL (must include everything with "code=" parameter)</li>
                          <li>Using an old URL from a previous authorization attempt</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-4 bg-blue-50 border-l-4 border-blue-500 p-4">
                    <p className="text-sm text-blue-700">
                      <strong>Note:</strong> You might see "This site can't be reached" or another error page after Google authorization - that's completely normal! Just copy the full URL from your browser's address bar.
                    </p>
                  </div>
                </div>
                
                <div className="mb-6">
                  <Button 
                    onClick={connectToGmail} 
                    className="w-full mb-4"
                    variant="outline"
                  >
                    Open Google Authorization Page
                  </Button>
                  
                  {authUrl && (
                    <div className="text-xs text-left mt-2 overflow-hidden">
                      <p className="font-medium mb-1">Or copy this URL manually:</p>
                      <div className="bg-secondary p-2 rounded overflow-x-auto whitespace-normal break-all">
                        {authUrl}
                      </div>
                    </div>
                  )}
                </div>
                
                <form onSubmit={handleManualSubmit}>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="authCode">Paste the Authorization Code or Complete URL</Label>
                      <Input
                        id="authCode"
                        value={authCode}
                        onChange={(e) => setAuthCode(e.target.value)}
                        placeholder="4/0AbCD...EfGhI or the full callback URL..."
                        className="font-mono text-xs"
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        <p className="mb-1">You can paste either:</p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>Just the authorization code (starts with "4/0A...")</li>
                          <li>OR the complete URL from your browser after authorization</li>
                        </ul>
                      </div>
                      
                      {manualAuthError && (
                        <div className="mt-2 bg-red-50 border-l-4 border-red-400 p-3 text-red-800 text-xs">
                          <div className="flex">
                            <AlertCircle className="h-4 w-4 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
                            <p>{manualAuthError}</p>
                          </div>
                        </div>
                      )}
                      
                      {manualAuthMutation.error && (
                        <div className="mt-2 bg-red-50 border-l-4 border-red-400 p-3 text-red-800 text-xs">
                          <div className="flex">
                            <AlertCircle className="h-4 w-4 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
                            <p>Authentication failed: {(manualAuthMutation.error as any)?.message || "The authorization code was invalid or expired. Please try again with a fresh code."}</p>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex justify-between">
                      <Button 
                        type="button" 
                        variant="ghost" 
                        onClick={() => setManualMode(false)}
                      >
                        Back
                      </Button>
                      <Button 
                        type="submit" 
                        disabled={isSubmittingCode || manualAuthMutation.isPending || !authCode.trim()}
                        className="bg-gradient-to-r from-blue-600 to-red-600 hover:from-blue-700 hover:to-red-700"
                      >
                        {manualAuthMutation.isPending ? "Connecting..." : "Connect Account"}
                      </Button>
                    </div>
                  </div>
                </form>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Messages</h2>
        <div className="flex space-x-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
          >
            <RotateCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            Sync
          </Button>
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/gmail/settings"] })}>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card className="mb-4">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="search">Search</Label>
                <Input
                  id="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search by subject or sender..."
                />
              </div>
              <div>
                <Label htmlFor="status">Status</Label>
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger id="status">
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="read">Read</SelectItem>
                    <SelectItem value="unread">Unread</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="importance">Importance</Label>
                <Select value={filterImportance} onValueChange={setFilterImportance}>
                  <SelectTrigger id="importance">
                    <SelectValue placeholder="Select importance" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="important">Important</SelectItem>
                    <SelectItem value="notImportant">Not Important</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        
        <TabsContent value="inbox" className="mt-4">
          {selectedMessageId ? (
            <Card className="mb-4">
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <Button variant="ghost" size="sm" onClick={handleBack}>
                      <ArrowLeft className="h-4 w-4 mr-2" />
                      Back
                    </Button>
                  </div>
                  <div className="flex space-x-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (selectedMessage) {
                          handleToggleImportance(selectedMessage.id, selectedMessage.isImportant);
                        }
                      }}
                    >
                      <Star 
                        className={`h-4 w-4 ${selectedMessage?.isImportant ? 'fill-yellow-400 text-yellow-400' : ''}`} 
                      />
                    </Button>
                  </div>
                </div>
                <CardTitle>{selectedMessage?.subject || 'No Subject'}</CardTitle>
                <div className="flex justify-between text-sm text-muted-foreground mt-2">
                  <div>
                    <div><strong>From:</strong> {selectedMessage?.from}</div>
                    <div><strong>To:</strong> {selectedMessage?.to}</div>
                  </div>
                  <div>
                    {selectedMessage?.receivedAt && formatDate(selectedMessage.receivedAt.toString())}
                  </div>
                </div>
              </CardHeader>
              <Separator />
              <CardContent className="pt-6">
                <div 
                  className="prose max-w-none" 
                  dangerouslySetInnerHTML={{ __html: selectedMessage?.body || selectedMessage?.snippet || 'No content' }} 
                />
              </CardContent>
            </Card>
          ) : (
            <div>
              {isLoadingMessages ? (
                <div className="flex items-center justify-center h-64">
                  <RotateCw className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : messagesError ? (
                <Card className="p-6 text-center">
                  <div className="bg-red-50 p-4 rounded-lg mb-4">
                    <Mail className="h-6 w-6 text-red-600 mx-auto mb-2" />
                    <p className="text-red-700 font-medium">Gmail Connection Error</p>
                    <p className="text-sm text-red-600 mt-1">
                      {messagesError instanceof Error 
                        ? messagesError.message.includes("failed to fetch") 
                          ? "Connection to Gmail failed. Your authentication may have expired." 
                          : messagesError.message.includes("401")
                            ? "Your Gmail authorization has expired."
                            : messagesError.message
                        : "Unknown error"}
                    </p>
                    <div className="mt-2 text-xs text-red-600">
                      {messagesError instanceof Error && (
                        messagesError.message.includes("401") 
                          ? <p>Please disconnect and reconnect your account using the buttons below.</p>
                          : messagesError.message.includes("redirect_uri_mismatch")
                            ? <p>There's a mismatch between the redirect URI configured in Google Cloud Console and this application.</p>
                            : null
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2 justify-center">
                    <Button 
                      onClick={() => queryClient.invalidateQueries({ queryKey: ["/api/gmail/messages"] })}
                      variant="outline"
                    >
                      Try Again
                    </Button>
                    <Button 
                      onClick={() => disconnectMutation.mutate()}
                      variant="outline"
                    >
                      Disconnect
                    </Button>
                  </div>
                  <div className="mt-4">
                    <Button 
                      onClick={() => syncMutation.mutate()}
                      disabled={syncMutation.isPending}
                      className="w-full"
                    >
                      <RotateCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                      Sync Messages
                    </Button>
                  </div>
                </Card>
              ) : messages?.length > 0 ? (
                <div className="space-y-2">
                  {messages.map((message: GmailMessage) => (
                    <Card 
                      key={message.id}
                      className={`hover:bg-accent/50 cursor-pointer transition-colors ${!message.isRead ? 'border-l-4 border-l-primary' : ''}`}
                      onClick={() => handleViewMessage(message.id)}
                    >
                      <CardHeader className="p-4">
                        <div className="flex justify-between">
                          <div className="flex items-start space-x-2">
                            {message.isRead ? (
                              <MailOpen className="h-5 w-5 text-muted-foreground mt-1" />
                            ) : (
                              <Mail className="h-5 w-5 text-primary mt-1" />
                            )}
                            <div>
                              <div className="font-medium flex items-center">
                                {message.from.split('<')[0].trim() || message.from}
                                {message.isImportant && (
                                  <Star className="h-4 w-4 ml-2 fill-yellow-400 text-yellow-400" />
                                )}
                              </div>
                              <div className={`text-sm ${!message.isRead ? 'font-bold' : ''}`}>
                                {message.subject || 'No Subject'}
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                {message.snippet}
                              </div>
                            </div>
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {message.receivedAt && formatDate(message.receivedAt.toString())}
                          </div>
                        </div>
                      </CardHeader>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Mail className="h-12 w-12 mb-2" />
                  <p>No messages found</p>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-4"
                    onClick={() => syncMutation.mutate()}
                    disabled={syncMutation.isPending}
                  >
                    <RotateCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
                    Sync Messages
                  </Button>
                </div>
              )}
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="settings" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Gmail Integration Settings</CardTitle>
              <CardDescription>
                Configure your Gmail integration settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label htmlFor="auto-sync">Auto Sync</Label>
                  <Switch
                    id="auto-sync"
                    checked={settings?.autoSyncEnabled || false}
                    onCheckedChange={(checked) => {
                      updateSettingsMutation.mutate({ autoSyncEnabled: checked });
                    }}
                    disabled={isLoadingSettings || updateSettingsMutation.isPending}
                  />
                </div>
                <div>
                  <Label htmlFor="sync-frequency">Sync Frequency (minutes)</Label>
                  <div className="flex items-center space-x-2 mt-2">
                    <Select
                      value={String(settings?.syncFrequencyMinutes || 30)}
                      onValueChange={(value) => {
                        updateSettingsMutation.mutate({ syncFrequencyMinutes: parseInt(value) });
                      }}
                      disabled={isLoadingSettings || updateSettingsMutation.isPending || !settings?.autoSyncEnabled}
                    >
                      <SelectTrigger id="sync-frequency">
                        <SelectValue placeholder="Select frequency" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5 minutes</SelectItem>
                        <SelectItem value="15">15 minutes</SelectItem>
                        <SelectItem value="30">30 minutes</SelectItem>
                        <SelectItem value="60">1 hour</SelectItem>
                        <SelectItem value="120">2 hours</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              
              <Separator />
              
              <div>
                <h3 className="font-medium mb-2">Account</h3>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">
                      Connected since {connectionStatus?.connectedSince ? formatDate(connectionStatus.connectedSince) : 'Unknown'}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Token Status: {connectionStatus?.tokenValid ? 'Valid' : 'Expired'}
                    </p>
                  </div>
                  <Button 
                    variant="destructive" 
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                  >
                    Disconnect
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Messages;