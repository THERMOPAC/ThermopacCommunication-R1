import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  Bot, 
  Video, 
  FileText, 
  Download, 
  Check, 
  Clock, 
  AlertCircle,
  Play,
  Loader2,
  ExternalLink,
  Sparkles,
  Brain,
  Calendar,
  Users,
  Target,
  CheckCircle2,
  ArrowRight,
  Lightbulb
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import { format, parseISO } from 'date-fns';

interface AINotesData {
  summary: string;
  keyPoints: string[];
  actionItems: Array<{
    task: string;
    assignee?: string;
    dueDate?: string;
    priority: 'low' | 'medium' | 'high';
  }>;
  decisions: string[];
  nextSteps: string[];
  sentiment: 'positive' | 'neutral' | 'negative';
  confidence: number;
}

interface EnhancedAIMeetingAssistantProps {
  selectedMeeting?: {
    type: 'internal' | 'google-calendar';
    meeting?: any;
    event?: any;
  };
  onUpdate?: () => void;
}

export default function EnhancedAIMeetingAssistant({ selectedMeeting, onUpdate }: EnhancedAIMeetingAssistantProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Form states
  const [content, setContent] = useState('');
  const [inputType, setInputType] = useState<'transcript' | 'recording' | 'manual_notes' | 'description'>('manual_notes');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResults, setAiResults] = useState<AINotesData | null>(null);

  // Fetch existing AI notes for internal meetings
  const { data: existingNotes, isLoading: notesLoading } = useQuery({
    queryKey: ['/api/meetings', selectedMeeting?.meeting?.id, 'ai-notes'],
    enabled: selectedMeeting?.type === 'internal' && !!selectedMeeting?.meeting?.id
  });

  // Fetch meeting analytics
  const { data: analytics } = useQuery({
    queryKey: ['/api/meetings/analytics'],
    enabled: !!selectedMeeting
  });

  // Enhanced AI analysis mutation for internal meetings
  const enhancedAIAnalysisMutation = useMutation({
    mutationFn: (data: { content: string; inputType: string; context: any }) =>
      apiRequest('POST', `/api/meetings/${selectedMeeting?.meeting?.id}/ai-notes/generate`, data),
    onSuccess: () => {
      toast({
        title: "AI Analysis Complete",
        description: "Enhanced AI notes have been generated successfully."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/meetings', selectedMeeting?.meeting?.id, 'ai-notes'] });
      onUpdate?.();
    },
    onError: (error: any) => {
      toast({
        title: "AI Analysis Failed",
        description: error.message || "Failed to generate AI notes.",
        variant: "destructive"
      });
    }
  });

  // Google Calendar event analysis mutation
  const calendarEventAnalysisMutation = useMutation({
    mutationFn: (data: { eventId: string; title: string; description: string; attendees: string[] }) =>
      apiRequest('POST', '/api/meetings/ai-notes/analyze-calendar-event', data),
    onSuccess: (response) => {
      setAiResults(response.data);
      toast({
        title: "Calendar Event Analyzed",
        description: "AI insights generated from Google Calendar event."
      });
    },
    onError: (error: any) => {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze calendar event.",
        variant: "destructive"
      });
    }
  });

  const handleAnalyzeContent = async () => {
    if (!content.trim()) {
      toast({
        title: "Content Required",
        description: "Please enter meeting content to analyze.",
        variant: "destructive"
      });
      return;
    }

    if (selectedMeeting?.type === 'internal') {
      const context = {
        title: selectedMeeting.meeting?.title || 'Internal Meeting',
        description: selectedMeeting.meeting?.description,
        type: 'internal',
        platform: selectedMeeting.meeting?.googleMeetLink ? 'Google Meet' : 'Internal',
        duration: selectedMeeting.meeting?.duration
      };

      enhancedAIAnalysisMutation.mutate({ content, inputType, context });
    }
  };

  const handleAnalyzeCalendarEvent = () => {
    if (selectedMeeting?.type === 'google-calendar' && selectedMeeting.event) {
      const event = selectedMeeting.event;
      calendarEventAnalysisMutation.mutate({
        eventId: event.id,
        title: event.summary || 'Calendar Event',
        description: event.description || '',
        attendees: event.attendees?.map((a: any) => a.email) || []
      });
    }
  };

  const getSentimentColor = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return 'text-green-600 bg-green-50';
      case 'negative': return 'text-red-600 bg-red-50';
      default: return 'text-blue-600 bg-blue-50';
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-green-100 text-green-800';
    }
  };

  // Display existing AI notes for internal meetings
  const displayAiResults = existingNotes?.data || aiResults;

  if (!selectedMeeting) {
    return (
      <Card className="p-6">
        <div className="text-center py-12">
          <Brain className="h-16 w-16 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-600 mb-2">AI Meeting Assistant</h3>
          <p className="text-gray-500">Select a meeting or calendar event to generate AI-powered insights</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Meeting Context Header */}
      <Card className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
        <div className="flex items-start gap-4">
          <div className="p-2 bg-white rounded-lg">
            {selectedMeeting.type === 'internal' ? <Video className="h-6 w-6 text-blue-600" /> : <Calendar className="h-6 w-6 text-green-600" />}
          </div>
          <div className="flex-1">
            <h3 className="font-semibold text-gray-900 mb-1">
              {selectedMeeting.type === 'internal' ? selectedMeeting.meeting?.title : selectedMeeting.event?.summary}
            </h3>
            <div className="flex items-center gap-4 text-sm text-gray-600">
              <Badge variant={selectedMeeting.type === 'internal' ? 'default' : 'secondary'}>
                {selectedMeeting.type === 'internal' ? 'Internal Meeting' : 'Google Calendar Event'}
              </Badge>
              {selectedMeeting.type === 'internal' && selectedMeeting.meeting?.meetingDate && (
                <span>
                  {format(parseISO(selectedMeeting.meeting.meetingDate), 'MMM d, yyyy')} at {selectedMeeting.meeting.startTime}
                </span>
              )}
              {selectedMeeting.type === 'google-calendar' && selectedMeeting.event?.start && (
                <span>
                  {selectedMeeting.event.start.dateTime 
                    ? format(parseISO(selectedMeeting.event.start.dateTime), 'MMM d, yyyy · h:mm a')
                    : selectedMeeting.event.start.date
                  }
                </span>
              )}
            </div>
          </div>
        </div>
      </Card>

      <Tabs defaultValue="analysis" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="analysis">AI Analysis</TabsTrigger>
          <TabsTrigger value="input">Content Input</TabsTrigger>
          <TabsTrigger value="insights">Insights</TabsTrigger>
        </TabsList>

        {/* AI Analysis Tab */}
        <TabsContent value="analysis" className="space-y-4">
          {selectedMeeting.type === 'google-calendar' && !aiResults && (
            <Card className="p-6">
              <div className="text-center">
                <Sparkles className="h-12 w-12 text-purple-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Analyze Calendar Event</h3>
                <p className="text-gray-600 mb-4">
                  Generate AI insights from this Google Calendar event
                </p>
                <Button 
                  onClick={handleAnalyzeCalendarEvent}
                  disabled={calendarEventAnalysisMutation.isPending}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {calendarEventAnalysisMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Brain className="h-4 w-4 mr-2" />
                      Analyze Event
                    </>
                  )}
                </Button>
              </div>
            </Card>
          )}

          {displayAiResults && (
            <div className="space-y-4">
              {/* Summary Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    AI Summary
                    <Badge className={`ml-auto ${getSentimentColor(displayAiResults.sentiment)}`}>
                      {displayAiResults.sentiment} ({Math.round(displayAiResults.confidence * 100)}% confidence)
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 leading-relaxed">{displayAiResults.summary}</p>
                </CardContent>
              </Card>

              {/* Key Points */}
              {displayAiResults.keyPoints && displayAiResults.keyPoints.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5" />
                      Key Discussion Points
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {displayAiResults.keyPoints.map((point, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <ArrowRight className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-700">{point}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}

              {/* Action Items */}
              {displayAiResults.actionItems && displayAiResults.actionItems.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="h-5 w-5" />
                      Action Items
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {displayAiResults.actionItems.map((item, index) => (
                        <div key={index} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                          <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                          <div className="flex-1">
                            <p className="font-medium text-gray-900">{item.task}</p>
                            <div className="flex items-center gap-2 mt-1">
                              <Badge className={getPriorityColor(item.priority)}>
                                {item.priority}
                              </Badge>
                              {item.assignee && (
                                <Badge variant="outline">
                                  <Users className="h-3 w-3 mr-1" />
                                  {item.assignee}
                                </Badge>
                              )}
                              {item.dueDate && (
                                <Badge variant="outline">
                                  <Clock className="h-3 w-3 mr-1" />
                                  {item.dueDate}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Decisions */}
              {displayAiResults.decisions && displayAiResults.decisions.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Check className="h-5 w-5" />
                      Decisions Made
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2">
                      {displayAiResults.decisions.map((decision, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                          <span className="text-gray-700">{decision}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {notesLoading && (
            <Card className="p-6">
              <div className="text-center">
                <Loader2 className="h-8 w-8 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-gray-600">Loading AI notes...</p>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Content Input Tab */}
        <TabsContent value="input" className="space-y-4">
          {selectedMeeting.type === 'internal' && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bot className="h-5 w-5" />
                  Generate AI Notes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="input-type">Content Type</Label>
                  <Select value={inputType} onValueChange={(value: any) => setInputType(value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="manual_notes">Manual Meeting Notes</SelectItem>
                      <SelectItem value="transcript">Meeting Transcript</SelectItem>
                      <SelectItem value="recording">Recording URL</SelectItem>
                      <SelectItem value="description">Meeting Description</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="content">Meeting Content</Label>
                  <Textarea
                    id="content"
                    placeholder={
                      inputType === 'manual_notes' 
                        ? "Enter your meeting notes here..."
                        : inputType === 'transcript'
                        ? "Paste the meeting transcript..."
                        : inputType === 'recording'
                        ? "Enter the recording URL..."
                        : "Enter meeting description or agenda..."
                    }
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    className="min-h-[200px]"
                  />
                </div>

                <Button 
                  onClick={handleAnalyzeContent}
                  disabled={enhancedAIAnalysisMutation.isPending || !content.trim()}
                  className="w-full"
                >
                  {enhancedAIAnalysisMutation.isPending ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating AI Notes...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate AI Notes
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>
          )}

          {selectedMeeting.type === 'google-calendar' && (
            <Card className="p-6">
              <div className="text-center">
                <Calendar className="h-12 w-12 text-green-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold mb-2">Google Calendar Event</h3>
                <p className="text-gray-600 mb-4">
                  This is an external calendar event. Use the Analysis tab to generate AI insights.
                </p>
                <Button 
                  onClick={() => document.querySelector('[data-state="active"][value="analysis"]')?.click()}
                  variant="outline"
                >
                  Go to Analysis
                </Button>
              </div>
            </Card>
          )}
        </TabsContent>

        {/* Insights Tab */}
        <TabsContent value="insights" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Meeting Analytics
              </CardTitle>
            </CardHeader>
            <CardContent>
              {analytics?.data ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{analytics.data.totalMeetings}</div>
                    <div className="text-sm text-gray-600">Total Meetings</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{analytics.data.meetingsWithAI}</div>
                    <div className="text-sm text-gray-600">With AI Notes</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">{analytics.data.totalActionItems}</div>
                    <div className="text-sm text-gray-600">Action Items</div>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">{Math.round(analytics.data.averageActionItems * 10) / 10}</div>
                    <div className="text-sm text-gray-600">Avg Actions/Meeting</div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-500">Analytics data not available</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}