# Communications Agent — Complete Technical Review
**Date:** 14 March 2026  
**System:** THERMOPAC Quality Management System — Multi-Agent Intelligence Layer  
**Agent Key:** `communications`  
**Source File:** `server/agents/agents/communications.ts` (939 lines)

---

## 1. Agent Scope

The Communications Agent monitors **human activity and communication discipline** across 8 modules. All 8 are **currently implemented and producing findings from real data**.

| # | Module | Status | Findings Produced |
|---|--------|--------|-------------------|
| 1 | Tasks (non-finance) | ✅ Implemented | 7-tier escalation pipeline |
| 2 | Recurring Tasks | ✅ Implemented | Grouped by assignee |
| 3 | Emails (Gmail) | ✅ Implemented | Priority-based (P0–P3) |
| 4 | Attendance | ✅ Implemented | Per-employee with absent-without-leave |
| 5 | Daily Work Reports (DWAR) | ✅ Implemented | 3-tier escalation + content quality |
| 6 | Leave Requests | ✅ Implemented | Per-request: expired / escalation / reminder |
| 7 | Meetings & Commitments | ✅ Implemented | Individual tracking + no-linked-task gap |
| 8 | Internal Messages | ✅ Implemented | Aggregate unread count |

**Finance Exclusion:** All tasks with `category='Finance'` OR titles containing BRC/invoice/payment/remittance/outstanding are excluded — those belong to the Finance Control Agent.

**Planned but NOT implemented:** None of the 8 modules are stubs. All are fully operational with real data queries and finding generation.

---

## 2. Detection Logic — Module by Module

### Module 1: Tasks (Non-Finance) — 7-Tier Escalation Pipeline

The agent queries all overdue tasks with assignee/creator/manager names, filters out finance tasks, then classifies each into one of 7 tiers based on days overdue:

| Tier | Threshold | Severity | Grouping | Notify Targets |
|------|-----------|----------|----------|----------------|
| 1st Reminder | 1–6 days overdue | Low | Grouped by assignee | Assignee only |
| 2nd Reminder | 7–14 days overdue | Medium | Grouped by assignee | Assignee only |
| Strong Reminder | 15–29 days overdue | Medium | Per task | Assignee + Task Creator |
| Escalation L1 | 30–59 days overdue | High | Per task | Assignee + Creator + Creator's Manager |
| Escalation L2 | 60–89 days overdue | High | Per task | Assignee + Creator + Both Managers |
| Zombie-Risk | 90–179 days overdue | Critical | Per task | All + Management Review flag |
| Zombie Review | 180+ days overdue | Critical | Per task | All + Management Review + Closure recommendation |

**Additional task workflows:**
- **Completion Verification (Workflow 5):** When a task is marked completed within the last 24 hours, the agent notifies the task creator to verify the completed work meets requirements. Severity: Low. Finding type: `completion`.
- **Zero-Task Workload Alert (Workflow 6):** Employees with zero active tasks for 2+ days (who have a reporting manager) generate a `visibility` finding. Severity: Low. Notifies the manager.

### Module 2: Recurring Tasks

| Detection | Threshold | Severity | Grouping |
|-----------|-----------|----------|----------|
| Overdue recurring tasks | 7+ days overdue | Dynamic: Low (7–13d), Medium (14–29d), High (30+d) | Grouped by assignee |

Top 5 worst overdue tasks listed per assignee. Severity scales with the worst overdue task in the group.

### Module 3: Emails (Gmail)

| Detection | Threshold | Severity | Grouping |
|-----------|-----------|----------|----------|
| Critical emails unanswered | P0/P1 emails unanswered 24+ hours | Critical (P0) / High (P1) | Per email |
| Long-unanswered emails | Any priority, 72+ hours unanswered | Medium | Per email (excluding already-flagged critical) |

### Module 4: Attendance Monitoring

Three sub-detections from detailed 7-day attendance data:

| Sub-Detection | Threshold | Severity | Grouping |
|---------------|-----------|----------|----------|
| Absent without approved leave | Any absence day with no approved leave | Low (1 day), Medium (2 days), High (3+ days) | Per employee |
| Incomplete attendance (check-in, no check-out) | 3+ incomplete records in 7 days | Medium | Per employee |
| Incomplete attendance (minor) | 1–2 incomplete records | Low | Per employee |
| Missing attendance today | No record today + no approved leave (weekends excluded) | Low (<5), Medium (5+) | Aggregate |

