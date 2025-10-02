import OpenAI from "openai";

// the newest OpenAI model is "gpt-5" which was released August 7, 2025. do not change this unless explicitly requested by the user
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

interface EmailAnalysis {
  summary: string;
  keyPoints: string[];
  urgency: 'Low' | 'Normal' | 'High' | 'Urgent';
  category: 'Finance' | 'Engineering' | 'Sales' | 'HR' | 'Legal' | 'Meeting' | 'Project' | 'General';
  actionItems: string[];
  sentiment: 'Positive' | 'Neutral' | 'Negative';
}

interface EmailReply {
  professional: string;
  brief: string;
  detailed: string;
}

/**
 * Analyze email content using OpenAI GPT-5
 */
export async function analyzeEmail(
  subject: string, 
  body: string, 
  from: string
): Promise<EmailAnalysis> {
  try {
    const prompt = `Analyze the following email and provide a structured analysis in JSON format:

FROM: ${from}
SUBJECT: ${subject}
BODY: ${body}

Please analyze this email and respond with JSON in this exact format:
{
  "summary": "A concise 2-3 sentence summary of the email's main message",
  "keyPoints": ["List of 3-5 key points or important information from the email"],
  "urgency": "Low|Normal|High|Urgent based on content and tone",
  "category": "Finance|Engineering|Sales|HR|Legal|Meeting|Project|General based on the content",
  "actionItems": ["List of any specific actions requested or implied"],
  "sentiment": "Positive|Neutral|Negative based on the tone"
}

Focus on:
- Extracting the core message and intent
- Identifying any deadlines, requests, or required actions
- Categorizing based on business context
- Assessing urgency based on language, deadlines, and importance indicators`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an expert email analysis assistant for a business environment. Provide accurate, actionable analysis of email content."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    // Validate and sanitize the response
    return {
      summary: result.summary || 'Unable to generate summary',
      keyPoints: Array.isArray(result.keyPoints) ? result.keyPoints : [],
      urgency: ['Low', 'Normal', 'High', 'Urgent'].includes(result.urgency) ? result.urgency : 'Normal',
      category: ['Finance', 'Engineering', 'Sales', 'HR', 'Legal', 'Meeting', 'Project', 'General'].includes(result.category) ? result.category : 'General',
      actionItems: Array.isArray(result.actionItems) ? result.actionItems : [],
      sentiment: ['Positive', 'Neutral', 'Negative'].includes(result.sentiment) ? result.sentiment : 'Neutral'
    };
  } catch (error) {
    console.error('Error analyzing email with OpenAI:', error);
    throw new Error('Failed to analyze email content');
  }
}

/**
 * Generate smart reply options for an email
 */
export async function generateEmailReplies(
  originalSubject: string,
  originalBody: string,
  originalFrom: string,
  userInfo?: {
    name: string;
    title?: string;
    company: string;
    email: string;
    phone?: string;
  },
  context?: string
): Promise<EmailReply> {
  try {
    const prompt = `Generate three different email reply options for the following email:

FROM: ${originalFrom}
SUBJECT: ${originalSubject}
ORIGINAL EMAIL: ${originalBody}
${context ? `ADDITIONAL CONTEXT: ${context}` : ''}

Please generate three different reply options in JSON format:
{
  "professional": "A formal, professional response (2-3 paragraphs)",
  "brief": "A concise, direct response (1-2 sentences)", 
  "detailed": "A comprehensive response addressing all points (3-4 paragraphs)"
}

Guidelines:
- Maintain a professional business tone
- Address the sender appropriately
- Respond to key points raised in the original email
- Include appropriate greetings and closings with signature
- Professional: Formal language, complete structure with signature
- Brief: Direct and to-the-point while remaining courteous
- Detailed: Thorough coverage of all topics with explanations and signature
- End each reply with a professional signature block including: Best regards, [Name], [Title], [Company], [Contact Information]`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system", 
          content: "You are a professional business communication assistant. Generate appropriate email replies that match the requested tone and style."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');

    // Helper function to replace signature placeholders
    const replaceSignature = (text: string): string => {
      if (!userInfo) return text;
      
      let updatedText = text
        .replace(/\[Your Name\]/gi, userInfo.name)
        .replace(/\[Name\]/gi, userInfo.name)
        .replace(/\[Your Title\]/gi, userInfo.title || '')
        .replace(/\[Title\]/gi, userInfo.title || '')
        .replace(/\[Your Company\]/gi, userInfo.company)
        .replace(/\[Company\]/gi, userInfo.company)
        .replace(/\[Your Contact Information\]/gi, `${userInfo.email}${userInfo.phone ? ' | ' + userInfo.phone : ''}`)
        .replace(/\[Contact Information\]/gi, `${userInfo.email}${userInfo.phone ? ' | ' + userInfo.phone : ''}`);
      
      return updatedText;
    };

    return {
      professional: replaceSignature(result.professional || 'Thank you for your email. I will review this and get back to you shortly.'),
      brief: replaceSignature(result.brief || 'Thank you. I will follow up soon.'),
      detailed: replaceSignature(result.detailed || 'Thank you for your email. I appreciate you taking the time to reach out. I will review the information you have provided and get back to you with a comprehensive response shortly.')
    };
  } catch (error) {
    console.error('Error generating email replies with OpenAI:', error);
    throw new Error('Failed to generate email replies');
  }
}

/**
 * Classify multiple emails for batch processing
 */
export async function batchClassifyEmails(emails: Array<{
  id: number;
  subject: string;
  body: string;
  from: string;
}>): Promise<Array<{
  id: number;
  classification: {
    urgency: string;
    category: string;
    sentiment: string;
  }
}>> {
  try {
    const emailsText = emails.map(email => 
      `ID: ${email.id}\nFROM: ${email.from}\nSUBJECT: ${email.subject}\nBODY: ${email.body.substring(0, 500)}\n---`
    ).join('\n');

    const prompt = `Classify the following emails. For each email, provide urgency (Low/Normal/High/Urgent), category (Finance/Engineering/Sales/HR/Legal/Meeting/Project/General), and sentiment (Positive/Neutral/Negative).

${emailsText}

Respond in JSON format:
{
  "classifications": [
    {
      "id": 1,
      "urgency": "Normal",
      "category": "General", 
      "sentiment": "Neutral"
    }
  ]
}`;

    const response = await openai.chat.completions.create({
      model: "gpt-5",
      messages: [
        {
          role: "system",
          content: "You are an email classification assistant. Classify emails accurately based on content."
        },
        {
          role: "user", 
          content: prompt
        }
      ],
      response_format: { type: "json_object" },
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');
    
    return result.classifications || [];
  } catch (error) {
    console.error('Error batch classifying emails:', error);
    throw new Error('Failed to classify emails');
  }
}