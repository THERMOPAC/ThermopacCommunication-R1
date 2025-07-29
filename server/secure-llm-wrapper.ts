/**
 * Secure LLM Wrapper - Central orchestrator for secure prompt execution
 * Integrates data masking, model routing, logging, and test mode capabilities
 */

import DataMasker from './data-masker';
import ModelRouter, { RoutingDecision } from './model-router';
import PromptLogger, { LogEntry } from './prompt-logger';
import LLMPromptEngine from './llm-prompt-engine';

export interface SecureExecutionOptions {
  promptId: number;
  userId: number;
  promptName: string;
  category: string;
  frequency: string;
  template: string;
  data: any;
  preferredModel?: string;
  isTestMode?: boolean;
  maskingOverride?: boolean;
  customMaskingRules?: any[];
}

export interface SecureExecutionResult {
  success: boolean;
  result?: string;
  error?: string;
  executionTime: number;
  model: string;
  routingDecision: RoutingDecision;
  maskingApplied: boolean;
  appliedMaskingRules: string[];
  logId: number;
  isTestMode: boolean;
  tokens?: {
    input: number;
    output: number;
  };
  cost?: number;
}

export class SecureLLMWrapper {
  private static testModeResponses = {
    'gpt-4o': 'TEST MODE - GPT-4o simulated response for prompt validation',
    'claude-sonnet-4-20250514': 'TEST MODE - Claude Sonnet 4 simulated response for prompt validation',
    'mistral-medium': 'TEST MODE - Mistral Medium simulated response for prompt validation'
  };

