/**
 * Intelligent Model Router for LLM Prompt Engine
 * Routes prompts to optimal AI models based on content type, urgency, and performance
 */

export interface ModelConfig {
  name: string;
  apiName: string;
  maxTokens: number;
  costPerToken: number;
  strengths: string[];
  weaknesses: string[];
  isAvailable: boolean;
}

export interface RoutingDecision {
  selectedModel: string;
  reason: string;
  fallbackUsed: boolean;
  originalRequest?: string;
}

export class ModelRouter {
  private static models: Record<string, ModelConfig> = {
    'gpt-4o': {
      name: 'GPT-4o',
      apiName: 'gpt-4o',
      maxTokens: 4096,
      costPerToken: 0.00003,
      strengths: ['speed', 'real-time', 'urgent', 'structured-data', 'analysis'],
      weaknesses: ['long-form', 'creative'],
      isAvailable: true
    },
    'claude-sonnet-4-20250514': {
      name: 'Claude Sonnet 4',
      apiName: 'claude-sonnet-4-20250514',
      maxTokens: 8192,
      costPerToken: 0.00004,
      strengths: ['summaries', 'long-form', 'analysis', 'meetings', 'reports'],
      weaknesses: ['real-time', 'structured-data'],
      isAvailable: true
    },
    'mistral-medium': {
      name: 'Mistral Medium',
      apiName: 'mistral-medium',
      maxTokens: 4096,
      costPerToken: 0.00002,
      strengths: ['internal', 'cost-effective', 'process-reports'],
      weaknesses: ['complex-analysis', 'urgent'],
      isAvailable: false // Not implemented yet
    }
  };

  private static routingRules = {
    // Time-sensitive patterns
    urgent: ['gpt-4o'],
    realtime: ['gpt-4o'],
    daily: ['gpt-4o'],
    hourly: ['gpt-4o'],
    
    // Content-type patterns
    summary: ['claude-sonnet-4-20250514', 'gpt-4o'],
    analysis: ['claude-sonnet-4-20250514', 'gpt-4o'],
    report: ['claude-sonnet-4-20250514', 'gpt-4o'],
    meeting: ['claude-sonnet-4-20250514'],
    
    // Module-specific routing
    finance: ['gpt-4o'], // Structured financial data
    quality: ['gpt-4o'], // Technical precision
    administration: ['mistral-medium', 'gpt-4o'], // Internal processes
    hr: ['claude-sonnet-4-20250514'], // Long-form summaries
    
    // Default fallback
    default: ['gpt-4o', 'claude-sonnet-4-20250514']
  };

  /**
   * Route prompt to optimal model based on multiple factors
   */
  static routePrompt(
    promptName: string,
    category: string,
    frequency: string,
    preferredModel?: string,
    isTestMode: boolean = false
  ): RoutingDecision {
    
    // Test mode always uses GPT-4o for consistency
    if (isTestMode) {
      return {
        selectedModel: 'gpt-4o',
        reason: 'Test mode - using default model',
        fallbackUsed: false
      };
    }

    // Check if preferred model is available
    if (preferredModel && ModelRouter.models[preferredModel]?.isAvailable) {
      return {
        selectedModel: preferredModel,
        reason: 'User specified preferred model',
        fallbackUsed: false,
        originalRequest: preferredModel
      };
    }

    // Apply intelligent routing rules
    const routingDecision = ModelRouter.applyRoutingRules(
      promptName, 
      category, 
      frequency, 
      preferredModel
    );

    // Log routing decision for transparency
    console.log(`🎯 Model Routing Decision:`, {
      prompt: promptName,
      category,
      frequency,
      preferred: preferredModel,
      selected: routingDecision.selectedModel,
      reason: routingDecision.reason
    });

    return routingDecision;
  }

  /**
   * Apply routing rules based on prompt characteristics
   */
  private static applyRoutingRules(
    promptName: string,
    category: string,
    frequency: string,
    preferredModel?: string
  ): RoutingDecision {
    const lowerName = promptName.toLowerCase();
    const lowerCategory = category.toLowerCase();
    
    // Check frequency-based routing (highest priority)
    if (frequency === 'daily' || frequency === 'hourly') {
      const model = ModelRouter.selectAvailableModel(['gpt-4o']);
      if (model) {
        return {
          selectedModel: model,
          reason: `Time-sensitive frequency: ${frequency}`,
          fallbackUsed: preferredModel !== model,
          originalRequest: preferredModel
        };
      }
    }

    // Check content type patterns
    for (const [pattern, models] of Object.entries(ModelRouter.routingRules)) {
      if (pattern === 'default') continue;
      
      if (lowerName.includes(pattern) || lowerCategory.includes(pattern)) {
        const model = ModelRouter.selectAvailableModel(models);
        if (model) {
          return {
            selectedModel: model,
            reason: `Content pattern match: ${pattern}`,
            fallbackUsed: preferredModel !== model,
            originalRequest: preferredModel
          };
        }
      }
    }

    // Module-specific routing
    if (ModelRouter.routingRules[lowerCategory]) {
      const model = ModelRouter.selectAvailableModel(ModelRouter.routingRules[lowerCategory]);
      if (model) {
        return {
          selectedModel: model,
          reason: `Module-specific routing: ${category}`,
          fallbackUsed: preferredModel !== model,
          originalRequest: preferredModel
        };
      }
    }

    // Default fallback
    const defaultModel = ModelRouter.selectAvailableModel(ModelRouter.routingRules.default);
    return {
      selectedModel: defaultModel || 'gpt-4o',
      reason: 'Default fallback routing',
      fallbackUsed: true,
      originalRequest: preferredModel
    };
  }

  /**
   * Select first available model from preference list
   */
  private static selectAvailableModel(preferredModels: string[]): string | null {
    for (const modelName of preferredModels) {
      if (ModelRouter.models[modelName]?.isAvailable) {
        return modelName;
      }
    }
    return null;
  }

  /**
   * Get model configuration
   */
  static getModelConfig(modelName: string): ModelConfig | null {
    return ModelRouter.models[modelName] || null;
  }

  /**
   * Update model availability status
   */
  static updateModelAvailability(modelName: string, isAvailable: boolean): void {
    if (ModelRouter.models[modelName]) {
      ModelRouter.models[modelName].isAvailable = isAvailable;
      console.log(`📊 Model ${modelName} availability updated: ${isAvailable}`);
    }
  }

  /**
   * Get routing statistics for dashboard
   */
  static getRoutingStats(): Record<string, any> {
    return {
      availableModels: Object.entries(ModelRouter.models)
        .filter(([_, config]) => config.isAvailable)
        .map(([name, config]) => ({ name, ...config })),
      routingRules: ModelRouter.routingRules,
      totalModels: Object.keys(ModelRouter.models).length,
      activeModels: Object.values(ModelRouter.models).filter(m => m.isAvailable).length
    };
  }

  /**
   * Test routing logic with sample prompts
   */
  static testRouting(): void {
    console.log('🧪 Testing Model Routing Logic:');
    
    const testCases = [
      { name: 'Daily Sales Summary', category: 'finance', frequency: 'daily' },
      { name: 'Meeting Efficiency Analysis', category: 'meetings', frequency: 'weekly' },
      { name: 'Internal Process Report', category: 'administration', frequency: 'monthly' },
      { name: 'Quality Trend Analysis', category: 'quality', frequency: 'weekly' }
    ];

    testCases.forEach(test => {
      const result = ModelRouter.routePrompt(test.name, test.category, test.frequency);
      console.log(`  ${test.name} → ${result.selectedModel} (${result.reason})`);
    });
  }
}

export default ModelRouter;