# Non-System User Payroll Unification Plan
## THERMOPAC QMS — Bridging Non-System Users into the Unified Payroll Engine

**Date:** March 19, 2026  
**Version:** 2.0 (Updated with Expert Feedback)  
**Status:** Expert Reviewed  

---

## 1. Executive Summary

Currently, THERMOPAC's QMS has two separate payroll processing paths:

| Path | For | Attendance Source | Pay Calculation |
|------|-----|------------------|-----------------|
| **Payroll Run Engine** | System Users | Biometric/system punch-in | Automated (salary-based) |
| **Manual Salary Processing** | Non-System Users (6 users) | Admin enters Days Worked manually | Semi-automated (daily/hourly/piece rate) |

**Objective:** Unify Non-System Users into the same Payroll Run Engine by introducing a **calendar-based manual attendance marking** system. The Manual Salary tab will be retained **only for Overtime (OT) entry**, since Non-System Users do not have biometric/system-derived OT.

**Key Outcome:** One payroll engine, one set of statutory rules, one payslip format — the only difference is *how attendance is captured*.

---

## 2. Current System State

### 2.1 What Already Works Identically for Both User Types

| Module | System User | Non-System User | Status |
|--------|-------------|-----------------|--------|
| Leave Allocations | Assigned per leave type per year | Same | **Working** |
| Leave Requests & Approvals | Apply → Manager Approves | Same | **Working** |
| Leave Balance Tracking | Allocated − Used − Pending | Same | **Working** |
| Loan Applications | Apply → Approve → Schedule | Same | **Working** |
| Salary Advance | Apply → Approve | Same | **Working** |
| Loan/Advance EMI Deductions | Auto-deducted from salary | Same logic available | **Working** |
| Salary Configuration | Basic + HRA + Allowances | Same | **Working** |
| PF (Provident Fund) | 12% on basic (cap ₹15,000) | Same | **Working** |
| ESIC | 0.75% if gross ≤ ₹21,000 | Same | **Working** |
| Professional Tax | Slab-based | Same | **Working** |

### 2.2 What's Different Today

| Aspect | System User | Non-System User |
|--------|-------------|-----------------|
| **Attendance Input** | Biometric / GPS / IP-based punch | Admin manually enters "Days Worked" in a form field |
| **Working Days Derivation** | System counts punched-in days | Admin counts manually |
| **Overtime** | Auto-calculated from extra hours beyond threshold | Admin manually enters OT hours + rate in Manual Salary form |
| **Payroll Processing** | Payroll Run Engine (batch for all) | Manual Salary Processing (one-by-one) |
| **Payslip Format** | Standard payroll record | Separate manual salary record |
| **TDS** | Section 192 (salary slab-based) | Previously Section 194C (1%) — **now corrected to Section 192** |

### 2.3 Existing Infrastructure Available

| Component | Table / System | Key Fields |
|-----------|---------------|------------|
| **Workweek Policies** | `workweek_policies` | `working_days` (JSON array, e.g., `[1,2,3,4,5,6]`), `start_time`, `end_time`, `overtime_threshold_daily`, `overtime_rate_multiplier` |
| **Employee Workweek Assignments** | `employee_workweek_assignments` | Links employee → workweek policy (supports custom overrides) |
| **Company Holidays** | `company_holidays` | `name`, `date`, `is_optional` |
| **Attendance Records** | `attendance_records` | `user_id`, `date`, `status` (present/absent/partial/late), `working_hours`, `overtime_hours` |
| **Payroll Records** | `payroll_records` | `working_days`, `present_days`, `paid_days`, `lop_days`, `paid_leave_days`, `unpaid_leave_days`, `overtime_hours`, `overtime_pay` |
| **Leave Balances** | `leave_balances` | `user_id`, `leave_type_id`, `year`, `allocated_days`, `used_days`, `pending_days`, `carryover_days` |
| **Leave Requests** | `leave_requests` | `user_id`, `leave_type_id`, `start_date`, `end_date`, `status` (pending/approved/rejected) |

---

## 3. Expert Feedback — Resolved Items

The following items were raised during expert review and have been incorporated into this plan:

### 3.1 TDS Section — Corrected to Section 192

**Previous approach:** Non-System Users were taxed under Section 194C (contractor TDS at 1%).

**Expert ruling:** Since leaves, loans, advances, and payroll are managed identically to System Users, Non-System Users are employees — not contractors. TDS must follow **Section 192** (salary-based slab rates), the same as System Users.

**Impact:** After unification, the Payroll Run Engine applies Section 192 TDS to all users uniformly. No separate TDS logic required.

