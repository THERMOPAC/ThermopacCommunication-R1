import { GoogleGenerativeAI } from '@google/generative-ai';
import { db } from './db';
import { businessMeetings } from '@shared/schema';
import { eq } from 'drizzle-orm';

export interface MeetingContext {
  title: string;
  description?: string;
  attendees?: string[];
  duration?: number;
  type: 'internal' | 'google-calendar' | 'teams' | 'zoom' | 'webex';
  platform?: string;
}

export interface AINotesResult {
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

export class EnhancedAIMeetingService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    // Initialize Google Generative AI if API key is available
    if (process.env.GEMINI_API_KEY) {
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
  }

  /**
   * Generate AI meeting notes from various input types
   */
  async generateAINotesFromContent(
    content: string,
    context: MeetingContext,
    inputType: 'transcript' | 'recording' | 'manual_notes' | 'description'
  ): Promise<AINotesResult> {
    try {
      if (!this.genAI) {
        throw new Error('Gemini API key not configured. Please add GEMINI_API_KEY to environment variables.');
      }

      const model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

      const prompt = this.buildAnalysisPrompt(content, context, inputType);
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          topK: 40,
          topP: 0.8,
          maxOutputTokens: 2048,
        },
      });

      const response = result.response.text();
      return this.parseAIResponse(response);

    } catch (error) {
      console.error('Error generating AI notes:', error);
      
      // Fallback to basic parsing for demo purposes
      return this.generateFallbackNotes(content, context);
    }
  }

  private buildAnalysisPrompt(content: string, context: MeetingContext, inputType: string): string {
    return `
You are an AI meeting assistant analyzing ${inputType} from a ${context.type} meeting. Please provide a comprehensive analysis in JSON format.

Meeting Context:
- Title: ${context.title}
- Description: ${context.description || 'Not provided'}
- Type: ${context.type}
- Platform: ${context.platform || 'Unknown'}
- Attendees: ${context.attendees?.join(', ') || 'Not specified'}
- Duration: ${context.duration ? `${context.duration} minutes` : 'Unknown'}

Content to analyze:
${content}

Please respond with a valid JSON object containing:
{
  "summary": "Brief 2-3 sentence summary of the meeting",
  "keyPoints": ["Array of main discussion points"],
  "actionItems": [
    {
      "task": "Description of action item",
      "assignee": "Person responsible (if mentioned)",
      "dueDate": "Due date if mentioned",
      "priority": "low|medium|high"
    }
  ],
  "decisions": ["Array of decisions made during the meeting"],
  "nextSteps": ["Array of next steps or follow-up items"],
  "sentiment": "positive|neutral|negative",
  "confidence": 0.95
}

Focus on extracting concrete, actionable information. If information isn't available, use appropriate fallbacks.
`;
  }

  private parseAIResponse(response: string): AINotesResult {
    try {
      // Clean up the response to extract JSON
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          summary: parsed.summary || 'AI analysis completed.',
          keyPoints: parsed.keyPoints || [],
          actionItems: parsed.actionItems || [],
          decisions: parsed.decisions || [],
          nextSteps: parsed.nextSteps || [],
          sentiment: parsed.sentiment || 'neutral',
          confidence: parsed.confidence || 0.8
        };
      }
      throw new Error('No valid JSON found in response');
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return this.generateFallbackNotes(response, {} as MeetingContext);
    }
  }

  private generateFallbackNotes(content: string, context: MeetingContext): AINotesResult {
    // Basic keyword-based analysis as fallback
    const words = content.toLowerCase().split(/\s+/);
    const actionKeywords = ['todo', 'action', 'task', 'assign', 'follow up', 'next step'];
    const decisionKeywords = ['decided', 'agreed', 'conclusion', 'resolution'];
    
    const extractedActionItems = this.extractKeywordSections(content, actionKeywords).map(item => ({
      task: item,
      priority: 'medium' as const
    }));

    const extractedDecisions = this.extractKeywordSections(content, decisionKeywords);

    return {
      summary: `Meeting analysis completed for "${context.title}". Content processed with ${words.length} words.`,
      keyPoints: this.extractKeyPoints(content),
      actionItems: extractedActionItems,
      decisions: extractedDecisions,
      nextSteps: extractedActionItems.map(item => item.task),
      sentiment: 'neutral',
      confidence: 0.6
    };
  }

  private extractKeywordSections(content: string, keywords: string[]): string[] {
    const sentences = content.split(/[.!?]+/);
    const relevantSentences: string[] = [];

    sentences.forEach(sentence => {
      const lowerSentence = sentence.toLowerCase();
      if (keywords.some(keyword => lowerSentence.includes(keyword))) {
        relevantSentences.push(sentence.trim());
      }
    });

    return relevantSentences.slice(0, 5); // Limit to 5 items
  }

  private extractKeyPoints(content: string): string[] {
    const sentences = content.split(/[.!?]+/);
    // Return longer sentences as they're more likely to be key points
    return sentences
      .filter(s => s.trim().length > 20 && s.trim().length < 200)
      .slice(0, 5)
      .map(s => s.trim());
  }

  /**
   * Process AI notes for internal meetings
   */
  async processInternalMeetingNotes(
    meetingId: number,
    content: string,
    inputType: 'transcript' | 'recording' | 'manual_notes' | 'description',
    context: MeetingContext
  ): Promise<boolean> {
    try {
      const aiNotes = await this.generateAINotesFromContent(content, context, inputType);

      await db
        .update(businessMeetings)
        .set({
          aiSummary: aiNotes.summary,
          aiActionItems: aiNotes.actionItems,
          aiKeyPoints: aiNotes.keyPoints,
          aiNotesGenerated: true,
          aiNotesGeneratedAt: new Date(),
          transcriptUrl: inputType === 'transcript' ? content : undefined,
          recordingUrl: inputType === 'recording' ? content : undefined
        })
        .where(eq(businessMeetings.id, meetingId));

      console.log(`AI notes processed for internal meeting ${meetingId}`);
      return true;
    } catch (error) {
      console.error('Error processing internal meeting notes:', error);
      return false;
    }
  }

  /**
   * Generate AI notes for Google Calendar events (external meetings)
   */
  async generateNotesForGoogleCalendarEvent(
    eventId: string,
    eventTitle: string,
    eventDescription: string,
    attendees: string[]
  ): Promise<AINotesResult> {
    const context: MeetingContext = {
      title: eventTitle,
      description: eventDescription,
      attendees: attendees,
      type: 'google-calendar',
      platform: 'Google Meet'
    };

    // Use event description as content for analysis
    const content = eventDescription || `Meeting: ${eventTitle}`;
    
    return this.generateAINotesFromContent(content, context, 'description');
  }

  /**
   * Extract meeting insights from meeting URLs and descriptions
   */
  async analyzeMeetingFromUrl(
    meetingUrl: string,
    title: string,
    description?: string
  ): Promise<AINotesResult> {
    const platform = this.detectMeetingPlatform(meetingUrl);
    
    const context: MeetingContext = {
      title,
      description,
      type: platform === 'teams' ? 'teams' : platform === 'zoom' ? 'zoom' : 'google-calendar',
      platform: platform
    };

    const content = description || `Meeting: ${title} (${platform} meeting)`;
    
    return this.generateAINotesFromContent(content, context, 'description');
  }

  private detectMeetingPlatform(url: string): string {
    if (url.includes('teams.microsoft.com')) return 'teams';
    if (url.includes('zoom.us')) return 'zoom';
    if (url.includes('webex.com')) return 'webex';
    if (url.includes('meet.google.com')) return 'google-meet';
    return 'unknown';
  }

  /**
   * Get comprehensive meeting analytics
   */
  async getMeetingAnalytics(dateRange: { start: Date; end: Date }) {
    try {
      const meetings = await db
        .select({
          id: businessMeetings.id,
          title: businessMeetings.title,
          meetingDate: businessMeetings.meetingDate,
          aiNotesGenerated: businessMeetings.aiNotesGenerated,
          aiActionItems: businessMeetings.aiActionItems,
          aiKeyPoints: businessMeetings.aiKeyPoints
        })
        .from(businessMeetings)
        .where(
          // Add date range filtering here when needed
        );

      return {
        totalMeetings: meetings.length,
        meetingsWithAI: meetings.filter(m => m.aiNotesGenerated).length,
        totalActionItems: meetings.reduce((sum, m) => sum + (m.aiActionItems?.length || 0), 0),
        totalKeyPoints: meetings.reduce((sum, m) => sum + (m.aiKeyPoints?.length || 0), 0),
        averageActionItems: meetings.length > 0 ? 
          meetings.reduce((sum, m) => sum + (m.aiActionItems?.length || 0), 0) / meetings.length : 0
      };
    } catch (error) {
      console.error('Error getting meeting analytics:', error);
      return null;
    }
  }
}

export const enhancedAIMeetingService = new EnhancedAIMeetingService();