**Escalation logic:** Absent-without-leave with 1 occurrence → notify employee only. 2+ occurrences → escalate to reporting manager. Incomplete attendance with 3+ records → escalate to manager.

### Module 5: DWAR Monitoring — 3-Tier Escalation

| Tier | Detection | Threshold | Severity | Notify |
|------|-----------|-----------|----------|--------|
| Escalation | Missing DWARs | 3+ missing in 7 working days | Medium (3–4), High (5+) | Employee + Manager |
| Warning | Consecutive missing | 2 consecutive missing (but <3 total) | Medium | Employee only |
| Reminder | Any missing | 1+ missing days | Low | Employee only |
| Content Quality | Empty/draft DWARs | Any DWAR with `status='draft'` or all 4 content fields blank | Low | Employee only |

**Consecutive gap tracking:** The query calculates consecutive missing work days (excluding weekends DOW 0,6). Consecutive gaps ≥2 trigger the Warning tier even if total missing is <3.

**Content quality check:** DWARs where `challenges`, `tomorrow_plans`, `issues_encountered`, and `support_required` are all empty/null AND status is 'draft' are flagged as incomplete content.

### Module 6: Leave Requests — Per-Request Tracking

| Detection | Condition | Severity | Notify |
|-----------|-----------|----------|--------|
| Expired (date passed) | Leave `start_date < CURRENT_DATE` AND status still 'pending' | High | Approving Manager |
| Escalation | Pending 7+ days, leave date not yet passed | High | Approving Manager |
| Reminder | Pending 3–6 days | Medium | Approving Manager |
| Under threshold | Pending 1–2 days | Counted but no finding created | — |

Each finding is **per individual leave request** (not grouped), with leave type, dates, total days, and manager identification.

### Module 7: Meetings & Commitments — Individual Tracking

| Detection | Threshold | Severity | Notify |
|-----------|-----------|----------|--------|
| Overdue 30+ days | `due_date` 30+ days past | High | Assignee + Manager (escalated) |
| Overdue 14–29 days | `due_date` 14–29 days past | Medium | Assignee only |
| Overdue 1–13 days | `due_date` 1–13 days past | Low | Assignee only |
| No linked task | Commitment has no matching `tasks.source_id` (integer join) | Low | Recommendation to create task |

Each commitment is tracked individually by `commitment.id`. Manager escalation triggers at 30+ days overdue.

### Module 8: Internal Messages

| Detection | Threshold | Severity | Grouping |
|-----------|-----------|----------|----------|
| Unread messages | 5+ messages unread for 48+ hours | Low (5–9), Medium (10–19), High (20+) | Single aggregate finding |

---

## 3. Agent Outputs

### Currently Active Outputs

| Output Type | Status | Count (Latest Run) | Notes |
|-------------|--------|-------------------|-------|
| **Findings** | ✅ Active | 58 total across all runs | Stored in `agent_findings` table |
| **Insights** | ✅ Active | 1 per run | "People Activity Summary" — comprehensive daily digest |
| **Recommendations** | ❌ Not implemented | 0 | Framework exists but no recommendation generation logic |
| **Notifications** | ❌ Not implemented | 0 | Finding descriptions say "→ Notify: [person]" but no actual notification is sent |
| **Escalations** | ⚠️ Recorded only | Embedded in findings | Escalation targets identified in findings but no automated escalation action |

### Daily Insight — "People Activity Summary"

One insight is generated per run. It is a structured text summary covering all 8 modules with exact counts:

```
=== PEOPLE ACTIVITY & COMMUNICATION DISCIPLINE ===
Date: Saturday, 14 March 2026

--- TASK ESCALATION PIPELINE (Non-Finance) ---
1st Reminder (1-6 days):   0 tasks
...
Zombie Review (180+d):     3 tasks
Total overdue:             4 tasks

--- ATTENDANCE ---
Missing attendance today: 0 employees
Incomplete records (7d): 40 records across 13 employees
Absent without leave (7d): 1 instances

--- DAILY WORK REPORTS ---
Missing DWARs this week: 16 employees
  - Escalated to manager (≥3 missing): 10
  - Warning (2 consecutive): 1
  - Reminder (1 missing): 5

--- LEAVE REQUESTS ---
Total pending: 3
  - Expired (date passed): 2
  - Escalation (>7 days): 1

--- MEETING COMMITMENTS ---
Total overdue: 2 across 2 people
  - Escalated to manager (>30d): 2

--- INTERNAL MESSAGES ---
Unread 48h+: 54
```