### 3.2 Leave Management — Confirmed Identical

**Expert confirmation:** Leave management is the same for both user types. No changes needed:
- Same leave types and allocation rules
- Same leave request → approval workflow
- Same balance tracking formula: Available = Allocated + Carryover − Used − Pending
- Same deduction priority during payroll

### 3.3 Approved Leave — No Conflict on Calendar

**Expert concern:** Could the calendar create double-deduction conflicts with already-approved leave?

**Resolution:** No conflict. The calendar respects approved leaves:

| Calendar Day State | What Happens |
|-------------------|-------------|
| Day has **approved leave** | Shown with distinct "On Leave" indicator (e.g., purple with leave type label "CL") — **not editable** by admin |
| Day has **pending leave** | Shown with "Pending Leave" indicator — **not editable** (must be approved/rejected first) |
| Day is a **working day** with no leave | Admin can click to mark Present / Half Day |
| Day is a **weekly/company holiday** | Locked / greyed out — not editable |

**Key guarantee:** The system will **never double-deduct**. If a leave request is approved and the balance already deducted, the calendar treats that day as accounted for. The admin cannot override an approved leave day to "Present" — they must first cancel the leave through the normal leave management workflow.

---

## 4. Proposed Solution: Calendar-Based Attendance for Non-System Users

### 4.1 Concept

A **monthly calendar view** where the admin marks attendance for Non-System Users. The calendar is smart — it pre-fills known information and the admin only needs to click to mark presence.

### 4.2 Calendar Behavior

```
┌────────────────────────────────────────────────────┐
│  March 2026 - Employee: Rajesh Kumar               │
│  Workweek Policy: Factory Production (Mon-Sat)     │
├────────────────────────────────────────────────────┤
│  Mon   Tue   Wed   Thu   Fri   Sat   Sun          │
│                                                    │
│                          1     2     3             │
│                          ✅    ✅    ██             │
│  4     5     6     7     8     9     10            │
│  ✅    ✅    ✅    ✅    ✅    ✅    ██             │
│  11    12    13    14    15    16    17            │
│  ✅    ✅    ✅    🟡    🟣CL  ✅    ██             │
│  18    19    20    21    22    23    24            │
│  🔴    ✅    ✅    ✅    ✅    ✅    ██             │
│  25    26    27    28    29    30    31            │
│  ✅    ✅    🏛️H   ✅    ✅    ✅    ██             │
│                                                    │
│  Legend:                                           │
│  ██ = Weekly Holiday (auto, locked)                │
│  🏛️H = Company Holiday (auto, locked)              │
│  🟣 = Approved Leave (auto, locked, shows type)    │
│  ✅ = Present (admin clicks)                       │
│  🟡 = Half Day (admin clicks)                      │
│  🔴 = Absent (derived — unmarked working days)     │
│                                                    │
│  Summary:                                          │
│  Total Calendar Days: 31                           │
│  Weekly Holidays: 4 (Sundays)                      │
│  Company Holidays: 1 (Holi)                        │
│  Approved Leave: 1 (CL)                            │
│  Net Working Days: 26                              │
│  Present: 23  |  Half Days: 1  |  Absent: 1       │
│  Effective Working: 23.5 days                      │
│  Leave Applied: 1 CL (already deducted)            │
│  LOP: 1 day                                        │
└────────────────────────────────────────────────────┘
```

### 4.3 Interaction Rules

| Calendar Element | State | Admin Can Edit? |
|-----------------|-------|-----------------|
| **Weekly Holidays** (from Workweek Policy) | Grey / disabled | No (locked) |
| **Company Holidays** (from `company_holidays`) | Locked with label | No (locked) |
| **Approved Leave Days** (from `leave_requests`) | Purple with leave type label | No (locked — cancel leave first via Leave Management) |
| **Pending Leave Days** (from `leave_requests`) | Orange with "Pending" label | No (approve/reject first via Leave Management) |
| **Working Days** | Default: unmarked | Yes — click to toggle: Present → Half Day → Clear |
| **Absent Days** | Derived automatically | No (auto-calculated from unmarked working days) |

### 4.4 Calendar Click Flow

```
Admin clicks a working day (no leave/holiday):
  Empty → ✅ Present → 🟡 Half Day → Empty (cycle)

Days with approved/pending leave:
  Not clickable — shown as locked with leave type indicator

On Save:
  1. All clicked days → INSERT into attendance_records with status
  2. Approved leave days → Already accounted for (no attendance record needed)
  3. Unmarked working days (no leave) → Absent / LOP
  4. Summary calculated and stored
```

