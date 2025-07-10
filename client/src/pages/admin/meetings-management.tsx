import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import Layout from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useToast } from '@/hooks/use-toast';
import {
  CalendarIcon,
  ClockIcon,
  UsersIcon,
  MapPinIcon,
  PlusIcon,
  EditIcon,
  TrashIcon,
  CheckIcon,
  XIcon,
  AlertCircleIcon,
  TrendingUpIcon,
  CalendarDaysIcon,
  ListChecksIcon,
  BellIcon,
  BarChart3Icon,
  SearchIcon,
  FilterIcon,
  MoreHorizontalIcon
} from 'lucide-react';
import { format, parseISO, addDays } from 'date-fns';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

// Form schemas
const meetingFormSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  meetingType: z.string().min(1, 'Meeting type is required'),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']),
  meetingDate: z.string().min(1, 'Meeting date is required'),
  startTime: z.string().min(1, 'Start time is required'),
  endTime: z.string().min(1, 'End time is required'),
  location: z.string().optional(),
  meetingUrl: z.string().optional(),
  attendeeIds: z.array(z.number()).default([]),
  agenda: z.string().optional(),
});

const commitmentFormSchema = z.object({
  meetingId: z.number(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']),
  assignedToId: z.number().min(1, 'Assignee is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  estimatedHours: z.number().optional(),
  businessValue: z.string().optional(),
  successCriteria: z.string().optional(),
});

type MeetingFormData = z.infer<typeof meetingFormSchema>;
type CommitmentFormData = z.infer<typeof commitmentFormSchema>;

interface Meeting {
  meeting: {
    id: number;
    title: string;
    description: string;
    meetingType: string;
    priority: string;
    meetingDate: string;
    startTime: string;
    endTime: string;
    location: string;
    attendeeIds: number[];
    status: string;
    organizerId: number;
    createdAt: string;
  };
  organizer: {
    id: number;
    username: string;
    firstName: string;
    lastName: string;
  };
}

interface Commitment {
  commitment: {
    id: number;
    meetingId: number;
    title: string;
    description: string;
    priority: string;
    assignedToId: number;
    dueDate: string;
    status: string;
    progressPercentage: number;
    createdAt: string;
  };
  assignedTo: {
    id: number;
    username: string;
    firstName: string;
    lastName: string;
  };
  meeting: {
    id: number;
    title: string;
    meetingDate: string;
  };
}

interface DashboardStats {
  meetings: {
    total: number;
    organized: number;
    attended: number;
  };
  commitments: {
    total: number;
    pending: number;
    inProgress: number;
    completed: number;
    overdue: number;
  };
}

interface User {
  id: number;
  username: string;
  firstName: string;
  lastName: string;
  role: string;
}

export default function MeetingsManagement() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [isCreateMeetingOpen, setIsCreateMeetingOpen] = useState(false);
  const [isCreateCommitmentOpen, setIsCreateCommitmentOpen] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<Meeting | null>(null);
  const [editingCommitment, setEditingCommitment] = useState<Commitment | null>(null);

  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch dashboard stats
  const { data: dashboardStats } = useQuery<DashboardStats>({
    queryKey: ['/api/meetings/dashboard/stats'],
    enabled: activeTab === 'dashboard',
  });

  // Fetch upcoming meetings
  const { data: upcomingMeetings } = useQuery<{ meetings: Meeting[] }>({
    queryKey: ['/api/meetings/dashboard/upcoming'],
    enabled: activeTab === 'dashboard',
  });

  // Fetch all meetings
  const { data: meetingsData, isLoading: meetingsLoading } = useQuery<{ meetings: Meeting[] }>({
    queryKey: ['/api/meetings', { status: statusFilter, type: typeFilter, priority: priorityFilter }],
    enabled: activeTab === 'meetings',
  });

  // Fetch commitments
  const { data: commitmentsData, isLoading: commitmentsLoading } = useQuery<{ commitments: Commitment[] }>({
    queryKey: ['/api/meetings/commitments', { status: statusFilter, priority: priorityFilter }],
    enabled: activeTab === 'commitments',
  });

  // Fetch users for dropdowns
  const { data: users } = useQuery<User[]>({
    queryKey: ['/api/admin/users'],
  });

  // Create meeting mutation
  const createMeetingMutation = useMutation({
    mutationFn: (data: MeetingFormData) => apiRequest('POST', '/api/meetings', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/meetings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/meetings/dashboard/stats'] });
      setIsCreateMeetingOpen(false);
      toast({ title: 'Meeting created successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Error creating meeting', description: error.message, variant: 'destructive' });
    },
  });

  // Update meeting mutation
  const updateMeetingMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<MeetingFormData> }) =>
      apiRequest('PUT', `/api/meetings/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/meetings'] });
      setEditingMeeting(null);
      toast({ title: 'Meeting updated successfully' });
    },
  });

  // Delete meeting mutation
  const deleteMeetingMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/meetings/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/meetings'] });
      toast({ title: 'Meeting deleted successfully' });
    },
  });

  // Create commitment mutation
  const createCommitmentMutation = useMutation({
    mutationFn: (data: CommitmentFormData) => apiRequest('POST', '/api/meetings/commitments', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/meetings/commitments'] });
      queryClient.invalidateQueries({ queryKey: ['/api/meetings/dashboard/stats'] });
      setIsCreateCommitmentOpen(false);
      toast({ title: 'Commitment created successfully' });
    },
  });

  // Update commitment mutation
  const updateCommitmentMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CommitmentFormData> }) =>
      apiRequest('PUT', `/api/meetings/commitments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/meetings/commitments'] });
      setEditingCommitment(null);
      toast({ title: 'Commitment updated successfully' });
    },
  });

  // Delete commitment mutation
  const deleteCommitmentMutation = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/meetings/commitments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/meetings/commitments'] });
      toast({ title: 'Commitment deleted successfully' });
    },
  });

  // Send reminder mutation
  const sendReminderMutation = useMutation({
    mutationFn: (commitmentId: number) =>
      apiRequest('POST', `/api/meetings/commitments/${commitmentId}/remind`, {}),
    onSuccess: () => {
      toast({ title: 'Reminder sent successfully' });
    },
  });

  // Filter meetings based on search and filters
  const filteredMeetings = useMemo(() => {
    if (!meetingsData?.meetings) return [];
    
    return meetingsData.meetings.filter((meeting) => {
      const matchesSearch = !searchTerm || 
        meeting.meeting.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        meeting.meeting.description?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = !statusFilter || statusFilter === 'all' || meeting.meeting.status === statusFilter;
      const matchesType = !typeFilter || typeFilter === 'all' || meeting.meeting.meetingType === typeFilter;
      const matchesPriority = !priorityFilter || priorityFilter === 'all' || meeting.meeting.priority === priorityFilter;
      
      return matchesSearch && matchesStatus && matchesType && matchesPriority;
    });
  }, [meetingsData, searchTerm, statusFilter, typeFilter, priorityFilter]);

  // Filter commitments based on search and filters
  const filteredCommitments = useMemo(() => {
    if (!commitmentsData?.commitments) return [];
    
    return commitmentsData.commitments.filter((commitment) => {
      const matchesSearch = !searchTerm || 
        commitment.commitment.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        commitment.commitment.description?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesStatus = !statusFilter || statusFilter === 'all' || commitment.commitment.status === statusFilter;
      const matchesPriority = !priorityFilter || priorityFilter === 'all' || commitment.commitment.priority === priorityFilter;
      
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [commitmentsData, searchTerm, statusFilter, priorityFilter]);

  // Forms
  const meetingForm = useForm<MeetingFormData>({
    resolver: zodResolver(meetingFormSchema),
    defaultValues: {
      title: '',
      description: '',
      meetingType: '',
      priority: 'Medium',
      meetingDate: '',
      startTime: '',
      endTime: '',
      location: '',
      meetingUrl: '',
      attendeeIds: [],
      agenda: '',
    },
  });

  const commitmentForm = useForm<CommitmentFormData>({
    resolver: zodResolver(commitmentFormSchema),
    defaultValues: {
      meetingId: 0,
      title: '',
      description: '',
      priority: 'Medium',
      assignedToId: 0,
      dueDate: '',
      estimatedHours: undefined,
      businessValue: '',
      successCriteria: '',
    },
  });

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Critical': return 'bg-red-100 text-red-800';
      case 'High': return 'bg-orange-100 text-orange-800';
      case 'Medium': return 'bg-yellow-100 text-yellow-800';
      case 'Low': return 'bg-green-100 text-green-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Completed': return 'bg-green-100 text-green-800';
      case 'In Progress': return 'bg-blue-100 text-blue-800';
      case 'Scheduled': return 'bg-blue-100 text-blue-800';
      case 'Pending': return 'bg-yellow-100 text-yellow-800';
      case 'Overdue': return 'bg-red-100 text-red-800';
      case 'Cancelled': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const onSubmitMeeting = (data: MeetingFormData) => {
    if (editingMeeting) {
      updateMeetingMutation.mutate({ id: editingMeeting.meeting.id, data });
    } else {
      createMeetingMutation.mutate(data);
    }
  };

  const onSubmitCommitment = (data: CommitmentFormData) => {
    if (editingCommitment) {
      updateCommitmentMutation.mutate({ id: editingCommitment.commitment.id, data });
    } else {
      createCommitmentMutation.mutate(data);
    }
  };

  const resetMeetingForm = () => {
    meetingForm.reset();
    setEditingMeeting(null);
    setIsCreateMeetingOpen(false);
  };

  const resetCommitmentForm = () => {
    commitmentForm.reset();
    setEditingCommitment(null);
    setIsCreateCommitmentOpen(false);
  };

  const startEditMeeting = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    meetingForm.reset({
      title: meeting.meeting.title,
      description: meeting.meeting.description || '',
      meetingType: meeting.meeting.meetingType,
      priority: meeting.meeting.priority as any,
      meetingDate: meeting.meeting.meetingDate,
      startTime: meeting.meeting.startTime,
      endTime: meeting.meeting.endTime,
      location: meeting.meeting.location || '',
      attendeeIds: meeting.meeting.attendeeIds || [],
    });
    setIsCreateMeetingOpen(true);
  };

  const startEditCommitment = (commitment: Commitment) => {
    setEditingCommitment(commitment);
    commitmentForm.reset({
      meetingId: commitment.commitment.meetingId,
      title: commitment.commitment.title,
      description: commitment.commitment.description || '',
      priority: commitment.commitment.priority as any,
      assignedToId: commitment.commitment.assignedToId,
      dueDate: commitment.commitment.dueDate,
    });
    setIsCreateCommitmentOpen(true);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">Meetings & Commitments</h1>
            <p className="text-gray-600">Manage business meetings and track action items</p>
          </div>
        </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <BarChart3Icon className="h-4 w-4" />
            Dashboard
          </TabsTrigger>
          <TabsTrigger value="meetings" className="flex items-center gap-2">
            <CalendarDaysIcon className="h-4 w-4" />
            Meetings
          </TabsTrigger>
          <TabsTrigger value="commitments" className="flex items-center gap-2">
            <ListChecksIcon className="h-4 w-4" />
            Commitments
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <TrendingUpIcon className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Meetings</p>
                  <p className="text-3xl font-bold">{dashboardStats?.meetings.total || 0}</p>
                </div>
                <CalendarDaysIcon className="h-8 w-8 text-blue-600" />
              </div>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Organized</p>
                  <p className="text-3xl font-bold">{dashboardStats?.meetings.organized || 0}</p>
                </div>
                <UsersIcon className="h-8 w-8 text-green-600" />
              </div>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending Commitments</p>
                  <p className="text-3xl font-bold">{dashboardStats?.commitments.pending || 0}</p>
                </div>
                <ListChecksIcon className="h-8 w-8 text-yellow-600" />
              </div>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Overdue Items</p>
                  <p className="text-3xl font-bold text-red-600">{dashboardStats?.commitments.overdue || 0}</p>
                </div>
                <AlertCircleIcon className="h-8 w-8 text-red-600" />
              </div>
            </Card>
          </div>

          {/* Upcoming Meetings */}
          <Card>
            <div className="p-6 border-b">
              <h3 className="text-lg font-semibold">Upcoming Meetings</h3>
            </div>
            <div className="p-6">
              {upcomingMeetings?.meetings?.length ? (
                <div className="space-y-4">
                  {upcomingMeetings.meetings.slice(0, 5).map((meeting) => (
                    <div key={meeting.meeting.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                      <div className="flex-1">
                        <h4 className="font-medium">{meeting.meeting.title}</h4>
                        <div className="flex items-center gap-4 text-sm text-gray-600 mt-1">
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="h-4 w-4" />
                            {format(parseISO(meeting.meeting.meetingDate), 'MMM dd, yyyy')}
                          </span>
                          <span className="flex items-center gap-1">
                            <ClockIcon className="h-4 w-4" />
                            {meeting.meeting.startTime} - {meeting.meeting.endTime}
                          </span>
                          {meeting.meeting.location && (
                            <span className="flex items-center gap-1">
                              <MapPinIcon className="h-4 w-4" />
                              {meeting.meeting.location}
                            </span>
                          )}
                        </div>
                      </div>
                      <Badge className={getPriorityColor(meeting.meeting.priority)}>
                        {meeting.meeting.priority}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No upcoming meetings</p>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* Meetings Tab */}
        <TabsContent value="meetings" className="space-y-6">
          {/* Search and Filters */}
          <Card className="p-6">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                <div className="relative flex-1 max-w-md">
                  <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search meetings..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="Scheduled">Scheduled</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="Team Meeting">Team Meeting</SelectItem>
                    <SelectItem value="One-on-One">One-on-One</SelectItem>
                    <SelectItem value="Board Meeting">Board Meeting</SelectItem>
                    <SelectItem value="Client Meeting">Client Meeting</SelectItem>
                    <SelectItem value="Project Review">Project Review</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priority</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Dialog open={isCreateMeetingOpen} onOpenChange={setIsCreateMeetingOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => { resetMeetingForm(); setIsCreateMeetingOpen(true); }}>
                    <PlusIcon className="h-4 w-4 mr-2" />
                    New Meeting
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>{editingMeeting ? 'Edit Meeting' : 'Create New Meeting'}</DialogTitle>
                  </DialogHeader>
                  <Form {...meetingForm}>
                    <form onSubmit={meetingForm.handleSubmit(onSubmitMeeting)} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={meetingForm.control}
                          name="title"
                          render={({ field }) => (
                            <FormItem className="col-span-2">
                              <FormLabel>Meeting Title</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter meeting title" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={meetingForm.control}
                          name="meetingType"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Meeting Type</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select type" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Team Meeting">Team Meeting</SelectItem>
                                  <SelectItem value="One-on-One">One-on-One</SelectItem>
                                  <SelectItem value="Board Meeting">Board Meeting</SelectItem>
                                  <SelectItem value="Client Meeting">Client Meeting</SelectItem>
                                  <SelectItem value="Project Review">Project Review</SelectItem>
                                  <SelectItem value="Training">Training</SelectItem>
                                  <SelectItem value="Interview">Interview</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={meetingForm.control}
                          name="priority"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Priority</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select priority" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Low">Low</SelectItem>
                                  <SelectItem value="Medium">Medium</SelectItem>
                                  <SelectItem value="High">High</SelectItem>
                                  <SelectItem value="Critical">Critical</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={meetingForm.control}
                          name="meetingDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Meeting Date</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={meetingForm.control}
                          name="startTime"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Start Time</FormLabel>
                              <FormControl>
                                <Input type="time" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={meetingForm.control}
                          name="endTime"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>End Time</FormLabel>
                              <FormControl>
                                <Input type="time" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={meetingForm.control}
                          name="location"
                          render={({ field }) => (
                            <FormItem className="col-span-2">
                              <FormLabel>Location</FormLabel>
                              <FormControl>
                                <Input placeholder="Meeting location or online meeting URL" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={meetingForm.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem className="col-span-2">
                              <FormLabel>Description</FormLabel>
                              <FormControl>
                                <Textarea placeholder="Meeting description" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={meetingForm.control}
                          name="agenda"
                          render={({ field }) => (
                            <FormItem className="col-span-2">
                              <FormLabel>Agenda</FormLabel>
                              <FormControl>
                                <Textarea placeholder="Meeting agenda items" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="flex justify-end gap-3">
                        <Button type="button" variant="outline" onClick={resetMeetingForm}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createMeetingMutation.isPending || updateMeetingMutation.isPending}>
                          {editingMeeting ? 'Update Meeting' : 'Create Meeting'}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </Card>

          {/* Meetings List */}
          <Card>
            <div className="p-6">
              {meetingsLoading ? (
                <div className="text-center py-8">Loading meetings...</div>
              ) : filteredMeetings.length > 0 ? (
                <div className="space-y-4">
                  {filteredMeetings.map((meeting) => (
                    <div key={meeting.meeting.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{meeting.meeting.title}</h3>
                            <Badge className={getPriorityColor(meeting.meeting.priority)}>
                              {meeting.meeting.priority}
                            </Badge>
                            <Badge className={getStatusColor(meeting.meeting.status)}>
                              {meeting.meeting.status}
                            </Badge>
                          </div>
                          {meeting.meeting.description && (
                            <p className="text-gray-600 mb-3">{meeting.meeting.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="h-4 w-4" />
                              {format(parseISO(meeting.meeting.meetingDate), 'MMM dd, yyyy')}
                            </span>
                            <span className="flex items-center gap-1">
                              <ClockIcon className="h-4 w-4" />
                              {meeting.meeting.startTime} - {meeting.meeting.endTime}
                            </span>
                            {meeting.meeting.location && (
                              <span className="flex items-center gap-1">
                                <MapPinIcon className="h-4 w-4" />
                                {meeting.meeting.location}
                              </span>
                            )}
                            <span className="flex items-center gap-1">
                              <UsersIcon className="h-4 w-4" />
                              Organized by {meeting.organizer.username}
                            </span>
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0">
                              <MoreHorizontalIcon className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => startEditMeeting(meeting)}>
                              <EditIcon className="h-4 w-4 mr-2" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem 
                              className="text-red-600"
                              onClick={() => deleteMeetingMutation.mutate(meeting.meeting.id)}
                            >
                              <TrashIcon className="h-4 w-4 mr-2" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CalendarDaysIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No meetings found</p>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* Commitments Tab */}
        <TabsContent value="commitments" className="space-y-6">
          {/* Search and Filters */}
          <Card className="p-6">
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
              <div className="flex items-center gap-4 flex-1">
                <div className="relative flex-1 max-w-md">
                  <SearchIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="Search commitments..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[140px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="Pending">Pending</SelectItem>
                    <SelectItem value="In Progress">In Progress</SelectItem>
                    <SelectItem value="Completed">Completed</SelectItem>
                    <SelectItem value="Overdue">Overdue</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Priority" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priority</SelectItem>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Dialog open={isCreateCommitmentOpen} onOpenChange={setIsCreateCommitmentOpen}>
                <DialogTrigger asChild>
                  <Button onClick={() => { resetCommitmentForm(); setIsCreateCommitmentOpen(true); }}>
                    <PlusIcon className="h-4 w-4 mr-2" />
                    New Commitment
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>{editingCommitment ? 'Edit Commitment' : 'Create New Commitment'}</DialogTitle>
                  </DialogHeader>
                  <Form {...commitmentForm}>
                    <form onSubmit={commitmentForm.handleSubmit(onSubmitCommitment)} className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <FormField
                          control={commitmentForm.control}
                          name="meetingId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Related Meeting</FormLabel>
                              <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={field.value?.toString()}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select meeting" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {meetingsData?.meetings.map((meeting) => (
                                    <SelectItem key={meeting.meeting.id} value={meeting.meeting.id.toString()}>
                                      {meeting.meeting.title}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={commitmentForm.control}
                          name="assignedToId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Assigned To</FormLabel>
                              <Select onValueChange={(value) => field.onChange(parseInt(value))} defaultValue={field.value?.toString()}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select assignee" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {users?.map((user) => (
                                    <SelectItem key={user.id} value={user.id.toString()}>
                                      {user.username} ({user.role})
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={commitmentForm.control}
                          name="title"
                          render={({ field }) => (
                            <FormItem className="col-span-2">
                              <FormLabel>Commitment Title</FormLabel>
                              <FormControl>
                                <Input placeholder="Enter commitment title" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={commitmentForm.control}
                          name="priority"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Priority</FormLabel>
                              <Select onValueChange={field.onChange} defaultValue={field.value}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select priority" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  <SelectItem value="Low">Low</SelectItem>
                                  <SelectItem value="Medium">Medium</SelectItem>
                                  <SelectItem value="High">High</SelectItem>
                                  <SelectItem value="Critical">Critical</SelectItem>
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={commitmentForm.control}
                          name="dueDate"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Due Date</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={commitmentForm.control}
                          name="description"
                          render={({ field }) => (
                            <FormItem className="col-span-2">
                              <FormLabel>Description</FormLabel>
                              <FormControl>
                                <Textarea placeholder="Commitment description" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={commitmentForm.control}
                          name="businessValue"
                          render={({ field }) => (
                            <FormItem className="col-span-2">
                              <FormLabel>Business Value</FormLabel>
                              <FormControl>
                                <Textarea placeholder="Expected business value and impact" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <div className="flex justify-end gap-3">
                        <Button type="button" variant="outline" onClick={resetCommitmentForm}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={createCommitmentMutation.isPending || updateCommitmentMutation.isPending}>
                          {editingCommitment ? 'Update Commitment' : 'Create Commitment'}
                        </Button>
                      </div>
                    </form>
                  </Form>
                </DialogContent>
              </Dialog>
            </div>
          </Card>

          {/* Commitments List */}
          <Card>
            <div className="p-6">
              {commitmentsLoading ? (
                <div className="text-center py-8">Loading commitments...</div>
              ) : filteredCommitments.length > 0 ? (
                <div className="space-y-4">
                  {filteredCommitments.map((commitment) => (
                    <div key={commitment.commitment.id} className="border rounded-lg p-4 hover:bg-gray-50">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h3 className="font-semibold text-lg">{commitment.commitment.title}</h3>
                            <Badge className={getPriorityColor(commitment.commitment.priority)}>
                              {commitment.commitment.priority}
                            </Badge>
                            <Badge className={getStatusColor(commitment.commitment.status)}>
                              {commitment.commitment.status}
                            </Badge>
                          </div>
                          {commitment.commitment.description && (
                            <p className="text-gray-600 mb-3">{commitment.commitment.description}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <CalendarIcon className="h-4 w-4" />
                              Due: {format(parseISO(commitment.commitment.dueDate), 'MMM dd, yyyy')}
                            </span>
                            <span className="flex items-center gap-1">
                              <UsersIcon className="h-4 w-4" />
                              Assigned to {commitment.assignedTo.username}
                            </span>
                            <span className="flex items-center gap-1">
                              <CalendarDaysIcon className="h-4 w-4" />
                              From: {commitment.meeting.title}
                            </span>
                            {commitment.commitment.progressPercentage > 0 && (
                              <span className="flex items-center gap-1">
                                <TrendingUpIcon className="h-4 w-4" />
                                {commitment.commitment.progressPercentage}% complete
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => sendReminderMutation.mutate(commitment.commitment.id)}
                            disabled={sendReminderMutation.isPending}
                          >
                            <BellIcon className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" className="h-8 w-8 p-0">
                                <MoreHorizontalIcon className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => startEditCommitment(commitment)}>
                                <EditIcon className="h-4 w-4 mr-2" />
                                Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem 
                                className="text-red-600"
                                onClick={() => deleteCommitmentMutation.mutate(commitment.commitment.id)}
                              >
                                <TrashIcon className="h-4 w-4 mr-2" />
                                Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <ListChecksIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">No commitments found</p>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          <Card className="p-6">
            <div className="text-center py-12">
              <TrendingUpIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-600 mb-2">Analytics Dashboard</h3>
              <p className="text-gray-500">Advanced analytics and reporting features coming soon</p>
            </div>
          </Card>
        </TabsContent>
      </Tabs>
      </div>
    </Layout>
  );
}