---

## 4. Automation Behavior

**The agent is currently OBSERVE-ONLY (Phase 1).**

| Capability | Status |
|------------|--------|
| Send notifications (email/in-app) | ❌ Not implemented |
| Create tasks automatically | ❌ Not implemented |
| Escalate issues (trigger actions) | ❌ Not implemented |
| Generate recommendations | ❌ Not implemented |
| Auto-reassign tasks | ❌ Not implemented |
| Generate reports for stakeholders | ❌ Not implemented |

**What it does today:**
1. Queries live data from 8 database modules
2. Applies rule-based thresholds
3. Writes findings to `agent_findings` table (with dedup)
4. Writes one insight to `agent_insights` table
5. Returns execution metadata (findings count, duration, queries run)

All "→ Notify: [person]" text in findings is **descriptive only** — it identifies who *should* be notified, but no actual notification is sent.

---

## 5. Execution Triggers

| Trigger Type | Status | How |
|-------------|--------|-----|
| **Manual trigger from dashboard** | ✅ Active | `POST /api/agents/communications/trigger` — button on Agent Dashboard |
| **Scheduled runs** | ❌ Not implemented | No cron job or interval timer configured |
| **Event-driven triggers** | ❌ Not implemented | `getSubscribedEvents()` returns event names but no event bus listener is active |

**Current execution:** The agent runs only when a superuser clicks "Trigger Agent" on the Agent Dashboard. Authentication required: session-based auth + superuser role.

**Route:** `POST /api/agents/:agentKey/trigger` → Orchestrator validates agent key, creates run record, calls `agent.execute()`, updates run record with results.

**Performance:** 12 database queries, ~3 seconds execution time on real data.

---

## 6. Database Views and Queries

### Reporting Views (PostgreSQL)

| View Name | Purpose | Used By |
|-----------|---------|---------|
| `vw_agent_overdue_tasks` | Overdue tasks with assignee/creator/manager names | Task escalation pipeline |
| `vw_agent_unanswered_emails` | Gmail messages without replies | Email monitoring |
| `vw_agent_overdue_work_orders` | Overdue work orders | Project Control Agent (not Communications) |
| `vw_agent_project_health` | Project status summary | Project Control Agent |
| `vw_agent_finance_kpis` | Finance KPIs | Finance Control Agent |

### Direct Queries in `agent-data-repo.ts`

| Method | Module | What It Queries |
|--------|--------|-----------------|
| `getOverdueTasksWithEscalation()` | Tasks | `vw_agent_overdue_tasks` — all overdue with escalation metadata |
| `getRecentlyCompletedTasks(days)` | Tasks | `tasks` where `completed_at` within N days |
| `getUsersWithNoActiveTasks(days)` | Tasks | Users with 0 open tasks for N+ days, with manager info |
| `getOverdueRecurringTasks(days)` | Recurring Tasks | `recurring_tasks` overdue by N+ days |
| `getUnansweredEmails(hours)` | Emails | `vw_agent_unanswered_emails` filtered by hours |
| `getEmailStats()` | Emails | Aggregate: total unread, high priority count (7 days) |
| `getDetailedAttendanceIssues(days)` | Attendance | Raw SQL: `attendance_records` — absent days, incomplete records, cross-ref with `leave_requests` for absent-without-leave |
| `getTodayMissingAttendance()` | Attendance | Raw SQL: active users with no attendance today (excludes weekends, excludes approved leave) |
| `getDetailedDWARGaps()` | DWAR | Raw SQL: `daily_work_reports` — missing days (excluding weekends), consecutive gaps, content quality check on 4 fields |
| `getDetailedPendingLeaveRequests()` | Leave Requests | Raw SQL: `leave_requests` where status='pending', includes `manager_id` join, `start_date < CURRENT_DATE` flag |
| `getDetailedMeetingCommitments()` | Commitments | Raw SQL: `meeting_commitments` with status='Pending' + overdue, left join on `tasks.source_id` (INTEGER) for `has_linked_task` |
| `getUnreadInternalMessages(hours)` | Messages | `internal_messages` unread for N+ hours |

