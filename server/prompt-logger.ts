/**
 * Comprehensive Prompt Logging & Auditing System
 * Logs all LLM interactions for security, compliance, and performance monitoring
 */

import { db } from './db';
import { llmLogs } from '../shared/schema';

export interface LogEntry {
  promptId: number;
  userId: number;
  model: string;
  maskedInput: string;
  llmResponse: string;
  executionStatus: 'success' | 'error' | 'masked_error' | 'test_mode';
  executionTimeMs?: number;
  tokenUsageInput?: number;
  tokenUsageOutput?: number;
  costUsd?: number;
  errorMessage?: string;
  isTestMode?: boolean;
  routingReason?: string;
  originalModelRequest?: string;
  fallbackUsed?: boolean;
  maskingRulesApplied?: string[];
}

export interface LogQueryOptions {
  userId?: number;
  promptId?: number;
  model?: string;
  status?: string;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
}

export class PromptLogger {
  /**
   * Log prompt execution details
   */
  static async logExecution(entry: LogEntry): Promise<number> {
    try {
      const logEntry = {
        prompt_id: entry.promptId,
        user_id: entry.userId,
        model: entry.model,
        masked_input: entry.maskedInput,
        llm_response: entry.llmResponse,
        execution_status: entry.executionStatus,
        execution_time_ms: entry.executionTimeMs || null,
        token_usage_input: entry.tokenUsageInput || null,
        token_usage_output: entry.tokenUsageOutput || null,
        cost_usd: entry.costUsd || null,
        error_message: entry.errorMessage || null,
        is_test_mode: entry.isTestMode || false,
        routing_reason: entry.routingReason || null,
        original_model_request: entry.originalModelRequest || null,
        fallback_used: entry.fallbackUsed || false,
        masking_rules_applied: entry.maskingRulesApplied ? 
          JSON.stringify(entry.maskingRulesApplied) : null,
        execution_timestamp: new Date(),
        created_at: new Date()
      };

      const result = await db.insert(llmLogs).values(logEntry).returning({ id: llmLogs.id });
      
      console.log(`📝 Logged prompt execution - ID: ${result[0].id}, Status: ${entry.executionStatus}`);
      return result[0].id;
    } catch (error) {
      console.error('❌ Failed to log prompt execution:', error);
      // Don't throw - logging failure shouldn't break prompt execution
      return -1;
    }
  }

  /**
   * Retrieve logs with filtering options
   */
  static async getLogs(options: LogQueryOptions = {}): Promise<any[]> {
    try {
      let query = db.select().from(llmLogs);
      
      // Apply filters
      if (options.userId) {
        query = query.where(eq(llmLogs.user_id, options.userId));
      }
      
      if (options.promptId) {
        query = query.where(eq(llmLogs.prompt_id, options.promptId));
      }
      
      if (options.model) {
        query = query.where(eq(llmLogs.model, options.model));
      }
      
      if (options.status) {
        query = query.where(eq(llmLogs.execution_status, options.status));
      }
      
      if (options.dateFrom) {
        query = query.where(gte(llmLogs.execution_timestamp, options.dateFrom));
      }
      
      if (options.dateTo) {
        query = query.where(lte(llmLogs.execution_timestamp, options.dateTo));
      }
      
      // Apply ordering and pagination
      query = query.orderBy(desc(llmLogs.execution_timestamp));
      
      if (options.limit) {
        query = query.limit(options.limit);
      }
      
      if (options.offset) {
        query = query.offset(options.offset);
      }
      
      const logs = await query.execute();
      return logs;
    } catch (error) {
      console.error('❌ Failed to retrieve logs:', error);
      return [];
    }
  }

