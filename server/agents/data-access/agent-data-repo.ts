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

  async getOverdueTasksWithEscalation(): Promise<Array<{
    id: number; title: string; dueDate: string; status: string; priority: string;
    category: string; daysOverdue: number;
    assigneeId: number | null; assigneeName: string; assigneeEmail: string;
    creatorId: number | null; creatorName: string; creatorEmail: string;
    assigneeManagerId: number | null; assigneeManagerName: string;
    creatorManagerId: number | null; creatorManagerName: string;
  }>> {
    const rows = await db.execute(sql`
      SELECT t.id, t.title,
        COALESCE(NULLIF(t.due_date,''), t.finish_date) as due_date,
        t.status, t.priority, t.category,
        EXTRACT(DAY FROM NOW() - COALESCE(NULLIF(t.due_date,''), t.finish_date)::timestamp)::int as days_overdue,
        t.assigned_to as assignee_id,
        COALESCE(ua.first_name || ' ' || COALESCE(ua.last_name, ''), ua.username, 'Unassigned') as assignee_name,
        COALESCE(ua.email, '') as assignee_email,
        t.created_by as creator_id,
        COALESCE(uc.first_name || ' ' || COALESCE(uc.last_name, ''), uc.username, 'Unknown') as creator_name,
        COALESCE(uc.email, '') as creator_email,
        ua.reporting_manager_id as assignee_manager_id,
        COALESCE(uma.first_name || ' ' || COALESCE(uma.last_name, ''), uma.username, '') as assignee_manager_name,
        uc.reporting_manager_id as creator_manager_id,
        COALESCE(umc.first_name || ' ' || COALESCE(umc.last_name, ''), umc.username, '') as creator_manager_name
      FROM tasks t
      LEFT JOIN users ua ON t.assigned_to = ua.id
      LEFT JOIN users uc ON t.created_by = uc.id
      LEFT JOIN users uma ON ua.reporting_manager_id = uma.id
      LEFT JOIN users umc ON uc.reporting_manager_id = umc.id
      WHERE t.status NOT IN ('completed', 'cancelled')
        AND COALESCE(NULLIF(t.due_date,''), t.finish_date) IS NOT NULL
        AND COALESCE(NULLIF(t.due_date,''), t.finish_date) != ''
        AND COALESCE(NULLIF(t.due_date,''), t.finish_date)::date < CURRENT_DATE
        AND t.source_agent IS NULL
      ORDER BY days_overdue DESC
    `);
    return (rows.rows || []).map((r: any) => ({
      id: Number(r.id),
      title: r.title || '',
      dueDate: r.due_date || '',
      status: r.status || '',
      priority: r.priority || 'medium',
      category: r.category || 'General',
      daysOverdue: Number(r.days_overdue || 0),
      assigneeId: r.assignee_id ? Number(r.assignee_id) : null,
      assigneeName: r.assignee_name || 'Unassigned',
      assigneeEmail: r.assignee_email || '',
      creatorId: r.creator_id ? Number(r.creator_id) : null,
      creatorName: r.creator_name || 'Unknown',
      creatorEmail: r.creator_email || '',
      assigneeManagerId: r.assignee_manager_id ? Number(r.assignee_manager_id) : null,
      assigneeManagerName: r.assignee_manager_name || '',
      creatorManagerId: r.creator_manager_id ? Number(r.creator_manager_id) : null,
      creatorManagerName: r.creator_manager_name || '',
    }));
  }

  async getRecentlyCompletedTasks(withinDays: number = 1): Promise<Array<{
    id: number; title: string; category: string;
    assigneeId: number | null; assigneeName: string;
    creatorId: number | null; creatorName: string; creatorEmail: string;
    completedAt: string;
  }>> {
    const rows = await db.execute(sql`
      SELECT t.id, t.title, t.category,
        t.assigned_to as assignee_id,
        COALESCE(ua.first_name || ' ' || COALESCE(ua.last_name, ''), ua.username, 'Unknown') as assignee_name,
        t.created_by as creator_id,
        COALESCE(uc.first_name || ' ' || COALESCE(uc.last_name, ''), uc.username, 'Unknown') as creator_name,
        COALESCE(uc.email, '') as creator_email,
        t.completed_at
      FROM tasks t
      LEFT JOIN users ua ON t.assigned_to = ua.id
      LEFT JOIN users uc ON t.created_by = uc.id
      WHERE t.status = 'completed'
        AND t.completed_at IS NOT NULL AND t.completed_at != ''
        AND t.completed_at::timestamp > NOW() - (${withinDays} || ' days')::interval
        AND t.assigned_to IS DISTINCT FROM t.created_by
      ORDER BY t.completed_at DESC
    `);
    return (rows.rows || []).map((r: any) => ({
      id: Number(r.id),
      title: r.title || '',
      category: r.category || 'General',
      assigneeId: r.assignee_id ? Number(r.assignee_id) : null,
      assigneeName: r.assignee_name || 'Unknown',
      creatorId: r.creator_id ? Number(r.creator_id) : null,
      creatorName: r.creator_name || 'Unknown',
      creatorEmail: r.creator_email || '',
      completedAt: r.completed_at ? new Date(r.completed_at).toLocaleString() : '',
    }));
  }

  async getUsersWithNoActiveTasks(minWorkingDays: number = 2): Promise<Array<{
    userId: number; employeeName: string; employeeEmail: string;
    managerId: number | null; managerName: string;
    daysSinceLastActiveTask: number;
  }>> {
    const rows = await db.execute(sql`
      WITH active_users AS (
        SELECT u.id, 
          COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.username) as employee_name,
          COALESCE(u.email, '') as employee_email,
          u.reporting_manager_id,
          COALESCE(m.first_name || ' ' || COALESCE(m.last_name, ''), m.username, '') as manager_name
        FROM users u
        LEFT JOIN users m ON u.reporting_manager_id = m.id
        WHERE u.is_active = true
          AND u.role NOT IN ('Superuser')
      ),
      last_task AS (
        SELECT assigned_to, MAX(created_at::timestamp) as last_task_date
        FROM tasks
        WHERE status NOT IN ('completed', 'cancelled')
        GROUP BY assigned_to
      ),
      active_task_count AS (
        SELECT assigned_to, COUNT(*) as active_count
        FROM tasks
        WHERE status NOT IN ('completed', 'cancelled')
        GROUP BY assigned_to
      )
      SELECT au.id as user_id, au.employee_name, au.employee_email,
        au.reporting_manager_id as manager_id, au.manager_name,
        COALESCE(EXTRACT(DAY FROM NOW() - lt.last_task_date)::int, 999) as days_since_last
      FROM active_users au
      LEFT JOIN active_task_count atc ON au.id = atc.assigned_to
      LEFT JOIN last_task lt ON au.id = lt.assigned_to
      WHERE COALESCE(atc.active_count, 0) = 0
        AND au.reporting_manager_id IS NOT NULL
      ORDER BY au.employee_name
    `);
    return (rows.rows || []).map((r: any) => ({
      userId: Number(r.user_id),
      employeeName: r.employee_name || 'Unknown',
      employeeEmail: r.employee_email || '',
      managerId: r.manager_id ? Number(r.manager_id) : null,
      managerName: r.manager_name || '',
      daysSinceLastActiveTask: Number(r.days_since_last || 0),
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

  async getOverdueRecurringTasks(thresholdDays: number = 7): Promise<Array<{
    id: number; title: string; assigneeName: string; daysOverdue: number; category: string; priority: string;
  }>> {
    const rows = await db.execute(sql`
      SELECT rt.id, rt.title, rt.priority, rt.category,
        COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.username, 'Unassigned') as assignee_name,
        EXTRACT(DAY FROM NOW() - rt.due_date::timestamp)::int as days_overdue
      FROM recurring_tasks rt
      LEFT JOIN users u ON rt.assigned_to = u.id
      WHERE rt.status = 'pending'
        AND rt.due_date IS NOT NULL
        AND rt.due_date::date < CURRENT_DATE
        AND EXTRACT(DAY FROM NOW() - rt.due_date::timestamp) >= ${thresholdDays}
      ORDER BY days_overdue DESC
    `);
    return (rows.rows || []).map((r: any) => ({
      id: Number(r.id),
      title: r.title || '',
      assigneeName: r.assignee_name || 'Unassigned',
      daysOverdue: Number(r.days_overdue || 0),
      category: r.category || 'General',
      priority: r.priority || 'medium',
    }));
  }

  async getAttendanceAnomalies(days: number = 7): Promise<Array<{
    userId: number; employeeName: string; absentCount: number; incompleteCount: number;
  }>> {
    const rows = await db.execute(sql`
      SELECT ar.user_id,
        COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.username, 'Unknown') as employee_name,
        COUNT(*) FILTER (WHERE ar.status = 'absent') as absent_count,
        COUNT(*) FILTER (WHERE ar.is_incomplete = true) as incomplete_count
      FROM attendance_records ar
      LEFT JOIN users u ON ar.user_id = u.id
      WHERE ar.date >= CURRENT_DATE - ${days}::int
      GROUP BY ar.user_id, u.first_name, u.last_name, u.username
      HAVING COUNT(*) FILTER (WHERE ar.status = 'absent') > 0
         OR COUNT(*) FILTER (WHERE ar.is_incomplete = true) > 0
      ORDER BY absent_count DESC, incomplete_count DESC
    `);
    return (rows.rows || []).map((r: any) => ({
      userId: Number(r.user_id),
      employeeName: r.employee_name || 'Unknown',
      absentCount: Number(r.absent_count || 0),
      incompleteCount: Number(r.incomplete_count || 0),
    }));
  }

  async getDetailedAttendanceIssues(days: number = 7): Promise<Array<{
    userId: number; employeeName: string; managerName: string; managerId: number | null;
    absentCount: number; incompleteCount: number; absentWithoutLeaveCount: number;
    todayMissing: boolean; todayIncomplete: boolean;
    absentDates: string[]; incompleteDates: string[];
  }>> {
    const rows = await db.execute(sql`
      WITH user_attendance AS (
        SELECT ar.user_id,
          COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.username, 'Unknown') as employee_name,
          u.reporting_manager_id,
          COALESCE(m.first_name || ' ' || COALESCE(m.last_name, ''), m.username, '') as manager_name,
          COUNT(*) FILTER (WHERE ar.status = 'absent') as absent_count,
          COUNT(*) FILTER (WHERE ar.is_incomplete = true OR (ar.check_in_time IS NOT NULL AND ar.check_out_time IS NULL AND ar.date < CURRENT_DATE)) as incomplete_count,
          COUNT(*) FILTER (WHERE ar.status = 'absent' AND NOT EXISTS(
            SELECT 1 FROM leave_requests lr WHERE lr.employee_id = ar.user_id AND lr.status = 'approved' AND lr.start_date <= ar.date AND lr.end_date >= ar.date
          )) as absent_without_leave_count,
          BOOL_OR(ar.date = CURRENT_DATE AND ar.user_id IS NULL) as today_missing,
          BOOL_OR(ar.date = CURRENT_DATE AND ar.check_in_time IS NOT NULL AND ar.check_out_time IS NULL) as today_incomplete,
          ARRAY_AGG(DISTINCT ar.date::text ORDER BY ar.date::text) FILTER (WHERE ar.status = 'absent') as absent_dates,
          ARRAY_AGG(DISTINCT ar.date::text ORDER BY ar.date::text) FILTER (WHERE ar.is_incomplete = true OR (ar.check_in_time IS NOT NULL AND ar.check_out_time IS NULL AND ar.date < CURRENT_DATE)) as incomplete_dates
        FROM attendance_records ar
        LEFT JOIN users u ON ar.user_id = u.id
        LEFT JOIN users m ON u.reporting_manager_id = m.id
        WHERE ar.date >= CURRENT_DATE - ${days}::int
          AND u.is_active = true
        GROUP BY ar.user_id, u.first_name, u.last_name, u.username, u.reporting_manager_id, m.first_name, m.last_name, m.username
        HAVING COUNT(*) FILTER (WHERE ar.status = 'absent') > 0
           OR COUNT(*) FILTER (WHERE ar.is_incomplete = true OR (ar.check_in_time IS NOT NULL AND ar.check_out_time IS NULL AND ar.date < CURRENT_DATE)) > 0
      )
      SELECT * FROM user_attendance ORDER BY absent_without_leave_count DESC, absent_count DESC, incomplete_count DESC
    `);
    return (rows.rows || []).map((r: any) => ({
      userId: Number(r.user_id),
      employeeName: r.employee_name || 'Unknown',
      managerName: r.manager_name || '',
      managerId: r.reporting_manager_id ? Number(r.reporting_manager_id) : null,
      absentCount: Number(r.absent_count || 0),
      incompleteCount: Number(r.incomplete_count || 0),
      absentWithoutLeaveCount: Number(r.absent_without_leave_count || 0),
      todayMissing: Boolean(r.today_missing),
      todayIncomplete: Boolean(r.today_incomplete),
      absentDates: r.absent_dates || [],
      incompleteDates: r.incomplete_dates || [],
    }));
  }

  async getTodayMissingAttendance(): Promise<Array<{
    userId: number; employeeName: string; managerName: string;
  }>> {
    const rows = await db.execute(sql`
      SELECT u.id as user_id,
        COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.username) as employee_name,
        COALESCE(m.first_name || ' ' || COALESCE(m.last_name, ''), m.username, '') as manager_name
      FROM users u
      LEFT JOIN users m ON u.reporting_manager_id = m.id
      WHERE u.is_active = true
        AND u.role NOT IN ('Superuser')
        AND EXTRACT(DOW FROM CURRENT_DATE) NOT IN (0, 6)
        AND NOT EXISTS (
          SELECT 1 FROM attendance_records ar WHERE ar.user_id = u.id AND ar.date = CURRENT_DATE
        )
        AND NOT EXISTS (
          SELECT 1 FROM leave_requests lr WHERE lr.employee_id = u.id AND lr.status = 'approved'
            AND lr.start_date <= CURRENT_DATE AND lr.end_date >= CURRENT_DATE
        )
      ORDER BY employee_name
    `);
    return (rows.rows || []).map((r: any) => ({
      userId: Number(r.user_id),
      employeeName: r.employee_name || 'Unknown',
      managerName: r.manager_name || '',
    }));
  }

  async getDWARSubmissionGaps(minMissingDays: number = 2): Promise<Array<{
    userId: number; employeeName: string; missingDays: number;
  }>> {
    const rows = await db.execute(sql`
      WITH active_users AS (
        SELECT id, COALESCE(first_name || ' ' || COALESCE(last_name, ''), username) as employee_name
        FROM users WHERE is_active = true
      ),
      working_days AS (
        SELECT generate_series(CURRENT_DATE - 6, CURRENT_DATE, '1 day'::interval)::date as work_date
      ),
      expected AS (
        SELECT u.id as user_id, u.employee_name, wd.work_date
        FROM active_users u CROSS JOIN working_days wd
        WHERE EXTRACT(DOW FROM wd.work_date) NOT IN (0, 6)
      ),
      submitted AS (
        SELECT user_id, report_date::date as report_date FROM daily_work_reports
        WHERE report_date::date >= CURRENT_DATE - 6
      )
      SELECT e.user_id, e.employee_name, COUNT(*) as missing_days
      FROM expected e
      LEFT JOIN submitted s ON e.user_id = s.user_id AND e.work_date = s.report_date
      WHERE s.user_id IS NULL
      GROUP BY e.user_id, e.employee_name
      HAVING COUNT(*) >= ${minMissingDays}
      ORDER BY missing_days DESC
    `);
    return (rows.rows || []).map((r: any) => ({
      userId: Number(r.user_id),
      employeeName: r.employee_name || 'Unknown',
      missingDays: Number(r.missing_days || 0),
    }));
  }

  async getDetailedDWARGaps(): Promise<Array<{
    userId: number; employeeName: string; managerName: string; managerId: number | null;
    missingDays: number; consecutiveMissing: number; missingDates: string[];
    incompleteDwarCount: number;
  }>> {
    const rows = await db.execute(sql`
      WITH active_users AS (
        SELECT u.id, 
          COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.username) as employee_name,
          u.reporting_manager_id,
          COALESCE(m.first_name || ' ' || COALESCE(m.last_name, ''), m.username, '') as manager_name
        FROM users u
        LEFT JOIN users m ON u.reporting_manager_id = m.id
        WHERE u.is_active = true AND u.role NOT IN ('Superuser')
      ),
      working_days AS (
        SELECT generate_series(CURRENT_DATE - 6, CURRENT_DATE, '1 day'::interval)::date as work_date
      ),
      expected AS (
        SELECT u.id as user_id, u.employee_name, u.reporting_manager_id, u.manager_name, wd.work_date
        FROM active_users u CROSS JOIN working_days wd
        WHERE EXTRACT(DOW FROM wd.work_date) NOT IN (0, 6)
      ),
      submitted AS (
        SELECT user_id, report_date::date as report_date,
          LENGTH(COALESCE(challenges,'') || COALESCE(tomorrow_plans,'') || COALESCE(issues_encountered,'') || COALESCE(support_required,'')) as content_len,
          status
        FROM daily_work_reports
        WHERE report_date::date >= CURRENT_DATE - 6
      ),
      gaps AS (
        SELECT e.user_id, e.employee_name, e.reporting_manager_id, e.manager_name, e.work_date,
          CASE WHEN s.user_id IS NULL THEN 1 ELSE 0 END as is_missing
        FROM expected e
        LEFT JOIN submitted s ON e.user_id = s.user_id AND e.work_date = s.report_date
      ),
      incomplete_dwars AS (
        SELECT user_id, COUNT(*) as incomplete_count
        FROM submitted
        WHERE content_len < 20 AND status = 'draft'
        GROUP BY user_id
      ),
      consecutive AS (
        SELECT user_id, employee_name, reporting_manager_id, manager_name,
          SUM(is_missing) as total_missing,
          ARRAY_AGG(work_date::text ORDER BY work_date) FILTER (WHERE is_missing = 1) as missing_dates
        FROM gaps
        GROUP BY user_id, employee_name, reporting_manager_id, manager_name
        HAVING SUM(is_missing) > 0
      )
      SELECT c.user_id, c.employee_name, c.reporting_manager_id, c.manager_name,
        c.total_missing as missing_days,
        c.missing_dates,
        COALESCE(id.incomplete_count, 0) as incomplete_dwar_count
      FROM consecutive c
      LEFT JOIN incomplete_dwars id ON c.user_id = id.user_id
      ORDER BY c.total_missing DESC
    `);
    return (rows.rows || []).map((r: any) => {
      const dates: string[] = r.missing_dates || [];
      let consecutive = 0;
      let maxConsecutive = 0;
      const sortedDates = dates.sort();
      for (let i = 0; i < sortedDates.length; i++) {
        if (i === 0) { consecutive = 1; }
        else {
          const prev = new Date(sortedDates[i-1]);
          const curr = new Date(sortedDates[i]);
          const diffDays = (curr.getTime() - prev.getTime()) / (1000 * 60 * 60 * 24);
          consecutive = diffDays <= 3 ? consecutive + 1 : 1;
        }
        maxConsecutive = Math.max(maxConsecutive, consecutive);
      }
      return {
        userId: Number(r.user_id),
        employeeName: r.employee_name || 'Unknown',
        managerName: r.manager_name || '',
        managerId: r.reporting_manager_id ? Number(r.reporting_manager_id) : null,
        missingDays: Number(r.missing_days || 0),
        consecutiveMissing: maxConsecutive,
        missingDates: dates,
        incompleteDwarCount: Number(r.incomplete_dwar_count || 0),
      };
    });
  }

  async getPendingLeaveRequests(): Promise<Array<{
    id: number; employeeName: string; leaveType: string; startDate: string; endDate: string; daysPending: number;
  }>> {
    const rows = await db.execute(sql`
      SELECT lr.id, lr.start_date, lr.end_date,
        COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.username, 'Unknown') as employee_name,
        COALESCE(lt.name, 'Leave') as leave_type,
        EXTRACT(DAY FROM NOW() - lr.created_at)::int as days_pending
      FROM leave_requests lr
      LEFT JOIN users u ON lr.employee_id = u.id
      LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE lr.status = 'pending'
      ORDER BY days_pending DESC
    `);
    return (rows.rows || []).map((r: any) => ({
      id: Number(r.id),
      employeeName: r.employee_name || 'Unknown',
      leaveType: r.leave_type || 'Leave',
      startDate: r.start_date ? new Date(r.start_date).toLocaleDateString() : '',
      endDate: r.end_date ? new Date(r.end_date).toLocaleDateString() : '',
      daysPending: Number(r.days_pending || 0),
    }));
  }

  async getDetailedPendingLeaveRequests(): Promise<Array<{
    id: number; employeeId: number; employeeName: string; leaveType: string;
    startDate: string; endDate: string; daysPending: number;
    managerId: number | null; managerName: string;
    leaveDatePassed: boolean; totalDays: number;
  }>> {
    const rows = await db.execute(sql`
      SELECT lr.id, lr.employee_id, lr.start_date, lr.end_date, lr.total_days,
        COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.username, 'Unknown') as employee_name,
        COALESCE(lt.name, 'Leave') as leave_type,
        EXTRACT(DAY FROM NOW() - lr.created_at)::int as days_pending,
        lr.manager_id,
        COALESCE(m.first_name || ' ' || COALESCE(m.last_name, ''), m.username, '') as manager_name,
        CASE WHEN lr.start_date < CURRENT_DATE THEN true ELSE false END as leave_date_passed
      FROM leave_requests lr
      LEFT JOIN users u ON lr.employee_id = u.id
      LEFT JOIN users m ON lr.manager_id = m.id
      LEFT JOIN leave_types lt ON lr.leave_type_id = lt.id
      WHERE lr.status = 'pending'
      ORDER BY days_pending DESC
    `);
    return (rows.rows || []).map((r: any) => ({
      id: Number(r.id),
      employeeId: Number(r.employee_id),
      employeeName: r.employee_name || 'Unknown',
      leaveType: r.leave_type || 'Leave',
      startDate: r.start_date ? new Date(r.start_date).toLocaleDateString() : '',
      endDate: r.end_date ? new Date(r.end_date).toLocaleDateString() : '',
      daysPending: Number(r.days_pending || 0),
      managerId: r.manager_id ? Number(r.manager_id) : null,
      managerName: r.manager_name || '',
      leaveDatePassed: Boolean(r.leave_date_passed),
      totalDays: Number(r.total_days || 0),
    }));
  }

  async getOverdueMeetingCommitments(thresholdDays: number = 7): Promise<Array<{
    id: number; title: string; assigneeName: string; daysOverdue: number; meetingTitle: string;
  }>> {
    const rows = await db.execute(sql`
      SELECT mc.id, mc.title, mc.meeting_title,
        COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.username, 'Unassigned') as assignee_name,
        EXTRACT(DAY FROM NOW() - mc.due_date::timestamp)::int as days_overdue
      FROM meeting_commitments mc
      LEFT JOIN users u ON mc.assigned_to_id = u.id
      WHERE mc.status IN ('Pending')
        AND mc.due_date IS NOT NULL
        AND mc.due_date::date < CURRENT_DATE
        AND EXTRACT(DAY FROM NOW() - mc.due_date::timestamp) >= ${thresholdDays}
      ORDER BY days_overdue DESC
    `);
    return (rows.rows || []).map((r: any) => ({
      id: Number(r.id),
      title: r.title || '',
      assigneeName: r.assignee_name || 'Unassigned',
      daysOverdue: Number(r.days_overdue || 0),
      meetingTitle: r.meeting_title || '',
    }));
  }

  async getDetailedMeetingCommitments(): Promise<Array<{
    id: number; title: string; dueDate: string; daysOverdue: number;
    assigneeId: number | null; assigneeName: string;
    managerId: number | null; managerName: string;
    meetingTitle: string; meetingDate: string;
    hasLinkedTask: boolean; priority: string; category: string;
  }>> {
    const rows = await db.execute(sql`
      SELECT mc.id, mc.title, mc.due_date, mc.priority, mc.category, mc.meeting_title, mc.meeting_date,
        EXTRACT(DAY FROM NOW() - mc.due_date::timestamp)::int as days_overdue,
        mc.assigned_to_id,
        COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.username, 'Unassigned') as assignee_name,
        u.reporting_manager_id,
        COALESCE(m.first_name || ' ' || COALESCE(m.last_name, ''), m.username, '') as manager_name,
        EXISTS(SELECT 1 FROM tasks t WHERE t.source_type = 'meeting_commitment' AND t.source_id = mc.id) as has_linked_task
      FROM meeting_commitments mc
      LEFT JOIN users u ON mc.assigned_to_id = u.id
      LEFT JOIN users m ON u.reporting_manager_id = m.id
      WHERE mc.status IN ('Pending')
        AND mc.due_date IS NOT NULL
        AND mc.due_date::date < CURRENT_DATE
      ORDER BY days_overdue DESC
    `);
    return (rows.rows || []).map((r: any) => ({
      id: Number(r.id),
      title: r.title || '',
      dueDate: r.due_date ? new Date(r.due_date).toLocaleDateString() : '',
      daysOverdue: Number(r.days_overdue || 0),
      assigneeId: r.assigned_to_id ? Number(r.assigned_to_id) : null,
      assigneeName: r.assignee_name || 'Unassigned',
      managerId: r.reporting_manager_id ? Number(r.reporting_manager_id) : null,
      managerName: r.manager_name || '',
      meetingTitle: r.meeting_title || '',
      meetingDate: r.meeting_date ? new Date(r.meeting_date).toLocaleDateString() : '',
      hasLinkedTask: Boolean(r.has_linked_task),
      priority: r.priority || 'Medium',
      category: r.category || '',
    }));
  }

  async getUnreadInternalMessages(thresholdHours: number = 48): Promise<Array<{
    id: number; recipientName: string; subject: string; hoursUnread: number;
  }>> {
    const rows = await db.execute(sql`
      SELECT m.id, m.subject, m.recipient_name,
        EXTRACT(EPOCH FROM NOW() - m.created_at)::int / 3600 as hours_unread
      FROM internal_messages m
      WHERE m.is_read = false
        AND EXTRACT(EPOCH FROM NOW() - m.created_at) / 3600 >= ${thresholdHours}
      ORDER BY hours_unread DESC
    `);
    return (rows.rows || []).map((r: any) => ({
      id: Number(r.id),
      recipientName: r.recipient_name || 'Unknown',
      subject: r.subject || '',
      hoursUnread: Number(r.hours_unread || 0),
    }));
  }

  async getUnallocatedPayments(): Promise<Array<{
    paymentRef: string; currency: string; unallocatedAmount: number; daysSincePayment: number;
  }>> {
    try {
      const rows = await db.execute(sql`
        SELECT COALESCE(p.irm_no, p.sap_payment_no, 'PMT-' || p.id) as payment_ref,
          COALESCE(p.currency, 'USD') as currency,
          COALESCE(p.unallocated_amount, COALESCE(p.amount, 0) - COALESCE(p.allocated_amount, 0)) as unallocated_amount,
          EXTRACT(DAY FROM NOW() - p.payment_date::timestamp)::int as days_since_payment
        FROM payments p
        WHERE COALESCE(p.unallocated_amount, COALESCE(p.amount, 0) - COALESCE(p.allocated_amount, 0)) > 1
        ORDER BY unallocated_amount DESC
        LIMIT 20
      `);
      return (rows.rows || []).map((r: any) => ({
        paymentRef: r.payment_ref || '',
        currency: r.currency || 'USD',
        unallocatedAmount: Number(r.unallocated_amount || 0),
        daysSincePayment: Number(r.days_since_payment || 0),
      }));
    } catch {
      return [];
    }
  }

  async getTrendComparison(): Promise<{
    currentOverdueTasks: number; previousOverdueTasks: number;
    currentDwarMissing: number; previousDwarMissing: number;
    currentAttendanceIssues: number; previousAttendanceIssues: number;
    currentPendingLeaves: number; previousPendingLeaves: number;
    currentOverdueCommitments: number; previousOverdueCommitments: number;
  }> {
    const rows = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM tasks WHERE status NOT IN ('completed','cancelled') AND due_date IS NOT NULL AND due_date != '' AND due_date::date < CURRENT_DATE) as current_overdue_tasks,
        (SELECT COUNT(*) FROM agent_findings WHERE agent_key = 'communications' AND finding_type = 'overdue' AND created_at > CURRENT_DATE - 7 AND created_at <= CURRENT_DATE) as current_period_overdue_findings,
        (SELECT COUNT(*) FROM agent_findings WHERE agent_key = 'communications' AND finding_type = 'overdue' AND created_at > CURRENT_DATE - 14 AND created_at <= CURRENT_DATE - 7) as previous_period_overdue_findings,
        (SELECT COUNT(DISTINCT f.related_entity_id) FROM agent_findings f WHERE f.agent_key='communications' AND f.related_entity_type='dwar' AND f.created_at > CURRENT_DATE - 7) as current_dwar_issues,
        (SELECT COUNT(DISTINCT f.related_entity_id) FROM agent_findings f WHERE f.agent_key='communications' AND f.related_entity_type='dwar' AND f.created_at > CURRENT_DATE - 14 AND f.created_at <= CURRENT_DATE - 7) as previous_dwar_issues,
        (SELECT COUNT(DISTINCT f.related_entity_id) FROM agent_findings f WHERE f.agent_key='communications' AND f.related_entity_type='attendance' AND f.created_at > CURRENT_DATE - 7) as current_attendance_issues,
        (SELECT COUNT(DISTINCT f.related_entity_id) FROM agent_findings f WHERE f.agent_key='communications' AND f.related_entity_type='attendance' AND f.created_at > CURRENT_DATE - 14 AND f.created_at <= CURRENT_DATE - 7) as previous_attendance_issues,
        (SELECT COUNT(*) FROM leave_requests WHERE status='pending') as current_pending_leaves,
        (SELECT COUNT(DISTINCT f.related_entity_id) FROM agent_findings f WHERE f.agent_key='communications' AND f.related_entity_type='leave_request' AND f.created_at > CURRENT_DATE - 14 AND f.created_at <= CURRENT_DATE - 7) as previous_pending_leaves,
        (SELECT COUNT(*) FROM meeting_commitments WHERE status='Pending' AND due_date IS NOT NULL AND due_date::date < CURRENT_DATE) as current_overdue_commitments,
        (SELECT COUNT(DISTINCT f.related_entity_id) FROM agent_findings f WHERE f.agent_key='communications' AND f.related_entity_type='meeting_commitment' AND f.created_at > CURRENT_DATE - 14 AND f.created_at <= CURRENT_DATE - 7) as previous_overdue_commitments
    `);
    const r = (rows.rows as any[])?.[0] || {};
    return {
      currentOverdueTasks: Number(r.current_overdue_tasks || 0),
      previousOverdueTasks: Number(r.previous_period_overdue_findings || 0),
      currentDwarMissing: Number(r.current_dwar_issues || 0),
      previousDwarMissing: Number(r.previous_dwar_issues || 0),
      currentAttendanceIssues: Number(r.current_attendance_issues || 0),
      previousAttendanceIssues: Number(r.previous_attendance_issues || 0),
      currentPendingLeaves: Number(r.current_pending_leaves || 0),
      previousPendingLeaves: Number(r.previous_pending_leaves || 0),
      currentOverdueCommitments: Number(r.current_overdue_commitments || 0),
      previousOverdueCommitments: Number(r.previous_overdue_commitments || 0),
    };
  }

  async getDWARQualityScores(): Promise<Array<{
    userId: number; employeeName: string; managerName: string; managerId: number | null;
    totalDwars: number; completeCount: number; weakCount: number; poorCount: number; emptyCount: number;
    avgScore: number;
  }>> {
    const rows = await db.execute(sql`
      WITH active_users AS (
        SELECT u.id, 
          COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.username) as employee_name,
          u.reporting_manager_id,
          COALESCE(m.first_name || ' ' || COALESCE(m.last_name, ''), m.username, '') as manager_name
        FROM users u
        LEFT JOIN users m ON u.reporting_manager_id = m.id
        WHERE u.is_active = true AND u.role NOT IN ('Superuser')
      ),
      scored AS (
        SELECT d.user_id,
          LENGTH(COALESCE(d.challenges,'')) + LENGTH(COALESCE(d.tomorrow_plans,'')) + LENGTH(COALESCE(d.issues_encountered,'')) + LENGTH(COALESCE(d.support_required,'')) as total_len,
          CASE WHEN d.challenges IS NOT NULL AND d.challenges != '' THEN 1 ELSE 0 END +
          CASE WHEN d.tomorrow_plans IS NOT NULL AND d.tomorrow_plans != '' THEN 1 ELSE 0 END +
          CASE WHEN d.issues_encountered IS NOT NULL AND d.issues_encountered != '' THEN 1 ELSE 0 END +
          CASE WHEN d.support_required IS NOT NULL AND d.support_required != '' THEN 1 ELSE 0 END as fields_filled,
          d.status
        FROM daily_work_reports d
        WHERE d.report_date::date >= CURRENT_DATE - 7
      ),
      classified AS (
        SELECT user_id,
          CASE
            WHEN status = 'draft' AND total_len < 10 THEN 'empty'
            WHEN total_len < 30 OR fields_filled <= 1 THEN 'poor'
            WHEN total_len < 80 OR fields_filled <= 2 THEN 'weak'
            ELSE 'complete'
          END as quality,
          CASE
            WHEN status = 'draft' AND total_len < 10 THEN 0
            WHEN total_len < 30 OR fields_filled <= 1 THEN 25
            WHEN total_len < 80 OR fields_filled <= 2 THEN 50
            ELSE 100
          END as score
        FROM scored
      )
      SELECT au.id as user_id, au.employee_name, au.reporting_manager_id, au.manager_name,
        COUNT(c.*) as total_dwars,
        COUNT(*) FILTER (WHERE c.quality = 'complete') as complete_count,
        COUNT(*) FILTER (WHERE c.quality = 'weak') as weak_count,
        COUNT(*) FILTER (WHERE c.quality = 'poor') as poor_count,
        COUNT(*) FILTER (WHERE c.quality = 'empty') as empty_count,
        COALESCE(AVG(c.score), 0) as avg_score
      FROM active_users au
      LEFT JOIN classified c ON au.id = c.user_id
      WHERE c.user_id IS NOT NULL
      GROUP BY au.id, au.employee_name, au.reporting_manager_id, au.manager_name
      HAVING COUNT(*) FILTER (WHERE c.quality IN ('poor','empty','weak')) > 0
      ORDER BY avg_score ASC
    `);
    return (rows.rows || []).map((r: any) => ({
      userId: Number(r.user_id),
      employeeName: r.employee_name || 'Unknown',
      managerName: r.manager_name || '',
      managerId: r.reporting_manager_id ? Number(r.reporting_manager_id) : null,
      totalDwars: Number(r.total_dwars || 0),
      completeCount: Number(r.complete_count || 0),
      weakCount: Number(r.weak_count || 0),
      poorCount: Number(r.poor_count || 0),
      emptyCount: Number(r.empty_count || 0),
      avgScore: Math.round(Number(r.avg_score || 0)),
    }));
  }

  async getAttendancePatterns30Day(): Promise<Array<{
    userId: number; employeeName: string; managerName: string; managerId: number | null;
    totalAbsent: number; totalIncomplete: number; absentWithoutLeave: number;
    mondayAbsences: number; fridayAbsences: number; hasWeekendPattern: boolean;
  }>> {
    const rows = await db.execute(sql`
      SELECT ar.user_id,
        COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.username, 'Unknown') as employee_name,
        u.reporting_manager_id,
        COALESCE(m.first_name || ' ' || COALESCE(m.last_name, ''), m.username, '') as manager_name,
        COUNT(*) FILTER (WHERE ar.status = 'absent') as total_absent,
        COUNT(*) FILTER (WHERE ar.is_incomplete = true OR (ar.check_in_time IS NOT NULL AND ar.check_out_time IS NULL AND ar.date < CURRENT_DATE)) as total_incomplete,
        COUNT(*) FILTER (WHERE ar.status = 'absent' AND NOT EXISTS(
          SELECT 1 FROM leave_requests lr WHERE lr.employee_id = ar.user_id AND lr.status = 'approved' AND lr.start_date <= ar.date AND lr.end_date >= ar.date
        )) as absent_without_leave,
        COUNT(*) FILTER (WHERE ar.status = 'absent' AND EXTRACT(DOW FROM ar.date) = 1) as monday_absences,
        COUNT(*) FILTER (WHERE ar.status = 'absent' AND EXTRACT(DOW FROM ar.date) = 5) as friday_absences
      FROM attendance_records ar
      LEFT JOIN users u ON ar.user_id = u.id
      LEFT JOIN users m ON u.reporting_manager_id = m.id
      WHERE ar.date >= CURRENT_DATE - 30
        AND u.is_active = true
      GROUP BY ar.user_id, u.first_name, u.last_name, u.username, u.reporting_manager_id, m.first_name, m.last_name, m.username
      HAVING COUNT(*) FILTER (WHERE ar.status = 'absent') >= 3
         OR COUNT(*) FILTER (WHERE ar.is_incomplete = true OR (ar.check_in_time IS NOT NULL AND ar.check_out_time IS NULL AND ar.date < CURRENT_DATE)) >= 5
      ORDER BY total_absent DESC
    `);
    return (rows.rows || []).map((r: any) => {
      const monAbs = Number(r.monday_absences || 0);
      const friAbs = Number(r.friday_absences || 0);
      const totalAbs = Number(r.total_absent || 0);
      return {
        userId: Number(r.user_id),
        employeeName: r.employee_name || 'Unknown',
        managerName: r.manager_name || '',
        managerId: r.reporting_manager_id ? Number(r.reporting_manager_id) : null,
        totalAbsent: totalAbs,
        totalIncomplete: Number(r.total_incomplete || 0),
        absentWithoutLeave: Number(r.absent_without_leave || 0),
        mondayAbsences: monAbs,
        fridayAbsences: friAbs,
        hasWeekendPattern: totalAbs >= 3 && (monAbs + friAbs) >= Math.ceil(totalAbs * 0.5),
      };
    });
  }

  async getLeaveBalanceAlerts(): Promise<Array<{
    userId: number; employeeName: string; managerName: string;
    leaveType: string; totalEntitled: number; used: number; remaining: number;
    pendingRequests: number;
  }>> {
    try {
      const rows = await db.execute(sql`
        SELECT lb.employee_id as user_id,
          COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.username, 'Unknown') as employee_name,
          COALESCE(m.first_name || ' ' || COALESCE(m.last_name, ''), m.username, '') as manager_name,
          COALESCE(lt.name, 'Leave') as leave_type,
          COALESCE(lb.total_entitled, 0) as total_entitled,
          COALESCE(lb.used, 0) as used,
          COALESCE(lb.remaining, lb.total_entitled - lb.used, 0) as remaining,
          (SELECT COUNT(*) FROM leave_requests lr WHERE lr.employee_id = lb.employee_id AND lr.status = 'pending') as pending_requests
        FROM leave_balances lb
        LEFT JOIN users u ON lb.employee_id = u.id
        LEFT JOIN users m ON u.reporting_manager_id = m.id
        LEFT JOIN leave_types lt ON lb.leave_type_id = lt.id
        WHERE u.is_active = true
          AND COALESCE(lb.remaining, lb.total_entitled - lb.used, 0) <= 2
        ORDER BY remaining ASC
      `);
      return (rows.rows || []).map((r: any) => ({
        userId: Number(r.user_id),
        employeeName: r.employee_name || 'Unknown',
        managerName: r.manager_name || '',
        leaveType: r.leave_type || 'Leave',
        totalEntitled: Number(r.total_entitled || 0),
        used: Number(r.used || 0),
        remaining: Number(r.remaining || 0),
        pendingRequests: Number(r.pending_requests || 0),
      }));
    } catch {
      return [];
    }
  }

  async getMeetingDisciplineMetrics(): Promise<{
    totalCommitments: number; completedCommitments: number; overdueCommitments: number;
    completionRate: number;
    repeatOffenders: Array<{ userId: number; employeeName: string; overdueCount: number }>;
    meetingsWithNoActions: number;
  }> {
    const rows = await db.execute(sql`
      SELECT
        (SELECT COUNT(*) FROM meeting_commitments) as total_commitments,
        (SELECT COUNT(*) FROM meeting_commitments WHERE status = 'Completed') as completed_commitments,
        (SELECT COUNT(*) FROM meeting_commitments WHERE status = 'Pending' AND due_date IS NOT NULL AND due_date::date < CURRENT_DATE) as overdue_commitments,
        (SELECT COUNT(DISTINCT meeting_title) FROM meeting_commitments mc2 
         WHERE NOT EXISTS (SELECT 1 FROM meeting_commitments mc3 WHERE mc3.meeting_title = mc2.meeting_title AND mc3.status = 'Completed')
         AND mc2.meeting_date IS NOT NULL AND mc2.meeting_date::date < CURRENT_DATE - 30
        ) as meetings_with_no_completed_actions
    `);
    const r = (rows.rows as any[])?.[0] || {};
    const total = Number(r.total_commitments || 0);
    const completed = Number(r.completed_commitments || 0);

    const offenderRows = await db.execute(sql`
      SELECT mc.assigned_to_id as user_id,
        COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.username, 'Unknown') as employee_name,
        COUNT(*) as overdue_count
      FROM meeting_commitments mc
      LEFT JOIN users u ON mc.assigned_to_id = u.id
      WHERE mc.status = 'Pending' AND mc.due_date IS NOT NULL AND mc.due_date::date < CURRENT_DATE
      GROUP BY mc.assigned_to_id, u.first_name, u.last_name, u.username
      HAVING COUNT(*) >= 2
      ORDER BY overdue_count DESC
      LIMIT 10
    `);

    return {
      totalCommitments: total,
      completedCommitments: completed,
      overdueCommitments: Number(r.overdue_commitments || 0),
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      repeatOffenders: (offenderRows.rows || []).map((o: any) => ({
        userId: Number(o.user_id),
        employeeName: o.employee_name || 'Unknown',
        overdueCount: Number(o.overdue_count || 0),
      })),
      meetingsWithNoActions: Number(r.meetings_with_no_completed_actions || 0),
    };
  }

  async getTasksAssignedToInactiveUsers(): Promise<Array<{
    taskId: number; taskTitle: string; assigneeId: number; assigneeName: string;
    creatorId: number; creatorName: string; daysOverdue: number;
  }>> {
    const rows = await db.execute(sql`
      SELECT t.id as task_id, t.title as task_title, t.assigned_to as assignee_id,
        COALESCE(ua.first_name || ' ' || COALESCE(ua.last_name, ''), ua.username, 'Unknown') as assignee_name,
        t.created_by as creator_id,
        COALESCE(uc.first_name || ' ' || COALESCE(uc.last_name, ''), uc.username, 'Unknown') as creator_name,
        CASE WHEN t.due_date IS NOT NULL AND t.due_date != '' AND t.due_date::date < CURRENT_DATE
          THEN EXTRACT(DAY FROM NOW() - t.due_date::timestamp)::int ELSE 0 END as days_overdue
      FROM tasks t
      JOIN users ua ON t.assigned_to = ua.id
      LEFT JOIN users uc ON t.created_by = uc.id
      WHERE t.status NOT IN ('completed','cancelled')
        AND ua.is_active = false
      ORDER BY days_overdue DESC
      LIMIT 20
    `);
    return (rows.rows || []).map((r: any) => ({
      taskId: Number(r.task_id),
      taskTitle: r.task_title || '',
      assigneeId: Number(r.assignee_id),
      assigneeName: r.assignee_name || 'Unknown',
      creatorId: Number(r.creator_id),
      creatorName: r.creator_name || 'Unknown',
      daysOverdue: Number(r.days_overdue || 0),
    }));
  }

  async getUserIdByName(name: string): Promise<number | null> {
    const rows = await db.execute(sql`
      SELECT id FROM users 
      WHERE COALESCE(first_name || ' ' || COALESCE(last_name, ''), username) ILIKE ${name}
      LIMIT 1
    `);
    const r = (rows.rows as any[])?.[0];
    return r ? Number(r.id) : null;
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
  async getRecurringTaskLateCompletions(days: number = 30): Promise<Array<{
    assigneeId: number; assigneeName: string; managerId: number | null; managerName: string | null;
    lateCount: number; avgDaysLate: number; worstDaysLate: number;
    tasks: Array<{ id: number; title: string; daysLate: number }>;
  }>> {
    const rows = await db.execute(sql`
      SELECT rt.assigned_to as assignee_id,
        COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.username, 'Unknown') as assignee_name,
        u.reports_to as manager_id,
        COALESCE(m.first_name || ' ' || COALESCE(m.last_name, ''), m.username) as manager_name,
        COUNT(*) as late_count,
        ROUND(AVG(EXTRACT(DAY FROM rt.completed_at::timestamp - rt.due_date::timestamp)))::int as avg_days_late,
        MAX(EXTRACT(DAY FROM rt.completed_at::timestamp - rt.due_date::timestamp))::int as worst_days_late,
        json_agg(json_build_object('id', rt.id, 'title', rt.title,
          'daysLate', EXTRACT(DAY FROM rt.completed_at::timestamp - rt.due_date::timestamp)::int
        ) ORDER BY EXTRACT(DAY FROM rt.completed_at::timestamp - rt.due_date::timestamp) DESC) as tasks
      FROM recurring_tasks rt
      LEFT JOIN users u ON rt.assigned_to = u.id
      LEFT JOIN users m ON u.reports_to = m.id
      WHERE rt.status = 'completed'
        AND rt.completed_at IS NOT NULL
        AND rt.due_date IS NOT NULL
        AND rt.completed_at::date > rt.due_date::date
        AND rt.completed_at::date >= CURRENT_DATE - ${days}::int
      GROUP BY rt.assigned_to, u.first_name, u.last_name, u.username, u.reports_to, m.first_name, m.last_name, m.username
      HAVING COUNT(*) >= 3
      ORDER BY late_count DESC
    `);
    return (rows.rows || []).map((r: any) => ({
      assigneeId: Number(r.assignee_id),
      assigneeName: r.assignee_name || 'Unknown',
      managerId: r.manager_id ? Number(r.manager_id) : null,
      managerName: r.manager_name || null,
      lateCount: Number(r.late_count || 0),
      avgDaysLate: Number(r.avg_days_late || 0),
      worstDaysLate: Number(r.worst_days_late || 0),
      tasks: Array.isArray(r.tasks) ? r.tasks.slice(0, 5) : [],
    }));
  }

  async getRecurringTaskBacklog(threshold: number = 5): Promise<Array<{
    assigneeId: number; assigneeName: string; managerId: number | null; managerName: string | null;
    pendingCount: number; oldestDays: number;
    tasks: Array<{ id: number; title: string; daysOverdue: number }>;
  }>> {
    const rows = await db.execute(sql`
      SELECT rt.assigned_to as assignee_id,
        COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.username, 'Unknown') as assignee_name,
        u.reports_to as manager_id,
        COALESCE(m.first_name || ' ' || COALESCE(m.last_name, ''), m.username) as manager_name,
        COUNT(*) as pending_count,
        MAX(EXTRACT(DAY FROM NOW() - rt.due_date::timestamp))::int as oldest_days,
        json_agg(json_build_object('id', rt.id, 'title', rt.title,
          'daysOverdue', GREATEST(EXTRACT(DAY FROM NOW() - rt.due_date::timestamp)::int, 0)
        ) ORDER BY rt.due_date ASC) as tasks
      FROM recurring_tasks rt
      LEFT JOIN users u ON rt.assigned_to = u.id
      LEFT JOIN users m ON u.reports_to = m.id
      WHERE rt.status = 'pending'
        AND rt.due_date IS NOT NULL
        AND rt.due_date::date < CURRENT_DATE
      GROUP BY rt.assigned_to, u.first_name, u.last_name, u.username, u.reports_to, m.first_name, m.last_name, m.username
      HAVING COUNT(*) >= ${threshold}
      ORDER BY pending_count DESC
    `);
    return (rows.rows || []).map((r: any) => ({
      assigneeId: Number(r.assignee_id),
      assigneeName: r.assignee_name || 'Unknown',
      managerId: r.manager_id ? Number(r.manager_id) : null,
      managerName: r.manager_name || null,
      pendingCount: Number(r.pending_count || 0),
      oldestDays: Number(r.oldest_days || 0),
      tasks: Array.isArray(r.tasks) ? r.tasks.slice(0, 10) : [],
    }));
  }

  async getZombieRecurringTasks(days: number = 30): Promise<Array<{
    id: number; title: string; assigneeId: number | null; assigneeName: string;
    managerId: number | null; managerName: string | null;
    daysPending: number; dueDate: string; category: string;
  }>> {
    const rows = await db.execute(sql`
      SELECT rt.id, rt.title, rt.assigned_to as assignee_id, rt.due_date, rt.category,
        COALESCE(u.first_name || ' ' || COALESCE(u.last_name, ''), u.username, 'Unknown') as assignee_name,
        u.reports_to as manager_id,
        COALESCE(m.first_name || ' ' || COALESCE(m.last_name, ''), m.username) as manager_name,
        EXTRACT(DAY FROM NOW() - rt.due_date::timestamp)::int as days_pending
      FROM recurring_tasks rt
      LEFT JOIN users u ON rt.assigned_to = u.id
      LEFT JOIN users m ON u.reports_to = m.id
      WHERE rt.status = 'pending'
        AND rt.due_date IS NOT NULL
        AND EXTRACT(DAY FROM NOW() - rt.due_date::timestamp) >= ${days}
      ORDER BY days_pending DESC
    `);
    return (rows.rows || []).map((r: any) => ({
      id: Number(r.id),
      title: r.title || '',
      assigneeId: r.assignee_id ? Number(r.assignee_id) : null,
      assigneeName: r.assignee_name || 'Unknown',
      managerId: r.manager_id ? Number(r.manager_id) : null,
      managerName: r.manager_name || null,
      daysPending: Number(r.days_pending || 0),
      dueDate: r.due_date || '',
      category: r.category || 'General',
    }));
  }
}

export const agentDataRepo = new AgentDataRepository();
