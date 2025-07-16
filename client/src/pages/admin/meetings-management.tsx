import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/use-auth';
import Layout from '@/components/layout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
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
  UserIcon,
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
  FileTextIcon,
  CheckCircleIcon,
  EyeIcon,
  TimerIcon
} from 'lucide-react';
import { format, parseISO, addDays, subDays, isAfter, isBefore, startOfDay, isEqual } from 'date-fns';
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
}).refine(
  (data) => {
    // Ensure End Time is not earlier than Start Time
    if (data.startTime && data.endTime) {
      const [startHour, startMinute] = data.startTime.split(':').map(Number);
      const [endHour, endMinute] = data.endTime.split(':').map(Number);
      
      const startMinutes = startHour * 60 + startMinute;
      const endMinutes = endHour * 60 + endMinute;
      
      return endMinutes > startMinutes;
    }
    return true;
  },
  {
    message: "End time must be after start time",
    path: ["endTime"],
  }
);

const commitmentFormSchema = z.object({
  meetingId: z.number().optional(), // Now optional for Google Calendar events
  meetingType: z.enum(['internal', 'google_calendar']).default('internal'),
  googleCalendarEventId: z.string().optional(),
  meetingTitle: z.string().optional(),
  meetingDate: z.string().optional(),
  meetingStartTime: z.string().optional(),
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']),
  assignedToId: z.number().min(1, 'Assignee is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  estimatedHours: z.number().optional(),
  businessValue: z.string().optional(),
  successCriteria: z.string().optional(),
}).refine(
  (data) => {
    // Ensure either meetingId (internal) or googleCalendarEventId (Google Calendar) is provided
    return (data.meetingType === 'internal' && data.meetingId) || 
           (data.meetingType === 'google_calendar' && data.googleCalendarEventId);
  },
  {
    message: "A meeting selection is required",
    path: ["meetingId"],
  }
);

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
    thisWeek: number;
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

// Helper function to generate start time options (9:00 AM to 8:00 PM in 30-minute intervals)
const generateStartTimeOptions = () => {
  const times = [];
  for (let hour = 9; hour <= 20; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      const displayTime = hour < 12 
        ? `${hour}:${minute.toString().padStart(2, '0')} AM`
        : hour === 12 
        ? `${hour}:${minute.toString().padStart(2, '0')} PM`
        : `${hour - 12}:${minute.toString().padStart(2, '0')} PM`;
      times.push({ value: timeString, label: displayTime });
    }
  }
  return times;
};

// Helper function to generate end time options based on selected start time
const generateEndTimeOptions = (startTime: string) => {
  if (!startTime) return [];
  
  const times = [];
  const [startHour, startMinute] = startTime.split(':').map(Number);
  const startTimeInMinutes = startHour * 60 + startMinute;
  
  for (let hour = 9; hour <= 20; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const currentTimeInMinutes = hour * 60 + minute;
      
      // Only include times after the selected start time
      if (currentTimeInMinutes > startTimeInMinutes) {
        const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        const displayTime = hour < 12 
          ? `${hour}:${minute.toString().padStart(2, '0')} AM`
          : hour === 12 
          ? `${hour}:${minute.toString().padStart(2, '0')} PM`
          : `${hour - 12}:${minute.toString().padStart(2, '0')} PM`;
        times.push({ value: timeString, label: displayTime });
      }
    }
  }
  return times;
};

