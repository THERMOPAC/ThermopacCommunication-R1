import OpenAI from 'openai';

export type PriorityLevel = 'P0' | 'P1' | 'P2' | 'P3';

export interface ClassificationResult {
  priority: PriorityLevel;
  priorityScore: number;
  classificationReason: string;
  classificationSignals: {
    hardRules?: string[];
    aiScore?: number;
    confidence?: number;
    factors?: string[];
  };
}

const GOVERNMENT_TAX_DOMAINS = [
  '@incometax.gov.in',
  '@cbic-gst.gov.in',
  '@gst.gov.in',
  '@incometaxindia.gov.in',
  '@incometaxindiaefiling.gov.in'
];

const CRITICAL_KEYWORDS = {
  tax: ['GSTR', 'ITR', 'TDS', 'challan', '143(1)', 'penalty', 'notice', 'assessment', 'demand', 'intimation', 'scrutiny'],
  compliance: ['compliance', 'statutory', 'regulatory', 'audit', 'verification'],
  urgent: ['urgent', 'immediate', 'critical', 'deadline', 'overdue', 'final reminder', 'last notice']
};

const HIGH_PRIORITY_KEYWORDS = {
  business: ['invoice', 'payment', 'po', 'purchase order', 'quotation', 'proposal', 'contract'],
  client: ['client', 'customer', 'complaint', 'escalation', 'feedback'],
  internal: ['approval required', 'action needed', 'review required', 'urgent task']
};

const LOW_PRIORITY_KEYWORDS = [
  'newsletter', 'subscription', 'unsubscribe', 'marketing', 'promotional',
  'advertisement', 'sale', 'discount', 'offer', 'deal', 'social media',
  'notification', 'digest', 'weekly update', 'monthly report'
];

export class EmailClassifier {
  private openai: OpenAI | null = null;

  constructor() {
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
  }

  async classifyEmail(email: {
    from: string;
    subject?: string | null;
    snippet?: string | null;
    body?: string | null;
  }): Promise<ClassificationResult> {
    const hardRuleResult = this.applyHardRules(email);
    if (hardRuleResult) {
      return hardRuleResult;
    }

    if (this.openai) {
      try {
        const aiResult = await this.classifyWithAI(email);
        if (aiResult && aiResult.classificationSignals.confidence && aiResult.classificationSignals.confidence > 0.7) {
          return aiResult;
        }
      } catch (error) {
        console.error('❌ AI classification failed, falling back to keyword-based:', error);
      }
    }

    return this.keywordBasedClassification(email);
  }

  private applyHardRules(email: {
    from: string;
    subject?: string | null;
    snippet?: string | null;
  }): ClassificationResult | null {
    const from = email.from.toLowerCase();
    const subject = (email.subject || '').toLowerCase();
    const snippet = (email.snippet || '').toLowerCase();
    const combinedText = `${subject} ${snippet}`;

    const matchedRules: string[] = [];

    const isGovernmentDomain = GOVERNMENT_TAX_DOMAINS.some(domain => from.includes(domain.toLowerCase()));
    if (isGovernmentDomain) {
      matchedRules.push(`Government/Tax domain: ${from}`);
    }

    const criticalKeywordMatches: string[] = [];
    Object.entries(CRITICAL_KEYWORDS).forEach(([category, keywords]) => {
      keywords.forEach(keyword => {
        if (combinedText.includes(keyword.toLowerCase())) {
          criticalKeywordMatches.push(`${category}: ${keyword}`);
        }
      });
    });

    if (matchedRules.length > 0 || criticalKeywordMatches.length > 0) {
      const allRules = [...matchedRules, ...criticalKeywordMatches];
      return {
        priority: 'P0',
        priorityScore: 100,
        classificationReason: `Critical: ${allRules.join(', ')}`,
        classificationSignals: {
          hardRules: allRules,
          confidence: 1.0
        }
      };
    }

    return null;
  }

  private keywordBasedClassification(email: {
    from: string;
    subject?: string | null;
    snippet?: string | null;
  }): ClassificationResult {
    const from = email.from.toLowerCase();
    const subject = (email.subject || '').toLowerCase();
    const snippet = (email.snippet || '').toLowerCase();
    const combinedText = `${subject} ${snippet}`;

    const factors: string[] = [];

    const lowPriorityMatches = LOW_PRIORITY_KEYWORDS.filter(keyword => 
      combinedText.includes(keyword.toLowerCase())
    );

    if (lowPriorityMatches.length >= 2) {
      return {
        priority: 'P3',
        priorityScore: 25,
        classificationReason: `Low priority: ${lowPriorityMatches.join(', ')}`,
        classificationSignals: {
          factors: lowPriorityMatches,
          confidence: 0.8
        }
      };
    }

    const highPriorityMatches: string[] = [];
    Object.entries(HIGH_PRIORITY_KEYWORDS).forEach(([category, keywords]) => {
      keywords.forEach(keyword => {
        if (combinedText.includes(keyword.toLowerCase())) {
          highPriorityMatches.push(`${category}: ${keyword}`);
        }
      });
    });

    if (highPriorityMatches.length > 0) {
      return {
        priority: 'P1',
        priorityScore: 75,
        classificationReason: `High priority: ${highPriorityMatches.join(', ')}`,
        classificationSignals: {
          factors: highPriorityMatches,
          confidence: 0.7
        }
      };
    }

    return {
      priority: 'P2',
      priorityScore: 50,
      classificationReason: 'Normal priority (default)',
      classificationSignals: {
        factors: ['No specific indicators found'],
        confidence: 0.5
      }
    };
  }

  private async classifyWithAI(email: {
    from: string;
    subject?: string | null;
    snippet?: string | null;
    body?: string | null;
  }): Promise<ClassificationResult | null> {
    if (!this.openai) return null;

    const emailContent = `
From: ${email.from}
Subject: ${email.subject || '(no subject)'}
Preview: ${email.snippet || ''}
${email.body ? `Body: ${email.body.substring(0, 1000)}` : ''}
`.trim();

    const prompt = `You are an intelligent email priority classifier for a business. Analyze the email and classify it into one of these priority levels:

P0 (Critical): Government/tax notices, legal demands, critical compliance, urgent regulatory matters
P1 (High): Client communications, business proposals, payment-related, action required
P2 (Normal): Regular business emails, informational updates
P3 (Low): Newsletters, marketing, promotional content, social media notifications

Email to classify:
${emailContent}

Respond with a JSON object in this exact format:
{
  "priority": "P0" | "P1" | "P2" | "P3",
  "score": 0-100,
  "reason": "brief explanation",
  "confidence": 0.0-1.0,
  "factors": ["factor1", "factor2"]
}`;

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: 'You are an expert email classification assistant. Always respond with valid JSON.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.3,
        max_tokens: 300
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return null;

      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return null;

      const result = JSON.parse(jsonMatch[0]);

      return {
        priority: result.priority as PriorityLevel,
        priorityScore: result.score,
        classificationReason: `AI: ${result.reason}`,
        classificationSignals: {
          aiScore: result.score,
          confidence: result.confidence,
          factors: result.factors
        }
      };
    } catch (error) {
      console.error('❌ AI classification error:', error);
      return null;
    }
  }

  classifyBatch(emails: Array<{
    from: string;
    subject?: string | null;
    snippet?: string | null;
    body?: string | null;
  }>): Promise<ClassificationResult[]> {
    return Promise.all(emails.map(email => this.classifyEmail(email)));
  }
}

export const emailClassifier = new EmailClassifier();