### 4.5 Data Flow After Calendar Save

```
Calendar Attendance Saved
         │
         ▼
attendance_records populated
(status: present / absent / half_day, source: 'manual_calendar')
         │
         ▼
Payroll Run Engine picks up attendance
(same logic as System Users)
         │
         ├──► Working Days = from workweek policy − holidays
         ├──► Present Days = from attendance_records
         ├──► Half Days = counted as 0.5
         ├──► Approved Leave Days = from leave_requests (already deducted from balance)
         ├──► Absent Days = Working Days − Present − Half Days − Approved Leave
         ├──► LOP = Absent Days (no further leave deduction — leave already managed separately)
         ├──► Paid Days = Present + Half Days(0.5) + Paid Leave
         │
         ▼
Salary Calculated via existing engine
(Basic + HRA + Allowances prorated to Paid Days)
         │
         ▼
Statutory Deductions applied
(TDS Section 192, PF, ESIC, PT — same rules for all users)
         │
         ▼
Loan/Advance EMI deducted
(same priority and min take-home rules)
         │
         ▼
Payroll Record generated
(same table: payroll_records)
```

---

## 5. Overtime Handling

### 5.1 Why OT Stays Separate

Non-System Users don't have biometric time tracking, so the system cannot auto-calculate overtime hours. The admin needs to enter OT explicitly.

### 5.2 OT Entry via Manual Salary Tab (Simplified)

The existing Manual Salary tab will be repurposed to handle **OT-only entries** for Non-System Users whose attendance is managed via the calendar.

| Field | Source | Admin Input? |
|-------|--------|-------------|
| Employee | Select dropdown | Yes |
| Payroll Period | Select dropdown | Yes |
| OT Hours | Manual entry | Yes |
| OT Rate | Auto from salary config (Basic x 2.5 / 26 / 8) | No (read-only, overridable) |
| OT Multiplier | Default 1.5x from workweek policy | No (read-only, overridable) |
| **OT Amount** | OT Hours x OT Rate x Multiplier | No (calculated) |

### 5.3 OT Integration with Payroll

When the Payroll Run Engine processes a Non-System User:
1. Attendance data comes from calendar-marked `attendance_records`
2. OT data comes from the Manual Salary OT entry
3. Engine merges both into the payroll record:
   - `overtime_hours` and `overtime_pay` populated from OT entry
   - Added to `gross_pay` before statutory deductions

---

## 6. TDS — Unified Section 192 for All Users

### 6.1 Previous Approach (Retired)

Non-System Users were processed under Manual Salary with TDS Section 194C (flat 1% contractor rate). This is **no longer applicable** since these users are treated as employees with full HR management (leave, loans, attendance).

### 6.2 New Approach (Unified)

| TDS Aspect | System User | Non-System User | Same? |
|------------|-------------|-----------------|-------|
| Section | 192 | 192 | Yes |
| Tax Regime | Old/New (employee choice) | Old/New (employee choice) | Yes |
| Tax Declaration | Supported | Supported | Yes |
| Investment Proof Verification | Supported | Supported | Yes |
| Monthly TDS Calculation | Annualized projection method | Same | Yes |
| Surcharge & Cess | Applied as per slabs | Same | Yes |

**No separate TDS logic is required.** The Payroll Run Engine applies Section 192 uniformly to all users.

---

## 7. Implementation Phases

### Phase 1: Calendar-Based Attendance UI

**Scope:**
- New page/component: "Non-System User Attendance" under HR module
- Monthly calendar view per employee
- Pre-marks:
  - Weekly holidays (from assigned workweek policy) — locked, greyed out
  - Company holidays (from `company_holidays`) — locked with label
  - Approved leave days (from `leave_requests`) — locked with leave type indicator
  - Pending leave days — locked with "Pending" indicator
- Admin interaction: Click working days to toggle Present / Half Day
- Summary panel: Working days, Present, Half Days, Absent, Leave, LOP
- Save: Populates `attendance_records` table for the selected month
- Edit: Admin can re-open and modify before payroll is processed
- Bulk: "Mark All Working Days as Present" button for quick entry

**Data Source Mapping:**

| Calendar Data | Source |
|---------------|--------|
| Weekly Holidays | `workweek_policies.working_days` via `employee_workweek_assignments` |
| Company Holidays | `company_holidays` table (filtered by month) |
| Approved Leave | `leave_requests` table (status = 'approved', filtered by month) |
| Pending Leave | `leave_requests` table (status = 'pending', filtered by month) |
| Existing Attendance | `attendance_records` (if already marked for this month) |