// Helper function to generate all time options for MD Planning (still uses 15-minute intervals)
const generateAllTimeOptions = () => {
  const times = [];
  for (let hour = 0; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      const timeString = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      const displayTime = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      times.push({ value: timeString, label: displayTime });
    }
  }
  return times;
};

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
  const [geminiContent, setGeminiContent] = useState('');

  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Generate start time options for dropdowns
  const startTimeOptions = useMemo(() => generateStartTimeOptions(), []);
  
  // Watch for start time changes to update end time options
  const [selectedStartTime, setSelectedStartTime] = useState<string>('');
  const endTimeOptions = useMemo(() => generateEndTimeOptions(selectedStartTime), [selectedStartTime]);
  
  // Generate all time options for MD Planning (still uses 15-minute intervals)
  const allTimeOptions = useMemo(() => generateAllTimeOptions(), []);

  // Load existing AI content when a meeting is selected
  useEffect(() => {
    if (selectedMeetingForAI?.meeting) {
      const meeting = selectedMeetingForAI.meeting;
      
      if (meeting.aiNotesGenerated && meeting.aiSummary) {
        // Format existing AI content for display
        let formattedContent = '';
        
        if (meeting.aiSummary) {
          formattedContent += `Summary\n\n${meeting.aiSummary}\n\n`;
        }
        
        if (meeting.aiKeyPoints && Array.isArray(meeting.aiKeyPoints) && meeting.aiKeyPoints.length > 0) {
          formattedContent += `Details\n\n`;
          meeting.aiKeyPoints.forEach((point: string) => {
            formattedContent += `• ${point}\n`;
          });
          formattedContent += '\n';
        }
        
        if (meeting.aiActionItems && Array.isArray(meeting.aiActionItems) && meeting.aiActionItems.length > 0) {
          formattedContent += `Suggested next steps\n\n`;
          meeting.aiActionItems.forEach((item: any) => {
            if (typeof item === 'string') {
              formattedContent += `• ${item}\n`;
            } else if (item.task) {
              formattedContent += `• ${item.task}\n`;
            }
          });
        }
        
        setGeminiContent(formattedContent);
      } else {
        // Clear content if no AI notes exist
        setGeminiContent('');
      }
    } else {
      // Clear content when no meeting is selected
      setGeminiContent('');
    }
  }, [selectedMeetingForAI]);

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
    enabled: activeTab === 'meetings' || activeTab === 'ai-notes' || activeTab === 'commitments' || activeTab === 'ai-processing' || activeTab === 'analytics',
  });

  // Fetch commitments
  const { data: commitmentsData, isLoading: commitmentsLoading, error: commitmentsError } = useQuery<{ commitments: Commitment[] }>({
    queryKey: ['/api/meetings/commitments', { status: statusFilter, priority: priorityFilter }],
    enabled: activeTab === 'commitments' || activeTab === 'analytics',
    queryFn: async () => {
      const queryParams = new URLSearchParams({
        status: statusFilter,
        priority: priorityFilter,
      });
      const url = `/api/meetings/commitments?${queryParams}`;
      console.log('Making commitments API request to:', url);
      try {
        const result = await apiRequest('GET', url);
        console.log('Commitments API success:', result);
        return result;
      } catch (error) {
        console.error('API request failed:', error);
        throw error;
      }
    },
    retry: false,
  });

  // Add debugging for commitments query
  console.log('Commitments Query Debug:', {
    activeTab,
    enabled: activeTab === 'commitments',
    data: commitmentsData,
    loading: commitmentsLoading,
    error: commitmentsError,
    statusFilter,
    priorityFilter,
    errorDetails: commitmentsError ? JSON.stringify(commitmentsError) : null
  });

  // Force refetch commitments when tab becomes active
  useEffect(() => {
    if (activeTab === 'commitments') {
      console.log('Commitments tab activated, forcing refetch...');
      queryClient.invalidateQueries({ queryKey: ['/api/meetings/commitments'] });
    }
  }, [activeTab, queryClient]);



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
    
    // Debug logging for troubleshooting
    console.log('Combined Meetings Debug:', {
      activeTab,
      internalMeetingsCount: internalMeetings.length,
      googleEventsCount: googleEvents.length,
      googleEvents: googleEvents.map(e => ({
        id: e.id,
        summary: e.summary,
        startDateTime: e.start.dateTime,
        startDate: e.start.date
      }))
    });
    
    // Define time window: past 10 days to next 30 days (include all meetings from today)
    const now = new Date();
    const today = startOfDay(now);
    const pastCutoff = subDays(today, 10);
    const futureCutoff = addDays(today, 30);
    
    // Helper function to check if a date is within the time window
    const isWithinTimeWindow = (dateString: string) => {
      const meetingDate = startOfDay(parseISO(dateString));
      // Include all meetings from today regardless of time, plus meetings within the time window
      return isEqual(meetingDate, today) || 
             ((isAfter(meetingDate, pastCutoff) || isEqual(meetingDate, pastCutoff)) && 
              (isBefore(meetingDate, futureCutoff) || isEqual(meetingDate, futureCutoff)));
    };
    
    // Process internal meetings with time filtering and exclude concluded meetings
    const internal = internalMeetings
      .filter(meeting => 
        isWithinTimeWindow(meeting.meeting.meetingDate) && 
        meeting.meeting.status !== 'Completed' && 
        meeting.meeting.status !== 'Cancelled'
      )
      .map(meeting => ({
        id: `internal-${meeting.meeting.id}`,
        displayId: meeting.meeting.id,
        title: meeting.meeting.title,
        type: 'internal' as const,
        date: meeting.meeting.meetingDate,
        startTime: meeting.meeting.startTime,
        dedupeKey: `${meeting.meeting.title.toLowerCase().trim()}-${meeting.meeting.meetingDate}-${meeting.meeting.startTime}`
      }));

    // Create set of internal meeting titles for quick lookup
    const internalMeetingTitles = new Set(
      internal.map(meeting => meeting.title.toLowerCase().trim())
    );

    // Process Google Calendar events with enhanced deduplication
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
        dedupeKey: `${event.summary.toLowerCase().trim()}-${event.start.dateTime ? format(parseISO(event.start.dateTime), 'yyyy-MM-dd') : event.start.date || ''}-${event.start.dateTime ? format(parseISO(event.start.dateTime), 'HH:mm') : ''}`
      }))
      .filter(googleEvent => {
        // Remove Google Calendar events that have the same title as internal meetings
        const eventTitle = googleEvent.title.toLowerCase().trim();
        return !internalMeetingTitles.has(eventTitle);
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
      
      let toastMessage = '';
      if (data.googleMeetLink) {
        toastMessage = 'Google Meet link automatically generated and added to your calendar';
      } else if (data.googleCalendarConnected === false) {
        toastMessage = 'Connect your Google Calendar to automatically generate Meet links for future meetings';
      }
      
      // Display warnings if any exist
      if (data.warnings && data.warnings.length > 0) {
        const warningMessage = data.warnings.map((warning: any) => 
          `${warning.userName} has adjacent meetings (within 15 minutes)`
        ).join(', ');
        
        toast({ 
          title: 'Meeting created successfully', 
          description: `${toastMessage}${toastMessage ? '. ' : ''}Warning: ${warningMessage}`,
          variant: 'default'
        });
      } else {
        toast({ 
          title: 'Meeting created successfully',
          description: toastMessage || undefined
        });
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
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/meetings'] });
      setEditingMeeting(null);
      
      // Display warnings if any exist
      if (data.warnings && data.warnings.length > 0) {
        const warningMessage = data.warnings.map((warning: any) => 
          `${warning.userName} has adjacent meetings (within 15 minutes)`
        ).join(', ');
        
        toast({ 
          title: 'Meeting updated successfully', 
          description: `Warning: ${warningMessage}`,
          variant: 'default'
        });
      } else {
        toast({ title: 'Meeting updated successfully' });
      }
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

  // Sync meeting to Google Calendar mutation
  const syncToCalendarMutation = useMutation({
    mutationFn: (meetingId: number) => apiRequest('POST', `/api/meetings/${meetingId}/sync-to-calendar`),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/meetings'] });
      toast({ 
        title: 'Meeting synced to Google Calendar successfully', 
        description: data.message || 'Meeting now appears in your Google Calendar with Meet link'
      });
    },
    onError: (error: any) => {
      if (error.requiresConnection) {
        toast({ 
          title: 'Google Calendar not connected', 
          description: 'Please connect your Google Calendar to sync meetings. Redirecting to settings...',
          variant: 'destructive' 
        });
        setTimeout(() => {
          window.location.href = '/google-calendar-settings';
        }, 2000);
      } else {
        toast({ 
          title: 'Error syncing to Google Calendar', 
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

  // MD Meeting Plan mutations
  const generateWeeklyMDMeetingsMutation = useMutation({
    mutationFn: () => {
      // Use UTC time to match server timezone and avoid local timezone discrepancies
      const todayUTC = new Date();
      const utcDay = todayUTC.getUTCDay(); // 0=Sunday, 1=Monday, etc. in UTC
      
      console.log(`Generation - Frontend local: ${todayUTC.toDateString()} (local day ${todayUTC.getDay()})`);
      console.log(`Generation - Frontend UTC: ${todayUTC.toUTCString()} (UTC day ${utcDay})`);
      console.log(`Generation - Frontend timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
      
      let startOfWeek: Date;
      
      if (utcDay === 0) {
        // If today is Sunday in UTC, generate for next Monday's week
        console.log(`🔄 SUNDAY DETECTED (UTC): Generating for NEXT week`);
        const diff = todayUTC.getUTCDate() - utcDay + 1; // Next Monday
        startOfWeek = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), diff));
      } else {
        // Generate for this week (from this Monday)
        console.log(`📅 WEEKDAY DETECTED (UTC): Generating for THIS week`);
        const diff = todayUTC.getUTCDate() - utcDay + 1; // This Monday
        startOfWeek = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), diff));
      }
      
      // End of week is always the following Sunday
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
      
      // Format dates using UTC to avoid timezone shifts
      const formatDate = (date: Date) => {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      const startDateStr = formatDate(startOfWeek);
      const endDateStr = formatDate(endOfWeek);
      
      console.log(`Generation logic (UTC): Today is UTC day ${utcDay}, generating for ${startOfWeek.toDateString()} - ${endOfWeek.toDateString()}`);
      console.log(`Is Sunday check (UTC): utcDay === 0 ? ${utcDay === 0}`);
      console.log(`Generation week range: ${startDateStr} to ${endDateStr}`);
      
      return apiRequest('POST', '/api/meetings/md/generate-weekly', {
        startDate: startDateStr,
        endDate: endDateStr
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/meetings'] });
      toast({ 
        title: 'Weekly MD meetings generated successfully', 
        description: `${data.meetings?.length || 0} meetings created for this week` 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error generating weekly meetings', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  const generateMonthlyMDMeetingsMutation = useMutation({
    mutationFn: () => {
      // Get current year and month
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() + 1; // JavaScript months are 0-indexed
      
      return apiRequest('POST', '/api/meetings/md/generate-monthly', {
        year,
        month
      });
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/meetings'] });
      toast({ 
        title: 'Monthly MD meetings generated successfully', 
        description: `${data.meetings?.length || 0} meetings created for this month` 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error generating monthly meetings', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // MD Plan Overview query
  const { data: mdPlanOverview, isLoading: mdPlanLoading } = useQuery({
    queryKey: ['/api/meetings/md/plan-overview'],
    enabled: activeTab === 'md-planning' && user?.role === 'Superuser',
  });

  // Employee Planning mutations
  const generateWeeklyEmployeeMeetingsMutation = useMutation({
    mutationFn: (params: { startDate: string; endDate: string }) => {
      return apiRequest('POST', '/api/meetings/employee/generate-weekly', params);
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/meetings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/meetings/employee/plan-overview'] });
      toast({ 
        title: 'Weekly planning sessions generated successfully', 
        description: `${data.meetings?.length || 0} planning sessions created for this week` 
      });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error generating weekly planning sessions', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Employee Planning Preview mutation
  const previewWeeklyEmployeeMeetingsMutation = useMutation({
    mutationFn: (params: { startDate: string; endDate: string }) => {
      return apiRequest('POST', '/api/meetings/employee/preview-weekly', params);
    },
    onSuccess: (data: any) => {
      setPreviewData({
        meetings: data.data.meetings,
        weekOf: `${data.data.weekRange.start} to ${data.data.weekRange.end}`,
        totalNewMeetings: data.data.new,
        totalExisting: data.data.existing
      });
      setPreviewType('weekly');
      setShowEmployeePreviewModal(true);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error previewing weekly planning sessions', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // Employee Plan Overview query
  const { data: employeePlanOverview, isLoading: employeePlanLoading } = useQuery({
    queryKey: ['/api/meetings/employee/plan-overview'],
    enabled: activeTab === 'employee-planning',
  });

  // Preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showEmployeePreviewModal, setShowEmployeePreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [previewType, setPreviewType] = useState<'weekly' | 'monthly'>('weekly');
  const [editingPreviewMeeting, setEditingPreviewMeeting] = useState<any>(null);
  const [modifiedMeetings, setModifiedMeetings] = useState<any[]>([]);
  const [deletedMeetingIds, setDeletedMeetingIds] = useState<number[]>([]);

  // MD Meeting Preview mutations
  const previewWeeklyMDMeetingsMutation = useMutation({
    mutationFn: () => {
      // Use UTC time to match server timezone and avoid local timezone discrepancies
      const todayUTC = new Date();
      const utcDay = todayUTC.getUTCDay(); // 0=Sunday, 1=Monday, etc. in UTC
      
      console.log(`Frontend local: ${todayUTC.toDateString()} (local day ${todayUTC.getDay()})`);
      console.log(`Frontend UTC: ${todayUTC.toUTCString()} (UTC day ${utcDay})`);
      console.log(`Frontend timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`);
      
      let startDate: Date;
      let endOfWeek: Date;
      
      if (utcDay === 0) {
        // If today is Sunday in UTC, generate for next Monday's week
        console.log(`🔄 SUNDAY DETECTED (UTC): Generating for NEXT week`);
        const diff = todayUTC.getUTCDate() - utcDay + 1; // Next Monday
        startDate = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), diff));
        endOfWeek = new Date(startDate);
        endOfWeek.setUTCDate(startDate.getUTCDate() + 6); // Following Sunday
      } else {
        // Generate for remaining days of this week (from TODAY forward, not from Monday)
        console.log(`📅 WEEKDAY DETECTED (UTC): Generating from TODAY forward`);
        startDate = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), todayUTC.getUTCDate())); // Today
        
        // Calculate end of this week (Sunday)
        const mondayOfThisWeek = todayUTC.getUTCDate() - utcDay + 1;
        endOfWeek = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), mondayOfThisWeek + 6));
      }
      
      // Format dates using UTC to avoid timezone shifts
      const formatDate = (date: Date) => {
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      };
      
      const startDateStr = formatDate(startDate);
      const endDateStr = formatDate(endOfWeek);
      
      console.log(`Week selection logic (UTC): Today is UTC day ${utcDay}, generating from ${startDate.toDateString()} - ${endOfWeek.toDateString()}`);
      console.log(`Is Sunday check (UTC): utcDay === 0 ? ${utcDay === 0}`);
      console.log(`Date range: ${startDateStr} to ${endDateStr}`);
      
      return apiRequest('POST', '/api/meetings/md/preview-weekly', {
        startDate: startDateStr,
        endDate: endDateStr
      });
    },
    onSuccess: (data: any) => {
      setPreviewData(data);
      setPreviewType('weekly');
      setShowPreviewModal(true);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error previewing weekly meetings', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  const previewMonthlyMDMeetingsMutation = useMutation({
    mutationFn: () => {
      // Get current year and month
      const today = new Date();
      const year = today.getFullYear();
      const month = today.getMonth() + 1; // JavaScript months are 0-indexed
      
      return apiRequest('POST', '/api/meetings/md/preview-monthly', {
        year,
        month
      });
    },
    onSuccess: (data: any) => {
      setPreviewData(data);
      setPreviewType('monthly');
      setShowPreviewModal(true);
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error previewing monthly meetings', 
        description: error.message, 
        variant: 'destructive' 
      });
    },
  });

  // AI Processing mutation
  const processGeminiNotesMutation = useMutation({
    mutationFn: ({ meetingId, geminiContent }: { meetingId: number; geminiContent: string }) =>
      apiRequest('POST', '/api/meetings/ai-notes/process-gemini', { meetingId, geminiContent }),
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/meetings'] });
      toast({ 
        title: 'AI notes processed successfully', 
        description: 'Gemini-generated content has been integrated into the meeting record'
      });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error processing AI notes', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Conclude Google Calendar event mutation
  const concludeEventMutation = useMutation({
    mutationFn: ({ googleEventId, eventTitle }: { googleEventId: string; eventTitle: string }) =>
      apiRequest('POST', '/api/calendar/conclude-event', { googleEventId, eventTitle }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/upcoming-events'] });
      toast({ 
        title: 'Meeting concluded', 
        description: 'Event has been marked as concluded and removed from your list'
      });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error concluding event', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Conclude internal meeting mutation
  const concludeMeetingMutation = useMutation({
    mutationFn: ({ meetingId, meetingTitle }: { meetingId: number; meetingTitle: string }) =>
      apiRequest('POST', `/api/meetings/${meetingId}/conclude`, { meetingTitle }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/meetings'] });
      queryClient.invalidateQueries({ queryKey: ['/api/meetings/dashboard/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/meetings/dashboard/upcoming'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/upcoming-events'] });
      toast({ 
        title: 'Meeting concluded', 
        description: 'Meeting has been marked as completed and removed from upcoming meetings'
      });
    },
    onError: (error: any) => {
      toast({ 
        title: 'Error concluding meeting', 
        description: error.message,
        variant: 'destructive' 
      });
    },
  });

  // Preview modal helper functions
  const handleEditPreviewMeeting = (meeting: any, index: number) => {
    setEditingPreviewMeeting({ 
      ...meeting, 
      index,
      attendeeIds: meeting.attendeeIds || [] // Ensure attendeeIds is always an array
    });
  };

  const handleDeletePreviewMeeting = (index: number) => {
    if (previewData) {
      const updatedMeetings = previewData.meetings.filter((_: any, i: number) => i !== index);
      const updatedData = {
        ...previewData,
        meetings: updatedMeetings,
        totalNewMeetings: updatedMeetings.filter((m: any) => m.status === 'Will be created').length,
        totalExisting: updatedMeetings.filter((m: any) => m.status === 'Already exists').length
      };
      setPreviewData(updatedData);
    }
  };

  const handleSavePreviewMeetingEdit = (editedMeeting: any) => {
    if (previewData && editingPreviewMeeting) {
      const updatedMeetings = [...previewData.meetings];
      updatedMeetings[editingPreviewMeeting.index] = editedMeeting;
      const updatedData = {
        ...previewData,
        meetings: updatedMeetings
      };
      setPreviewData(updatedData);
      setEditingPreviewMeeting(null);
    }
  };



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
      meetingType: 'internal',
      googleCalendarEventId: undefined,
      meetingTitle: undefined,
      meetingDate: undefined,
      meetingStartTime: undefined,
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
    setSelectedStartTime(''); // Reset the selected start time state
    setEditingMeeting(null);
    setIsCreateMeetingOpen(false);
  };

  const resetCommitmentForm = () => {
    commitmentForm.reset({
      meetingId: undefined,
      meetingType: 'internal',
      googleCalendarEventId: undefined,
      meetingTitle: undefined,
      meetingDate: undefined,
      meetingStartTime: undefined,
      title: '',
      description: '',
      priority: 'Medium',
      assignedToId: undefined,
      dueDate: '',
      estimatedHours: undefined,
      businessValue: '',
      successCriteria: '',
    });
    setEditingCommitment(null);
    setIsCreateCommitmentOpen(false);
  };

  const startEditMeeting = (meeting: Meeting) => {
    setEditingMeeting(meeting);
    // Set the selected start time first to enable the end time dropdown
    setSelectedStartTime(meeting.meeting.startTime);
    meetingForm.reset({
      title: meeting.meeting.title,
      description: meeting.meeting.description || '',
      meetingType: meeting.meeting.meetingType,
      priority: meeting.meeting.priority as any,
      meetingDate: meeting.meeting.meetingDate,
      startTime: meeting.meeting.startTime,
      endTime: meeting.meeting.endTime,
      location: meeting.meeting.googleMeetLink || meeting.meeting.meetingUrl || meeting.meeting.location || '',
      meetingUrl: meeting.meeting.meetingUrl || meeting.meeting.googleMeetLink || '',
      attendeeIds: meeting.meeting.attendeeIds || [],
      agenda: meeting.meeting.agenda || '',
      autoCreateGoogleMeet: !!meeting.meeting.googleMeetLink,
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
        <TabsList className={`grid w-full ${user?.role === 'Superuser' ? 'grid-cols-9' : 'grid-cols-8'}`}>
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
          {user?.role === 'Superuser' && (
            <TabsTrigger value="md-planning" className="flex items-center gap-2">
              <SettingsIcon className="h-4 w-4" />
              MD Planning
            </TabsTrigger>
          )}
          <TabsTrigger value="employee-planning" className="flex items-center gap-2">
            <UserIcon className="h-4 w-4" />
            Employee Planning
          </TabsTrigger>
          <TabsTrigger value="google-calendar" className="flex items-center gap-2">
            <VideoIcon className="h-4 w-4" />
            Google Calendar
          </TabsTrigger>
          <TabsTrigger value="ai-notes" className="flex items-center gap-2">
            <BellIcon className="h-4 w-4" />
            AI Notes
          </TabsTrigger>
          <TabsTrigger value="ai-processing" className="flex items-center gap-2">
            <BotIcon className="h-4 w-4" />
            AI Processing
          </TabsTrigger>
          <TabsTrigger value="analytics" className="flex items-center gap-2">
            <TrendingUpIcon className="h-4 w-4" />
            Analytics
          </TabsTrigger>
        </TabsList>

        {/* Dashboard Tab */}
        <TabsContent value="dashboard" className="space-y-6">
          {/* Quick Actions Panel */}
          <Card className="p-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 rounded-lg">
                  <CalendarDaysIcon className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Quick Actions</h3>
                  <p className="text-sm text-gray-600">Create meetings and commitments instantly</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button 
                  onClick={() => { 
                    setActiveTab("meetings");
                    setTimeout(() => {
                      resetMeetingForm(); 
                      setIsCreateMeetingOpen(true); 
                    }, 100);
                  }} 
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <PlusIcon className="h-4 w-4 mr-2" />
                  New Meeting
                </Button>
                <Button 
                  onClick={() => { 
                    setActiveTab("commitments");
                    setTimeout(() => {
                      resetCommitmentForm(); 
                      setIsCreateCommitmentOpen(true); 
                    }, 100);
                  }} 
                  variant="outline" 
                  className="border-blue-200 text-blue-600 hover:bg-blue-50"
                >
                  <ListChecksIcon className="h-4 w-4 mr-2" />
                  New Commitment
                </Button>
              </div>
            </div>
          </Card>

          {/* Enhanced Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Meetings</p>
                  <p className="text-3xl font-bold">{dashboardStats?.meetings.total || 0}</p>
                  <p className="text-xs text-gray-500 mt-1">All time</p>
                </div>
                <CalendarDaysIcon className="h-8 w-8 text-blue-600" />
              </div>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">This Week</p>
                  <p className="text-3xl font-bold">{dashboardStats?.meetings.thisWeek || 0}</p>
                  <p className="text-xs text-gray-500 mt-1">Meetings scheduled</p>
                </div>
                <CalendarIcon className="h-8 w-8 text-green-600" />
              </div>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending Actions</p>
                  <p className="text-3xl font-bold">{dashboardStats?.commitments.pending || 0}</p>
                  <p className="text-xs text-gray-500 mt-1">Commitments</p>
                </div>
                <ListChecksIcon className="h-8 w-8 text-yellow-600" />
              </div>
            </Card>
            
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Overdue Items</p>
                  <p className="text-3xl font-bold text-red-600">{dashboardStats?.commitments.overdue || 0}</p>
                  <p className="text-xs text-red-500 mt-1">Need attention</p>
                </div>
                <AlertCircleIcon className="h-8 w-8 text-red-600" />
              </div>
            </Card>
          </div>

          {/* Today's Agenda */}
          <Card>
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 rounded-lg">
                    <ClockIcon className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Today's Agenda</h3>
                    <p className="text-sm text-gray-600">Your meetings and commitments for today</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-orange-600 border-orange-200">
                  {format(new Date(), 'MMM dd, yyyy')}
                </Badge>
              </div>
            </div>
            <div className="p-6">
              {/* Today's Meetings */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 mb-4">
                  <CalendarDaysIcon className="h-4 w-4 text-blue-600" />
                  <h4 className="font-medium text-gray-900">Today's Meetings</h4>
                </div>
                {upcomingMeetings?.meetings?.filter(meeting => 
                  format(parseISO(meeting.meeting.meetingDate), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                ).length > 0 ? (
                  <div className="space-y-3">
                    {upcomingMeetings.meetings.filter(meeting => 
                      format(parseISO(meeting.meeting.meetingDate), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                    ).map((meeting) => (
                      <div key={meeting.meeting.id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="p-1 bg-blue-100 rounded">
                            <CalendarDaysIcon className="h-4 w-4 text-blue-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{meeting.meeting.title}</p>
                            <p className="text-sm text-gray-600">{meeting.meeting.startTime} - {meeting.meeting.endTime}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getPriorityColor(meeting.meeting.priority)}>
                            {meeting.meeting.priority}
                          </Badge>
                          {(meeting.meeting.googleMeetLink || meeting.meeting.meetingUrl) && (
                            <Button 
                              size="sm" 
                              variant="outline" 
                              className="text-blue-600 border-blue-200"
                              onClick={() => window.open(meeting.meeting.googleMeetLink || meeting.meeting.meetingUrl, '_blank')}
                            >
                              <VideoIcon className="h-3 w-3 mr-1" />
                              Join
                            </Button>
                          )}
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => concludeMeetingMutation.mutate({ 
                              meetingId: meeting.meeting.id, 
                              meetingTitle: meeting.meeting.title 
                            })}
                            disabled={concludeMeetingMutation.isPending}
                            className="bg-red-600 hover:bg-red-700 whitespace-nowrap"
                          >
                            <CheckCircleIcon className="h-3 w-3 mr-1" />
                            Concluded
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm py-4">No meetings scheduled for today</p>
                )}

                {/* Today's Due Commitments */}
                <div className="flex items-center gap-2 mb-4 mt-6">
                  <ListChecksIcon className="h-4 w-4 text-green-600" />
                  <h4 className="font-medium text-gray-900">Due Today</h4>
                </div>
                {commitmentsData?.commitments?.filter(commitment => 
                  format(parseISO(commitment.commitment.dueDate), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                ).length > 0 ? (
                  <div className="space-y-3">
                    {commitmentsData.commitments.filter(commitment => 
                      format(parseISO(commitment.commitment.dueDate), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
                    ).map((commitment) => (
                      <div key={commitment.commitment.id} className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="p-1 bg-green-100 rounded">
                            <ListChecksIcon className="h-4 w-4 text-green-600" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{commitment.commitment.title}</p>
                            <p className="text-sm text-gray-600">Assigned to {commitment.assignedTo?.username}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={getPriorityColor(commitment.commitment.priority)}>
                            {commitment.commitment.priority}
                          </Badge>
                          <Badge variant="outline" className={getStatusColor(commitment.commitment.status)}>
                            {commitment.commitment.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-gray-500 text-sm py-4">No commitments due today</p>
                )}
              </div>
            </div>
          </Card>

          {/* Action Items Due Soon */}
          <Card>
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-yellow-100 rounded-lg">
                    <AlertCircleIcon className="h-5 w-5 text-yellow-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">Action Items Due Soon</h3>
                    <p className="text-sm text-gray-600">Commitments due within the next 3 days</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-yellow-600 border-yellow-200">
                  Next 3 Days
                </Badge>
              </div>
            </div>
            <div className="p-6">
              {commitmentsData?.commitments?.filter(commitment => {
                const dueDate = parseISO(commitment.commitment.dueDate);
                const today = new Date();
                const threeDaysFromNow = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
                return dueDate >= today && dueDate <= threeDaysFromNow && commitment.commitment.status !== 'Completed';
              }).length > 0 ? (
                <div className="space-y-4">
                  {commitmentsData.commitments.filter(commitment => {
                    const dueDate = parseISO(commitment.commitment.dueDate);
                    const today = new Date();
                    const threeDaysFromNow = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);
                    return dueDate >= today && dueDate <= threeDaysFromNow && commitment.commitment.status !== 'Completed';
                  }).slice(0, 5).map((commitment) => (
                    <div key={commitment.commitment.id} className="flex items-center justify-between p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-yellow-100 rounded">
                          <ListChecksIcon className="h-4 w-4 text-yellow-600" />
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{commitment.commitment.title}</p>
                          <p className="text-sm text-gray-600">
                            Due {format(parseISO(commitment.commitment.dueDate), 'MMM dd, yyyy')} • 
                            Assigned to {commitment.assignedTo?.username}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getPriorityColor(commitment.commitment.priority)}>
                          {commitment.commitment.priority}
                        </Badge>
                        <Badge variant="outline" className={getStatusColor(commitment.commitment.status)}>
                          {commitment.commitment.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircleIcon className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <p className="text-gray-500">No urgent action items</p>
                  <p className="text-sm text-gray-400">All commitments are on track</p>
                </div>
              )}
            </div>
          </Card>



          {/* Upcoming Google Calendar Events */}
          <Card>
            <div className="p-6 border-b">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Upcoming Google Calendar Events</h3>
                <Badge variant="outline" className="text-blue-600">
                  {googleCalendarEvents?.count || 0} events
                </Badge>
              </div>
            </div>
            <div className="p-6">
              {googleCalendarLoading ? (
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
              ) : googleCalendarEvents?.events?.length ? (
                <div className="space-y-4 max-h-96 overflow-y-auto">
                  {/* All Google Calendar Events (Internal & External) */}
                  {googleCalendarEvents.events.map((event) => (
                    <div key={`google-${event.id}`} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 bg-white rounded-lg border border-gray-200 gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <Badge variant="outline" className="bg-green-50 text-green-600 border-green-300">
                            Google Calendar
                          </Badge>
                          <h4 className="font-semibold text-gray-900">{event.summary || 'Untitled Event'}</h4>
                        </div>
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
                        {event.description && (
                          <div className="text-xs text-gray-500 mt-1 truncate">
                            {event.description.substring(0, 100)}...
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0 sm:ml-4">
                        {event.hangoutLink && (
                          <Button
                            size="sm"
                            onClick={() => window.open(event.hangoutLink, '_blank')}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            <VideoIcon className="h-3 w-3 mr-1" />
                            Join
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => window.open(event.htmlLink, '_blank')}
                        >
                          <LinkIcon className="h-3 w-3 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => concludeEventMutation.mutate({ 
                            googleEventId: event.id, 
                            eventTitle: event.summary 
                          })}
                          disabled={concludeEventMutation.isPending}
                          className="bg-red-600 hover:bg-red-700 whitespace-nowrap"
                        >
                          <CheckCircleIcon className="h-4 w-4 mr-1" />
                          Concluded
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CalendarDaysIcon className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h4 className="text-lg font-medium text-gray-900 mb-2">No upcoming events</h4>
                  <p className="text-gray-500">
                    No upcoming Google Calendar events found.
                  </p>
                </div>
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
                                <Select 
                                  onValueChange={(value) => {
                                    field.onChange(value);
                                    setSelectedStartTime(value);
                                    // Clear end time when start time changes
                                    meetingForm.setValue('endTime', '');
                                  }} 
                                  value={field.value}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select start time" />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="max-h-60">
                                    {startTimeOptions.map((time) => (
                                      <SelectItem key={time.value} value={time.value}>
                                        {time.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
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
                                <Select 
                                  onValueChange={field.onChange} 
                                  value={field.value}
                                  disabled={!selectedStartTime}
                                >
                                  <FormControl>
                                    <SelectTrigger>
                                      <SelectValue placeholder={selectedStartTime ? "Select end time" : "Select start time first"} />
                                    </SelectTrigger>
                                  </FormControl>
                                  <SelectContent className="max-h-60">
                                    {endTimeOptions.map((time) => (
                                      <SelectItem key={time.value} value={time.value}>
                                        {time.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
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
                            {meeting.meeting.autoCreateGoogleMeet && !meeting.meeting.googleCalendarSynced && (
                              <DropdownMenuItem 
                                onClick={() => syncToCalendarMutation.mutate(meeting.meeting.id)}
                                disabled={syncToCalendarMutation.isPending}
                              >
                                <CalendarIcon className="h-4 w-4 mr-2" />
                                Sync to Google Calendar
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
                                  // Handle both internal meetings and Google Calendar events
                                  if (value.startsWith('google_calendar_')) {
                                    // Google Calendar event selected
                                    const eventId = value.replace('google_calendar_', '');
                                    const selectedEvent = combinedMeetingsList.googleCalendar.find(event => event.id === eventId);
                                    if (selectedEvent) {
                                      // Clear meetingId and set Google Calendar data
                                      field.onChange(undefined);
                                      commitmentForm.setValue('meetingType', 'google_calendar');
                                      commitmentForm.setValue('googleCalendarEventId', eventId);
                                      commitmentForm.setValue('meetingTitle', selectedEvent.title);
                                      commitmentForm.setValue('meetingDate', selectedEvent.date);
                                      commitmentForm.setValue('meetingStartTime', selectedEvent.startTime);
                                    }
                                  } else {
                                    // Internal meeting selected
                                    const meetingId = parseInt(value);
                                    const selectedMeeting = combinedMeetingsList.internal.find(meeting => meeting.displayId === meetingId);
                                    if (selectedMeeting) {
                                      field.onChange(meetingId);
                                      commitmentForm.setValue('meetingType', 'internal');
                                      commitmentForm.setValue('googleCalendarEventId', undefined);
                                      commitmentForm.setValue('meetingTitle', selectedMeeting.title);
                                      commitmentForm.setValue('meetingDate', selectedMeeting.date);
                                      commitmentForm.setValue('meetingStartTime', selectedMeeting.startTime);
                                    }
                                  }
                                }} 
                                value={
                                  commitmentForm.watch('meetingType') === 'google_calendar' 
                                    ? `google_calendar_${commitmentForm.watch('googleCalendarEventId')}`
                                    : field.value ? field.value.toString() : undefined
                                }
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Select meeting" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {/* Internal Meetings - Can be selected */}
                                  {combinedMeetingsList.internal.length > 0 && (
                                    <SelectGroup>
                                      <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                                        Internal Meetings
                                      </SelectLabel>
                                      {combinedMeetingsList.internal.map((meeting) => (
                                        <SelectItem key={meeting.id} value={meeting.displayId.toString()}>
                                          {meeting.title}
                                          <span className="ml-2 text-sm text-gray-500">
                                            ({format(parseISO(meeting.date), 'MMM dd')} at {meeting.startTime})
                                          </span>
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  )}
                                  
                                  {/* Google Calendar Events - Now selectable */}
                                  {combinedMeetingsList.googleCalendar.length > 0 && (
                                    <SelectGroup>
                                      <SelectLabel className="font-semibold text-green-600 dark:text-green-400">
                                        Google Calendar Events
                                      </SelectLabel>
                                      {combinedMeetingsList.googleCalendar.map((meeting) => (
                                        <SelectItem key={meeting.id} value={`google_calendar_${meeting.id}`}>
                                          {meeting.title}
                                          <span className="ml-2 text-sm text-gray-500">
                                            ({format(parseISO(meeting.date), 'MMM dd')} at {meeting.startTime})
                                          </span>
                                        </SelectItem>
                                      ))}
                                    </SelectGroup>
                                  )}
                                  
                                  {/* Empty state */}
                                  {combinedMeetingsList.internal.length === 0 && combinedMeetingsList.googleCalendar.length === 0 && (
                                    <SelectItem value="no-meetings" disabled>
                                      No recent or upcoming meetings available
                                    </SelectItem>
                                  )}
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-gray-500 mt-1">
                                Commitments can be linked to both internal meetings and Google Calendar events
                              </p>
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

        {/* MD Planning Tab */}
        {user?.role === 'Superuser' && (
          <TabsContent value="md-planning" className="space-y-6">
            <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-semibold">Managing Director Meeting Plan</h3>
                <p className="text-gray-600">Automated meeting generation based on approved 2025 yearly meeting plan</p>
              </div>
              <SettingsIcon className="h-8 w-8 text-blue-600" />
            </div>

            {/* Plan Overview */}
            {mdPlanLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-gray-500">Loading MD plan overview...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <Card className="p-4 bg-blue-50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-100 rounded-lg">
                      <CalendarDaysIcon className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-blue-600">Weekly Time Allocation</p>
                      <p className="text-2xl font-bold text-blue-900">25 Hours</p>
                      <p className="text-xs text-blue-700">Target weekly limit</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-4 bg-green-50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-green-100 rounded-lg">
                      <TrendingUpIcon className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-green-600">Marketing Leadership</p>
                      <p className="text-2xl font-bold text-green-900">12%</p>
                      <p className="text-xs text-green-700">Time allocation</p>
                    </div>
                  </div>
                </Card>

                <Card className="p-4 bg-purple-50">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-purple-100 rounded-lg">
                      <UsersIcon className="h-5 w-5 text-purple-600" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-purple-600">Customer Projects</p>
                      <p className="text-2xl font-bold text-purple-900">8%</p>
                      <p className="text-xs text-purple-700">Oversight allocation</p>
                    </div>
                  </div>
                </Card>
              </div>
            )}

            {/* Quick Actions */}
            <div className="border rounded-lg p-6">
              <h4 className="text-lg font-semibold mb-4">Quick Actions</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Button
                  onClick={() => previewWeeklyMDMeetingsMutation.mutate()}
                  disabled={previewWeeklyMDMeetingsMutation.isPending}
                  className="h-16 flex-col gap-2"
                >
                  <CalendarDaysIcon className="h-6 w-6" />
                  Preview & Generate Upcoming Meetings
                  <span className="text-xs opacity-75">From today through end of week</span>
                </Button>

                <Button
                  onClick={() => previewMonthlyMDMeetingsMutation.mutate()}
                  disabled={previewMonthlyMDMeetingsMutation.isPending}
                  variant="outline"
                  className="h-16 flex-col gap-2"
                >
                  <CalendarIcon className="h-6 w-6" />
                  Preview & Generate Monthly Meetings
                  <span className="text-xs opacity-75">All monthly recurring templates</span>
                </Button>
              </div>
            </div>

            {/* Meeting Templates Overview */}
            <div className="border rounded-lg p-6">
              <h4 className="text-lg font-semibold mb-4">Meeting Framework</h4>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="border rounded p-4">
                    <h5 className="font-semibold text-blue-600 mb-2">Strategic Work (Morning)</h5>
                    <p className="text-sm text-gray-600 mb-2">9:00 AM - 12:00 PM, Monday-Friday</p>
                    <ul className="text-xs text-gray-500 space-y-1">
                      <li>• Strategic planning & analysis</li>
                      <li>• Deep work sessions</li>
                      <li>• No meetings scheduled</li>
                    </ul>
                  </div>

                  <div className="border rounded p-4">
                    <h5 className="font-semibold text-green-600 mb-2">Meeting Block (Afternoon)</h5>
                    <p className="text-sm text-gray-600 mb-2">2:00 PM - 5:00 PM, Tuesday-Thursday</p>
                    <ul className="text-xs text-gray-500 space-y-1">
                      <li>• Team meetings</li>
                      <li>• Customer interactions</li>
                      <li>• Marketing activities</li>
                    </ul>
                  </div>
                </div>

                <div className="border-t pt-4">
                  <h5 className="font-semibold mb-3">Meeting Schedule</h5>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 text-sm">
                    <div>
                      <p className="font-medium text-purple-600">Weekly Meetings</p>
                      <ul className="text-gray-600 space-y-1 mt-1">
                        <li>• Team Review (Monday 2:00 PM)</li>
                        <li>• Sales Review (Wednesday 2:30 PM)</li>
                        <li>• Operations Review (Thursday 2:00 PM)</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-orange-600">Monthly Meetings</p>
                      <ul className="text-gray-600 space-y-1 mt-1">
                        <li>• Board Meeting (1st Monday)</li>
                        <li>• Customer Review (3rd Wednesday)</li>
                        <li>• Strategic Planning (Last Friday)</li>
                      </ul>
                    </div>
                    <div>
                      <p className="font-medium text-teal-600">Quarterly Meetings</p>
                      <ul className="text-gray-600 space-y-1 mt-1">
                        <li>• All-Hands Meeting</li>
                        <li>• Vision & Strategy Session</li>
                        <li>• Performance Review</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Recent Generation Log */}
            <div className="border rounded-lg p-6">
              <h4 className="text-lg font-semibold mb-4">Recent Activity</h4>
              <div className="text-center py-8 text-gray-500">
                <FileTextIcon className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                <p>Meeting generation history will appear here</p>
                <p className="text-sm">Generate meetings to see activity log</p>
              </div>
            </div>
          </Card>
          </TabsContent>
        )}

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
                          className="p-4 hover:bg-green-50 transition-colors border-green-100"
                        >
                          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                            <div className="flex-1">
                              <h4 className="font-semibold">{event.summary}</h4>
                              <p className="text-sm text-gray-600">
                                {event.start.dateTime 
                                  ? format(parseISO(event.start.dateTime), 'MMM d, yyyy · h:mm a')
                                  : format(parseISO(event.start.date), 'MMM d, yyyy')
                                }
                              </p>
                              {event.description && (
                                <p className="text-sm text-gray-500 mt-1 line-clamp-2">{event.description}</p>
                              )}
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
                            <div className="flex flex-row lg:flex-col gap-2 shrink-0">
                              {event.hangoutLink && (
                                <Button
                                  size="sm"
                                  onClick={() => window.open(event.hangoutLink, '_blank')}
                                  className="bg-green-600 hover:bg-green-700 whitespace-nowrap"
                                >
                                  <VideoIcon className="h-4 w-4 mr-1" />
                                  Join
                                </Button>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => window.open(event.htmlLink, '_blank')}
                                className="whitespace-nowrap"
                              >
                                <LinkIcon className="h-4 w-4 mr-1" />
                                View
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                onClick={() => concludeEventMutation.mutate({ 
                                  googleEventId: event.id, 
                                  eventTitle: event.summary 
                                })}
                                disabled={concludeEventMutation.isPending}
                                className="bg-red-600 hover:bg-red-700 whitespace-nowrap"
                              >
                                <CheckCircleIcon className="h-4 w-4 mr-1" />
                                Concluded
                              </Button>
                            </div>
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
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => concludeEventMutation.mutate({ 
                            googleEventId: event.id, 
                            eventTitle: event.summary 
                          })}
                          disabled={concludeEventMutation.isPending}
                          className="bg-red-600 hover:bg-red-700"
                        >
                          <CheckCircleIcon className="h-4 w-4 mr-1" />
                          Meeting Concluded
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

        {/* AI Processing Tab */}
        <TabsContent value="ai-processing" className="space-y-6">
          <Card className="p-6">
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold">AI Meeting Notes Processing</h3>
                  <p className="text-gray-600">Process external AI-generated meeting notes from Gemini or other sources</p>
                </div>
                <BotIcon className="h-8 w-8 text-blue-600" />
              </div>

              {/* Meeting Selection */}
              <div className="border-b pb-6">
                <h4 className="text-lg font-medium mb-4">Select Meeting</h4>
                <Select 
                  onValueChange={(value) => {
                    const meeting = meetingsData?.meetings?.find(m => m.meeting.id === parseInt(value));
                    setSelectedMeetingForAI(meeting || null);
                    // Update Gemini content with existing AI notes if available
                    if (meeting?.meeting.aiNotes) {
                      setGeminiContent(meeting.meeting.aiNotes);
                    } else {
                      setGeminiContent('');
                    }
                  }}
                  value={selectedMeetingForAI?.meeting.id.toString() || ''}
                >
                  <SelectTrigger className="w-full max-w-md">
                    <SelectValue placeholder="Choose a meeting to process AI notes..." />
                  </SelectTrigger>
                  <SelectContent>
                    {meetingsData?.meetings?.map((meeting) => (
                      <SelectItem key={meeting.meeting.id} value={meeting.meeting.id.toString()}>
                        <div className="flex flex-col">
                          <span className="font-medium">{meeting.meeting.title}</span>
                          <span className="text-sm text-gray-500">
                            {format(parseISO(meeting.meeting.meetingDate), 'MMM dd, yyyy')} at {meeting.meeting.startTime}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* AI Content Input */}
              {selectedMeetingForAI && (
                <div className="space-y-4">
                  <div>
                    <h4 className="text-lg font-medium mb-2">Selected Meeting</h4>
                    <Card className="p-4 bg-blue-50 border-blue-200">
                      <div className="flex items-center gap-4">
                        <CalendarIcon className="h-5 w-5 text-blue-600" />
                        <div>
                          <h5 className="font-medium text-blue-900">{selectedMeetingForAI.meeting.title}</h5>
                          <p className="text-sm text-blue-700">
                            {format(parseISO(selectedMeetingForAI.meeting.meetingDate), 'MMM dd, yyyy')} · 
                            {selectedMeetingForAI.meeting.startTime} - {selectedMeetingForAI.meeting.endTime}
                          </p>
                          {selectedMeetingForAI.meeting.description && (
                            <p className="text-sm text-blue-600 mt-1">{selectedMeetingForAI.meeting.description}</p>
                          )}
                        </div>
                      </div>
                    </Card>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-lg font-medium">
                        {selectedMeetingForAI?.meeting.aiNotesGenerated ? 'Existing AI Content' : 'Gemini-Generated Content'}
                      </h4>
                      {selectedMeetingForAI?.meeting.aiNotesGenerated && (
                        <div className="flex items-center text-sm text-green-600">
                          <BotIcon className="h-4 w-4 mr-1" />
                          AI notes available
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-gray-600 mb-3">
                      {selectedMeetingForAI?.meeting.aiNotesGenerated 
                        ? 'This meeting already has AI-generated notes. You can edit and reprocess them below.'
                        : 'Paste your AI-generated meeting notes from Gemini or other AI sources. The system will automatically parse and structure the content.'
                      }
                    </p>
                    <Textarea
                      placeholder={selectedMeetingForAI?.meeting.aiNotes 
                        ? `Edit existing AI notes for "${selectedMeetingForAI.meeting.title}"...`
                        : `Paste your AI-generated meeting notes here for "${selectedMeetingForAI?.meeting.title || 'selected meeting'}"

Example format:

Summary
Brief overview of what was discussed in the meeting...

Details
• Key discussion points
• Decisions made
• Important information shared

Suggested next steps
• Action items to follow up on
• Next meeting schedule
• Documentation requirements`}
                      value={geminiContent}
                      onChange={(e) => setGeminiContent(e.target.value)}
                      className="min-h-[300px] font-mono text-sm"
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button
                      onClick={() => {
                        if (selectedMeetingForAI && geminiContent.trim()) {
                          processGeminiNotesMutation.mutate({
                            meetingId: selectedMeetingForAI.meeting.id,
                            geminiContent: geminiContent
                          });
                        }
                      }}
                      disabled={!selectedMeetingForAI || !geminiContent.trim() || processGeminiNotesMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700"
                    >
                      {processGeminiNotesMutation.isPending ? (
                        <>
                          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                          Processing...
                        </>
                      ) : (
                        <>
                          <BotIcon className="h-4 w-4 mr-2" />
                          {selectedMeetingForAI?.meeting.aiNotesGenerated ? 'Update AI Notes' : 'Process AI Notes'}
                        </>
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setGeminiContent('');
                        setSelectedMeetingForAI(null);
                      }}
                    >
                      Clear
                    </Button>
                  </div>

                  {/* Help Section */}
                  <Card className="p-4 bg-gray-50">
                    <div className="flex items-start gap-3">
                      <FileTextIcon className="h-5 w-5 text-gray-600 mt-0.5" />
                      <div>
                        <h5 className="font-medium text-gray-900 mb-2">How it works</h5>
                        <ul className="text-sm text-gray-600 space-y-1">
                          <li>• Select a meeting from the dropdown - both cards will update dynamically</li>
                          <li>• Existing AI notes will auto-load, or paste new Gemini content</li>
                          <li>• The system will automatically parse Summary, Details, and Next Steps</li>
                          <li>• Structured AI notes will be saved to the meeting record</li>
                          <li>• View all processed notes in the AI Notes tab</li>
                        </ul>
                      </div>
                    </div>
                  </Card>
                </div>
              )}
            </div>
          </Card>
        </TabsContent>

        {/* Analytics Tab */}
        <TabsContent value="analytics" className="space-y-6">
          {/* Analytics Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Analytics Dashboard</h2>
              <p className="text-gray-600">Comprehensive insights into meetings and commitments performance</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                <TrendingUpIcon className="h-3 w-3 mr-1" />
                Live Data
              </Badge>
            </div>
          </div>

          {/* Key Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Total Meetings */}
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Meetings</p>
                  <p className="text-3xl font-bold text-gray-900">{dashboardStats?.meetings?.total || 0}</p>
                </div>
                <div className="h-12 w-12 bg-blue-100 rounded-lg flex items-center justify-center">
                  <CalendarIcon className="h-6 w-6 text-blue-600" />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">All time meetings organized</p>
            </Card>

            {/* Active Commitments */}
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Active Commitments</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {(dashboardStats?.commitments?.pending || 0) + (dashboardStats?.commitments?.inProgress || 0)}
                  </p>
                </div>
                <div className="h-12 w-12 bg-green-100 rounded-lg flex items-center justify-center">
                  <ListChecksIcon className="h-6 w-6 text-green-600" />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">Pending & in progress</p>
            </Card>

            {/* Completion Rate */}
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Completion Rate</p>
                  <p className="text-3xl font-bold text-gray-900">
                    {dashboardStats?.commitments?.total ? 
                      Math.round((dashboardStats.commitments.completed / dashboardStats.commitments.total) * 100) : 0}%
                  </p>
                </div>
                <div className="h-12 w-12 bg-purple-100 rounded-lg flex items-center justify-center">
                  <CheckIcon className="h-6 w-6 text-purple-600" />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">Commitments completed</p>
            </Card>

            {/* Overdue Items */}
            <Card className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Overdue Items</p>
                  <p className="text-3xl font-bold text-red-600">{dashboardStats?.commitments?.overdue || 0}</p>
                </div>
                <div className="h-12 w-12 bg-red-100 rounded-lg flex items-center justify-center">
                  <AlertCircleIcon className="h-6 w-6 text-red-600" />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">Require immediate attention</p>
            </Card>
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Meeting Types Distribution */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Meeting Types Distribution</h3>
              <div className="space-y-4">
                {meetingsData?.meetings && (() => {
                  const typeStats = meetingsData.meetings.reduce((acc: any, item: any) => {
                    const type = item.meeting.meetingType || 'Other';
                    acc[type] = (acc[type] || 0) + 1;
                    return acc;
                  }, {});
                  
                  const total = Object.values(typeStats).reduce((a: any, b: any) => a + b, 0);
                  
                  return Object.entries(typeStats).map(([type, count]: [string, any]) => (
                    <div key={type} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-3 h-3 rounded-full bg-blue-500"></div>
                        <span className="text-sm font-medium">{type}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">{count}</span>
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className="bg-blue-500 h-2 rounded-full" 
                            style={{ width: `${(count / total) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </Card>

            {/* Priority Distribution */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Priority Distribution</h3>
              <div className="space-y-4">
                {commitmentsData?.commitments && (() => {
                  const priorityStats = commitmentsData.commitments.reduce((acc: any, item: any) => {
                    const priority = item.commitment.priority || 'Medium';
                    acc[priority] = (acc[priority] || 0) + 1;
                    return acc;
                  }, {});
                  
                  const total = Object.values(priorityStats).reduce((a: any, b: any) => a + b, 0);
                  const priorityColors: any = {
                    'High': 'bg-red-500',
                    'Medium': 'bg-yellow-500',
                    'Low': 'bg-green-500'
                  };
                  
                  return Object.entries(priorityStats).map(([priority, count]: [string, any]) => (
                    <div key={priority} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${priorityColors[priority] || 'bg-gray-500'}`}></div>
                        <span className="text-sm font-medium">{priority}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-gray-600">{count}</span>
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full ${priorityColors[priority] || 'bg-gray-500'}`}
                            style={{ width: `${(count / total) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </Card>
          </div>

          {/* Status Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Meeting Status */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Meeting Status</h3>
              <div className="space-y-3">
                {meetingsData?.meetings && (() => {
                  const statusStats = meetingsData.meetings.reduce((acc: any, item: any) => {
                    const status = item.meeting.status || 'Scheduled';
                    acc[status] = (acc[status] || 0) + 1;
                    return acc;
                  }, {});
                  
                  const statusColors: any = {
                    'Scheduled': 'text-blue-600 bg-blue-100',
                    'Completed': 'text-green-600 bg-green-100',
                    'Cancelled': 'text-red-600 bg-red-100',
                    'In Progress': 'text-yellow-600 bg-yellow-100'
                  };
                  
                  return Object.entries(statusStats).map(([status, count]: [string, any]) => (
                    <div key={status} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                      <span className="text-sm font-medium">{status}</span>
                      <Badge className={statusColors[status] || 'text-gray-600 bg-gray-100'}>
                        {count}
                      </Badge>
                    </div>
                  ));
                })()}
              </div>
            </Card>

            {/* Commitment Status */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Commitment Status</h3>
              <div className="space-y-3">
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <span className="text-sm font-medium">Pending</span>
                  <Badge className="text-yellow-600 bg-yellow-100">
                    {dashboardStats?.commitments?.pending || 0}
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <span className="text-sm font-medium">In Progress</span>
                  <Badge className="text-blue-600 bg-blue-100">
                    {dashboardStats?.commitments?.inProgress || 0}
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <span className="text-sm font-medium">Completed</span>
                  <Badge className="text-green-600 bg-green-100">
                    {dashboardStats?.commitments?.completed || 0}
                  </Badge>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                  <span className="text-sm font-medium">Overdue</span>
                  <Badge className="text-red-600 bg-red-100">
                    {dashboardStats?.commitments?.overdue || 0}
                  </Badge>
                </div>
              </div>
            </Card>

            {/* Team Performance */}
            <Card className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Team Performance</h3>
              <div className="space-y-3">
                {commitmentsData?.commitments && (() => {
                  const teamStats = commitmentsData.commitments.reduce((acc: any, item: any) => {
                    const assignee = item.assignedTo?.username || 'Unassigned';
                    if (!acc[assignee]) {
                      acc[assignee] = { total: 0, completed: 0 };
                    }
                    acc[assignee].total++;
                    if (item.commitment.status === 'Completed') {
                      acc[assignee].completed++;
                    }
                    return acc;
                  }, {});
                  
                  return Object.entries(teamStats).slice(0, 5).map(([assignee, stats]: [string, any]) => (
                    <div key={assignee} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                      <div>
                        <span className="text-sm font-medium">{assignee}</span>
                        <div className="text-xs text-gray-500">
                          {stats.completed}/{stats.total} completed
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%
                        </div>
                        <div className="w-16 bg-gray-200 rounded-full h-1.5 mt-1">
                          <div 
                            className="bg-green-500 h-1.5 rounded-full" 
                            style={{ width: `${stats.total > 0 ? (stats.completed / stats.total) * 100 : 0}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Activity</h3>
            <div className="space-y-4">
              {/* Recent Meetings */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Recent Meetings</h4>
                <div className="space-y-2">
                  {meetingsData?.meetings?.slice(0, 3).map((item: any) => (
                    <div key={item.meeting.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                      <div className="flex items-center gap-3">
                        <CalendarIcon className="h-4 w-4 text-gray-500" />
                        <div>
                          <span className="text-sm font-medium">{item.meeting.title}</span>
                          <div className="text-xs text-gray-500">
                            {new Date(item.meeting.meetingDate).toLocaleDateString()} at {item.meeting.startTime}
                          </div>
                        </div>
                      </div>
                      <Badge 
                        className={
                          item.meeting.status === 'Completed' ? 'text-green-600 bg-green-100' :
                          item.meeting.status === 'Cancelled' ? 'text-red-600 bg-red-100' :
                          'text-blue-600 bg-blue-100'
                        }
                      >
                        {item.meeting.status || 'Scheduled'}
                      </Badge>
                    </div>
                  )) || (
                    <div className="text-sm text-gray-500 text-center py-4">No recent meetings</div>
                  )}
                </div>
              </div>

              {/* Recent Commitments */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2">Recent Commitments</h4>
                <div className="space-y-2">
                  {commitmentsData?.commitments?.slice(0, 3).map((item: any) => (
                    <div key={item.commitment.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
                      <div className="flex items-center gap-3">
                        <ListChecksIcon className="h-4 w-4 text-gray-500" />
                        <div>
                          <span className="text-sm font-medium">{item.commitment.title}</span>
                          <div className="text-xs text-gray-500">
                            Due: {new Date(item.commitment.dueDate).toLocaleDateString()}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge 
                          className={
                            item.commitment.status === 'Completed' ? 'text-green-600 bg-green-100' :
                            item.commitment.status === 'In Progress' ? 'text-blue-600 bg-blue-100' :
                            new Date(item.commitment.dueDate) < new Date() ? 'text-red-600 bg-red-100' :
                            'text-yellow-600 bg-yellow-100'
                          }
                        >
                          {item.commitment.status}
                        </Badge>
                      </div>
                    </div>
                  )) || (
                    <div className="text-sm text-gray-500 text-center py-4">No recent commitments</div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </TabsContent>

        {/* Employee Planning Tab */}
        <TabsContent value="employee-planning" className="space-y-6">
          {/* Employee Planning Header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Employee Planning</h2>
              <p className="text-gray-600">Automated daily planning sessions for personal productivity</p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                <UserIcon className="h-3 w-3 mr-1" />
                For All Employees
              </Badge>
            </div>
          </div>

          {/* Employee Planning Framework */}
          <Card className="p-6 bg-gradient-to-r from-green-50 to-blue-50 border-green-200">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Daily Planning Template */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Daily Planning Template</h3>
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                    <span className="text-sm text-gray-700">Meeting: Daily Planning Session</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <span className="text-sm text-gray-700">Time: 10:30 AM - 11:00 AM</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                    <span className="text-sm text-gray-700">Duration: 30 minutes</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-orange-500 rounded-full"></div>
                    <span className="text-sm text-gray-700">Schedule: Monday to Friday</span>
                  </div>
                </div>
              </div>

              {/* Time Allocation */}
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-3">Weekly Time Allocation</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Weekly Sessions</span>
                    <span className="font-medium">5 meetings</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Time</span>
                    <span className="font-medium">2.5 hours</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Daily Focus</span>
                    <span className="font-medium">Personal productivity</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Meeting Type</span>
                    <span className="font-medium">Personal Planning</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* Conflict Resolution Notice */}
          <Card className="p-6 bg-green-50 border-green-200">
            <h3 className="font-semibold text-green-800 mb-3">✅ NO CONFLICTS DETECTED</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm text-green-700">Employee Planning: 10:30 AM - 11:00 AM (All weekdays)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-sm text-green-700">MD Executive Brief: 11:30 AM - 12:00 PM (Mondays)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                <span className="text-sm text-green-700">MD Strategic Thinking: 2:00 PM - 4:00 PM (Mondays)</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 bg-green-500 rounded-full"></div>
                <span className="text-sm text-green-700 font-medium">✅ PERFECT SCHEDULING: No overlaps between any meetings</span>
              </div>
            </div>
          </Card>

          {/* Employee Planning Actions */}
          <Card className="p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <UserIcon className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Weekly Planning Generation</h3>
                  <p className="text-sm text-gray-600">Generate your personal planning sessions for the week</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button 
                  variant="outline"
                  onClick={() => {
                    const todayUTC = new Date();
                    const utcDay = todayUTC.getUTCDay();
                    
                    let startOfWeek: Date;
                    if (utcDay === 0) {
                      // If Sunday, generate for next week
                      const diff = todayUTC.getUTCDate() - utcDay + 1;
                      startOfWeek = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), diff));
                    } else {
                      // Generate for this week
                      const diff = todayUTC.getUTCDate() - utcDay + 1;
                      startOfWeek = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), diff));
                    }
                    
                    const endOfWeek = new Date(startOfWeek);
                    endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
                    
                    previewWeeklyEmployeeMeetingsMutation.mutate({
                      startDate: startOfWeek.toISOString().split('T')[0],
                      endDate: endOfWeek.toISOString().split('T')[0]
                    });
                  }} 
                  disabled={previewWeeklyEmployeeMeetingsMutation.isPending}
                  className="border-green-600 text-green-600 hover:bg-green-50"
                >
                  {previewWeeklyEmployeeMeetingsMutation.isPending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-green-600 border-t-transparent rounded-full animate-spin mr-2" />
                      Previewing...
                    </>
                  ) : (
                    <>
                      <EyeIcon className="h-4 w-4 mr-2" />
                      Preview This Week's Planning
                    </>
                  )}
                </Button>
                <Button 
                  onClick={() => {
                    const todayUTC = new Date();
                    const utcDay = todayUTC.getUTCDay();
                    
                    let startOfWeek: Date;
                    if (utcDay === 0) {
                      // If Sunday, generate for next week
                      const diff = todayUTC.getUTCDate() - utcDay + 1;
                      startOfWeek = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), diff));
                    } else {
                      // Generate for this week
                      const diff = todayUTC.getUTCDate() - utcDay + 1;
                      startOfWeek = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), diff));
                    }
                    
                    const endOfWeek = new Date(startOfWeek);
                    endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
                    
                    generateWeeklyEmployeeMeetingsMutation.mutate({
                      startDate: startOfWeek.toISOString().split('T')[0],
                      endDate: endOfWeek.toISOString().split('T')[0]
                    });
                  }} 
                  disabled={generateWeeklyEmployeeMeetingsMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {generateWeeklyEmployeeMeetingsMutation.isPending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <PlusIcon className="h-4 w-4 mr-2" />
                      Generate This Week's Planning
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>

          {/* Employee Planning Overview */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Your Planning Schedule</h3>
              <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                <TimerIcon className="h-3 w-3 mr-1" />
                {user?.username}'s Sessions
              </Badge>
            </div>
            
            {employeePlanOverview?.data?.meetings?.length > 0 ? (
              <div className="space-y-3">
                {employeePlanOverview.data.meetings.map((meeting: any) => (
                  <div key={meeting.id} className="flex items-center justify-between p-4 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                        <UserIcon className="h-5 w-5 text-green-600" />
                      </div>
                      <div>
                        <div className="font-medium text-gray-900">{meeting.title}</div>
                        <div className="text-sm text-gray-500">
                          {format(parseISO(meeting.meetingDate), 'MMM dd, yyyy')} • {meeting.startTime} - {meeting.endTime}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-green-100 text-green-700 border-green-200">
                        {meeting.status}
                      </Badge>
                      <Badge variant="outline" className="text-gray-600">
                        30 min
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <UserIcon className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium mb-2">No Planning Sessions Scheduled</p>
                <p className="text-sm">Generate your weekly planning sessions to get started</p>
              </div>
            )}
          </Card>
        </TabsContent>
      </Tabs>

      {/* MD Meetings Preview Modal */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <EyeIcon className="h-5 w-5" />
              {previewType === 'weekly' ? 'Weekly' : 'Monthly'} MD Meetings Preview
            </DialogTitle>
            <DialogDescription>
              Review the meetings that will be generated and confirm creation.
            </DialogDescription>
          </DialogHeader>

          {previewData && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-blue-900">
                      {previewType === 'weekly' 
                        ? `Week of ${previewData.weekOf}` 
                        : `${previewData.monthYear}`
                      }
                    </h4>
                    <p className="text-sm text-blue-700 mt-1">
                      {previewData.totalNewMeetings} new meetings will be created
                      {previewData.totalExisting > 0 && 
                        `, ${previewData.totalExisting} already exist`
                      }
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-white">
                      {previewData.totalNewMeetings} New
                    </Badge>
                    {previewData.totalExisting > 0 && (
                      <Badge variant="secondary">
                        {previewData.totalExisting} Existing
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Meetings List */}
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Meeting Details</h4>
                {previewData.meetings.map((meeting: any, index: number) => (
                  <div 
                    key={index} 
                    className={`p-4 rounded-lg border ${
                      meeting.status === 'Will be created' 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h5 className="font-medium">{meeting.title}</h5>
                          <Badge 
                            variant={meeting.status === 'Will be created' ? 'default' : 'secondary'}
                            className={
                              meeting.status === 'Will be created' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-600'
                            }
                          >
                            {meeting.status}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 mb-2">{meeting.description}</p>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                          <span className="flex items-center gap-1">
                            <CalendarIcon className="h-4 w-4" />
                            {format(parseISO(meeting.meetingDate), 'MMM dd, yyyy')}
                          </span>
                          <span className="flex items-center gap-1">
                            <ClockIcon className="h-4 w-4" />
                            {meeting.startTime} - {meeting.endTime}
                          </span>
                          <span className="flex items-center gap-1">
                            <TimerIcon className="h-4 w-4" />
                            {meeting.duration} min
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className={getPriorityColor(meeting.priority)}>
                          {meeting.priority}
                        </Badge>
                        <Badge variant="outline">
                          {meeting.meetingType}
                        </Badge>
                        {meeting.status === 'Will be created' && (
                          <div className="flex gap-1 ml-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                // Create a detailed view of the meeting
                                alert(`Meeting Details:\n\nTitle: ${meeting.title}\nDescription: ${meeting.description}\nDate: ${format(parseISO(meeting.meetingDate), 'MMM dd, yyyy')}\nTime: ${meeting.startTime} - ${meeting.endTime}\nDuration: ${meeting.duration} min\nPriority: ${meeting.priority}\nType: ${meeting.meetingType}\nParticipants: ${meeting.participantCount || 0} attendees`);
                              }}
                              className="h-7 px-2"
                              title="View Meeting Details"
                            >
                              <EyeIcon className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEditPreviewMeeting(meeting, index)}
                              className="h-7 px-2"
                              title="Edit Meeting"
                            >
                              <EditIcon className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleDeletePreviewMeeting(index)}
                              className="h-7 px-2 text-red-600 hover:text-red-700"
                              title="Delete Meeting"
                            >
                              <TrashIcon className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-sm text-gray-500">
                  {previewData.totalNewMeetings === 0 
                    ? 'No new meetings to create'
                    : `${previewData.totalNewMeetings} meeting(s) will be added to your calendar`
                  }
                </div>
                <div className="flex gap-3">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowPreviewModal(false)}
                  >
                    Cancel
                  </Button>
                  {previewData.totalNewMeetings > 0 && (
                    <Button 
                      onClick={() => {
                        if (previewType === 'weekly') {
                          generateWeeklyMDMeetingsMutation.mutate();
                        } else {
                          generateMonthlyMDMeetingsMutation.mutate();
                        }
                        setShowPreviewModal(false);
                      }}
                      disabled={generateWeeklyMDMeetingsMutation.isPending || generateMonthlyMDMeetingsMutation.isPending}
                    >
                      {generateWeeklyMDMeetingsMutation.isPending || generateMonthlyMDMeetingsMutation.isPending 
                        ? 'Creating...' 
                        : `Create ${previewData.totalNewMeetings} Meeting(s)`
                      }
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Edit Preview Meeting Dialog */}
      <Dialog open={!!editingPreviewMeeting} onOpenChange={() => setEditingPreviewMeeting(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Meeting</DialogTitle>
            <DialogDescription>
              Modify the meeting details before finalizing creation.
            </DialogDescription>
          </DialogHeader>

          {editingPreviewMeeting && (
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Title</label>
                <Input
                  value={editingPreviewMeeting.title}
                  onChange={(e) => setEditingPreviewMeeting({
                    ...editingPreviewMeeting,
                    title: e.target.value
                  })}
                />
              </div>
              
              <div>
                <label className="text-sm font-medium">Description</label>
                <Textarea
                  value={editingPreviewMeeting.description || ''}
                  onChange={(e) => setEditingPreviewMeeting({
                    ...editingPreviewMeeting,
                    description: e.target.value
                  })}
                />
              </div>

              {/* Participants Section */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 border-b pb-2">Participants</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium">Participants / Attendees</label>
                    <Select
                      onValueChange={(value) => {
                        const currentValues = editingPreviewMeeting.attendeeIds || [];
                        if (!currentValues.includes(parseInt(value))) {
                          setEditingPreviewMeeting({
                            ...editingPreviewMeeting,
                            attendeeIds: [...currentValues, parseInt(value)]
                          });
                        }
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select team members to invite" />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(groupedUsers).length > 0 ? (
                          Object.entries(groupedUsers).map(([role, roleUsers]) => (
                            <SelectGroup key={role}>
                              <SelectLabel className="font-semibold text-blue-600 dark:text-blue-400">
                                {role}s
                              </SelectLabel>
                              {roleUsers.map((user) => (
                                <SelectItem key={user.id} value={user.id.toString()}>
                                  {user.firstName && user.lastName 
                                    ? `${user.firstName} ${user.lastName}` 
                                    : user.username}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          ))
                        ) : (
                          <SelectItem value="loading" disabled>Loading users...</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {editingPreviewMeeting.attendeeIds && editingPreviewMeeting.attendeeIds.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {editingPreviewMeeting.attendeeIds.map((attendeeId) => {
                          const user = users?.find(u => u.id === attendeeId);
                          return user ? (
                            <Badge key={attendeeId} variant="outline" className="flex items-center gap-1">
                              <UsersIcon className="h-3 w-3" />
                              {user.firstName && user.lastName 
                                ? `${user.firstName} ${user.lastName}` 
                                : user.username}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingPreviewMeeting({
                                    ...editingPreviewMeeting,
                                    attendeeIds: editingPreviewMeeting.attendeeIds?.filter(id => id !== attendeeId) || []
                                  });
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
                  </div>
                </div>
              </div>

              {/* Meeting Link Section */}
              <div>
                <label className="text-sm font-medium">Meeting Link</label>
                <Input
                  value={editingPreviewMeeting.meetingUrl || editingPreviewMeeting.googleMeetLink || ''}
                  onChange={(e) => setEditingPreviewMeeting({
                    ...editingPreviewMeeting,
                    meetingUrl: e.target.value
                  })}
                  placeholder="Google Meet link or custom meeting URL"
                />
                <div className="text-xs text-gray-500 mt-1">
                  Will be auto-generated when Google Calendar integration is enabled
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium">Start Time</label>
                  <Select
                    value={editingPreviewMeeting.startTime}
                    onValueChange={(value) => setEditingPreviewMeeting({
                      ...editingPreviewMeeting,
                      startTime: value
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allTimeOptions.map((time) => (
                        <SelectItem key={time.value} value={time.value}>
                          {time.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                
                <div>
                  <label className="text-sm font-medium">End Time</label>
                  <Select
                    value={editingPreviewMeeting.endTime}
                    onValueChange={(value) => setEditingPreviewMeeting({
                      ...editingPreviewMeeting,
                      endTime: value
                    })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {allTimeOptions.map((time) => (
                        <SelectItem key={time.value} value={time.value}>
                          {time.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Priority</label>
                <Select
                  value={editingPreviewMeeting.priority}
                  onValueChange={(value) => setEditingPreviewMeeting({
                    ...editingPreviewMeeting,
                    priority: value
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Low">Low</SelectItem>
                    <SelectItem value="Medium">Medium</SelectItem>
                    <SelectItem value="High">High</SelectItem>
                    <SelectItem value="Critical">Critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => setEditingPreviewMeeting(null)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => handleSavePreviewMeetingEdit(editingPreviewMeeting)}
                >
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Employee Planning Preview Modal */}
      <Dialog open={showEmployeePreviewModal} onOpenChange={setShowEmployeePreviewModal}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserIcon className="h-5 w-5" />
              Employee Planning Preview
            </DialogTitle>
            <DialogDescription>
              Review your planning sessions that will be generated and confirm creation.
            </DialogDescription>
          </DialogHeader>

          {previewData && (
            <div className="space-y-6">
              {/* Summary */}
              <div className="bg-green-50 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-medium text-green-900">
                      Week of {previewData.weekOf}
                    </h4>
                    <p className="text-sm text-green-700 mt-1">
                      {previewData.totalNewMeetings} new planning sessions will be created
                      {previewData.totalExisting > 0 && 
                        `, ${previewData.totalExisting} already exist`
                      }
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="bg-white">
                      {previewData.totalNewMeetings} New
                    </Badge>
                    {previewData.totalExisting > 0 && (
                      <Badge variant="secondary">
                        {previewData.totalExisting} Existing
                      </Badge>
                    )}
                  </div>
                </div>
              </div>

              {/* Planning Sessions List */}
              <div className="space-y-3">
                <h4 className="font-medium text-gray-900">Planning Session Details</h4>
                {previewData.meetings.map((meeting: any, index: number) => (
                  <div 
                    key={index} 
                    className={`p-4 rounded-lg border ${
                      meeting.status === 'Scheduled' 
                        ? 'bg-green-50 border-green-200' 
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h5 className="font-medium">{meeting.title}</h5>
                          <Badge 
                            variant={meeting.status === 'Scheduled' ? 'default' : 'secondary'}
                            className={
                              meeting.status === 'Scheduled' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-gray-100 text-gray-600'
                            }
                          >
                            {meeting.status === 'Scheduled' ? 'Will be created' : 'Already exists'}
                          </Badge>
                        </div>
                        <div className="text-sm text-gray-600 space-y-1">
                          <div className="flex items-center gap-2">
                            <CalendarIcon className="h-4 w-4" />
                            <span>{format(parseISO(meeting.meetingDate), 'MMM dd, yyyy')}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <ClockIcon className="h-4 w-4" />
                            <span>{meeting.startTime} - {meeting.endTime}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <UserIcon className="h-4 w-4" />
                            <span>{meeting.organizer?.username || 'Organizer'}</span>
                          </div>
                        </div>
                        {meeting.description && (
                          <p className="text-sm text-gray-500 mt-2">{meeting.description}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="bg-green-100 text-green-700">
                          {meeting.priority}
                        </Badge>
                        <Badge variant="outline" className="text-gray-600">
                          30 min
                        </Badge>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t">
                <Button 
                  variant="outline" 
                  onClick={() => setShowEmployeePreviewModal(false)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={() => {
                    // Calculate same dates for generation
                    const todayUTC = new Date();
                    const utcDay = todayUTC.getUTCDay();
                    
                    let startOfWeek: Date;
                    if (utcDay === 0) {
                      const diff = todayUTC.getUTCDate() - utcDay + 1;
                      startOfWeek = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), diff));
                    } else {
                      const diff = todayUTC.getUTCDate() - utcDay + 1;
                      startOfWeek = new Date(Date.UTC(todayUTC.getUTCFullYear(), todayUTC.getUTCMonth(), diff));
                    }
                    
                    const endOfWeek = new Date(startOfWeek);
                    endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
                    
                    generateWeeklyEmployeeMeetingsMutation.mutate({
                      startDate: startOfWeek.toISOString().split('T')[0],
                      endDate: endOfWeek.toISOString().split('T')[0]
                    });
                    
                    setShowEmployeePreviewModal(false);
                  }}
                  disabled={generateWeeklyEmployeeMeetingsMutation.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {generateWeeklyEmployeeMeetingsMutation.isPending ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <CheckIcon className="h-4 w-4 mr-2" />
                      Generate Planning Sessions
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      </div>
    </Layout>
  );
}