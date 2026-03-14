import { db } from '../../db';
import { sql } from 'drizzle-orm';
import type {
  ProjectHealthView,
  OverdueWorkOrder,
  OverdueTask,
  UnansweredEmail,
  FinanceKPI,
} from '../framework/types';

class AgentDataRepository {
  async getProjectHealth(companyScope: string = 'ALL'): Promise<ProjectHealthView[]> {
    const query = companyScope === 'ALL'
      ? sql`SELECT * FROM vw_agent_project_health`
      : sql`SELECT * FROM vw_agent_project_health WHERE company_name = ${companyScope}`;
    const rows = await db.execute(query);
    return (rows.rows || []).map((r: any) => ({
      id: r.id,
      projectNumber: r.project_number || '',
      projectName: r.project_name || '',
      status: r.status || '',
      companyName: r.company_name || '',
      startDate: r.start_date,
      targetEndDate: r.target_end_date,
      progress: Number(r.progress || 0),
      totalWorkOrders: Number(r.total_work_orders || 0),
      completedWorkOrders: Number(r.completed_work_orders || 0),
      overdueWorkOrders: Number(r.overdue_work_orders || 0),
      woCompletionPct: Number(r.wo_completion_pct || 0),
    }));
  }

  async getOverdueWorkOrders(companyScope: string = 'ALL', thresholdDays: number = 0): Promise<OverdueWorkOrder[]> {
    const rows = await db.execute(
      sql`SELECT * FROM vw_agent_overdue_work_orders WHERE days_overdue >= ${thresholdDays} ORDER BY days_overdue DESC`
    );
    return (rows.rows || []).map((r: any) => ({
      id: r.id,
      workOrderNumber: r.work_order_number || '',
      title: r.title || '',
      status: r.status || '',
      priority: r.priority || '',
      plannedEndDate: r.planned_end_date,
      projectId: r.project_id,
      projectName: r.project_name || '',
      projectNumber: r.project_number || '',
      daysOverdue: Number(r.days_overdue || 0),
    }));
  }

  async getOverdueTasks(companyScope: string = 'ALL', thresholdDays: number = 0): Promise<OverdueTask[]> {
    const rows = await db.execute(
      sql`SELECT * FROM vw_agent_overdue_tasks WHERE days_overdue >= ${thresholdDays} ORDER BY days_overdue DESC`
    );
    return (rows.rows || []).map((r: any) => ({
      id: r.id,
      title: r.title || '',
      dueDate: r.due_date || '',
      status: r.status || '',
      assignedTo: r.assigned_to,
      priority: r.priority || 'medium',
      category: r.category || '',
      assigneeName: r.assignee_name || 'Unassigned',
      daysOverdue: Number(r.days_overdue || 0),
    }));
  }

  async getUnansweredEmails(thresholdHours: number = 24): Promise<UnansweredEmail[]> {
    const rows = await db.execute(
      sql`SELECT * FROM vw_agent_unanswered_emails WHERE hours_unanswered >= ${thresholdHours} ORDER BY hours_unanswered DESC`
    );
    return (rows.rows || []).map((r: any) => ({
      id: r.id,
      userId: r.user_id,
      subject: r.subject || '',
      fromAddress: r.from_address || '',
      receivedAt: r.received_at,
      priority: r.priority || '',
      hoursUnanswered: Number(r.hours_unanswered || 0),
    }));
  }

  async getFinanceKPIs(companyScope: string = 'ALL'): Promise<FinanceKPI[]> {
    const rows = await db.execute(sql`SELECT * FROM vw_agent_finance_kpis`);
    return (rows.rows || []).map((r: any) => ({
      companyName: r.company_name || 'Unknown',
      pendingInvoices: Number(r.pending_invoices || 0),
      overdueInvoices: Number(r.overdue_invoices || 0),
      pendingAmount: Number(r.pending_amount || 0),
      overdueAmount: Number(r.overdue_amount || 0),
      paidInvoicesCount: Number(r.paid_invoices_count || 0),
      totalInvoices: Number(r.total_invoices || 0),
    }));
  }

  async getProjectCount(): Promise<number> {
    const rows = await db.execute(sql`SELECT COUNT(*) as cnt FROM projects WHERE status NOT IN ('cancelled','archived')`);
    return Number((rows.rows as any[])?.[0]?.cnt || 0);
  }

  async getWorkOrderCount(): Promise<{ total: number; completed: number; inProgress: number; overdue: number }> {
    const rows = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status = 'in_progress') as in_progress,
        COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled') AND planned_end_date IS NOT NULL AND planned_end_date < NOW()) as overdue
      FROM work_orders
    `);
    const r = (rows.rows as any[])?.[0] || {};
    return {
      total: Number(r.total || 0),
      completed: Number(r.completed || 0),
      inProgress: Number(r.in_progress || 0),
      overdue: Number(r.overdue || 0),
    };
  }

  async getTaskStats(): Promise<{ total: number; completed: number; overdue: number; pending: number }> {
    const rows = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status = 'completed') as completed,
        COUNT(*) FILTER (WHERE status NOT IN ('completed','cancelled') AND due_date IS NOT NULL AND due_date != '' AND due_date::timestamp < NOW()) as overdue,
        COUNT(*) FILTER (WHERE status IN ('pending','todo','open')) as pending
      FROM tasks
    `);
    const r = (rows.rows as any[])?.[0] || {};
    return {
      total: Number(r.total || 0),
      completed: Number(r.completed || 0),
      overdue: Number(r.overdue || 0),
      pending: Number(r.pending || 0),
    };
  }

  async getEmailStats(): Promise<{ totalUnread: number; highPriority: number }> {
    const rows = await db.execute(sql`
      SELECT 
        COUNT(*) as total_unread,
        COUNT(*) FILTER (WHERE priority IN ('P0','P1')) as high_priority
      FROM gmail_messages
      WHERE is_read = false
        AND received_at > NOW() - INTERVAL '7 days'
    `);
    const r = (rows.rows as any[])?.[0] || {};
    return {
      totalUnread: Number(r.total_unread || 0),
      highPriority: Number(r.high_priority || 0),
    };
  }

  async getInspectionStats(): Promise<{ total: number; pending: number; completed: number }> {
    const rows = await db.execute(sql`
      SELECT 
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE status IN ('pending','scheduled','in_progress')) as pending,
        COUNT(*) FILTER (WHERE status = 'completed') as completed
      FROM inspection_orders
    `);
    const r = (rows.rows as any[])?.[0] || {};
    return {
      total: Number(r.total || 0),
      pending: Number(r.pending || 0),
      completed: Number(r.completed || 0),
    };
  }
}

export const agentDataRepo = new AgentDataRepository();
