import React, { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { User } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Mail, Send, RefreshCw, User as UserIcon, Bell } from "lucide-react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Define types
interface Message {
  id: number;
  senderId: number;
  receiverId: number;
  content: string;
  read: boolean;
  createdAt: string;
}

interface Notification {
  id: number;
  userId: number;
  title: string;
  content: string;
  read: boolean;
  type: "task" | "system" | "alert";
  createdAt: string;
  relatedEntityId?: number;
}

// Define form schema
const messageSchema = z.object({
  content: z.string().min(1, "Message cannot be empty"),
  receiverId: z.string().min(1, "Please select a recipient"),
});

type MessageFormValues = z.infer<typeof messageSchema>;

export default function MessagesComponent() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState("inbox");

  // Fetch users for the sender dropdown
  const { data: users = [] } = useQuery<User[]>({
    queryKey: ["/api/users"],
  });

  // Mock data for demonstration - replace with actual API calls
  const mockMessages: Message[] = [
    {
      id: 1,
      senderId: 2,
      receiverId: user?.id || 0,
      content: "Need to discuss the new project timelines, can we meet tomorrow?",
      read: false,
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 2,
      senderId: 5,
      receiverId: user?.id || 0,
      content: "Monthly report is ready for your review.",
      read: true,
      createdAt: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: 3,
      senderId: user?.id || 0,
      receiverId: 4,
      content: "Please send me the presentation for tomorrow's meeting.",
      read: true,
      createdAt: new Date(Date.now() - 172800000).toISOString(),
    },
  ];

  const mockNotifications: Notification[] = [
    {
      id: 1,
      userId: user?.id || 0,
      title: "Task Assigned",
      content: "You have been assigned a new task: 'Quarterly Report Review'",
      read: false,
      type: "task",
      createdAt: new Date(Date.now() - 7200000).toISOString(),
      relatedEntityId: 42,
    },
    {
      id: 2,
      userId: user?.id || 0,
      title: "System Update",
      content: "The system will undergo maintenance tonight at 10PM",
      read: false,
      type: "system",
      createdAt: new Date(Date.now() - 43200000).toISOString(),
    },
    {
      id: 3,
      userId: user?.id || 0,
      title: "Task Deadline Approaching",
      content: "Task 'Monthly Budget Review' is due in 2 days",
      read: true,
      type: "alert",
      createdAt: new Date(Date.now() - 129600000).toISOString(),
      relatedEntityId: 36,
    },
  ];

  // In a real implementation, these would be API calls
  const inboxMessages = mockMessages.filter(m => m.receiverId === user?.id && m.senderId !== user?.id);
  const sentMessages = mockMessages.filter(m => m.senderId === user?.id);
  const notifications = mockNotifications.filter(n => n.userId === user?.id);

  // Form setup for sending messages
  const form = useForm<MessageFormValues>({
    resolver: zodResolver(messageSchema),
    defaultValues: {
      content: "",
      receiverId: "",
    },
  });

  // This would be a real API mutation in production
  const sendMessageMutation = useMutation({
    mutationFn: async (data: MessageFormValues) => {
      // This is a mock implementation - replace with actual API call
      const mockResponse = {
        id: Math.floor(Math.random() * 1000),
        senderId: user?.id || 0,
        receiverId: parseInt(data.receiverId),
        content: data.content,
        read: false,
        createdAt: new Date().toISOString(),
      };
      return mockResponse;
    },
    onSuccess: () => {
      toast({
        title: "Message sent",
        description: "Your message has been sent successfully",
      });
      form.reset();
      // In real implementation, invalidate queries to refresh messages
      // queryClient.invalidateQueries({ queryKey: ["/api/messages"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error sending message",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Function to handle form submission
  const onSubmit = (data: MessageFormValues) => {
    sendMessageMutation.mutate(data);
  };

  // Helper to get username by ID
  const getUsernameById = (id: number) => {
    const user = users.find(u => u.id === id);
    return user ? user.username : "Unknown User";
  };

  // Helper to format date
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Messages & Notifications</h1>
      
      <Tabs defaultValue="inbox" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="inbox" className="flex items-center justify-center gap-2">
            <Mail className="h-4 w-4" />
            Inbox
            {inboxMessages.filter(m => !m.read).length > 0 && (
              <Badge className="ml-1 bg-primary h-5 w-5 flex items-center justify-center p-0">
                {inboxMessages.filter(m => !m.read).length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sent" className="flex items-center justify-center gap-2">
            <Send className="h-4 w-4" />
            Sent
          </TabsTrigger>
          <TabsTrigger value="notifications" className="flex items-center justify-center gap-2">
            <Bell className="h-4 w-4" />
            Notifications
            {notifications.filter(n => !n.read).length > 0 && (
              <Badge className="ml-1 bg-primary h-5 w-5 flex items-center justify-center p-0">
                {notifications.filter(n => !n.read).length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="inbox" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle>Inbox</CardTitle>
                <Button variant="outline" size="sm" className="flex items-center gap-1">
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {inboxMessages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Mail className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>Your inbox is empty</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {inboxMessages.map((message) => (
                    <div 
                      key={message.id} 
                      className={`p-4 border rounded-lg ${!message.read ? 'bg-primary/5 border-primary/20' : 'bg-card'}`}
                    >
                      <div className="flex items-start gap-3">
                        <Avatar>
                          <AvatarFallback>
                            {getUsernameById(message.senderId).charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">{getUsernameById(message.senderId)}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(message.createdAt)}
                              </p>
                            </div>
                            {!message.read && (
                              <Badge variant="default" className="ml-2">New</Badge>
                            )}
                          </div>
                          <p className="mt-2">{message.content}</p>
                          <div className="flex gap-2 mt-3">
                            <Button size="sm" variant="outline">Reply</Button>
                            <Button size="sm" variant="ghost">Mark as {message.read ? 'unread' : 'read'}</Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="sent" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle>Sent Messages</CardTitle>
                <Button variant="outline" size="sm" className="flex items-center gap-1">
                  <RefreshCw className="h-4 w-4" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {sentMessages.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Send className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>You haven't sent any messages yet</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sentMessages.map((message) => (
                    <div key={message.id} className="p-4 border rounded-lg bg-card">
                      <div className="flex items-start gap-3">
                        <Avatar>
                          <AvatarFallback>
                            {getUsernameById(message.receiverId).charAt(0)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1">
                          <div className="flex justify-between">
                            <div>
                              <p className="font-medium">To: {getUsernameById(message.receiverId)}</p>
                              <p className="text-xs text-muted-foreground">
                                {formatDate(message.createdAt)}
                              </p>
                            </div>
                            {message.read ? (
                              <Badge variant="outline" className="text-xs">Read</Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs">Delivered</Badge>
                            )}
                          </div>
                          <p className="mt-2">{message.content}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="notifications" className="mt-4">
          <Card>
            <CardHeader className="pb-3">
              <div className="flex justify-between items-center">
                <CardTitle>Notifications</CardTitle>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm">Mark all as read</Button>
                  <Button variant="outline" size="sm" className="flex items-center gap-1">
                    <RefreshCw className="h-4 w-4" />
                    Refresh
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {notifications.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-3 opacity-20" />
                  <p>No notifications</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notifications.map((notification) => (
                    <div 
                      key={notification.id} 
                      className={`p-3 border rounded-lg ${!notification.read ? 'bg-primary/5 border-primary/20' : 'bg-card'}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`
                          p-2 rounded-full
                          ${notification.type === 'task' ? 'bg-blue-100 text-blue-600' : 
                            notification.type === 'system' ? 'bg-purple-100 text-purple-600' : 
                            'bg-amber-100 text-amber-600'}
                        `}>
                          {notification.type === 'task' ? 
                            <UserIcon className="h-4 w-4" /> : 
                            notification.type === 'system' ? 
                            <Bell className="h-4 w-4" /> : 
                            <Bell className="h-4 w-4" />
                          }
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between">
                            <p className="font-medium">{notification.title}</p>
                            {!notification.read && (
                              <Badge variant="default" className="ml-2">New</Badge>
                            )}
                          </div>
                          <p className="text-sm">{notification.content}</p>
                          <p className="text-xs text-muted-foreground mt-1">
                            {formatDate(notification.createdAt)}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      {/* Message Composer */}
      {activeTab === "sent" && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Send New Message</CardTitle>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="receiverId"
                  render={({ field }) => (
                    <FormItem>
                      <Select 
                        onValueChange={field.onChange} 
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select recipient" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {users
                            .filter(u => u.id !== user?.id)
                            .map((u) => (
                              <SelectItem key={u.id} value={u.id.toString()}>
                                {u.username} ({u.role})
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <FormField
                  control={form.control}
                  name="content"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <Textarea 
                          placeholder="Type your message here..." 
                          className="min-h-[120px] resize-none"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
                <div className="flex justify-end">
                  <Button 
                    type="submit" 
                    className="gap-2"
                    disabled={sendMessageMutation.isPending}
                  >
                    {sendMessageMutation.isPending ? (
                      <>
                        <RefreshCw className="h-4 w-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4" />
                        Send Message
                      </>
                    )}
                  </Button>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}