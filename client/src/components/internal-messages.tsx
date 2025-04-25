import React, { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest, getQueryFn } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useToast } from "@/hooks/use-toast";
import { roles, roleHierarchy } from "@shared/roles";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  RotateCw,
  MessageSquare,
  Filter,
  ArrowLeft,
  Send,
  Users,
  Trash,
  AlertCircle
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { format } from "date-fns";

// Define interface structures
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

interface User {
  id: number;
  username: string;
  role: string;
  email: string;
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
  const [replyingToMessage, setReplyingToMessage] = useState<InternalMessage | null>(null);

  // Get users for the recipient dropdown
  const { data: users = [], isLoading: isLoadingUsers } = useQuery<User[], Error>({
    queryKey: ["/api/users"],
    queryFn: getQueryFn()
  });

  // Fetch internal messages
  const { data: messages = [], isLoading: isLoadingMessages } = useQuery<InternalMessage[], Error>({
    queryKey: ["/api/internal-messages", activeTab, searchTerm],
    queryFn: async ({ queryKey }) => {
      try {
        const queryParams = new URLSearchParams();
        
        if (activeTab === "sent") {
          queryParams.set("type", "sent");
        }
        
        if (searchTerm) {
          queryParams.set("search", searchTerm);
        }
        
        return await getQueryFn()({ queryKey: [`/api/internal-messages?${queryParams.toString()}`] });
      } catch (error) {
        console.error('Error fetching internal messages:', error);
        throw error;
      }
    }
  });

  // Reset form state
  const resetComposeForm = () => {
    setNewMessageRecipient("");
    setNewMessageSubject("");
    setNewMessageContent("");
    setReplyingToMessage(null);
    setShowComposeForm(false);
  };

  // Send a new message
  const sendMessageMutation = useMutation<
    InternalMessage, 
    Error, 
    { recipientId: number, subject: string, content: string }
  >({
    mutationFn: async (message) => {
      return await apiRequest("POST", "/api/internal-messages", message);
    },
    onSuccess: () => {
      toast({
        title: "Message Sent",
        description: "Your message has been sent successfully.",
      });
      resetComposeForm();
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
  const markAsReadMutation = useMutation<InternalMessage, Error, number>({
    mutationFn: async (messageId) => {
      return await apiRequest("PATCH", `/api/internal-messages/${messageId}/read`);
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
  
  // Delete message
  const [messageToDelete, setMessageToDelete] = useState<InternalMessage | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  
  const deleteMessageMutation = useMutation<void, Error, number>({
    mutationFn: async (messageId) => {
      await apiRequest("DELETE", `/api/internal-messages/${messageId}`);
    },
    onSuccess: () => {
      toast({
        title: "Message Deleted",
        description: "The message has been deleted successfully.",
      });
      setMessageToDelete(null);
      setDeleteDialogOpen(false);
      setSelectedMessageId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/internal-messages"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Failed to delete message. Please try again.",
        variant: "destructive"
      });
    }
  });

  // Selected message details
  const selectedMessage = selectedMessageId 
    ? messages.find((m) => m.id === selectedMessageId) 
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
    const message = messages.find((m) => m.id === messageId);
    if (message && !message.isRead) {
      markAsReadMutation.mutate(messageId);
    }
  };

  // Handle reply to message
  const handleReply = (message: InternalMessage) => {
    // Set up the reply
    setReplyingToMessage(message);
    setNewMessageRecipient(message.senderId.toString());
    setNewMessageSubject(`Re: ${message.subject}`);
    setNewMessageContent(`\n\n\n------- Original Message -------\nFrom: ${message.senderName}\nDate: ${formatDate(message.createdAt)}\n\n${message.content}`);
    setShowComposeForm(true);
    setSelectedMessageId(null);
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
            <CardTitle>{replyingToMessage ? 'Reply to Message' : 'Compose Message'}</CardTitle>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={resetComposeForm}
            >
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
                  {/* Group users by role for better organization */}
                  {[...roles].sort((a, b) => roleHierarchy[a] - roleHierarchy[b]).map((role) => {
                    const usersWithRole = users.filter((u) => u.role === role);
                    if (usersWithRole.length === 0) return null;
                    
                    return (
                      <SelectGroup key={role}>
                        <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                          {role}s
                        </SelectLabel>
                        {usersWithRole.map((user) => (
                          <SelectItem key={user.id} value={user.id.toString()}>
                            {user.username}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    );
                  })}
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

  // Handle delete message
  const handleDeleteMessage = (message: InternalMessage) => {
    setMessageToDelete(message);
    setDeleteDialogOpen(true);
  };

  // Render message detail view
  if (selectedMessageId && selectedMessage) {
    return (
      <>
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <Button variant="ghost" size="sm" onClick={handleBack}>
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </div>
              <div className="flex space-x-2">
                {/* Only show reply button for received messages (inbox), not for sent messages */}
                {activeTab === 'inbox' && (
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => handleReply(selectedMessage)}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Reply
                  </Button>
                )}
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handleDeleteMessage(selectedMessage)}
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                >
                  <Trash className="h-4 w-4 mr-2" />
                  Delete
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

        {/* Delete confirmation dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center">
                <AlertCircle className="h-5 w-5 mr-2 text-destructive" />
                Confirm Delete
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete this message?
                <div className="mt-2 p-2 border rounded bg-muted/50">
                  <strong>Subject:</strong> {messageToDelete?.subject || 'No Subject'}
                </div>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => setDeleteDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button 
                variant="destructive" 
                onClick={() => messageToDelete && deleteMessageMutation.mutate(messageToDelete.id)}
                disabled={deleteMessageMutation.isPending}
              >
                {deleteMessageMutation.isPending ? "Deleting..." : "Delete Message"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
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
              {messages.map((message) => (
                <Card 
                  key={message.id} 
                  className={`hover:bg-accent transition-colors ${!message.isRead ? 'border-primary' : ''}`}
                >
                  <CardHeader className="p-4">
                    <div className="flex justify-between items-start">
                      <div 
                        className="flex items-start space-x-4 cursor-pointer flex-1"
                        onClick={() => handleViewMessage(message.id)}
                      >
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
                      <div className="flex items-center space-x-2">
                        <div className="text-xs text-muted-foreground">
                          {formatDate(message.createdAt)}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMessage(message);
                          }}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
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
              {messages.map((message) => (
                <Card 
                  key={message.id} 
                  className="hover:bg-accent transition-colors"
                >
                  <CardHeader className="p-4">
                    <div className="flex justify-between items-start">
                      <div 
                        className="flex items-start space-x-4 cursor-pointer flex-1"
                        onClick={() => handleViewMessage(message.id)}
                      >
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
                      <div className="flex items-center space-x-2">
                        <div className="text-xs text-muted-foreground">
                          {formatDate(message.createdAt)}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteMessage(message);
                          }}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
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