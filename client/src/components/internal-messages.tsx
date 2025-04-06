import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  RotateCw,
  MessageSquare,
  Filter,
  ArrowLeft,
  Send,
  Users
} from "lucide-react";
import { format } from "date-fns";

// Define the internal message structure
interface InternalMessage {
  id: number;
  senderId: number;
  senderName: string;
  recipientId: number;
  recipientName: string;
  subject: string;
  content: string;
  isRead: boolean;
  createdAt: string;
}

function InternalMessages() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedMessageId, setSelectedMessageId] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const [activeTab, setActiveTab] = useState("inbox");
  const [newMessageRecipient, setNewMessageRecipient] = useState("");
  const [newMessageSubject, setNewMessageSubject] = useState("");
  const [newMessageContent, setNewMessageContent] = useState("");
  const [showComposeForm, setShowComposeForm] = useState(false);

  // Get users for the recipient dropdown
  const { data: users = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ["/api/users"],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/users");
      return await res.json();
    }
  });

  // Fetch internal messages
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery({
    queryKey: ["/api/internal-messages", activeTab, searchTerm],
    queryFn: async () => {
      try {
        const queryParams = new URLSearchParams();
        
        if (activeTab === "sent") {
          queryParams.set("type", "sent");
        }
        
        if (searchTerm) {
          queryParams.set("search", searchTerm);
        }
        
        const res = await apiRequest("GET", `/api/internal-messages?${queryParams.toString()}`);
        return await res.json();
      } catch (error) {
        console.error('Error fetching internal messages:', error);
        throw error;
      }
    }
  });

  // Send a new message
  const sendMessageMutation = useMutation({
    mutationFn: async (message: { recipientId: number, subject: string, content: string }) => {
      const res = await apiRequest("POST", "/api/internal-messages", message);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Message Sent",
        description: "Your message has been sent successfully.",
      });
      setNewMessageRecipient("");
      setNewMessageSubject("");
      setNewMessageContent("");
      setShowComposeForm(false);
      queryClient.invalidateQueries({ queryKey: ["/api/internal-messages"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to send message. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Mark message as read
  const markAsReadMutation = useMutation({
    mutationFn: async (messageId: number) => {
      const res = await apiRequest("PATCH", `/api/internal-messages/${messageId}/read`);
      return await res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/internal-messages"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to mark message as read",
        variant: "destructive"
      });
    }
  });

  // Selected message details
  const selectedMessage = selectedMessageId 
    ? messages.find((m: InternalMessage) => m.id === selectedMessageId) 
    : null;

  // Format date for display
  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), "MMM d, yyyy h:mm a");
    } catch (e) {
      return dateString;
    }
  };

  // Handle sending a new message
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!newMessageRecipient.trim() || !newMessageSubject.trim() || !newMessageContent.trim()) {
      toast({
        title: "Error",
        description: "Please fill in all fields",
        variant: "destructive"
      });
      return;
    }
    
    sendMessageMutation.mutate({
      recipientId: parseInt(newMessageRecipient),
      subject: newMessageSubject,
      content: newMessageContent
    });
  };

  // Handle view message
  const handleViewMessage = (messageId: number) => {
    setSelectedMessageId(messageId);
    
    // If the message is unread, mark it as read
    const message = messages.find((m: InternalMessage) => m.id === messageId);
    if (message && !message.isRead) {
      markAsReadMutation.mutate(messageId);
    }
  };

  // Handle back button
  const handleBack = () => {
    setSelectedMessageId(null);
  };

  if (isLoadingMessages) {
    return (
      <div className="flex items-center justify-center h-64">
        <RotateCw className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Render message compose form
  if (showComposeForm) {
    return (
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Compose Message</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setShowComposeForm(false)}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Messages
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSendMessage} className="space-y-4">
            <div>
              <Label htmlFor="recipient">Recipient</Label>
              <Select value={newMessageRecipient} onValueChange={setNewMessageRecipient}>
                <SelectTrigger>
                  <SelectValue placeholder="Select recipient" />
                </SelectTrigger>
                <SelectContent>
                  {users.map((user: any) => (
                    <SelectItem key={user.id} value={user.id.toString()}>
                      {user.username}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="subject">Subject</Label>
              <Input 
                id="subject" 
                value={newMessageSubject} 
                onChange={(e) => setNewMessageSubject(e.target.value)} 
                placeholder="Enter subject"
              />
            </div>
            <div>
              <Label htmlFor="content">Message</Label>
              <Textarea 
                id="content" 
                value={newMessageContent} 
                onChange={(e) => setNewMessageContent(e.target.value)} 
                placeholder="Write your message here..."
                rows={6}
              />
            </div>
            <Button type="submit" disabled={sendMessageMutation.isPending}>
              <Send className="h-4 w-4 mr-2" />
              {sendMessageMutation.isPending ? "Sending..." : "Send Message"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  // Render message detail view
  if (selectedMessageId && selectedMessage) {
    return (
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <Button variant="ghost" size="sm" onClick={handleBack}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back
              </Button>
            </div>
          </div>
          <CardTitle>{selectedMessage.subject || 'No Subject'}</CardTitle>
          <div className="flex justify-between text-sm text-muted-foreground mt-2">
            <div>
              <span className="font-medium">
                {activeTab === 'sent' ? `To: ${selectedMessage.recipientName}` : `From: ${selectedMessage.senderName}`}
              </span>
            </div>
            <div>{formatDate(selectedMessage.createdAt)}</div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="prose max-w-none">
            <p className="whitespace-pre-wrap">{selectedMessage.content}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Main inbox view
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold">Internal Messages</h2>
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
            variant="default" 
            size="sm" 
            onClick={() => setShowComposeForm(true)}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            New Message
          </Button>
        </div>
      </div>

      {showFilters && (
        <Card className="mb-4">
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 gap-4">
              <div>
                <Label htmlFor="search">Search</Label>
                <Input
                  id="search"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search messages..."
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="inbox">Inbox</TabsTrigger>
          <TabsTrigger value="sent">Sent</TabsTrigger>
        </TabsList>
        
        <TabsContent value="inbox" className="mt-4">
          {messages.length > 0 ? (
            <div className="space-y-2">
              {messages.map((message: InternalMessage) => (
                <Card 
                  key={message.id} 
                  className={`cursor-pointer hover:bg-accent transition-colors ${!message.isRead ? 'border-primary' : ''}`}
                  onClick={() => handleViewMessage(message.id)}
                >
                  <CardHeader className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-start space-x-4">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback>{message.senderName.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium flex items-center">
                            {message.senderName}
                          </div>
                          <div className={`text-sm ${!message.isRead ? 'font-bold' : ''}`}>
                            {message.subject || 'No Subject'}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {message.content.substring(0, 100)}...
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(message.createdAt)}
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mb-2" />
              <p>No messages found</p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-4"
                onClick={() => setShowComposeForm(true)}
              >
                New Message
              </Button>
            </div>
          )}
        </TabsContent>
        
        <TabsContent value="sent" className="mt-4">
          {messages.length > 0 ? (
            <div className="space-y-2">
              {messages.map((message: InternalMessage) => (
                <Card 
                  key={message.id} 
                  className="cursor-pointer hover:bg-accent transition-colors"
                  onClick={() => handleViewMessage(message.id)}
                >
                  <CardHeader className="p-4">
                    <div className="flex justify-between items-start">
                      <div className="flex items-start space-x-4">
                        <Avatar className="h-10 w-10">
                          <AvatarFallback>{message.recipientName.substring(0, 2).toUpperCase()}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium flex items-center">
                            To: {message.recipientName}
                          </div>
                          <div className="text-sm">
                            {message.subject || 'No Subject'}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {message.content.substring(0, 100)}...
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {formatDate(message.createdAt)}
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
              <MessageSquare className="h-12 w-12 mb-2" />
              <p>No sent messages found</p>
              <Button 
                variant="outline" 
                size="sm" 
                className="mt-4"
                onClick={() => setShowComposeForm(true)}
              >
                New Message
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default InternalMessages;