**Prerequisite:**
Non-System Users must have a Workweek Policy assigned via `employee_workweek_assignments`.

### Phase 2: Payroll Engine Integration

**Scope:**
- Modify the Payroll Run Engine to include Non-System Users (currently filters to `system_user` only)
- Engine uses the same attendance → salary → deductions → net pay logic
- Add a flag or filter: "Include Non-System Users" toggle on Payroll Run screen
- Leave is already managed through Leave Management (approved leaves are pre-accounted)
- Absent days on calendar (without leave) = LOP directly
- Loan/Advance EMI: Already works — just needs Non-System Users included in the engine run
- TDS: Section 192 applied uniformly (remove any 194C logic for these users)

**Changes Required:**
- `salary-calculation-engine.ts`: Remove `user_type = 'system_user'` filter (or make configurable)
- TDS calculation: Ensure Section 192 is used for Non-System Users (not 194C)
- Attendance data retrieval: Already reads from `attendance_records` — no change needed
- Payroll record creation: Same table, same format

### Phase 3: Manual Salary Tab → OT-Only Mode

**Scope:**
- Simplify the Manual Salary Entry form for users whose attendance is calendar-managed
- Fields: Employee, Period, OT Hours, OT Rate (auto), OT Multiplier (auto), OT Amount (calculated)
- On payroll run, OT data is merged into the payroll record
- Historical Manual Salary records (before this change) remain accessible and valid

---

## 8. Comparison: Before vs After

### Before (Current)

```
System Users:
  Biometric Punch → Attendance Records → Payroll Engine (Sec 192) → Payroll Record → Payslip

Non-System Users:
  Admin enters Days+OT manually → Manual Salary Processing (Sec 194C) → Separate Record → Separate Payslip
```

### After (Proposed)

```
System Users:
  Biometric Punch → Attendance Records ──────────────┐
                                                      ▼
                                        Payroll Engine (Sec 192) → Payroll Record → Payslip

Non-System Users:
  Admin clicks Calendar → Attendance Records ─┐
  Admin enters OT (if any) ───────────────────┤
                                               ▼
                              Payroll Engine (Sec 192) → Payroll Record → Payslip
```

**Result:** Same engine, same TDS section, same records, same payslip — only the attendance input method differs.

---

## 9. Leave Integration — No Double Deduction

### 9.1 How Leave and Calendar Coexist

```
Leave Management (existing workflow):
  Employee applies → Manager approves → Balance deducted

Calendar Attendance (new workflow):
  Admin opens calendar → Approved leave days shown as locked
  → Admin marks remaining working days → Absent days (without leave) = LOP

These are two separate, non-overlapping processes:
  - Leave Management handles leave balance deduction
  - Calendar Attendance handles presence/absence tracking
  - Payroll Engine reads both and produces a unified record
```

### 9.2 Payroll Engine Logic

```
Step 1: Get attendance summary from calendar
  present_days = count(status = 'present')
  half_days = count(status = 'half_day')

Step 2: Get leave data from leave_requests
  approved_paid_leave = count(approved leaves where leave type is paid)
  approved_unpaid_leave = count(approved leaves where leave type is unpaid)

Step 3: Calculate working days from workweek policy
  net_working_days = working days in period − company holidays

Step 4: Calculate absent / LOP
  accounted_days = present_days + (half_days × 0.5) + approved_paid_leave + approved_unpaid_leave
  lop_days = net_working_days − accounted_days  (if positive)

Step 5: Calculate paid days
  paid_days = present_days + (half_days × 0.5) + approved_paid_leave

Step 6: Prorate salary
  payable = (base_salary / net_working_days) × paid_days
```

**Key:** Leave balance is deducted at the time of leave approval — not during payroll. The payroll engine only reads leave data, it does not modify leave balances.

---

## 10. Edge Cases & Rules

| Scenario | Handling |
|----------|----------|
| Admin forgets to mark attendance before payroll run | Payroll Engine blocks: "Attendance not submitted for [Employee] — please complete calendar first" |
| Admin marks attendance after payroll is already processed | Not allowed if payroll record exists for that period (locked) |
| Mid-month joining | Calendar shows only days from joining date onwards; earlier days are disabled |
| Mid-month exit | Calendar shows only days up to exit date; later days are disabled |
| Employee has no workweek policy assigned | Calendar page shows warning: "Assign a Workweek Policy first" |
| Optional holiday — employee worked | Admin marks as Present (optional holidays are not locked) |
| Employee has approved leave on a day | Day shown as "On Leave (CL)" — locked, not editable; admin must cancel leave via Leave Management first |
| Employee has pending leave on a day | Day shown as "Pending Leave" — locked; must be approved/rejected first |
| Employee takes leave but didn't apply in system | Admin leaves the day unmarked → becomes LOP; employee should apply for leave retroactively |
| Payroll already transferred to SAP | Attendance locked for that period (same as current behavior) |
| Leave approved after calendar already saved | Calendar should be re-opened to reflect the newly approved leave; payroll must not be processed until reconciled |

