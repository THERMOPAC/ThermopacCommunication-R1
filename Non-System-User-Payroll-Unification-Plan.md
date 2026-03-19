# Non-System User Payroll Unification Plan
## THERMOPAC QMS — Bridging Non-System Users into the Unified Payroll Engine

**Date:** March 19, 2026  
**Version:** 1.0  
**Status:** For Expert Review  

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
| TDS (Income Tax) | Section 192 | Section 194C (1%) | **Working** |
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

### 2.3 Existing Infrastructure Available

| Component | Table / System | Key Fields |
|-----------|---------------|------------|
| **Workweek Policies** | `workweek_policies` | `working_days` (JSON array, e.g., `[1,2,3,4,5,6]`), `start_time`, `end_time`, `overtime_threshold_daily`, `overtime_rate_multiplier` |
| **Employee Workweek Assignments** | `employee_workweek_assignments` | Links employee → workweek policy (supports custom overrides) |
| **Company Holidays** | `company_holidays` | `name`, `date`, `is_optional` |
| **Attendance Records** | `attendance_records` | `user_id`, `date`, `status` (present/absent/partial/late), `working_hours`, `overtime_hours` |
| **Payroll Records** | `payroll_records` | `working_days`, `present_days`, `paid_days`, `lop_days`, `paid_leave_days`, `unpaid_leave_days`, `overtime_hours`, `overtime_pay` |
| **Leave Balances** | `leave_balances` | `user_id`, `leave_type_id`, `year`, `allocated_days`, `used_days`, `pending_days`, `carryover_days` |

---

## 3. Proposed Solution: Calendar-Based Attendance for Non-System Users

### 3.1 Concept

A **monthly calendar view** where the admin marks attendance for Non-System Users. The calendar is smart — it pre-fills known information and the admin only needs to click to mark presence.

### 3.2 Calendar Behavior

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
│  ✅    ✅    ✅    🟡    ✅    ✅    ██             │
│  18    19    20    21    22    23    24            │
│  🔴    ✅    ✅    ✅    ✅    ✅    ██             │
│  25    26    27    28    29    30    31            │
│  ✅    ✅    ✅    ✅    ✅    ✅    ██             │
│                                                    │
│  Legend:                                           │
│  ██ = Weekly Holiday (auto, locked)                │
│  🏛️ = Company Holiday (auto, locked)               │
│  ✅ = Present (admin clicks)                       │
│  🟡 = Half Day (admin clicks)                      │
│  🔴 = Absent (derived — unmarked working days)     │
│                                                    │
│  Summary:                                          │
│  Total Calendar Days: 31                           │
│  Weekly Holidays: 4 (Sundays)                      │
│  Company Holidays: 0                               │
│  Net Working Days: 27                              │
│  Present: 24  |  Half Days: 1  |  Absent: 2       │
│  Effective Working: 24.5 days                      │
│  Leave Applied: 1 CL  |  LOP: 1 day               │
└────────────────────────────────────────────────────┘
```

### 3.3 Interaction Rules

| Calendar Element | State | Admin Can Edit? |
|-----------------|-------|-----------------|
| **Weekly Holidays** (from Workweek Policy) | Grey / disabled | No (locked) |
| **Company Holidays** (from `company_holidays`) | Locked with label | No (locked) |
| **Working Days** | Default: unmarked | Yes — click to toggle: Present → Half Day → Clear |
| **Absent Days** | Derived automatically | No (auto-calculated from unmarked working days) |

### 3.4 Calendar Click Flow

```
Admin clicks a working day:
  Empty → ✅ Present → 🟡 Half Day → Empty (cycle)

On Save:
  1. All clicked days → INSERT into attendance_records with status
  2. Unmarked working days → Absent (system derives, no record needed OR insert as 'absent')
  3. Summary calculated and stored
```

### 3.5 Data Flow After Calendar Save

```
Calendar Attendance Saved
         │
         ▼
attendance_records populated
(status: present / absent / half_day)
         │
         ▼
Payroll Run Engine picks up attendance
(same logic as System Users)
         │
         ├──► Working Days = from workweek policy
         ├──► Present Days = from attendance_records
         ├──► Half Days = counted as 0.5
         ├──► Absent Days = Working Days − Present − Half Days
         ├──► Leave Deduction = min(Absent, Leave Balance)
         ├──► LOP = Absent − Leave Deduction
         ├──► Paid Days = Present + Half Days(0.5) + Paid Leave
         │
         ▼
Salary Calculated via existing engine
(Basic + HRA + Allowances prorated to Paid Days)
         │
         ▼