  /**
   * Get execution statistics for dashboard
   */
  static async getExecutionStats(days: number = 7): Promise<any> {
    try {
      const dateFrom = new Date();
      dateFrom.setDate(dateFrom.getDate() - days);
      
      // Get basic stats
      const totalExecutions = await db.select({ count: count() })
        .from(llmLogs)
        .where(gte(llmLogs.execution_timestamp, dateFrom));
      
      const successfulExecutions = await db.select({ count: count() })
        .from(llmLogs)
        .where(
          and(
            gte(llmLogs.execution_timestamp, dateFrom),
            eq(llmLogs.execution_status, 'success')
          )
        );
      
      // Get model usage stats
      const modelStats = await db.select({
        model: llmLogs.model,
        count: count(),
        avgCost: avg(llmLogs.cost_usd),
        avgExecutionTime: avg(llmLogs.execution_time_ms)
      })
      .from(llmLogs)
      .where(gte(llmLogs.execution_timestamp, dateFrom))
      .groupBy(llmLogs.model);
      
      // Get user activity stats
      const userStats = await db.select({
        userId: llmLogs.user_id,
        count: count(),
        totalCost: sum(llmLogs.cost_usd)
      })
      .from(llmLogs)
      .where(gte(llmLogs.execution_timestamp, dateFrom))
      .groupBy(llmLogs.user_id)
      .orderBy(desc(count()));
      
      // Get error stats
      const errorStats = await db.select({
        status: llmLogs.execution_status,
        count: count()
      })
      .from(llmLogs)
      .where(
        and(
          gte(llmLogs.execution_timestamp, dateFrom),
          ne(llmLogs.execution_status, 'success')
        )
      )
      .groupBy(llmLogs.execution_status);
      
      return {
        period: `${days} days`,
        totalExecutions: totalExecutions[0]?.count || 0,
        successfulExecutions: successfulExecutions[0]?.count || 0,
        successRate: totalExecutions[0]?.count > 0 ? 
          ((successfulExecutions[0]?.count || 0) / totalExecutions[0].count * 100).toFixed(2) + '%' : '0%',
        modelStats,
        userStats,
        errorStats,
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Failed to generate execution stats:', error);
      return {
        error: 'Failed to generate statistics',
        generatedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Get security audit trail
   */
  static async getSecurityAudit(options: LogQueryOptions = {}): Promise<any> {
    try {
      const logs = await PromptLogger.getLogs({
        ...options,
        limit: options.limit || 100
      });
      
      const auditData = logs.map(log => ({
        timestamp: log.execution_timestamp,
        userId: log.user_id,
        promptId: log.prompt_id,
        model: log.model,
        status: log.execution_status,
        maskingApplied: log.masking_rules_applied ? 
          JSON.parse(log.masking_rules_applied).length > 0 : false,
        testMode: log.is_test_mode,
        routingDecision: {
          selectedModel: log.model,
          reason: log.routing_reason,
          fallbackUsed: log.fallback_used,
          originalRequest: log.original_model_request
        },
        executionTime: log.execution_time_ms,
        cost: log.cost_usd,
        hasError: log.execution_status !== 'success',
        errorMessage: log.error_message
      }));
      
      return {
        auditTrail: auditData,
        summary: {
          totalEntries: auditData.length,
          maskedEntries: auditData.filter(a => a.maskingApplied).length,
          testModeEntries: auditData.filter(a => a.testMode).length,
          errorEntries: auditData.filter(a => a.hasError).length,
          uniqueUsers: [...new Set(auditData.map(a => a.userId))].length,
          uniqueModels: [...new Set(auditData.map(a => a.model))].length
        },
        generatedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Failed to generate security audit:', error);
      return {
        error: 'Failed to generate security audit',
        generatedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Clean up old logs (data retention)
   */
  static async cleanupOldLogs(retentionDays: number = 90): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);
      
      const result = await db.delete(llmLogs)
        .where(lt(llmLogs.created_at, cutoffDate))
        .returning({ id: llmLogs.id });
      
      console.log(`🧹 Cleaned up ${result.length} old log entries (older than ${retentionDays} days)`);
      return result.length;
    } catch (error) {
      console.error('❌ Failed to cleanup old logs:', error);
      return 0;
    }
  }

  /**
   * Export logs for compliance reporting
   */
  static async exportLogs(options: LogQueryOptions & { format?: 'json' | 'csv' }): Promise<any> {
    try {
      const logs = await PromptLogger.getLogs(options);
      
      if (options.format === 'csv') {
        // Convert to CSV format for compliance reports
        const headers = [
          'Timestamp', 'User ID', 'Prompt ID', 'Model', 'Status', 
          'Execution Time (ms)', 'Cost (USD)', 'Test Mode', 'Masking Applied'
        ];
        
        const rows = logs.map(log => [
          log.execution_timestamp.toISOString(),
          log.user_id,
          log.prompt_id,
          log.model,
          log.execution_status,
          log.execution_time_ms || '',
          log.cost_usd || '',
          log.is_test_mode ? 'Yes' : 'No',
          log.masking_rules_applied ? 'Yes' : 'No'
        ]);
        
        return {
          format: 'csv',
          headers,
          rows,
          totalRecords: logs.length
        };
      }
      
      return {
        format: 'json',
        logs,
        totalRecords: logs.length,
        exportedAt: new Date().toISOString()
      };
    } catch (error) {
      console.error('❌ Failed to export logs:', error);
      return { error: 'Failed to export logs' };
    }
  }
}

// Import necessary functions from Drizzle
import { eq, and, gte, lte, desc, ne, lt, count, avg, sum } from 'drizzle-orm';

export default PromptLogger;