---

## 11. Database Changes

**No new tables required.** All data fits into existing tables:

| Table | Usage | Changes |
|-------|-------|---------|
| `attendance_records` | Stores calendar-marked attendance | Add `source` field: `'biometric'` / `'manual_calendar'` to distinguish input method |
| `payroll_records` | Stores payroll output | No change — same fields used |
| `employee_workweek_assignments` | Links employee to workweek policy | No change — already exists |
| `company_holidays` | Holiday calendar | No change — already exists |
| `leave_balances` | Leave tracking | No change — already used |
| `leave_requests` | Leave approval tracking | No change — calendar reads this data |
| `manual_salary_records` | OT-only entries going forward | Add `entry_purpose` field: `'full_salary'` / `'ot_only'` to distinguish |

**One new field on `attendance_records`:**
```sql
ALTER TABLE attendance_records ADD COLUMN source VARCHAR(30) DEFAULT 'biometric';
-- Values: 'biometric', 'manual_calendar'
```

**One new field on `manual_salary_records`:**
```sql
ALTER TABLE manual_salary_records ADD COLUMN entry_purpose VARCHAR(30) DEFAULT 'full_salary';
-- Values: 'full_salary', 'ot_only'
```

---

## 12. Security & Authorization

| Action | Allowed Roles |
|--------|--------------|
| Mark attendance via calendar | Superuser, Admin, HR Manager |
| View calendar (read-only) | All managers + the employee themselves |
| Enter OT via Manual Salary | Superuser, Admin, HR Manager, Finance Manager |
| Run Payroll (including Non-System) | Superuser, Admin, HR Manager, Finance Manager |

---

## 13. UI/UX Summary

### Calendar Attendance Page
- **Location:** HR Management → Attendance → Non-System User Attendance (new tab or link)
- **Layout:** Employee selector at top → Monthly calendar grid below → Summary panel at bottom
- **Bulk Mode:** "Mark All Working Days as Present" button for quick entry
- **Visual:** Color-coded cells matching existing THERMOPAC design:
  - Blue = Present
  - Yellow = Half Day
  - Grey = Weekly Holiday
  - Red = Absent / LOP
  - Purple = Approved Leave (with leave type label)
  - Orange = Pending Leave

### Payroll Run Screen
- **Change:** Add toggle or automatic inclusion of Non-System Users
- **Validation:** Warning if attendance not yet submitted for any Non-System User in the period

### Manual Salary Tab
- **Change:** Simplified OT-only form when attendance is calendar-managed
- **Legacy:** Existing full manual salary entries remain viewable and valid

---

## 14. Summary of Changes

| # | Change | Effort | Risk |
|---|--------|--------|------|
| 1 | Calendar-based attendance UI for Non-System Users | Medium | Low |
| 2 | Payroll Engine — include Non-System Users | Low | Low (same logic, just remove filter) |
| 3 | TDS Section 192 applied uniformly (remove 194C for Non-System) | Low | None |
| 4 | Loan/Advance EMI inclusion for Non-System Users | Low | Low (already works, just include in run) |
| 5 | Calendar respects approved/pending leave (no double deduction) | Low | None |
| 6 | Manual Salary tab → OT-only mode | Low | Low |
| 7 | `attendance_records.source` field | Minimal | None |
| 8 | Validation: block payroll if attendance not marked | Low | None |

**Total Estimated Effort:** Medium  
**Risk Level:** Low — leverages existing infrastructure, no architectural changes

---

## 15. Remaining Open Questions

1. **Leave Priority Order:** Is Casual Leave → Sick Leave → Earned Leave the correct deduction order for LOP scenarios (where employee is absent without applying leave), or should this be configurable?
2. **Half Day Pay:** Should half days count as exactly 0.5 days for pay calculation, or is there a different fraction used?
3. **OT Integration:** Should OT amount be added to gross pay before or after statutory deduction calculations? (Current assumption: added to gross before deductions.)
4. **Calendar Lock Date:** Should there be a cutoff date after which attendance can no longer be modified for a period? (Recommended: lock when payroll status moves to "Verified" or beyond.)
5. **Retrospective Application:** Should calendar attendance be required for past periods, or only from the go-live date forward?