---

## 7. Findings Structure

### Finding Types Used

| Finding Type | Count | Used For |
|-------------|-------|----------|
| `overdue` | 9 | Task tiers 1–3, recurring tasks, meeting commitments 1–29d |
| `escalation` | 19 | Task tiers 4–7, DWAR ≥3 missing, leave expired/7d+, commitment 30d+ |
| `anomaly` | 14 | Attendance (absent-without-leave, incomplete records) |
| `gap` | 11 | Emails, DWAR (warning/reminder/incomplete), leave 3d+, messages, today-missing |
| `completion` | 0* | Recently completed tasks (*none in current data window) |
| `visibility` | 5 | Zero-task workload alerts |

### Severity Rules

| Severity | Count | Triggers |
|----------|-------|----------|
| `critical` | 4 | Zombie-risk tasks (90+d), zombie review (180+d), P0 emails |
| `high` | 22 | Task escalation 30+d, DWAR 5+ missing, leave expired/7d+, commitment 30d+, absent-without-leave 3+ |
| `medium` | 10 | Task 7–15d, DWAR consecutive/3–4 missing, leave 3–6d, commitment 14–29d, absent-without-leave 2, incomplete attendance 3+ |
| `low` | 22 | Task 1–6d, DWAR 1 missing/content, commitment 1–13d, zero-task, messages, no-linked-task, absent-without-leave 1 |

### Fingerprint Logic

Each finding gets a unique fingerprint computed as:

```
SHA256( agentKey | findingType | relatedEntityType | relatedEntityId | dateBucket | title )
```