Statutory Deductions applied
(TDS, PF, ESIC, PT — same rules)
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

## 4. Overtime Handling

### 4.1 Why OT Stays Separate

Non-System Users don't have biometric time tracking, so the system cannot auto-calculate overtime hours. The admin needs to enter OT explicitly.

### 4.2 OT Entry via Manual Salary Tab (Simplified)

The existing Manual Salary tab will be repurposed to handle **OT-only entries** for Non-System Users whose attendance is managed via the calendar.

| Field | Source | Admin Input? |
|-------|--------|-------------|
| Employee | Select dropdown | Yes |
| Payroll Period | Select dropdown | Yes |
| OT Hours | Manual entry | Yes |
| OT Rate | Auto from salary config (Basic × 2.5 / 26 / 8) | No (read-only, overridable) |
| OT Multiplier | Default 1.5× from workweek policy | No (read-only, overridable) |
| **OT Amount** | OT Hours × OT Rate × Multiplier | No (calculated) |

### 4.3 OT Integration with Payroll

When the Payroll Run Engine processes a Non-System User:
1. Attendance data comes from calendar-marked attendance_records
2. OT data comes from the Manual Salary OT entry
3. Engine merges both into the payroll record:
   - `overtime_hours` and `overtime_pay` populated from OT entry
   - Added to `gross_pay` before deductions

---

## 5. Implementation Phases

### Phase 1: Calendar-Based Attendance UI

**Scope:**
- New page/component: "Non-System User Attendance" under HR module
- Monthly calendar view per employee
- Pre-marks: Weekly holidays (from assigned workweek policy), Company holidays
- Admin interaction: Click to mark Present / Half Day
- Summary panel: Working days, Present, Half Days, Absent, Leave available
- Save: Populates `attendance_records` table for the selected month
- Edit: Admin can re-open and modify before payroll is processed

**Data Source Mapping:**

| Calendar Data | Source |
|---------------|--------|
| Weekly Holidays | `workweek_policies.working_days` via `employee_workweek_assignments` |
| Company Holidays | `company_holidays` table (filtered by month) |
| Existing Attendance | `attendance_records` (if already marked) |

**Prerequisite:**  
Non-System Users must have a Workweek Policy assigned via `employee_workweek_assignments`.

### Phase 2: Payroll Engine Integration

**Scope:**
- Modify the Payroll Run Engine to include Non-System Users (currently filters to `system_user` only)
- Engine uses the same attendance → salary → deductions → net pay logic
- Add a flag or filter: "Include Non-System Users" toggle on Payroll Run screen
- Leave auto-deduction: When absent days are calculated, system checks leave balance and auto-deducts (Casual Leave first, then Earned Leave, then LOP)
- Loan/Advance EMI: Already works — just needs Non-System Users included in the engine run

**Changes Required:**
- `salary-calculation-engine.ts`: Remove `user_type = 'system_user'` filter (or make configurable)
- Attendance data retrieval: Already reads from `attendance_records` — no change needed
- Payroll record creation: Same table, same format

### Phase 3: Manual Salary Tab → OT-Only Mode

**Scope:**
- Simplify the Manual Salary Entry form for users whose attendance is calendar-managed
- Fields: Employee, Period, OT Hours, OT Rate (auto), OT Multiplier (auto), OT Amount (calculated)
- On payroll run, OT data is merged into the payroll record
- Historical Manual Salary records (before this change) remain accessible and valid

---

## 6. Comparison: Before vs After

### Before (Current)

```
System Users:
  Biometric Punch → Attendance Records → Payroll Engine → Payroll Record → Payslip

Non-System Users:
  Admin enters Days+OT manually → Manual Salary Processing → Separate Record → Separate Payslip
```

### After (Proposed)

```
System Users:
  Biometric Punch → Attendance Records → Payroll Engine → Payroll Record → Payslip

Non-System Users:
  Admin clicks Calendar → Attendance Records ─┐
  Admin enters OT (if any) ───────────────────┤
                                               ▼
                              Payroll Engine → Payroll Record → Payslip
```

**Result:** Same engine, same records, same payslip — only the input method differs.

---

## 7. Leave Deduction Logic

When the Payroll Engine processes a Non-System User:

```
Step 1: Calculate Absent Days
  absent_days = net_working_days - present_days - (half_days × 0.5)

Step 2: Check Leave Balance (ordered by priority)
  For each leave type (Casual Leave → Sick Leave → Earned Leave):
    deductible = min(remaining_absent, available_balance)
    deduct from leave_balances
    remaining_absent -= deductible

Step 3: Remaining Absent = LOP
  lop_days = remaining_absent

Step 4: Calculate Paid Days
  paid_days = present_days + (half_days × 0.5) + total_paid_leave_used
```

