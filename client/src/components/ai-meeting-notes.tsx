import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
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
  ExternalLink
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface AIMeetingNotesProps {
  meetingId: number;
  meetingData: any;
  onUpdate?: () => void;
}

export default function AIMeetingNotes({ meetingId, meetingData, onUpdate }: AIMeetingNotesProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [transcriptUrl, setTranscriptUrl] = useState('');
  const [recordingUrl, setRecordingUrl] = useState('');

  // Fetch AI meeting notes
  const { data: aiNotes, isLoading: notesLoading } = useQuery({
    queryKey: ['/api/meetings', meetingId, 'ai-notes'],
    enabled: !!meetingId
  });

  // Enable recording mutation
  const enableRecordingMutation = useMutation({
    mutationFn: () => apiRequest('POST', `/api/meetings/${meetingId}/recording/enable`),
    onSuccess: () => {
      toast({
        title: "Recording Enabled",
        description: "Google Meet will automatically record when the meeting starts."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/meetings', meetingId] });
      onUpdate?.();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Enable Recording",
        description: error.message || "An error occurred while enabling recording.",
        variant: "destructive"
      });
    }
  });

  // Process AI notes mutation
  const processAINotesMutation = useMutation({
    mutationFn: (data: { transcriptUrl: string; recordingUrl?: string }) =>
      apiRequest('POST', `/api/meetings/${meetingId}/ai-notes/process`, data),
    onSuccess: () => {
      toast({
        title: "AI Processing Started",
        description: "AI meeting notes are being processed. This may take a few minutes."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/meetings', meetingId, 'ai-notes'] });
      setTranscriptUrl('');
      setRecordingUrl('');
      onUpdate?.();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Process AI Notes",
        description: error.message || "An error occurred while processing AI notes.",
        variant: "destructive"
      });
    }
  });

  // Update AI content mutation
  const updateAIContentMutation = useMutation({
    mutationFn: (data: { aiSummary: string; aiActionItems: any[]; aiKeyPoints: any[] }) =>
      apiRequest('PUT', `/api/meetings/${meetingId}/ai-notes/update`, data),
    onSuccess: () => {
      toast({
        title: "AI Notes Updated",
        description: "AI-generated meeting content has been updated successfully."
      });
      queryClient.invalidateQueries({ queryKey: ['/api/meetings', meetingId, 'ai-notes'] });
      onUpdate?.();
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Update AI Notes",
        description: error.message || "An error occurred while updating AI notes.",
        variant: "destructive"
      });
    }
  });

  const handleEnableRecording = () => {
    enableRecordingMutation.mutate();
  };

  const handleProcessAINotes = () => {
    if (!transcriptUrl) {
      toast({
        title: "Transcript URL Required",
        description: "Please provide the Google Meet transcript URL.",
        variant: "destructive"
      });
      return;
    }
    processAINotesMutation.mutate({ transcriptUrl, recordingUrl });
  };

  const getRecordingStatus = () => {
    if (meetingData.recordingEnabled) {
      return { status: 'enabled', label: 'Recording Enabled', icon: Video, color: 'bg-green-500' };
    }
    return { status: 'disabled', label: 'Recording Disabled', icon: Video, color: 'bg-gray-400' };
  };

  const getAINotesStatus = () => {
    if (!aiNotes?.data) {
      return { status: 'not-started', label: 'Not Started', icon: Clock, color: 'bg-gray-400' };
    }
    if (aiNotes.data.aiNotesGenerated) {
      return { status: 'completed', label: 'AI Notes Available', icon: Check, color: 'bg-green-500' };
    }
    return { status: 'processing', label: 'Processing...', icon: Loader2, color: 'bg-blue-500' };
  };

  const recordingStatus = getRecordingStatus();
  const aiStatus = getAINotesStatus();

  return (
    <div className="space-y-6">
      {/* Google Meet Integration Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Video className="h-5 w-5" />
            Google Meet Integration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Google Meet Link */}
          {meetingData.googleMeetLink && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg">
              <ExternalLink className="h-4 w-4 text-blue-600" />
              <div className="flex-1">
                <Label className="text-sm font-medium">Google Meet Link</Label>
                <div className="text-sm text-gray-600 break-all">
                  {meetingData.googleMeetLink}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => window.open(meetingData.googleMeetLink, '_blank')}
              >
                Open
              </Button>
            </div>
          )}

          {/* Recording Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${recordingStatus.color}`} />
              <div>
                <Label className="text-sm font-medium">Meeting Recording</Label>
                <div className="text-sm text-gray-600">{recordingStatus.label}</div>
              </div>
            </div>
            {!meetingData.recordingEnabled && (
              <Button
                size="sm"
                onClick={handleEnableRecording}
                disabled={enableRecordingMutation.isPending}
              >
                {enableRecordingMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                Enable Recording
              </Button>
            )}
          </div>

          {/* AI Notes Status */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${aiStatus.color}`} />
              <div>
                <Label className="text-sm font-medium">AI Meeting Notes</Label>
                <div className="text-sm text-gray-600 flex items-center gap-1">
                  {aiStatus.status === 'processing' && <Loader2 className="h-3 w-3 animate-spin" />}
                  {aiStatus.label}
                </div>
              </div>
            </div>
            <Badge variant={aiStatus.status === 'completed' ? 'default' : 'secondary'}>
              <Bot className="h-3 w-3 mr-1" />
              AI Powered
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Process AI Notes Section */}
      {!aiNotes?.data?.aiNotesGenerated && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Process AI Meeting Notes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="transcript-url">Google Meet Transcript URL *</Label>
              <Input
                id="transcript-url"
                placeholder="https://docs.google.com/document/d/..."
                value={transcriptUrl}
                onChange={(e) => setTranscriptUrl(e.target.value)}
              />
              <div className="text-xs text-gray-500">
                The transcript is automatically generated by Google Meet and saved to Google Drive.
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="recording-url">Recording URL (Optional)</Label>
              <Input
                id="recording-url"
                placeholder="https://drive.google.com/file/d/..."
                value={recordingUrl}
                onChange={(e) => setRecordingUrl(e.target.value)}
              />
            </div>

            <Button 
              onClick={handleProcessAINotes}
              disabled={processAINotesMutation.isPending || !transcriptUrl}
              className="w-full"
            >
              {processAINotesMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : (
                <Bot className="h-4 w-4 mr-2" />
              )}
              Process AI Meeting Notes
            </Button>

            <div className="text-xs text-amber-600 bg-amber-50 p-3 rounded-lg flex items-start gap-2">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <div>
                <strong>How it works:</strong> AI processing uses Google Workspace's built-in AI capabilities 
                to analyze the meeting transcript and automatically generate summaries, action items, and key points.
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* AI Generated Content Display */}
      {aiNotes?.data?.aiNotesGenerated && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              AI-Generated Meeting Notes
              <Badge variant="default" className="ml-2">
                <Check className="h-3 w-3 mr-1" />
                Ready
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* AI Summary */}
            {aiNotes.data.aiSummary && (
              <div>
                <Label className="text-sm font-semibold text-gray-700">AI Summary</Label>
                <div className="mt-2 p-4 bg-blue-50 rounded-lg">
                  <p className="text-sm leading-relaxed">{aiNotes.data.aiSummary}</p>
                </div>
              </div>
            )}

            <Separator />

            {/* Action Items */}
            {aiNotes.data.aiActionItems && aiNotes.data.aiActionItems.length > 0 && (
              <div>
                <Label className="text-sm font-semibold text-gray-700">Action Items</Label>
                <div className="mt-2 space-y-2">
                  {aiNotes.data.aiActionItems.map((item: any, index: number) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-orange-50 rounded-lg">
                      <div className="w-6 h-6 bg-orange-200 rounded-full flex items-center justify-center text-xs font-medium">
                        {index + 1}
                      </div>
                      <div className="flex-1 text-sm">
                        {typeof item === 'string' ? item : item.description || item.title}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <Separator />

            {/* Key Points */}
            {aiNotes.data.aiKeyPoints && aiNotes.data.aiKeyPoints.length > 0 && (
              <div>
                <Label className="text-sm font-semibold text-gray-700">Key Points</Label>
                <div className="mt-2 space-y-2">
                  {aiNotes.data.aiKeyPoints.map((point: any, index: number) => (
                    <div key={index} className="flex items-start gap-3 p-3 bg-green-50 rounded-lg">
                      <div className="w-2 h-2 bg-green-500 rounded-full mt-2 flex-shrink-0" />
                      <div className="flex-1 text-sm">
                        {typeof point === 'string' ? point : point.description || point.title}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Links to Resources */}
            <div className="flex gap-4 pt-4">
              {aiNotes.data.transcriptUrl && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => window.open(aiNotes.data.transcriptUrl, '_blank')}
                >
                  <FileText className="h-4 w-4 mr-2" />
                  View Transcript
                </Button>
              )}
              {aiNotes.data.recordingUrl && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => window.open(aiNotes.data.recordingUrl, '_blank')}
                >
                  <Video className="h-4 w-4 mr-2" />
                  View Recording
                </Button>
              )}
            </div>

            <div className="text-xs text-gray-500 border-t pt-3">
              AI notes generated on: {new Date(aiNotes.data.aiNotesGeneratedAt).toLocaleString()}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}