- `dateBucket` = `YYYY-MM-DD` (today's date)
- Output: First 40 characters of the hex digest
- Stored in `agent_findings.fingerprint` column

### Deduplication Behavior

Before inserting a finding, the system checks for an existing finding with the same fingerprint:

1. If found with status `snoozed` → check if snooze has expired. If still snoozed, skip (duplicate). If expired, create new.
2. If found with status `open`, `acknowledged`, or `in_progress` → skip (duplicate).
3. If found with status `dismissed` or `resolved` → **create new** (allows re-detection after resolution).
4. If not found → create new finding.

**Effect:** Running the agent multiple times on the same day produces 0 new findings (all suppressed as duplicates). The next day, new findings can be created for the same issues if they persist.

### Override System

Before creating any finding, the system checks `agent_entity_overrides` for a matching `relatedEntityType` + `relatedEntityId` with action `mute_findings`. If muted, the finding is silently skipped.

---

## 8. Current Limitations

### Not Yet Implemented

| Gap | Description |
|-----|-------------|
| **No automated notifications** | Findings describe who should be notified but no email/in-app notification is sent |
| **No scheduled runs** | Agent only runs on manual trigger — no cron/interval automation |
| **No recommendation generation** | Framework supports recommendations but the agent produces 0 |
| **No auto-actions** | No automated task creation, reassignment, or status changes |
| **No event-driven triggers** | Subscribed events defined but no event bus is actively listening |
| **No cross-day trend analysis** | Each run is independent — no week-over-week or trend comparison |
| **No DWAR content scoring** | Content quality check is binary (empty vs. non-empty) — no quality scoring |
| **No email response quality** | Only checks if replied, not response timeliness or quality |
| **No attendance pattern analysis** | Checks 7-day window only — no monthly pattern detection |
| **No leave balance awareness** | Checks pending requests but not remaining leave balance |
| **No meeting frequency monitoring** | Tracks commitments but not meeting attendance or cadence |

### Known Technical Constraints

| Constraint | Detail |
|------------|--------|
| Weekend handling | DOW 0 (Sunday), 6 (Saturday) excluded from attendance/DWAR — no holiday calendar |
| Task `source_id` type | INTEGER — meeting commitment join must use integer comparison, not text cast |
| Date columns | `tasks.created_at` and `completed_at` are TEXT — require `::timestamp` cast |
| Daily dedup window | Fingerprint uses daily date bucket — same finding cannot be updated within the day |
| Insight overwrites | Each run creates a new insight row — no consolidation of multi-run insights |

---

## 9. Example Outputs — Real Findings from Production Data

### Example 1: Zombie Task (Critical)
```
Title: ⚫ ZOMBIE TASK: "Prepare WPQR documents" — 245 days overdue — Immediate Review Required
Severity: critical
Type: escalation
Description:
  Task "Prepare WPQR documents" assigned to Sagar Mohite has been overdue for 245 days.
  Created by: Santosh Mane
  Category: General | Priority: Medium
  
  Escalation: Zombie Task Review (180+ days overdue)
  → Notify: Sagar Mohite (assignee)
  → Notify: Santosh Mane (task creator)
  → Notify: [Creator's Manager] (creator's manager)
  → Notify: [Assignee's Manager] (assignee's manager)
  → Flag for Management Review
  
  ZOMBIE TASK: Overdue for 180+ days. This task should be reviewed for immediate 
  closure or formal reassignment. Its continued open status distorts workload metrics 
  and overdue reporting.
  
  Recommended action: Close this task as "Not Applicable" or reassign with a new 
  due date.
```

### Example 2: DWAR Escalation to Manager (High)
```
Title: Karthik Shetty: 5 missing DWARs this week — Escalated to Manager
Severity: high
Type: escalation
Description:
  Karthik Shetty has not submitted daily work reports for 5 working days in the last 
  7 working days.
  3 consecutive missing DWARs detected.
  Missing dates: 2026-03-10, 2026-03-11, 2026-03-12, 2026-03-13, 2026-03-14

  → Notify: Karthik Shetty
  → Escalate to: [Reporting Manager] — ≥3 missing DWARs triggers manager escalation.

  Daily work reports are essential for productivity tracking, workload visibility, and 
  performance assessment.
```

### Example 3: Expired Leave Request (High)
```
Title: Leave request expired: Pravin Jadhav — Casual Leave (1/6/2026–1/6/2026) still pending
Severity: high
Type: escalation
Description:
  Pravin Jadhav's Casual Leave request for 1/6/2026 to 1/6/2026 is still in Pending 
  status, but the leave date has already passed.
  Pending for 67 days. Total days requested: 1

  → Notify: [Approving Manager] — this leave request requires immediate closure.

  Recommendation: Approve retroactively if leave was actually taken, or reject with 
  clarification. Leaving expired requests open distorts leave balance reports.
```

### Example 4: Meeting Commitment Escalation (High)
```
Title: Meeting commitment overdue 30+ days: "WPC PROGRESS" — Escalated to Manager
Severity: high
Type: escalation
Description:
  Commitment "WPC PROGRESS" from meeting "WPC PROGRESS MEETING" (7/24/2025) is 222 
  days overdue.
  Assigned to: Jawahar Bha | Due: 8/5/2025 | Priority: High

  → Notify: Jawahar Bha (assignee)
  → Escalate to: [Reporting Manager] — commitment overdue >30 days requires manager 
  intervention.

  Overdue meeting commitments indicate broken promises and may erode team trust.
```

### Example 5: Internal Messages Aggregate (High)
```
Title: 54 internal messages unread for 48+ hours
Severity: high
Type: gap
Description:
  54 internal messages have been unread for more than 48 hours.

  Unread internal messages may indicate communication breakdowns within the team. 
  Important updates, requests, or decisions could be missed.
```

---

## Summary Statistics (Latest Run — 14 March 2026)

| Metric | Value |
|--------|-------|
| Total findings (all runs, deduplicated) | 58 |
| Findings by type | overdue: 9, escalation: 19, anomaly: 14, gap: 11, visibility: 5 |
| Findings by severity | critical: 4, high: 22, medium: 10, low: 22 |
| Insights generated | 1 (daily summary) |
| Recommendations generated | 0 |
| Notifications sent | 0 |
| Automated actions taken | 0 |
| Database queries per run | 12 |
| Execution time | ~3 seconds |
| Trigger method | Manual only (dashboard button) |
| Dedup behavior | Fingerprint-based, daily bucket — re-runs on same day produce 0 new findings |

