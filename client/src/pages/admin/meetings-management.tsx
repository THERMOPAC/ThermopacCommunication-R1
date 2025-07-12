import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import Layout from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
  MoreHorizontalIcon,
  VideoIcon,
  LinkIcon,
  SettingsIcon,
  BotIcon,
  ChevronRightIcon,
  FileTextIcon
} from 'lucide-react';
import { format, parseISO, addDays, subDays, isAfter, isBefore, startOfDay } from 'date-fns';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import AIMeetingNotes from '@/components/ai-meeting-notes';
import EnhancedAIMeetingAssistant from '@/components/enhanced-ai-meeting-assistant';

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
  autoCreateGoogleMeet: z.boolean().default(true),
});

const commitmentFormSchema = z.object({
  meetingId: z.number().min(1, 'Related meeting is required'),
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

interface GoogleCalendarEvent {
  id: string;
  summary: string;
  description: string;
  start: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  end: {
    dateTime?: string;
    date?: string;
    timeZone?: string;
  };
  hangoutLink: string;
  location?: string;
  status: string;
  htmlLink: string;
  creator: {
    email?: string;
    displayName?: string;
  };
  organizer: {
    email?: string;
    displayName?: string;
  };
  attendees: Array<{
    email: string;
    displayName?: string;
    responseStatus: string;
  }>;
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
  const [selectedMeetingForAI, setSelectedMeetingForAI] = useState<Meeting | null>(null);
  const [selectedMeetingForEnhancedAI, setSelectedMeetingForEnhancedAI] = useState<{
    type: 'internal' | 'google-calendar';
    meeting?: any;
    event?: any;
  } | null>(null);

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
    enabled: activeTab === 'meetings' || activeTab === 'ai-notes',
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

  // Fetch Google Calendar connection status
  const { data: googleCalendarStatus } = useQuery({
    queryKey: ['/api/calendar/status'],
  });

  // Fetch upcoming Google Calendar events with Meet links
  const { data: googleCalendarEvents, isLoading: googleCalendarLoading, error: googleCalendarError } = useQuery<{
    success: boolean;
    events: GoogleCalendarEvent[];
    count: number;
    message: string;
    requiresConnection?: boolean;
  }>({
    queryKey: ['/api/calendar/upcoming-events'],
    enabled: activeTab === 'dashboard' || activeTab === 'google-calendar' || activeTab === 'commitments',
    retry: false,
  });



  // Role hierarchy for sorting
  const roleHierarchy: Record<string, number> = {
    'Superuser': 1,
    'General Manager': 2,
    'Senior Manager': 3,
    'Manager': 4,
    'Employee': 5,
  };

  // Group users by role for the meeting attendees dropdown
  const groupedUsers = useMemo(() => {
    if (!users) return {};
    
    const roles = [...new Set(users.map(u => u.role))];
    return roles
      .sort((a, b) => (roleHierarchy[a] || 999) - (roleHierarchy[b] || 999))
      .reduce((acc: Record<string, User[]>, role: string) => {
        const usersInRole = users.filter(u => u.role === role);
        if (usersInRole.length > 0) {
          acc[role] = usersInRole.sort((a, b) => a.username.localeCompare(b.username));
        }
        return acc;
      }, {} as Record<string, User[]>);
  }, [users]);

  // Combined meetings list for dropdown (internal meetings + Google Calendar events with deduplication and time filtering)
  const combinedMeetingsList = useMemo(() => {
    const internalMeetings = meetingsData?.meetings || [];
    const googleEvents = googleCalendarEvents?.events || [];
    
    // Define time window: past 10 days to next 30 days
    const today = startOfDay(new Date());
    const pastCutoff = subDays(today, 10);
    const futureCutoff = addDays(today, 30);
    
    // Helper function to check if a date is within the time window
    const isWithinTimeWindow = (dateString: string) => {
      const meetingDate = startOfDay(parseISO(dateString));
      return isAfter(meetingDate, pastCutoff) && isBefore(meetingDate, futureCutoff);
    };
    
    // Process internal meetings with time filtering
    const internal = internalMeetings
      .filter(meeting => isWithinTimeWindow(meeting.meeting.meetingDate))
      .map(meeting => ({
        id: `internal-${meeting.meeting.id}`,
        displayId: meeting.meeting.id,
        title: meeting.meeting.title,
        type: 'internal' as const,
        date: meeting.meeting.meetingDate,
        startTime: meeting.meeting.startTime,
        dedupeKey: `${meeting.meeting.title}-${meeting.meeting.meetingDate}-${meeting.meeting.startTime}`
      }));

    // Process Google Calendar events with time filtering and deduplication
    const googleCalendar = googleEvents
      .filter(event => {
        const eventDate = event.start.dateTime 
          ? format(parseISO(event.start.dateTime), 'yyyy-MM-dd')
          : event.start.date || '';
        return eventDate && isWithinTimeWindow(eventDate);
      })
      .map(event => ({
        id: `google-${event.id}`,
        displayId: event.id,
        title: event.summary,
        type: 'google' as const,
        date: event.start.dateTime ? format(parseISO(event.start.dateTime), 'yyyy-MM-dd') : event.start.date || '',
        startTime: event.start.dateTime ? format(parseISO(event.start.dateTime), 'HH:mm') : '',
        dedupeKey: `${event.summary}-${event.start.dateTime ? format(parseISO(event.start.dateTime), 'yyyy-MM-dd') : event.start.date || ''}-${event.start.dateTime ? format(parseISO(event.start.dateTime), 'HH:mm') : ''}`
      }))
      .filter(googleEvent => {
        // Only include Google Calendar events that don't already exist in internal meetings
        return !internal.some(internalMeeting => internalMeeting.dedupeKey === googleEvent.dedupeKey);
      });
    
    return {
      internal: internal.map(({ dedupeKey, ...rest }) => rest), // Remove dedupeKey from final result
      googleCalendar: googleCalendar.map(({ dedupeKey, ...rest }) => rest) // Remove dedupeKey from final result
    };
  }, [meetingsData, googleCalendarEvents]);

  // Create meeting mutation
  const createMeetingMutation = useMutation({
    mutationFn: (data: MeetingFormData) => apiRequest('POST', '/api/meetings', data),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/meetings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/meetings/dashboard/stats'] });
      setIsCreateMeetingOpen(false);
      
      if (data.googleMeetLink) {
        toast({ 
          title: 'Meeting created successfully', 
          description: `Google Meet link automatically generated and added to your calendar`
        });
      } else if (data.googleCalendarConnected === false) {
        toast({ 
          title: 'Meeting created successfully', 
          description: 'Connect your Google Calendar to automatically generate Meet links for future meetings'
        });
      } else {
        toast({ title: 'Meeting created successfully' });
      }
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

  // Generate Google Meet link mutation
  const generateMeetLinkMutation = useMutation({
    mutationFn: (meetingId: number) => apiRequest('POST', `/api/meetings/${meetingId}/generate-meet`),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/meetings'] });
      toast({ 
        title: 'Google Meet link generated successfully', 
        description: data.message 
      });
    },
    onError: (error: any) => {
      if (error.requiresConnection) {
        toast({ 
          title: 'Google Calendar not connected', 
          description: 'Please connect your Google Calendar to generate real Google Meet links. Redirecting to settings...',
          variant: 'destructive' 
        });
        // Redirect to Google Calendar settings after a short delay
        setTimeout(() => {
          window.location.href = '/google-calendar-settings';
        }, 2000);
      } else {
        toast({ 
          title: 'Error generating Google Meet link', 
          description: error.message, 
          variant: 'destructive' 
        });
      }
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
      autoCreateGoogleMeet: true,
    },
  });

  const commitmentForm = useForm<CommitmentFormData>({
    resolver: zodResolver(commitmentFormSchema),
    defaultValues: {
      meetingId: undefined,
      title: '',
      description: '',
      priority: 'Medium',
      assignedToId: undefined,
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
    console.log('Commitment form data:', data);
    console.log('Form validation errors:', commitmentForm.formState.errors);
    
    if (editingCommitment) {
      updateCommitmentMutation.mutate({ id: editingCommitment.commitment.id, data });
    } else {
      createCommitmentMutation.mutate(data);
    }
  };

  const resetMeetingForm = () => {
    meetingForm.reset({
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
      autoCreateGoogleMeet: true,
    });
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
        <TabsList className="grid w-full grid-cols-6">
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
          <TabsTrigger value="google-calendar" className="flex items-center gap-2">
            <VideoIcon className="h-4 w-4" />
            Google Calendar
          </TabsTrigger>
          <TabsTrigger value="ai-notes" className="flex items-center gap-2">
            <BellIcon className="h-4 w-4" />
            AI Notes
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



          {/* Upcoming Google Calendar Events */}
          <Card>
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Upcoming Google Calendar Events</h3>
                <Badge variant="outline" className="text-blue-600">
                  {(googleCalendarEvents?.count || 0) + (upcomingMeetings?.meetings?.filter((meeting) => {
                    const isDuplicate = googleCalendarEvents?.events?.some(event => 
                      event.summary?.toLowerCase().includes(meeting.meeting.title.toLowerCase()) ||
                      meeting.meeting.title.toLowerCase().includes(event.summary?.toLowerCase() || '')
                    );
                    return !isDuplicate;
                  }).length || 0)} events
                </Badge>
              </div>
            </div>
            <div className="p-6">
              {(googleCalendarLoading || !upcomingMeetings) ? (
                <p className="text-gray-500 text-center py-8">Loading calendar events...</p>
              ) : googleCalendarError || !googleCalendarEvents?.success ? (
                <div className="text-center py-8">
                  <p className="text-gray-500 mb-4">Unable to load Google Calendar events</p>
                  <p className="text-sm text-gray-400">
                    {googleCalendarEvents?.requiresConnection 
                      ? 'Please connect your Google Calendar to view events' 
                      : 'Check your Google Calendar connection'}
                  </p>
                </div>
              ) : (googleCalendarEvents?.events?.length || upcomingMeetings?.meetings?.length) ? (
                <div className="space-y-4">
                  {/* Google Calendar Events - Clean, professional design */}
                  {googleCalendarEvents?.events?.slice(0, 8).map((event) => (
                    <div key={`google-${event.id}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-white rounded-lg border border-gray-200 gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 mb-2">{event.summary || 'Untitled Event'}</h4>
                        <div className="text-sm text-gray-600">
                          {event.start.dateTime && event.end.dateTime ? (
                            <span>
                              {format(new Date(event.start.dateTime), 'MMM dd, yyyy')} · {format(new Date(event.start.dateTime), 'h:mm')} – {format(new Date(event.end.dateTime), 'h:mm a')}
                            </span>
                          ) : event.start.date ? (
                            <span>
                              {format(new Date(event.start.date), 'MMM dd, yyyy')} · All day
                            </span>
                          ) : (
                            <span>No date available</span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 sm:ml-4">
                        {event.hangoutLink && (
                          <Button
                            size="sm"
                            onClick={() => window.open(event.hangoutLink, '_blank')}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            Join
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  {/* Internal Meetings - Clean, professional design */}
                  {upcomingMeetings?.meetings?.filter((meeting) => {
                    // Check if this internal meeting title matches any Google Calendar event
                    const isDuplicate = googleCalendarEvents?.events?.some(event => 
                      event.summary?.toLowerCase().includes(meeting.meeting.title.toLowerCase()) ||
                      meeting.meeting.title.toLowerCase().includes(event.summary?.toLowerCase() || '')
                    );
                    return !isDuplicate;
                  }).slice(0, 3).map((meeting) => (
                    <div key={`internal-${meeting.meeting.id}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-white rounded-lg border border-gray-200 gap-3">
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold text-gray-900 mb-2">{meeting.meeting.title}</h4>
                        <div className="text-sm text-gray-600">
                          {format(parseISO(meeting.meeting.meetingDate), 'MMM dd, yyyy')} · {meeting.meeting.startTime} – {meeting.meeting.endTime}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 sm:ml-4">
                        {(meeting.meeting.googleMeetLink || meeting.meeting.meetingUrl) && (
                          <Button
                            size="sm"
                            onClick={() => {
                              if (meeting.meeting.googleMeetLink) {
                                window.open(meeting.meeting.googleMeetLink, '_blank');
                              } else if (meeting.meeting.meetingUrl) {
                                window.open(meeting.meeting.meetingUrl, '_blank');
                              } else {
                                toast({ 
                                  title: 'No meeting link available', 
                                  description: 'This meeting does not have a Google Meet or custom meeting link.',
                                  variant: 'destructive'
                                });
                              }
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            Join
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">No upcoming meetings or calendar events</p>
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
                    <form onSubmit={meetingForm.handleSubmit(onSubmitMeeting)} className="space-y-8">
                      
                      {/* Basic Information Section */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Basic Information</h3>
                        <div className="space-y-4">
                          <FormField
                            control={meetingForm.control}
                            name="title"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="flex items-center gap-1">
                                  Meeting Title
                                  <span className="text-red-500">*</span>
                                </FormLabel>
                                <FormControl>
                                  <Input placeholder="Enter meeting title" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <div className="grid grid-cols-2 gap-4">
                            <FormField
                              control={meetingForm.control}
                              name="meetingType"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="flex items-center gap-1">
                                    Meeting Type
                                    <span className="text-red-500">*</span>
                                  </FormLabel>
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
                          </div>
                        </div>
                      </div>

                      {/* Date & Time Section */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Date & Time</h3>
                        <div className="grid grid-cols-3 gap-4">
                          <FormField
                            control={meetingForm.control}
                            name="meetingDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel className="flex items-center gap-1">
                                  Meeting Date
                                  <span className="text-red-500">*</span>
                                </FormLabel>
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
                                <FormLabel className="flex items-center gap-1">
                                  Start Time
                                  <span className="text-red-500">*</span>
                                </FormLabel>
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
                                <FormLabel className="flex items-center gap-1">
                                  End Time
                                  <span className="text-red-500">*</span>
                                </FormLabel>
                                <FormControl>
                                  <Input type="time" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      {/* Meeting Details Section */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Meeting Details</h3>
                        <div className="space-y-4">
                          <FormField
                            control={meetingForm.control}
                            name="description"
                            render={({ field }) => (
                              <FormItem>
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
                              <FormItem>
                                <FormLabel>Agenda</FormLabel>
                                <FormControl>
                                  <Textarea placeholder="Meeting agenda items" {...field} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          
                          <FormField
                            control={meetingForm.control}
                            name="location"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Meeting Link</FormLabel>
                                <FormControl>
                                  <Input placeholder="Auto-generated Meet link or custom meeting URL" {...field} />
                                </FormControl>
                                <div className="text-xs text-gray-500">
                                  Will be auto-filled if Google Calendar is connected and integration is enabled
                                </div>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      {/* Participants Section */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Participants</h3>
                        <div className="space-y-4">
                          <FormField
                            control={meetingForm.control}
                            name="attendeeIds"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>Participants / Attendees</FormLabel>
                                <FormControl>
                                  <Select 
                                    onValueChange={(value) => {
                                      const currentValues = field.value || [];
                                      if (!currentValues.includes(parseInt(value))) {
                                        field.onChange([...currentValues, parseInt(value)]);
                                      }
                                    }} 
                                  >
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select team members to invite" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {Object.entries(groupedUsers).length > 0 ? (
                                        Object.entries(groupedUsers).map(([role, users]) => (
                                          <SelectGroup key={role}>
                                            <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                                              {role}s
                                            </SelectLabel>
                                            {users.map((user) => (
                                              <SelectItem key={user.id} value={user.id.toString()}>
                                                {user.username}
                                              </SelectItem>
                                            ))}
                                          </SelectGroup>
                                        ))
                                      ) : (
                                        <SelectItem value="loading" disabled>Loading users...</SelectItem>
                                      )}
                                    </SelectContent>
                                  </Select>
                                </FormControl>
                                {field.value && field.value.length > 0 && (
                                  <div className="flex flex-wrap gap-2 mt-2">
                                    {field.value.map((attendeeId) => {
                                      const user = users?.find(u => u.id === attendeeId);
                                      return user ? (
                                        <Badge key={attendeeId} variant="outline" className="flex items-center gap-1">
                                          <UsersIcon className="h-3 w-3" />
                                          {user.username}
                                          <button
                                            type="button"
                                            onClick={() => {
                                              field.onChange(field.value.filter(id => id !== attendeeId));
                                            }}
                                            className="ml-1 text-red-500 hover:text-red-700"
                                          >
                                            ×
                                          </button>
                                        </Badge>
                                      ) : null;
                                    })}
                                  </div>
                                )}
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>

                      {/* Google Integration Section */}
                      <div className="space-y-4">
                        <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Google Integration</h3>
                        <div className={`p-4 rounded-lg border ${googleCalendarStatus?.isConnected ? 'bg-green-50 border-green-200' : 'bg-blue-50 border-blue-200'}`}>
                          <div className="flex items-center gap-2 mb-4">
                            <VideoIcon className={`h-5 w-5 ${googleCalendarStatus?.isConnected ? 'text-green-600' : 'text-blue-600'}`} />
                            <h4 className={`font-medium ${googleCalendarStatus?.isConnected ? 'text-green-900' : 'text-blue-900'}`}>
                              Google Calendar & Meet Integration
                            </h4>
                            {googleCalendarStatus?.isConnected && (
                              <Badge className="bg-green-100 text-green-800 border-green-300">
                                Connected
                              </Badge>
                            )}
                          </div>

                          {/* Connection Status */}
                          {googleCalendarStatus?.isConnected ? (
                            <div className="text-sm text-green-700 bg-green-100 p-2 rounded mb-4">
                              <CheckIcon className="h-4 w-4 inline mr-1" />
                              Google Calendar connected as {googleCalendarStatus.googleEmail}
                            </div>
                          ) : (
                            <div className="text-sm text-red-700 bg-red-100 p-2 rounded mb-4">
                              <AlertCircleIcon className="h-4 w-4 inline mr-1" />
                              Google Calendar not connected - Please connect to enable automatic Google Meet links
                            </div>
                          )}
                          
                          <FormField
                            control={meetingForm.control}
                            name="autoCreateGoogleMeet"
                            render={({ field }) => (
                              <FormItem className="flex flex-row items-center justify-between">
                                <div className="space-y-0.5">
                                  <FormLabel className="text-base">
                                    Auto-create Google Meet Link
                                  </FormLabel>
                                  <div className="text-sm text-gray-600">
                                    Automatically generate a Google Meet link and add this meeting to your Google Calendar
                                  </div>
                                </div>
                                <FormControl>
                                  <Switch
                                    checked={field.value && googleCalendarStatus?.isConnected}
                                    onCheckedChange={(checked) => {
                                      if (!googleCalendarStatus?.isConnected) {
                                        toast({
                                          title: 'Google Calendar Required',
                                          description: 'Please connect your Google Calendar first to enable automatic Google Meet creation.',
                                          variant: 'destructive'
                                        });
                                        return;
                                      }
                                      field.onChange(checked);
                                    }}
                                    disabled={!googleCalendarStatus?.isConnected}
                                  />
                                </FormControl>
                              </FormItem>
                            )}
                          />
                          
                          <div className={`text-xs p-2 rounded mt-4 ${googleCalendarStatus?.isConnected ? 'text-green-700 bg-green-100' : 'text-blue-700 bg-blue-100'}`}>
                            <SettingsIcon className="h-4 w-4 inline mr-1" />
                            {googleCalendarStatus?.isConnected ? (
                              <>Manage your Google Calendar settings in <button 
                                onClick={() => {
                                  setIsCreateMeetingOpen(false);
                                  setTimeout(() => window.location.href = '/google-calendar-settings', 100);
                                }} 
                                className="underline font-medium text-green-700 hover:text-green-800"
                              >Google Calendar Settings</button></>
                            ) : (
                              <div className="flex flex-col gap-2">
                                <div>Connect your Google account to enable Google Meet links:</div>
                                <Button 
                                  type="button"
                                  size="sm"
                                  onClick={() => {
                                    setIsCreateMeetingOpen(false);
                                    setTimeout(() => window.location.href = '/api/auth/google/calendar', 100);
                                  }}
                                  className="bg-blue-600 hover:bg-blue-700 text-white w-fit"
                                >
                                  Connect Google Calendar
                                </Button>
                                <div className="text-xs">
                                  Or manage settings in <button 
                                    onClick={() => {
                                      setIsCreateMeetingOpen(false);
                                      setTimeout(() => window.location.href = '/google-calendar-settings', 100);
                                    }} 
                                    className="underline font-medium text-blue-700 hover:text-blue-800"
                                  >Google Calendar Settings</button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
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
                          <div className="flex items-center gap-2 mt-3">
                            <Badge variant={meeting.meeting.googleMeetLink ? 'default' : 'secondary'}>
                              {meeting.meeting.googleMeetLink ? (
                                <>
                                  <VideoIcon className="h-3 w-3 mr-1" />
                                  Google Meet Ready
                                </>
                              ) : (
                                <>
                                  <VideoIcon className="h-3 w-3 mr-1" />
                                  No Meet Link
                                </>
                              )}
                            </Badge>
                            <Badge variant={meeting.meeting.aiNotesGenerated ? 'default' : 'secondary'}>
                              {meeting.meeting.aiNotesGenerated ? (
                                <>
                                  <BellIcon className="h-3 w-3 mr-1" />
                                  AI Notes Available
                                </>
                              ) : (
                                <>
                                  <BellIcon className="h-3 w-3 mr-1" />
                                  No AI Notes
                                </>
                              )}
                            </Badge>
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
                            {!meeting.meeting.googleMeetLink && (
                              <DropdownMenuItem 
                                onClick={() => generateMeetLinkMutation.mutate(meeting.meeting.id)}
                                disabled={generateMeetLinkMutation.isPending}
                              >
                                <VideoIcon className="h-4 w-4 mr-2" />
                                Generate Google Meet
                              </DropdownMenuItem>
                            )}
                            {meeting.meeting.googleMeetLink && (
                              <DropdownMenuItem 
                                onClick={() => window.open(meeting.meeting.googleMeetLink, '_blank')}
                              >
                                <LinkIcon className="h-4 w-4 mr-2" />
                                Open Google Meet
                              </DropdownMenuItem>
                            )}
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
                              <Select 
                                onValueChange={(value) => {
                                  // Only internal meetings allowed for commitments since backend requires valid meetingId
                                  field.onChange(parseInt(value));
                                }} 
                                value={field.value ? field.value.toString() : undefined}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select internal meeting" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {combinedMeetingsList.internal.length > 0 ? (
                                    combinedMeetingsList.internal.map((meeting) => (
                                      <SelectItem key={meeting.id} value={meeting.id.toString()}>
                                        {meeting.title}
                                        <span className="ml-2 text-sm text-gray-500">
                                          ({format(parseISO(meeting.date), 'MMM dd')} at {meeting.startTime})
                                        </span>
                                      </SelectItem>
                                    ))
                                  ) : (
                                    <SelectItem value="no-meetings" disabled>
                                      No recent or upcoming internal meetings available
                                    </SelectItem>
                                  )}
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
                                    <SelectValue placeholder="Select team member" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {Object.entries(groupedUsers).map(([role, roleUsers]) => (
                                    <SelectGroup key={role}>
                                      <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                                        {role}s
                                      </SelectLabel>
                                      {roleUsers.map((user) => (
                                        <SelectItem key={user.id} value={user.id.toString()}>
                                          {user.username}
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
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

        {/* AI Notes Tab */}
        <TabsContent value="ai-notes" className="space-y-6">
          <Card className="p-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold">Enhanced AI Meeting Assistant</h3>
                <p className="text-gray-600">Generate AI insights from internal meetings and Google Calendar events</p>
              </div>
              {selectedMeetingForEnhancedAI && (
                <Button
                  variant="outline"
                  onClick={() => setSelectedMeetingForEnhancedAI(null)}
                >
                  Back to Meeting Selection
                </Button>
              )}
            </div>
            
            {selectedMeetingForEnhancedAI ? (
              <EnhancedAIMeetingAssistant
                selectedMeeting={selectedMeetingForEnhancedAI}
                onUpdate={() => {
                  queryClient.invalidateQueries({ queryKey: ['/api/meetings'] });
                  queryClient.invalidateQueries({ queryKey: ['/api/calendar/upcoming-events'] });
                }}
              />
            ) : (
              <div className="space-y-6">
                {/* Internal Meetings Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 bg-blue-500 rounded-full"></div>
                    <h4 className="text-md font-medium text-blue-700">Internal Meetings</h4>
                  </div>
                  
                  {meetingsData?.meetings && meetingsData.meetings.length > 0 ? (
                    <div className="grid gap-3">
                      {meetingsData.meetings.map((meeting) => (
                        <Card
                          key={meeting.meeting.id}
                          className="p-4 hover:bg-blue-50 cursor-pointer transition-colors border-blue-100"
                          onClick={() => setSelectedMeetingForEnhancedAI({
                            type: 'internal',
                            meeting: meeting.meeting
                          })}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="font-semibold">{meeting.meeting.title}</h4>
                              <p className="text-sm text-gray-600">
                                {format(parseISO(meeting.meeting.meetingDate), 'MMM d, yyyy')} · {meeting.meeting.startTime}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                {meeting.meeting.googleMeetLink && (
                                  <Badge variant="default" className="bg-blue-100 text-blue-800">
                                    <VideoIcon className="h-3 w-3 mr-1" />
                                    Meet
                                  </Badge>
                                )}
                                {meeting.meeting.aiNotesGenerated && (
                                  <Badge variant="default" className="bg-green-100 text-green-800">
                                    <BotIcon className="h-3 w-3 mr-1" />
                                    AI Notes
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card className="p-6 border-dashed">
                      <div className="text-center text-gray-500">
                        <VideoIcon className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                        <p>No internal meetings available</p>
                      </div>
                    </Card>
                  )}
                </div>

                {/* Google Calendar Events Section */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                    <h4 className="text-md font-medium text-green-700">Google Calendar Events</h4>
                  </div>
                  
                  {googleCalendarEvents?.events && googleCalendarEvents.events.length > 0 ? (
                    <div className="grid gap-3">
                      {googleCalendarEvents.events.map((event) => (
                        <Card
                          key={event.id}
                          className="p-4 hover:bg-green-50 cursor-pointer transition-colors border-green-100"
                          onClick={() => setSelectedMeetingForEnhancedAI({
                            type: 'google-calendar',
                            event: event
                          })}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <h4 className="font-semibold">{event.summary}</h4>
                              <p className="text-sm text-gray-600">
                                {event.start.dateTime 
                                  ? format(parseISO(event.start.dateTime), 'MMM d, yyyy · h:mm a')
                                  : format(parseISO(event.start.date), 'MMM d, yyyy')
                                }
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="secondary" className="bg-green-100 text-green-800">
                                  <CalendarIcon className="h-3 w-3 mr-1" />
                                  Google Calendar
                                </Badge>
                                {event.hangoutLink && (
                                  <Badge variant="default" className="bg-blue-100 text-blue-800">
                                    <VideoIcon className="h-3 w-3 mr-1" />
                                    Meet
                                  </Badge>
                                )}
                              </div>
                            </div>
                            <ChevronRightIcon className="h-4 w-4 text-gray-400" />
                          </div>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <Card className="p-6 border-dashed">
                      <div className="text-center text-gray-500">
                        <CalendarIcon className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                        <p>No Google Calendar events available</p>
                      </div>
                    </Card>
                  )}
                </div>

                {/* Empty State */}
                {(!meetingsData?.meetings || meetingsData.meetings.length === 0) && 
                 (!googleCalendarEvents?.events || googleCalendarEvents.events.length === 0) && (
                  <Card className="p-8">
                    <div className="text-center">
                      <BotIcon className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-semibold text-gray-600 mb-2">No Meetings Available</h3>
                      <p className="text-gray-500 mb-4">
                        Create internal meetings or sync Google Calendar events to start using AI insights
                      </p>
                      <div className="flex gap-2 justify-center">
                        <Button onClick={() => setActiveTab('meetings')} variant="outline">
                          Create Meeting
                        </Button>
                        <Button onClick={() => setActiveTab('dashboard')} variant="outline">
                          View Calendar Events
                        </Button>
                      </div>
                    </div>
                  </Card>
                )}
              </div>
            )}
          </Card>
        </TabsContent>

        {/* Google Calendar Tab */}
        <TabsContent value="google-calendar" className="space-y-6">
          <Card className="p-6">
            <div className="flex flex-col sm:flex-row gap-4 items-start justify-between mb-6">
              <div>
                <h3 className="text-lg font-semibold">Upcoming Google Calendar Events</h3>
                <p className="text-gray-600">View upcoming calendar events with Google Meet links from your Google Calendar</p>
              </div>
              <Button
                variant="outline"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/calendar/upcoming-events'] })}
                disabled={googleCalendarLoading}
              >
                {googleCalendarLoading ? 'Refreshing...' : 'Refresh Events'}
              </Button>
            </div>

            {/* Connection Status */}
            {googleCalendarStatus?.isConnected ? (
              <div className="text-sm text-green-700 bg-green-100 p-3 rounded mb-6">
                <CheckIcon className="h-4 w-4 inline mr-2" />
                Google Calendar connected
                {googleCalendarStatus.syncEnabled ? (
                  <span> and sync is enabled</span>
                ) : (
                  <span> but sync is disabled</span>
                )}
              </div>
            ) : (
              <div className="text-sm text-red-700 bg-red-100 p-3 rounded mb-6">
                <AlertCircleIcon className="h-4 w-4 inline mr-2" />
                Google Calendar not connected - Please connect to view events
                <Button 
                  variant="link" 
                  size="sm" 
                  onClick={() => window.open('/auth/google', '_blank')}
                  className="ml-2 p-0 h-auto"
                >
                  Connect Now
                </Button>
              </div>
            )}

            {/* Events List */}
            {googleCalendarLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-500">Loading Google Calendar events...</p>
              </div>
            ) : googleCalendarError ? (
              <div className="text-center py-8">
                <AlertCircleIcon className="h-12 w-12 text-red-400 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 mb-2">Unable to load events</h4>
                <p className="text-gray-500 mb-4">
                  {googleCalendarError.message || 'Failed to fetch Google Calendar events'}
                </p>
                {googleCalendarError.requiresConnection && (
                  <Button 
                    onClick={() => window.open('/auth/google', '_blank')}
                    className="mt-2"
                  >
                    Connect Google Calendar
                  </Button>
                )}
              </div>
            ) : googleCalendarEvents?.events && googleCalendarEvents.events.length > 0 ? (
              <div className="space-y-4">
                <div className="text-sm text-gray-600 mb-4">
                  Found {googleCalendarEvents.count} upcoming events with Google Meet links
                </div>
                {googleCalendarEvents.events.map((event) => (
                  <Card key={event.id} className="p-4 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h4 className="font-medium text-gray-900 mb-1">{event.summary}</h4>
                        {event.description && (
                          <p className="text-sm text-gray-600 mb-2 line-clamp-2">{event.description}</p>
                        )}
                        
                        <div className="flex items-center gap-4 text-sm text-gray-500 mb-3">
                          <div className="flex items-center gap-1">
                            <CalendarIcon className="h-4 w-4" />
                            {event.start.dateTime 
                              ? format(parseISO(event.start.dateTime), 'MMM d, yyyy')
                              : event.start.date
                            }
                          </div>
                          <div className="flex items-center gap-1">
                            <ClockIcon className="h-4 w-4" />
                            {event.start.dateTime 
                              ? `${format(parseISO(event.start.dateTime), 'h:mm a')} - ${format(parseISO(event.end.dateTime!), 'h:mm a')}`
                              : 'All day'
                            }
                          </div>
                          {event.location && (
                            <div className="flex items-center gap-1">
                              <MapPinIcon className="h-4 w-4" />
                              <span className="truncate max-w-32">{event.location}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 mb-3">
                          <Badge variant="default" className="bg-blue-100 text-blue-800">
                            <VideoIcon className="h-3 w-3 mr-1" />
                            Google Meet
                          </Badge>
                          {event.organizer.email && (
                            <Badge variant="outline">
                              Organizer: {event.organizer.displayName || event.organizer.email}
                            </Badge>
                          )}
                        </div>

                        {event.attendees && event.attendees.length > 0 && (
                          <div className="text-sm text-gray-600">
                            <span className="font-medium">{event.attendees.length} attendees</span>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-col gap-2 ml-4">
                        <Button
                          size="sm"
                          onClick={() => window.open(event.hangoutLink, '_blank')}
                          className="bg-green-600 hover:bg-green-700"
                        >
                          <VideoIcon className="h-4 w-4 mr-1" />
                          Join Meet
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(event.htmlLink, '_blank')}
                        >
                          <LinkIcon className="h-4 w-4 mr-1" />
                          View in Calendar
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <div className="text-center py-8">
                <CalendarDaysIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 mb-2">No upcoming events</h4>
                <p className="text-gray-500">
                  No upcoming Google Calendar events with Google Meet links found in the next 30 days.
                </p>
              </div>
            )}
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