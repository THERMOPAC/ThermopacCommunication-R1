import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Inbox, Send, RefreshCw, Search, UserPlus, ChevronDown, ChevronRight, Mail, MessageCircle, MailOpen, Trash, Star, StarIcon, Paperclip } from 'lucide-react';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';

// Type definitions for emails
interface Attachment {
  id: string;
  filename: string;
  contentType: string;
  size: number;
}

interface EmailMessage {
  id: string;
  threadId?: string;
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
  isHtml: boolean;
  date: string;
  read: boolean;
  starred: boolean;
  labels?: string[];
  attachments?: Attachment[];
  snippet?: string;
  isExternal: boolean;
}

const EmailManager: React.FC = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('emails'); // 'emails' or 'messages'
  const [selectedFolder, setSelectedFolder] = useState('inbox');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmail, setSelectedEmail] = useState<EmailMessage | null>(null);
  const [showComposeDialog, setShowComposeDialog] = useState(false);
  
  // Form state for compose email
  const [composeForm, setComposeForm] = useState({
    to: '',
    cc: '',
    bcc: '',
    subject: '',
    body: '',
    attachments: [] as File[]
  });

  // Query to fetch emails
  const { data: emails, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/emails', selectedFolder, searchQuery],
    queryFn: async () => {
      const response = await apiRequest('GET', 
        `/api/emails?folder=${selectedFolder}${searchQuery ? `&query=${encodeURIComponent(searchQuery)}` : ''}`
      );
      return response.json();
    }
  });

  // Query to fetch internal messages
  const { data: messages, isLoading: messagesLoading } = useQuery({
    queryKey: ['/api/messages', searchQuery],
    queryFn: async () => {
      const response = await apiRequest('GET', 
        `/api/messages${searchQuery ? `?query=${encodeURIComponent(searchQuery)}` : ''}`
      );
      return response.json();
    },
    enabled: activeTab === 'messages'
  });

  // Mutation for sending email
  const sendEmailMutation = useMutation({
    mutationFn: async (formData: FormData) => {
      const response = await fetch('/api/emails/send', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send email');
      }
      
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Email Sent',
        description: 'Your email has been sent successfully.',
      });
      setShowComposeDialog(false);
      resetComposeForm();
      queryClient.invalidateQueries({ queryKey: ['/api/emails'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Send Email',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Mutation for sending internal message
  const sendMessageMutation = useMutation({
    mutationFn: async (data: {recipientId: number, subject: string, content: string}) => {
      const response = await apiRequest('POST', '/api/messages', data);
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Message Sent',
        description: 'Your internal message has been sent successfully.',
      });
      setShowComposeDialog(false);
      resetComposeForm();
      queryClient.invalidateQueries({ queryKey: ['/api/messages'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Send Message',
        description: error.message,
        variant: 'destructive'
      });
    }
  });

  // Mutation for marking email as read
  const markAsReadMutation = useMutation({
    mutationFn: async (emailId: string) => {
      const response = await apiRequest('PATCH', `/api/emails/${emailId}/read`);
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/emails'] });
    }
  });

  // Mutation for starring/unstarring email
  const toggleStarMutation = useMutation({
    mutationFn: async ({ emailId, starred }: { emailId: string, starred: boolean }) => {
      const response = await apiRequest('PATCH', `/api/emails/${emailId}/star`, { starred });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/emails'] });
    }
  });

  // Reset compose form
  const resetComposeForm = () => {
    setComposeForm({
      to: '',
      cc: '',
      bcc: '',
      subject: '',
      body: '',
      attachments: []
    });
  };

  // Handle form input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setComposeForm(prev => ({ ...prev, [name]: value }));
  };

  // Handle file attachments
  const handleFileAttachment = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      setComposeForm(prev => ({
        ...prev,
        attachments: [...prev.attachments, ...filesArray]
      }));
    }
  };

  // Handle removing an attachment
  const handleRemoveAttachment = (index: number) => {
    setComposeForm(prev => ({
      ...prev,
      attachments: prev.attachments.filter((_, i) => i !== index)
    }));
  };

  // Handle send email
  const handleSendEmail = () => {
    const formData = new FormData();
    
    // Add email data
    formData.append('to', composeForm.to);
    formData.append('subject', composeForm.subject);
    formData.append('body', composeForm.body);
    
    if (composeForm.cc) formData.append('cc', composeForm.cc);
    if (composeForm.bcc) formData.append('bcc', composeForm.bcc);
    
    // Add attachments
    composeForm.attachments.forEach(file => {
      formData.append('attachments', file);
    });
    
    sendEmailMutation.mutate(formData);
  };

  // Handle send internal message
  const handleSendMessage = () => {
    // Assumption: for internal messages, the "to" field contains recipientId
    try {
      const recipientId = parseInt(composeForm.to);
      if (isNaN(recipientId)) {
        throw new Error("Recipient ID must be a number");
      }
      
      sendMessageMutation.mutate({
        recipientId,
        subject: composeForm.subject,
        content: composeForm.body
      });
    } catch (error) {
      toast({
        title: 'Invalid Recipient',
        description: 'Please select a valid recipient for your message.',
        variant: 'destructive'
      });
    }
  };

  // Handle selecting an email
  const handleSelectEmail = (email: EmailMessage) => {
    setSelectedEmail(email);
    
    // If email is unread, mark it as read
    if (!email.read) {
      markAsReadMutation.mutate(email.id);
    }
  };

  // Toggle star status for an email
  const handleToggleStar = (email: EmailMessage, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent email selection
    toggleStarMutation.mutate({ 
      emailId: email.id, 
      starred: !email.starred 
    });
  };

  // Function to format email date for display
  const formatEmailDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    
    // If email is from today
    if (date.toDateString() === now.toDateString()) {
      return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    }
    
    // If email is from this year
    if (date.getFullYear() === now.getFullYear()) {
      return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }
    
    // If email is from a previous year
    return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  };

  // Calculate unread count
  const unreadCount = emails?.filter((email: EmailMessage) => !email.read).length || 0;

  return (
    <div className="email-manager w-full">
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold">Communication Center</h2>
          <p className="text-muted-foreground">Manage emails and internal messages</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()} 
            className="flex items-center gap-1"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          <Button onClick={() => setShowComposeDialog(true)}>
            {activeTab === 'emails' ? 'Compose Email' : 'New Message'}
          </Button>
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="emails" className="flex items-center gap-1">
            <Mail className="h-4 w-4" />
            Emails
            {unreadCount > 0 && activeTab !== 'emails' && (
              <Badge variant="secondary" className="ml-1">{unreadCount}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="messages" className="flex items-center gap-1">
            <MessageCircle className="h-4 w-4" />
            Internal Messages
          </TabsTrigger>
        </TabsList>
        
        <div className="grid grid-cols-[250px_1fr] gap-4">
          {/* Sidebar */}
          <div className="space-y-4">
            <Card>
              <CardContent className="p-0">
                <div className="p-3">
                  <div className="relative">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search..."
                      className="pl-8"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>
                
                <TabsContent value="emails" className="m-0">
                  <div className="space-y-1 p-1">
                    <button
                      className={`w-full flex items-center gap-2 p-2 rounded-md text-sm ${selectedFolder === 'inbox' ? 'bg-secondary' : 'hover:bg-secondary/50'}`}
                      onClick={() => setSelectedFolder('inbox')}
                    >
                      <Inbox className="h-4 w-4" />
                      <span className="flex-grow text-left">Inbox</span>
                      {unreadCount > 0 && (
                        <Badge variant="secondary">{unreadCount}</Badge>
                      )}
                    </button>
                    <button
                      className={`w-full flex items-center gap-2 p-2 rounded-md text-sm ${selectedFolder === 'sent' ? 'bg-secondary' : 'hover:bg-secondary/50'}`}
                      onClick={() => setSelectedFolder('sent')}
                    >
                      <Send className="h-4 w-4" />
                      <span className="flex-grow text-left">Sent</span>
                    </button>
                    <button
                      className={`w-full flex items-center gap-2 p-2 rounded-md text-sm ${selectedFolder === 'starred' ? 'bg-secondary' : 'hover:bg-secondary/50'}`}
                      onClick={() => setSelectedFolder('starred')}
                    >
                      <Star className="h-4 w-4" />
                      <span className="flex-grow text-left">Starred</span>
                    </button>
                    <button
                      className={`w-full flex items-center gap-2 p-2 rounded-md text-sm ${selectedFolder === 'trash' ? 'bg-secondary' : 'hover:bg-secondary/50'}`}
                      onClick={() => setSelectedFolder('trash')}
                    >
                      <Trash className="h-4 w-4" />
                      <span className="flex-grow text-left">Trash</span>
                    </button>
                  </div>
                </TabsContent>
                
                <TabsContent value="messages" className="m-0">
                  <div className="space-y-1 p-1">
                    <button
                      className={`w-full flex items-center gap-2 p-2 rounded-md text-sm hover:bg-secondary/50`}
                    >
                      <Inbox className="h-4 w-4" />
                      <span className="flex-grow text-left">All Messages</span>
                    </button>
                    <button
                      className={`w-full flex items-center gap-2 p-2 rounded-md text-sm hover:bg-secondary/50`}
                    >
                      <Send className="h-4 w-4" />
                      <span className="flex-grow text-left">Sent</span>
                    </button>
                  </div>
                </TabsContent>
              </CardContent>
            </Card>
          </div>
          
          {/* Main Content */}
          <div className="space-y-4">
            <TabsContent value="emails" className="m-0">
              <Card className={`h-[calc(100vh-240px)] flex flex-col ${selectedEmail ? 'overflow-hidden' : ''}`}>
                <CardHeader className="p-4 pb-2">
                  <CardTitle>
                    {selectedFolder.charAt(0).toUpperCase() + selectedFolder.slice(1)}
                    {unreadCount > 0 && selectedFolder === 'inbox' && (
                      <Badge variant="outline" className="ml-2">{unreadCount} unread</Badge>
                    )}
                  </CardTitle>
                </CardHeader>
                
                <CardContent className="flex-grow p-0 overflow-hidden">
                  {isLoading ? (
                    <div className="flex items-center justify-center h-full">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : error ? (
                    <div className="flex items-center justify-center h-full text-destructive">
                      An error occurred while loading emails.
                    </div>
                  ) : emails?.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full p-8 text-center text-muted-foreground">
                      <Mail className="h-12 w-12 mb-2" />
                      <h3 className="text-lg font-medium">No emails found</h3>
                      <p>This folder is empty or no emails match your search.</p>
                    </div>
                  ) : (
                    <div className={`flex ${selectedEmail ? 'h-full' : ''}`}>
                      {/* Email List */}
                      <div className={`${selectedEmail ? 'w-1/3 border-r' : 'w-full'} overflow-auto`}>
                        {emails?.map((email: EmailMessage) => (
                          <div
                            key={email.id}
                            onClick={() => handleSelectEmail(email)}
                            className={`p-3 border-b cursor-pointer transition-colors ${
                              !email.read ? 'bg-blue-50 dark:bg-blue-950/20' : ''
                            } ${selectedEmail?.id === email.id ? 'bg-secondary' : 'hover:bg-secondary/30'}`}
                          >
                            <div className="flex items-start gap-2">
                              <button 
                                onClick={(e) => handleToggleStar(email, e)}
                                className="mt-1"
                              >
                                {email.starred ? (
                                  <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                                ) : (
                                  <Star className="h-4 w-4 text-muted-foreground" />
                                )}
                              </button>
                              <div className="flex-grow min-w-0">
                                <div className="flex justify-between">
                                  <span className={`text-sm truncate font-medium ${!email.read ? 'font-semibold' : ''}`}>
                                    {selectedFolder === 'sent' ? `To: ${email.to.join(', ')}` : email.from}
                                  </span>
                                  <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                                    {formatEmailDate(email.date)}
                                  </span>
                                </div>
                                <div className="text-sm font-medium truncate">
                                  {email.subject || "(No subject)"}
                                </div>
                                <div className="text-xs text-muted-foreground line-clamp-1">
                                  {email.snippet || email.body.substring(0, 100)}
                                </div>
                                <div className="flex gap-1 mt-1">
                                  {email.isExternal && (
                                    <Badge variant="outline" className="text-xs py-0 h-5">
                                      External
                                    </Badge>
                                  )}
                                  {email.attachments && email.attachments.length > 0 && (
                                    <Badge variant="outline" className="text-xs py-0 h-5 flex items-center gap-1">
                                      <Paperclip className="h-3 w-3" />
                                      {email.attachments.length}
                                    </Badge>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                      
                      {/* Email View */}
                      {selectedEmail && (
                        <div className="w-2/3 overflow-auto p-4">
                          <div className="flex justify-between items-start mb-4">
                            <div>
                              <h3 className="text-xl font-bold">{selectedEmail.subject || "(No subject)"}</h3>
                              <div className="text-sm text-muted-foreground mt-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">From:</span> {selectedEmail.from}
                                </div>
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">To:</span> {selectedEmail.to.join(', ')}
                                </div>
                                {selectedEmail.cc && selectedEmail.cc.length > 0 && (
                                  <div className="flex items-center gap-2">
                                    <span className="font-medium">Cc:</span> {selectedEmail.cc.join(', ')}
                                  </div>
                                )}
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="font-medium">Date:</span> {new Date(selectedEmail.date).toLocaleString()}
                                </div>
                              </div>
                            </div>
                            <div className="flex gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => setSelectedEmail(null)}
                              >
                                Close
                              </Button>
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button variant="outline" size="sm">
                                    Actions
                                    <ChevronDown className="h-4 w-4 ml-1" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem>Reply</DropdownMenuItem>
                                  <DropdownMenuItem>Forward</DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem className="text-destructive">
                                    Delete
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </div>
                          </div>
                          
                          {selectedEmail.attachments && selectedEmail.attachments.length > 0 && (
                            <div className="mb-4 p-3 bg-secondary/30 rounded-md">
                              <h4 className="text-sm font-medium mb-2">Attachments ({selectedEmail.attachments.length})</h4>
                              <div className="flex flex-wrap gap-2">
                                {selectedEmail.attachments.map((attachment) => (
                                  <div 
                                    key={attachment.id} 
                                    className="flex items-center gap-2 p-2 bg-background border rounded-md text-sm"
                                  >
                                    <Paperclip className="h-4 w-4" />
                                    <span className="truncate max-w-[150px]">{attachment.filename}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {(attachment.size / 1024).toFixed(0)} KB
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          <Separator className="my-4" />
                          
                          <div className="email-body mt-4">
                            {selectedEmail.isHtml ? (
                              <div 
                                dangerouslySetInnerHTML={{ __html: selectedEmail.body }}
                                className="prose dark:prose-invert max-w-none"
                              />
                            ) : (
                              <pre className="whitespace-pre-wrap text-sm">{selectedEmail.body}</pre>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="messages" className="m-0">
              <Card className="h-[calc(100vh-240px)]">
                <CardHeader className="p-4 pb-2">
                  <CardTitle>Internal Messages</CardTitle>
                </CardHeader>
                
                <CardContent className="p-0">
                  {messagesLoading ? (
                    <div className="flex items-center justify-center h-64">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : messages?.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-8 text-center text-muted-foreground">
                      <MessageCircle className="h-12 w-12 mb-2" />
                      <h3 className="text-lg font-medium">No messages found</h3>
                      <p>Start a conversation with a team member.</p>
                    </div>
                  ) : (
                    <div className="space-y-2 p-4">
                      {/* Message data would go here */}
                      <div className="text-center text-muted-foreground italic">
                        Message feature is under development
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </div>
        </div>
      </Tabs>
      
      {/* Compose Dialog */}
      <Dialog open={showComposeDialog} onOpenChange={setShowComposeDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>
              {activeTab === 'emails' ? 'Compose Email' : 'New Internal Message'}
            </DialogTitle>
            <DialogDescription>
              {activeTab === 'emails' 
                ? 'Send an email to external recipients' 
                : 'Send a message to team members'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid w-full gap-1.5">
              <Label htmlFor="to">{activeTab === 'emails' ? 'To' : 'Recipient'}</Label>
              <Input
                id="to"
                name="to"
                value={composeForm.to}
                onChange={handleInputChange}
                placeholder={activeTab === 'emails' ? "recipient@example.com" : "Select recipient"}
              />
            </div>
            
            {activeTab === 'emails' && (
              <>
                <div className="grid w-full gap-1.5">
                  <Label htmlFor="cc">Cc</Label>
                  <Input
                    id="cc"
                    name="cc"
                    value={composeForm.cc}
                    onChange={handleInputChange}
                    placeholder="cc@example.com"
                  />
                </div>
                
                <div className="grid w-full gap-1.5">
                  <Label htmlFor="bcc">Bcc</Label>
                  <Input
                    id="bcc"
                    name="bcc"
                    value={composeForm.bcc}
                    onChange={handleInputChange}
                    placeholder="bcc@example.com"
                  />
                </div>
              </>
            )}
            
            <div className="grid w-full gap-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input
                id="subject"
                name="subject"
                value={composeForm.subject}
                onChange={handleInputChange}
                placeholder="Subject"
              />
            </div>
            
            <div className="grid w-full gap-1.5">
              <Label htmlFor="body">Message</Label>
              <Textarea
                id="body"
                name="body"
                value={composeForm.body}
                onChange={handleInputChange}
                placeholder="Write your message here..."
                className="min-h-[200px]"
              />
            </div>
            
            {activeTab === 'emails' && (
              <div className="space-y-2">
                <Label>Attachments</Label>
                
                {composeForm.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {composeForm.attachments.map((file, index) => (
                      <div 
                        key={index} 
                        className="flex items-center gap-2 p-2 bg-secondary/30 rounded-md text-sm"
                      >
                        <Paperclip className="h-4 w-4" />
                        <span className="truncate max-w-[150px]">{file.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {(file.size / 1024).toFixed(0)} KB
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleRemoveAttachment(index)}
                        >
                          <Trash className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
                
                <div className="flex items-center gap-2">
                  <Label htmlFor="attachment" className="cursor-pointer text-sm px-2 py-1 border rounded-md hover:bg-secondary/50">
                    Add Attachment
                  </Label>
                  <Input
                    id="attachment"
                    type="file"
                    onChange={handleFileAttachment}
                    className="hidden"
                    multiple
                  />
                  <span className="text-xs text-muted-foreground">
                    {composeForm.attachments.length} file(s) attached
                  </span>
                </div>
              </div>
            )}
          </div>
          
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setShowComposeDialog(false)}>
              Cancel
            </Button>
            <Button 
              type="button" 
              onClick={activeTab === 'emails' ? handleSendEmail : handleSendMessage}
              disabled={
                sendEmailMutation.isPending || 
                sendMessageMutation.isPending || 
                !composeForm.to || 
                !composeForm.subject
              }
            >
              {(sendEmailMutation.isPending || sendMessageMutation.isPending) ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default EmailManager;