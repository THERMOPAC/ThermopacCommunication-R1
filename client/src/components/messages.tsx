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
  Filter,
  Settings,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { format } from "date-fns";

const Messages: React.FC = () => {
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
  const { data: messages, isLoading: isLoadingMessages } = useQuery({
    queryKey: ["/api/gmail/messages", filterStatus, filterImportance, searchTerm],
    queryFn: async () => {
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
      return await res.json();
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
      const res = await apiRequest("POST", "/api/gmail/sync");
      return await res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/gmail/messages"] });
      toast({
        title: "Success",
        description: `Synced ${data.messageCount} messages from Gmail`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to sync messages from Gmail",
        variant: "destructive"
      });
    }
  });

  // Connect to Gmail
  const connectToGmail = async () => {
    try {
      const res = await apiRequest("GET", "/api/gmail/auth-url");
      const data = await res.json();
      
      if (data.url) {
        // Open Google auth page in a new tab
        window.open(data.url, '_blank');
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate authentication URL",
        variant: "destructive"
      });
    }
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
      <div className="flex flex-col items-center justify-center space-y-6 p-8">
        <Mail className="h-16 w-16 text-primary/50" />
        <h2 className="text-2xl font-bold">Connect to Gmail</h2>
        <p className="text-center text-muted-foreground max-w-md">
          Connect your Gmail account to view and manage THERMOPAC emails directly in this dashboard.
        </p>
        <Button onClick={connectToGmail} className="mt-4">
          Connect Gmail Account
        </Button>
      </div>
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