  /**
   * Execute prompt with full security pipeline
   */
  static async executeSecurePrompt(options: SecureExecutionOptions): Promise<SecureExecutionResult> {
    const startTime = Date.now();
    let logId = -1;

    try {
      console.log(`🔐 Starting secure prompt execution - ID: ${options.promptId}, User: ${options.userId}`);

      // Step 1: Route to optimal model
      const routingDecision = ModelRouter.routePrompt(
        options.promptName,
        options.category,
        options.frequency,
        options.preferredModel,
        options.isTestMode
      );

      // Step 2: Apply data masking if needed
      const shouldMask = !options.maskingOverride && 
                        (options.category === 'hr' || 
                         options.category === 'finance' || 
                         options.category === 'administration');
      
      let maskedData = options.data;
      let appliedMaskingRules: string[] = [];
      
      if (shouldMask) {
        const maskingResult = DataMasker.maskData(
          options.data,
          options.category,
          true, // isSensitive
          options.customMaskingRules
        );
        maskedData = maskingResult.maskedData;
        appliedMaskingRules = maskingResult.appliedRules;
        
        console.log(`🔒 Data masking applied - Rules: ${appliedMaskingRules.join(', ')}`);
      }

      // Step 3: Prepare final prompt with masked data
      const finalPrompt = SecureLLMWrapper.injectDataIntoTemplate(
        options.template,
        maskedData
      );

      let executionResult: any;
      let executionTime: number;

      // Step 4: Execute prompt (real or test mode)
      if (options.isTestMode) {
        executionResult = await SecureLLMWrapper.executeTestMode(
          routingDecision.selectedModel,
          finalPrompt,
          options.promptName
        );
        executionTime = Date.now() - startTime;
      } else {
        // Use existing LLM engine with selected model
        const llmEngine = new LLMPromptEngine();
        executionResult = await llmEngine.executePromptWithModel(
          routingDecision.selectedModel,
          finalPrompt,
          options.promptId
        );
        executionTime = Date.now() - startTime;
      }

      // Step 5: Log execution details
      const logEntry: LogEntry = {
        promptId: options.promptId,
        userId: options.userId,
        model: routingDecision.selectedModel,
        maskedInput: finalPrompt.substring(0, 1000), // Truncate for storage
        llmResponse: executionResult.success ? 
          executionResult.result.substring(0, 2000) : 'Error occurred',
        executionStatus: options.isTestMode ? 'test_mode' : 
          (executionResult.success ? 'success' : 'error'),
        executionTimeMs: executionTime,
        tokenUsageInput: executionResult.tokens?.input,
        tokenUsageOutput: executionResult.tokens?.output,
        costUsd: executionResult.cost,
        errorMessage: executionResult.error,
        isTestMode: options.isTestMode,
        routingReason: routingDecision.reason,
        originalModelRequest: routingDecision.originalRequest,
        fallbackUsed: routingDecision.fallbackUsed,
        maskingRulesApplied: appliedMaskingRules
      };

      logId = await PromptLogger.logExecution(logEntry);

      // Step 6: Return comprehensive result
      const result: SecureExecutionResult = {
        success: executionResult.success,
        result: executionResult.result,
        error: executionResult.error,
        executionTime,
        model: routingDecision.selectedModel,
        routingDecision,
        maskingApplied: shouldMask,
        appliedMaskingRules,
        logId,
        isTestMode: options.isTestMode || false,
        tokens: executionResult.tokens,
        cost: executionResult.cost
      };

      console.log(`✅ Secure prompt execution completed - Log ID: ${logId}, Success: ${result.success}`);
      return result;

    } catch (error) {
      console.error('❌ Secure prompt execution failed:', error);
      
      // Log error execution
      if (logId === -1) {
        const errorLogEntry: LogEntry = {
          promptId: options.promptId,
          userId: options.userId,
          model: 'unknown',
          maskedInput: 'Error occurred before execution',
          llmResponse: 'Execution failed',
          executionStatus: 'error',
          executionTimeMs: Date.now() - startTime,
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
          isTestMode: options.isTestMode,
          routingReason: 'Error in routing',
          fallbackUsed: false,
          maskingRulesApplied: []
        };
        logId = await PromptLogger.logExecution(errorLogEntry);
      }

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        executionTime: Date.now() - startTime,
        model: 'error',
        routingDecision: {
          selectedModel: 'error',
          reason: 'Execution failed',
          fallbackUsed: false
        },
        maskingApplied: false,
        appliedMaskingRules: [],
        logId,
        isTestMode: options.isTestMode || false
      };
    }
  }

  /**
   * Execute in test mode without calling real APIs
   */
  private static async executeTestMode(
    model: string,
    prompt: string,
    promptName: string
  ): Promise<any> {
    // Simulate realistic execution time
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

    const baseResponse = SecureLLMWrapper.testModeResponses[model] || 
      SecureLLMWrapper.testModeResponses['gpt-4o'];

    return {
      success: true,
      result: `${baseResponse}\n\nPrompt: ${promptName}\nSimulated analysis based on provided data structure.\n\nNote: This is a test mode execution. No actual API calls were made.`,
      tokens: {
        input: Math.floor(prompt.length / 4), // Rough token estimation
        output: 150
      },
      cost: 0.001 // Minimal test cost for tracking
    };
  }

  /**
   * Inject masked data into prompt template
   */
  private static injectDataIntoTemplate(template: string, data: any): string {
    try {
      let processedTemplate = template;

      // Replace data injection placeholder
      if (processedTemplate.includes('${data}')) {
        const dataString = typeof data === 'string' ? 
          data : JSON.stringify(data, null, 2);
        processedTemplate = processedTemplate.replace('${data}', dataString);
      }

      // Replace other common placeholders
      if (typeof data === 'object' && data !== null) {
        Object.keys(data).forEach(key => {
          const placeholder = `\${${key}}`;
          if (processedTemplate.includes(placeholder)) {
            const value = Array.isArray(data[key]) ? 
              JSON.stringify(data[key], null, 2) : 
              String(data[key]);
            processedTemplate = processedTemplate.replace(
              new RegExp(`\\$\\{${key}\\}`, 'g'), 
              value
            );
          }
        });
      }

      return processedTemplate;
    } catch (error) {
      console.error('Error injecting data into template:', error);
      return template + '\n\nData: ' + JSON.stringify(data, null, 2);
    }
  }

  /**
   * Execute A/B test with security pipeline
   */
  static async executeSecureABTest(
    options: SecureExecutionOptions,
    models: string[] = ['gpt-4o', 'claude-sonnet-4-20250514']
  ): Promise<any> {
    console.log(`🧪 Starting secure A/B test - Prompt: ${options.promptId}, Models: ${models.join(', ')}`);

    const results = await Promise.all(
      models.map(async (model) => {
        const testOptions = { ...options, preferredModel: model };
        const result = await SecureLLMWrapper.executeSecurePrompt(testOptions);
        
        return {
          model,
          success: result.success,
          result: result.result,
          error: result.error,
          execution_time: result.executionTime,
          tokens: result.tokens,
          cost: result.cost,
          routing: result.routingDecision,
          masking: {
            applied: result.maskingApplied,
            rules: result.appliedMaskingRules
          },
          logId: result.logId
        };
      })
    );

    return {
      prompt_id: options.promptId,
      test_results: results,
      timestamp: new Date().toISOString(),
      test_mode: options.isTestMode,
      total_cost: results.reduce((sum, r) => sum + (r.cost || 0), 0),
      total_time: results.reduce((sum, r) => sum + r.execution_time, 0)
    };
  }

  /**
   * Get security and performance analytics
   */
  static async getAnalytics(days: number = 7): Promise<any> {
    const [executionStats, securityAudit] = await Promise.all([
      PromptLogger.getExecutionStats(days),
      PromptLogger.getSecurityAudit({ limit: 50 })
    ]);

    const routingStats = ModelRouter.getRoutingStats();

    return {
      period: `${days} days`,
      execution: executionStats,
      security: securityAudit,
      routing: routingStats,
      generatedAt: new Date().toISOString()
    };
  }
}

export const secureLLMWrapper = SecureLLMWrapper;
export default SecureLLMWrapper;