---

## 8. Edge Cases & Rules

| Scenario | Handling |
|----------|----------|
| Admin forgets to mark attendance before payroll run | Payroll Engine blocks: "Attendance not submitted for [Employee] — please complete calendar first" |
| Admin marks attendance after payroll is already processed | Not allowed if payroll record exists for that period (locked) |
| Mid-month joining | Calendar shows only days from joining date onwards; earlier days are disabled |
| Mid-month exit | Calendar shows only days up to exit date; later days are disabled |
| Employee has no workweek policy assigned | Calendar page shows warning: "Assign a Workweek Policy first" |
| Optional holiday — employee worked | Admin marks as Present (optional holidays are not locked) |
| Employee on approved leave (already in system) | Calendar shows approved leave days with a different indicator; admin can still override |
| Payroll already transferred to SAP | Attendance locked for that period (same as current behavior) |

---

## 9. Database Changes

**No new tables required.** All data fits into existing tables:

| Table | Usage | Changes |
|-------|-------|---------|
| `attendance_records` | Stores calendar-marked attendance | Add `source` field: `'biometric'` / `'manual_calendar'` to distinguish input method |
| `payroll_records` | Stores payroll output | No change — same fields used |
| `employee_workweek_assignments` | Links employee to workweek policy | No change — already exists |
| `company_holidays` | Holiday calendar | No change — already exists |
| `leave_balances` | Leave tracking | No change — already used |
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

## 10. Security & Authorization

| Action | Allowed Roles |
|--------|--------------|
| Mark attendance via calendar | Superuser, Admin, HR Manager |
| View calendar (read-only) | All managers + the employee themselves |
| Enter OT via Manual Salary | Superuser, Admin, HR Manager, Finance Manager |
| Run Payroll (including Non-System) | Superuser, Admin, HR Manager, Finance Manager |

---

## 11. UI/UX Summary

### Calendar Attendance Page
- **Location:** HR Management → Attendance → Non-System User Attendance (new tab or link)
- **Layout:** Employee selector at top → Monthly calendar grid below → Summary panel at bottom
- **Bulk Mode:** "Mark All Working Days as Present" button for quick entry
- **Visual:** Color-coded cells matching existing THERMOPAC design (blue=present, yellow=half day, grey=holiday, red=absent)

### Payroll Run Screen
- **Change:** Add toggle or automatic inclusion of Non-System Users
- **Validation:** Warning if attendance not yet submitted for any Non-System User in the period

### Manual Salary Tab
- **Change:** Simplified OT-only form when attendance is calendar-managed
- **Legacy:** Existing full manual salary entries remain viewable and valid

---

## 12. Summary of Changes

| # | Change | Effort | Risk |
|---|--------|--------|------|
| 1 | Calendar-based attendance UI for Non-System Users | Medium | Low |
| 2 | Payroll Engine — include Non-System Users | Low | Low (same logic, just remove filter) |
| 3 | Leave auto-deduction for Non-System Users | Low | Low (logic exists, just needs to run) |
| 4 | Loan/Advance EMI inclusion for Non-System Users | Low | Low (already works, just include in run) |
| 5 | Manual Salary tab → OT-only mode | Low | Low |
| 6 | `attendance_records.source` field | Minimal | None |
| 7 | Validation: block payroll if attendance not marked | Low | None |

**Total Estimated Effort:** Medium  
**Risk Level:** Low — leverages existing infrastructure, no architectural changes

---

## 13. Open Questions for Expert Review

1. **Leave Priority Order:** Is Casual Leave → Sick Leave → Earned Leave the correct deduction order, or should this be configurable?
2. **Half Day Pay:** Should half days count as exactly 0.5 days for pay calculation, or is there a different fraction used?
3. **OT Integration:** Should OT amount be added to gross pay before or after statutory deduction calculations? (Current assumption: added to gross before deductions.)
4. **Calendar Lock Date:** Should there be a cutoff date after which attendance can no longer be modified for a period? (Recommended: lock when payroll status moves to "Verified" or beyond.)
5. **TDS Rate:** Non-System Users currently use TDS Section 194C (1%). After unification with the Payroll Engine, should they switch to Section 192 (salary TDS with slab rates)? This depends on their employment classification.
6. **Retrospective Application:** Should calendar attendance be required for past periods, or only from the go-live date forward?
