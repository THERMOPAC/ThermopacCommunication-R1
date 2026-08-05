CREATE TYPE "public"."oi_audit_action" AS ENUM('created', 'status_changed', 'field_updated', 'severity_changed', 'assigned', 'escalated', 'comment_added', 'withdrawn', 'reopened', 'closed', 'verified', 'rca_created', 'rca_deleted', 'rca_reopened', 'five_why_updated', 'fishbone_cause_added', 'fishbone_cause_updated', 'fishbone_cause_deleted', 'failure_tree_node_added', 'failure_tree_node_updated', 'failure_tree_node_deleted', 'rca_evidence_uploaded', 'rca_evidence_deleted', 'correlation_link_created', 'correlation_link_deleted', 'capa_created', 'capa_deleted', 'capa_cancelled', 'capa_reopened', 'capa_action_added', 'capa_action_updated', 'capa_action_completed', 'capa_action_cancelled', 'capa_action_verified', 'capa_action_verification_rejected', 'capa_effectiveness_recorded', 'capa_sla_breach', 'sop_created', 'sop_revised', 'sop_submitted_for_review', 'sop_approved', 'sop_rejected', 'sop_activated', 'sop_retired', 'sop_linked', 'sop_unlinked', 'sop_acknowledgment_assigned', 'sop_acknowledged', 'sop_acknowledgment_withdrawn', 'sop_effectiveness_recorded', 'suggestion_submitted', 'suggestion_reviewed', 'enforcement_control_created', 'enforcement_control_activated', 'enforcement_control_suspended', 'enforcement_control_retired', 'enforcement_hold_raised', 'enforcement_hold_approved_to_proceed', 'enforcement_hold_released', 'enforcement_hold_overridden', 'enforcement_checklist_item_checked', 'enforcement_checklist_item_rejected', 'enforcement_hold_emergency_bypassed', 'enforcement_checklist_item_resubmitted', 'lesson_created', 'lesson_submitted_for_review', 'lesson_reviewer_assigned', 'lesson_reviewer_voted', 'lesson_review_recused', 'lesson_approved', 'lesson_rejected', 'lesson_published', 'lesson_archived', 'lesson_revised', 'lesson_linked', 'lesson_unlinked', 'lesson_recurrence_recorded', 'lesson_effectiveness_reviewed', 'lesson_cross_project_approved', 'lesson_acknowledgment_required', 'lesson_acknowledged');--> statement-breakpoint
CREATE TYPE "public"."oi_category" AS ENUM('QC', 'DWG', 'PROC', 'MFG', 'SITE', 'COMM', 'LOG', 'DOC', 'SAP', 'COMP', 'SAFETY', 'FIN', 'LEGAL', 'HR', 'CUST', 'SYS', 'INT', 'OTHER', 'PROJECT', 'MAINT', 'STORE', 'SALES', 'QA');--> statement-breakpoint
CREATE TYPE "public"."oi_criticality_level" AS ENUM('none', 'low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."oi_escalation_type" AS ENUM('s1_immediate', 'safety_escalation', 'statutory_escalation', 'financial_escalation', 'overdue_response', 'overdue_closure', 'severity_change', 'manual');--> statement-breakpoint
CREATE TYPE "public"."oi_impact_level" AS ENUM('negligible', 'minor', 'moderate', 'major', 'catastrophic');--> statement-breakpoint
CREATE TYPE "public"."oi_issue_status" AS ENUM('captured', 'classified', 'investigating', 'rca_draft', 'rca_review', 'rca_approved', 'capa_open', 'capa_in_progress', 'capa_verified', 'sop_review', 'erp_enforcement', 'verified', 'closed', 'reopened', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."oi_probability_level" AS ENUM('very_low', 'low', 'medium', 'high', 'very_high');--> statement-breakpoint
CREATE TYPE "public"."oi_project_phase" AS ENUM('SALES', 'ENG', 'DVS', 'PROC', 'MFG', 'QC', 'FAT', 'DISP', 'LOG', 'SITE', 'ERECT', 'SAT', 'COMM', 'PERF', 'WARR', 'AFTS');--> statement-breakpoint
CREATE TYPE "public"."oi_risk_rating" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."oi_severity" AS ENUM('S1', 'S2', 'S3', 'S4');--> statement-breakpoint
CREATE TABLE "achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"category" text NOT NULL,
	"icon" text NOT NULL,
	"threshold" integer NOT NULL,
	"points" integer NOT NULL,
	"created_at" text NOT NULL,
	CONSTRAINT "achievements_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "advance_tax_calculations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"company_name" text DEFAULT 'TPEL' NOT NULL,
	"financial_year" text NOT NULL,
	"annual_taxable_income" numeric(15, 2) NOT NULL,
	"tax_rate" numeric(5, 2) NOT NULL,
	"surcharge_rate" numeric(5, 2) NOT NULL,
	"cess_rate" numeric(5, 2) NOT NULL,
	"base_tax" numeric(15, 2) NOT NULL,
	"surcharge_amount" numeric(15, 2) NOT NULL,
	"cess_amount" numeric(15, 2) NOT NULL,
	"total_tax_liability" numeric(15, 2) NOT NULL,
	"paid_june" numeric(15, 2) DEFAULT '0' NOT NULL,
	"paid_september" numeric(15, 2) DEFAULT '0' NOT NULL,
	"paid_december" numeric(15, 2) DEFAULT '0' NOT NULL,
	"paid_march" numeric(15, 2) DEFAULT '0' NOT NULL,
	"tds_q1" numeric(15, 2) DEFAULT '0' NOT NULL,
	"tds_q2" numeric(15, 2) DEFAULT '0' NOT NULL,
	"tds_q3" numeric(15, 2) DEFAULT '0' NOT NULL,
	"tds_q4" numeric(15, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"notes" text,
	"estimation_data" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_payment_date" date
);
--> statement-breakpoint
CREATE TABLE "advance_tax_payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"calculation_id" integer NOT NULL,
	"quarter" text NOT NULL,
	"due_date" date NOT NULL,
	"amount_due" numeric(15, 2) NOT NULL,
	"amount_paid" numeric(15, 2) DEFAULT '0' NOT NULL,
	"payment_date" date,
	"payment_method" text,
	"reference_number" text,
	"bank_name" text,
	"interest_applicable" boolean DEFAULT false,
	"interest_amount" numeric(15, 2) DEFAULT '0',
	"payment_status" text DEFAULT 'pending' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"recommendation_id" integer NOT NULL,
	"agent_key" text NOT NULL,
	"action_category" text NOT NULL,
	"action_type" text NOT NULL,
	"action_payload" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"execution_status" text DEFAULT 'pending' NOT NULL,
	"result_message" text,
	"result_data" jsonb,
	"executed_at" timestamp,
	"retry_count" integer DEFAULT 0,
	"max_retries" integer DEFAULT 3,
	"next_retry_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	CONSTRAINT "agent_actions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "agent_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_key" text,
	"event_type" text NOT NULL,
	"actor_type" text NOT NULL,
	"actor_id" text,
	"entity_type" text,
	"entity_id" text,
	"company_name" text,
	"details" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_entity_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"override_type" text NOT NULL,
	"reason" text,
	"created_by" integer NOT NULL,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_findings" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"agent_key" text NOT NULL,
	"fingerprint" text NOT NULL,
	"finding_type" text NOT NULL,
	"severity" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"logic_type" text DEFAULT 'rule_based' NOT NULL,
	"data_snapshot" jsonb,
	"related_entity_type" text,
	"related_entity_id" text,
	"company_name" text,
	"location" text,
	"status" text DEFAULT 'open' NOT NULL,
	"assigned_to" integer,
	"assigned_by" integer,
	"assigned_at" timestamp,
	"snoozed_until" timestamp,
	"muted_reason" text,
	"dismissed_by" integer,
	"dismissed_reason" text,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "agent_findings_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "agent_insights" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" integer NOT NULL,
	"agent_key" text NOT NULL,
	"finding_ids" integer[],
	"insight_type" text NOT NULL,
	"title" text NOT NULL,
	"content" text NOT NULL,
	"logic_type" text DEFAULT 'llm_generated' NOT NULL,
	"data_sources" text[],
	"company_name" text,
	"scope_period" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_key" text NOT NULL,
	"action_category" text NOT NULL,
	"action_type" text NOT NULL,
	"approval_mode" text DEFAULT 'require_approval' NOT NULL,
	"allowed_approver_roles" text[] DEFAULT '{"Superuser"}',
	"max_actions_per_day" integer DEFAULT 50,
	"cooldown_minutes" integer DEFAULT 30,
	"is_enabled" boolean DEFAULT true,
	"company_scope" text DEFAULT 'ALL',
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"finding_id" integer,
	"insight_id" integer,
	"agent_key" text NOT NULL,
	"action_category" text NOT NULL,
	"action_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"action_payload" jsonb NOT NULL,
	"logic_type" text NOT NULL,
	"confidence" numeric(3, 2),
	"priority" text DEFAULT 'normal',
	"company_name" text,
	"status" text DEFAULT 'pending_review' NOT NULL,
	"requires_approval" boolean DEFAULT true NOT NULL,
	"assigned_to" integer,
	"approved_by" integer,
	"approved_at" timestamp,
	"rejection_reason" text,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_key" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"is_enabled" boolean DEFAULT true,
	"is_suspended" boolean DEFAULT false,
	"suspended_by" integer,
	"suspended_reason" text,
	"suspended_at" timestamp,
	"default_schedule" text,
	"config" jsonb DEFAULT '{}'::jsonb,
	"scoping_rules" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "agent_registry_agent_key_unique" UNIQUE("agent_key")
);
--> statement-breakpoint
CREATE TABLE "agent_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_key" text NOT NULL,
	"trigger_type" text NOT NULL,
	"trigger_detail" text,
	"company_scope" text,
	"location_scope" text,
	"status" text DEFAULT 'running' NOT NULL,
	"started_at" timestamp DEFAULT now(),
	"completed_at" timestamp,
	"findings_count" integer DEFAULT 0,
	"insights_count" integer DEFAULT 0,
	"recommendations_count" integer DEFAULT 0,
	"error_message" text,
	"execution_metadata" jsonb DEFAULT '{}'::jsonb
);
--> statement-breakpoint
CREATE TABLE "agent_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"agent_key" text,
	"severity_filter" text[] DEFAULT '{"critical","high"}',
	"finding_types" text[],
	"channel" text DEFAULT 'dashboard' NOT NULL,
	"is_active" boolean DEFAULT true,
	"company_scope" text DEFAULT 'ALL',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "agent_usage_daily_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"log_date" timestamp with time zone NOT NULL,
	"estimated_units" numeric(10, 2) DEFAULT '0' NOT NULL,
	"estimated_cost" numeric(10, 2) DEFAULT '0' NOT NULL,
	"cumulative_total" numeric(10, 2) DEFAULT '0' NOT NULL,
	"notes" text,
	"logged_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agent_usage_limits" (
	"id" serial PRIMARY KEY NOT NULL,
	"monthly_limit_units" numeric(10, 2) DEFAULT '500' NOT NULL,
	"daily_limit_units" numeric(10, 2) DEFAULT '50' NOT NULL,
	"soft_block_enabled" boolean DEFAULT true NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agreement_amendments" (
	"id" serial PRIMARY KEY NOT NULL,
	"agreement_type" varchar(50) NOT NULL,
	"agreement_id" integer NOT NULL,
	"amendment_number" varchar(255) NOT NULL,
	"amendment_date" date NOT NULL,
	"amendment_type" varchar(100) NOT NULL,
	"previous_terms" text,
	"new_terms" text,
	"changes_summary" text NOT NULL,
	"reason_for_change" text,
	"effective_date" date,
	"approval_required" boolean DEFAULT true,
	"approval_status" varchar(50) DEFAULT 'Pending',
	"approved_by" integer,
	"approval_date" date,
	"legal_review_required" boolean DEFAULT true,
	"legal_review_status" varchar(50) DEFAULT 'Pending',
	"legal_reviewer" integer,
	"legal_review_date" date,
	"legal_review_comments" text,
	"file_path" varchar(500),
	"file_url" varchar(500),
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "appraisal_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"appraisal_id" integer NOT NULL,
	"previous_status" varchar(30) NOT NULL,
	"new_status" varchar(30) NOT NULL,
	"performed_by" integer NOT NULL,
	"performed_by_name" varchar(200) NOT NULL,
	"remarks" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appraisal_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" varchar(50) NOT NULL,
	"entity_id" integer NOT NULL,
	"action" varchar(100) NOT NULL,
	"performed_by" integer,
	"performed_by_name" varchar(200),
	"performed_by_system" boolean DEFAULT false,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appraisal_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"appraisal_id" integer NOT NULL,
	"section" varchar(50) NOT NULL,
	"comment_by" integer NOT NULL,
	"comment_by_name" varchar(200) NOT NULL,
	"comment_by_role" varchar(50) NOT NULL,
	"comment" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appraisal_cycle_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"cycle_type" varchar(50) NOT NULL,
	"trigger_month" integer NOT NULL,
	"trigger_day" integer NOT NULL,
	"self_deadline_days" integer DEFAULT 30 NOT NULL,
	"manager_deadline_days" integer DEFAULT 45 NOT NULL,
	"l2_deadline_days" integer DEFAULT 60 NOT NULL,
	"approval_deadline_days" integer DEFAULT 75 NOT NULL,
	"closure_buffer_days" integer DEFAULT 15 NOT NULL,
	"min_service_days" integer DEFAULT 90 NOT NULL,
	"auto_create" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appraisal_cycles" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer,
	"name" varchar(300) NOT NULL,
	"cycle_type" varchar(50) NOT NULL,
	"financial_year" varchar(20) NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"start_date" date NOT NULL,
	"self_assessment_deadline" date NOT NULL,
	"manager_review_deadline" date NOT NULL,
	"l2_review_deadline" date NOT NULL,
	"approval_deadline" date NOT NULL,
	"closure_date" date NOT NULL,
	"total_appraisals" integer DEFAULT 0,
	"completed_appraisals" integer DEFAULT 0,
	"created_by" integer,
	"is_auto_generated" boolean DEFAULT false,
	"paused_at" timestamp,
	"paused_by" integer,
	"pause_reason" text,
	"previous_status_before_pause" varchar(30),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appraisal_designation_progression" (
	"id" serial PRIMARY KEY NOT NULL,
	"current_designation" varchar(200) NOT NULL,
	"next_designation" varchar(200) NOT NULL,
	"minimum_tenure_months" integer DEFAULT 12,
	"minimum_rating" varchar(30),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appraisal_increment_policy" (
	"id" serial PRIMARY KEY NOT NULL,
	"rating_band" varchar(30) NOT NULL,
	"min_score_range" numeric(3, 1) NOT NULL,
	"max_score_range" numeric(3, 1) NOT NULL,
	"increment_min_percent" numeric(5, 2) NOT NULL,
	"increment_max_percent" numeric(5, 2) NOT NULL,
	"promotion_suitability" varchar(10) DEFAULT 'Low' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appraisal_kpi_template_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"kpi_title" varchar(300) NOT NULL,
	"kpi_description" text,
	"default_weightage" numeric(5, 2) NOT NULL,
	"target_guidance" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "appraisal_kpi_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(300) NOT NULL,
	"department" varchar(100) NOT NULL,
	"hierarchy_level" varchar(10) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"description" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"attendance_record_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"issue_type" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"severity" varchar(20) DEFAULT 'medium' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" integer,
	"resolution_notes" text,
	"manager_notified" boolean DEFAULT false,
	"hr_notified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_location_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"attendance_record_id" integer,
	"attempt_type" varchar(20) NOT NULL,
	"policy_mode" varchar(20),
	"outcome" varchar(40) NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"gps_accuracy_meters" double precision,
	"distance_to_office_meters" double precision,
	"work_location_id" integer,
	"ip_address" varchar(45),
	"is_ip_verified" boolean DEFAULT false,
	"spoofing_flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"severity" varchar(20) DEFAULT 'info' NOT NULL,
	"archived_at" timestamp,
	"archive_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_override_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"record_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"date" text NOT NULL,
	"action" varchar(20) NOT NULL,
	"before_values" jsonb NOT NULL,
	"after_values" jsonb NOT NULL,
	"reason" text NOT NULL,
	"changed_by" integer NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL,
	"payroll_period_was_locked" boolean DEFAULT false,
	"requires_payroll_recalculation" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "attendance_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"work_location_id" integer,
	"date" date NOT NULL,
	"check_in_time" timestamp,
	"check_in_latitude" double precision,
	"check_in_longitude" double precision,
	"check_in_address" text,
	"check_in_ip_address" varchar(45),
	"check_in_device_info" jsonb,
	"check_out_time" timestamp,
	"check_out_latitude" double precision,
	"check_out_longitude" double precision,
	"check_out_address" text,
	"check_out_ip_address" varchar(45),
	"check_out_device_info" jsonb,
	"working_hours" numeric(5, 2),
	"net_working_hours" numeric(5, 2),
	"overtime_hours" numeric(5, 2) DEFAULT '0',
	"status" varchar(30) DEFAULT 'present' NOT NULL,
	"status_source" varchar(40),
	"is_location_verified" boolean DEFAULT false,
	"is_ip_verified" boolean DEFAULT false,
	"is_late_arrival" boolean DEFAULT false,
	"is_early_departure" boolean DEFAULT false,
	"minimum_daily_hours_used" numeric(4, 2),
	"half_day_minimum_hours_used" numeric(4, 2),
	"work_time_policy_used" varchar(20),
	"net_working_seconds_used" integer,
	"tolerance_applied" boolean DEFAULT false,
	"is_incomplete" boolean DEFAULT false,
	"incomplete_reason" text,
	"flagged_at" timestamp,
	"requires_approval" boolean DEFAULT false,
	"approved_by" integer,
	"approval_date" timestamp,
	"approval_notes" text,
	"admin_adjustment" jsonb,
	"adjusted_by" integer,
	"adjustment_reason" text,
	"adjustment_date" timestamp,
	"original_punch_data" jsonb,
	"source" varchar(30) DEFAULT 'biometric',
	"check_in_gps_accuracy_meters" double precision,
	"check_out_gps_accuracy_meters" double precision,
	"check_in_mode" varchar(20),
	"attendance_policy_mode" varchar(20),
	"employee_notes" text,
	"admin_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_regularizations" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"attendance_record_id" integer,
	"request_date" date NOT NULL,
	"request_type" varchar(30) NOT NULL,
	"corrected_check_in" timestamp,
	"corrected_check_out" timestamp,
	"reason" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"approver_id" integer,
	"approved_at" timestamp,
	"approver_remarks" text,
	"rejected_by" integer,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"business_scenario" varchar(40),
	"cl_credited" boolean DEFAULT false,
	"applied_to_attendance" boolean DEFAULT false,
	"original_data" jsonb,
	"audit_trail" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attendance_security_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"policy_name" varchar(50) NOT NULL,
	"apply_to_roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"policy_mode" varchar(20) DEFAULT 'advisory' NOT NULL,
	"require_gps" boolean DEFAULT false NOT NULL,
	"geofence_radius_override" integer,
	"max_gps_accuracy_meters" integer DEFAULT 100,
	"require_ip_verification" boolean DEFAULT false NOT NULL,
	"allow_remote_work" boolean DEFAULT true NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "attendance_security_policies_policy_name_unique" UNIQUE("policy_name")
);
--> statement-breakpoint
CREATE TABLE "attendance_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_location_id" integer,
	"standard_working_hours" numeric(3, 1) DEFAULT '8.0' NOT NULL,
	"overtime_threshold" numeric(3, 1) DEFAULT '8.0' NOT NULL,
	"earliest_check_in" varchar(8) DEFAULT '06:00:00' NOT NULL,
	"latest_check_out" varchar(8) DEFAULT '22:00:00' NOT NULL,
	"late_threshold_minutes" integer DEFAULT 15 NOT NULL,
	"lunch_break_duration_minutes" integer DEFAULT 60,
	"automatic_break_deduction" boolean DEFAULT true,
	"require_location_verification" boolean DEFAULT true,
	"require_ip_verification" boolean DEFAULT false,
	"allow_offline_check_in" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attribute_option_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"option_id" integer NOT NULL,
	"old_label" text NOT NULL,
	"new_label" text NOT NULL,
	"old_tag" text,
	"new_tag" text,
	"changed_by" integer,
	"changed_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "automation_pipeline_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"run_id" uuid NOT NULL,
	"project_id" integer NOT NULL,
	"status" varchar(30) DEFAULT 'running' NOT NULL,
	"current_phase" integer DEFAULT 1 NOT NULL,
	"current_step" varchar(100),
	"trigger_user_id" integer NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"heartbeat_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"failed_at" timestamp,
	"failure_step" varchar(100),
	"failure_message" text,
	"failure_entity_id" integer,
	"failure_entity_type" varchar(50),
	"step_results" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"parent_run_id" uuid,
	CONSTRAINT "automation_pipeline_runs_run_id_unique" UNIQUE("run_id")
);
--> statement-breakpoint
CREATE TABLE "bank_realization_certificates" (
	"id" serial PRIMARY KEY NOT NULL,
	"certificate_number" varchar(100) NOT NULL,
	"issue_date" date NOT NULL,
	"bank_name" varchar(100) NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"currency" varchar(3) NOT NULL,
	"related_invoice_id" integer,
	"document_path" varchar(255),
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bom_explosion_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"bom_header_id" integer NOT NULL,
	"bom_line_id" integer NOT NULL,
	"project_item_id" integer,
	"planning_record_id" integer,
	"component_item_id" integer NOT NULL,
	"classification_used" varchar(20),
	"quantity_computed" numeric(12, 2),
	"status" varchar(20) DEFAULT 'created' NOT NULL,
	"exploded_by" integer,
	"exploded_at" timestamp DEFAULT now() NOT NULL,
	"superseded_at" timestamp,
	"notes" text,
	"item_code" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bom_gating_bypass_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_type" varchar(10) NOT NULL,
	"document_id" integer NOT NULL,
	"document_number" varchar(100) NOT NULL,
	"project_id" integer NOT NULL,
	"project_item_id" integer NOT NULL,
	"reason" varchar(50) DEFAULT 'no_bom_exists' NOT NULL,
	"item_code" varchar(100),
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bonus_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_name" varchar(100) NOT NULL,
	"rule_type" varchar(30) NOT NULL,
	"min_threshold" numeric(5, 2) NOT NULL,
	"max_threshold" numeric(5, 2),
	"bonus_percentage" numeric(5, 2),
	"fixed_amount" numeric(10, 2),
	"is_percentage" boolean DEFAULT true,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "business_meetings" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"meeting_type" varchar(50) NOT NULL,
	"priority" varchar(20) DEFAULT 'Medium' NOT NULL,
	"meeting_date" date NOT NULL,
	"start_time" varchar(8) NOT NULL,
	"end_time" varchar(8) NOT NULL,
	"duration_minutes" integer,
	"timezone" varchar(50) DEFAULT 'Asia/Kolkata' NOT NULL,
	"location" text,
	"meeting_url" text,
	"meeting_room_id" integer,
	"organizer_id" integer NOT NULL,
	"attendee_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"external_attendees" jsonb DEFAULT '[]'::jsonb,
	"agenda" text,
	"agenda_items" jsonb DEFAULT '[]'::jsonb,
	"meeting_notes" text,
	"key_decisions" text,
	"next_steps" text,
	"status" varchar(20) DEFAULT 'Scheduled' NOT NULL,
	"completion_percentage" integer DEFAULT 0,
	"effectiveness_rating" integer,
	"attachments" jsonb DEFAULT '[]'::jsonb,
	"is_recurring" boolean DEFAULT false,
	"recurring_pattern" jsonb,
	"parent_meeting_id" integer,
	"linked_kpis" jsonb DEFAULT '[]'::jsonb,
	"kpi_weight" numeric(5, 2) DEFAULT '0',
	"google_event_id" text,
	"google_calendar_synced" boolean DEFAULT false,
	"google_event_link" text,
	"auto_create_calendar_event" boolean DEFAULT true,
	"google_meet_link" text,
	"google_meet_url" text,
	"google_meet_enabled" boolean DEFAULT true,
	"auto_create_google_meet" boolean DEFAULT true,
	"recording_url" text,
	"transcript_url" text,
	"ai_summary" text,
	"ai_action_items" jsonb DEFAULT '[]'::jsonb,
	"ai_key_points" jsonb DEFAULT '[]'::jsonb,
	"recording_enabled" boolean DEFAULT false,
	"ai_notes_generated" boolean DEFAULT false,
	"ai_notes_generated_at" timestamp,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "business_opportunities" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"opportunity_name" text NOT NULL,
	"description" text,
	"estimated_value" numeric(12, 2),
	"probability" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'New' NOT NULL,
	"expected_close_date" date,
	"actual_close_date" date,
	"outcome" text,
	"created_by" integer NOT NULL,
	"assigned_to" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "business_trips" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"trip_title" varchar(255) NOT NULL,
	"purpose" text NOT NULL,
	"destination" varchar(255) NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"estimated_travel_cost" numeric(10, 2) DEFAULT '0',
	"estimated_accommodation_cost" numeric(10, 2) DEFAULT '0',
	"estimated_misc_cost" numeric(10, 2) DEFAULT '0',
	"advance_requested" numeric(10, 2) DEFAULT '0',
	"supporting_document_url" text,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buy_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(40) NOT NULL,
	"label" varchar(100) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "buy_groups_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "buy_list_line_selections" (
	"id" serial PRIMARY KEY NOT NULL,
	"buy_list_line_id" integer NOT NULL,
	"master_item_id" integer NOT NULL,
	"item_code" varchar(100),
	"item_description" text,
	"item_specification" text,
	"drawing_number" varchar(100),
	"drawing_revision" varchar(20),
	"selected_by" integer NOT NULL,
	"selected_at" timestamp DEFAULT now() NOT NULL,
	"datasheet_required" boolean NOT NULL,
	"datasheet_uploaded" boolean DEFAULT false NOT NULL,
	"datasheet_gcs_bucket" varchar(100),
	"datasheet_gcs_object_path" varchar(500),
	"datasheet_original_filename" varchar(255),
	"datasheet_mime_type" varchar(100),
	"datasheet_file_size_bytes" bigint,
	"datasheet_checksum_sha256" varchar(64),
	"datasheet_revision_seq" integer DEFAULT 1 NOT NULL,
	"datasheet_uploaded_by" integer,
	"datasheet_uploaded_at" timestamp,
	"approval_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"rejection_reason" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "buy_list_line_selections_buy_list_line_id_unique" UNIQUE("buy_list_line_id")
);
--> statement-breakpoint
CREATE TABLE "buy_package_headers" (
	"id" serial PRIMARY KEY NOT NULL,
	"product_id" integer NOT NULL,
	"package_code" varchar(30) NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"version" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buy_package_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"line_uid" uuid DEFAULT gen_random_uuid() NOT NULL,
	"buy_package_header_id" integer NOT NULL,
	"line_number" integer NOT NULL,
	"buy_group_id" integer NOT NULL,
	"buy_subgroup_id" integer NOT NULL,
	"uom_id" integer NOT NULL,
	"generic_requirement" text NOT NULL,
	"default_quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"default_specification" text,
	"technical_attributes" jsonb,
	"selection_required" boolean DEFAULT true NOT NULL,
	"datasheet_required" boolean DEFAULT false NOT NULL,
	"inspection_required" boolean DEFAULT false NOT NULL,
	"certificate_required" boolean DEFAULT false NOT NULL,
	"compliance_required" boolean DEFAULT false NOT NULL,
	"notes" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"master_item_id" integer,
	"sap_item_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buy_subgroups" (
	"id" serial PRIMARY KEY NOT NULL,
	"buy_group_id" integer NOT NULL,
	"code" varchar(60) NOT NULL,
	"label" varchar(120) NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" integer NOT NULL,
	"channel_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"start_date" date,
	"end_date" date,
	"status" text NOT NULL,
	"budget" numeric(15, 2),
	"actual_cost" numeric(15, 2),
	"metrics" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "campaign_channels" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "campaign_channels_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "campaign_leads" (
	"campaign_id" integer NOT NULL,
	"lead_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_leads_campaign_id_lead_id_pk" PRIMARY KEY("campaign_id","lead_id")
);
--> statement-breakpoint
CREATE TABLE "change_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"ecr_id" integer,
	"ecn_id" integer,
	"document_type" text NOT NULL,
	"document_name" text NOT NULL,
	"document_path" text NOT NULL,
	"uploaded_by" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"storage_path" text,
	"storage_url" text,
	"storage_url_expiry" timestamp,
	"gcs_object_path" text,
	"checksum_sha256" text,
	"file_size" integer
);
--> statement-breakpoint
CREATE TABLE "checklist_executions" (
	"id" serial PRIMARY KEY NOT NULL,
	"checklist_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"project_code" text NOT NULL,
	"work_order_id" integer,
	"execution_date" timestamp NOT NULL,
	"executed_by" integer NOT NULL,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"overall_result" text,
	"comments" text,
	"batch_number" text,
	"reference_documents" text[],
	"verified_by" integer,
	"verified_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_item_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"execution_id" integer NOT NULL,
	"checklist_item_id" integer NOT NULL,
	"result" text NOT NULL,
	"measured_value" text,
	"observation" text,
	"evidence_file_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"checklist_id" integer NOT NULL,
	"sequence_number" integer NOT NULL,
	"description" text NOT NULL,
	"requirement" text NOT NULL,
	"acceptance_criteria" text NOT NULL,
	"inspection_method" text NOT NULL,
	"is_critical" boolean DEFAULT false NOT NULL,
	"requires_evidence" boolean DEFAULT false NOT NULL,
	"reference_document" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "commercial_change_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"change_order_number" varchar(30) NOT NULL,
	"sequence" integer NOT NULL,
	"original_offer_id" integer NOT NULL,
	"original_order_number" varchar(15) NOT NULL,
	"project_id" integer NOT NULL,
	"revised_offer_id" integer,
	"ecr_id" integer,
	"change_type" varchar(30) NOT NULL,
	"description" text NOT NULL,
	"change_value" numeric(15, 2) NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"requested_by" integer NOT NULL,
	"approved_by" integer,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"approved_at" timestamp with time zone,
	"notes" text,
	CONSTRAINT "commercial_change_orders_change_order_number_unique" UNIQUE("change_order_number")
);
--> statement-breakpoint
CREATE TABLE "company_addresses" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"address_type" varchar(30) NOT NULL,
	"address_line1" text,
	"address_line2" text,
	"city" varchar(60),
	"district" varchar(60),
	"state" varchar(60),
	"country" varchar(60) DEFAULT 'India' NOT NULL,
	"pin_code" varchar(10),
	"geo_lat" numeric(10, 6),
	"geo_lng" numeric(10, 6),
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_advance_tax" (
	"id" serial PRIMARY KEY NOT NULL,
	"tax_year_id" integer NOT NULL,
	"estimate_id" integer,
	"installment" varchar(5) NOT NULL,
	"due_date" timestamp NOT NULL,
	"cumulative_percent" numeric(5, 2),
	"estimated_liability" numeric(12, 2),
	"amount_due" numeric(12, 2),
	"amount_paid" numeric(12, 2) DEFAULT '0',
	"payment_date" timestamp,
	"challan_id" integer,
	"interest_234c" numeric(10, 2) DEFAULT '0',
	"interest_234b" numeric(10, 2) DEFAULT '0',
	"status" varchar(20) DEFAULT 'upcoming' NOT NULL,
	"remarks" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"action" varchar(40) NOT NULL,
	"table_name" varchar(60),
	"field_name" varchar(80),
	"old_value" text,
	"new_value" text,
	"changed_by" integer,
	"changed_at" timestamp DEFAULT now() NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "company_bank_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"bank_name" varchar(80) NOT NULL,
	"branch" varchar(80),
	"beneficiary_name" varchar(120) NOT NULL,
	"account_number" varchar(20) NOT NULL,
	"ifsc" varchar(11),
	"swift" varchar(11),
	"iban" varchar(34),
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_branding" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"default_letterhead" text,
	"footer_text" text,
	"terms_conditions" text,
	"rfq_footer" text,
	"offer_footer" text,
	"purchase_footer" text,
	"report_watermark" text,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_branding_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "company_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"doc_type" varchar(40) NOT NULL,
	"revision_number" integer DEFAULT 1 NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"gcs_path" text NOT NULL,
	"content_type" varchar(80),
	"size_bytes" integer,
	"status" varchar(20) DEFAULT 'uploaded' NOT NULL,
	"expiry_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"uploaded_by" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "company_erp_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"sap_company_db" varchar(60),
	"sap_branch_code" varchar(20),
	"default_warehouse" varchar(40),
	"default_cost_center" varchar(40),
	"default_payment_terms" varchar(80),
	"default_delivery_terms" varchar(80),
	"base_uom" varchar(20),
	"decimal_precision" integer DEFAULT 2 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_erp_config_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "company_holidays" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"date" date NOT NULL,
	"is_optional" boolean DEFAULT false,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "company_legal_tax" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer NOT NULL,
	"cin" varchar(21),
	"pan" varchar(10),
	"gstin" varchar(15),
	"iec_code" varchar(10),
	"iec_branch" varchar(40),
	"lut_number" varchar(40),
	"lut_validity_date" date,
	"lut_financial_year" varchar(10),
	"msme_udyam" varchar(20),
	"tan" varchar(10),
	"pf_number" varchar(20),
	"esi_number" varchar(17),
	"gst_registration_type" varchar(40),
	"gst_state_code" varchar(3),
	"export_without_gst" boolean DEFAULT false NOT NULL,
	"ad_code" varchar(14),
	"authorized_dealer_bank" varchar(80),
	"version" integer DEFAULT 1 NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_legal_tax_company_id_unique" UNIQUE("company_id")
);
--> statement-breakpoint
CREATE TABLE "company_master" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_code" varchar(10) NOT NULL,
	"short_name" varchar(30) NOT NULL,
	"legal_name" varchar(120) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"company_type" varchar(40),
	"industry" varchar(80),
	"fy_start_month" integer DEFAULT 4 NOT NULL,
	"base_currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"timezone" varchar(60) DEFAULT 'Asia/Kolkata' NOT NULL,
	"logo_gcs_path" text,
	"signature_gcs_path" text,
	"seal_gcs_path" text,
	"phone" varchar(60),
	"fax" varchar(60),
	"email" varchar(120),
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_master_company_code_unique" UNIQUE("company_code")
);
--> statement-breakpoint
CREATE TABLE "company_tax_challans" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer DEFAULT 1,
	"tax_year_id" integer NOT NULL,
	"challan_reference" varchar(50),
	"payment_type" varchar(30) NOT NULL,
	"challan_no" varchar(10) DEFAULT '280',
	"bsr_code" varchar(20),
	"cin_number" varchar(50),
	"tax_amount" numeric(12, 2) NOT NULL,
	"surcharge_amount" numeric(10, 2) DEFAULT '0',
	"cess_amount" numeric(10, 2) DEFAULT '0',
	"interest_amount" numeric(10, 2) DEFAULT '0',
	"penalty_amount" numeric(10, 2) DEFAULT '0',
	"total_amount" numeric(12, 2) NOT NULL,
	"advance_tax_id" integer,
	"payment_date" timestamp,
	"payment_mode" varchar(20),
	"payment_reference" varchar(100),
	"bank_name" varchar(100),
	"sap_je_reference" varchar(50),
	"sap_doc_entry" integer,
	"sap_je_number" varchar(50),
	"sap_bank_account_code" varchar(50),
	"sap_posting_status" varchar(20) DEFAULT 'draft',
	"sap_posting_error" text,
	"sap_posted_at" timestamp,
	"reversal_sap_doc_entry" integer,
	"reversal_sap_je_number" varchar(50),
	"reversal_sap_posted_at" timestamp,
	"reversed_by" integer,
	"reversed_at" timestamp,
	"gl_posting_id" integer,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "company_tax_challans_challan_reference_unique" UNIQUE("challan_reference")
);
--> statement-breakpoint
CREATE TABLE "company_tax_estimates" (
	"id" serial PRIMARY KEY NOT NULL,
	"tax_year_id" integer NOT NULL,
	"estimate_date" timestamp NOT NULL,
	"estimate_label" varchar(50),
	"gross_revenue" numeric(14, 2),
	"total_expenses" numeric(14, 2),
	"profit_before_tax" numeric(14, 2),
	"adjustments" numeric(14, 2) DEFAULT '0',
	"adjustment_details" jsonb,
	"taxable_income" numeric(14, 2),
	"tax_at_normal_rate" numeric(12, 2),
	"surcharge" numeric(10, 2) DEFAULT '0',
	"education_cess" numeric(10, 2) DEFAULT '0',
	"total_tax_liability" numeric(12, 2),
	"mat_applicable" boolean DEFAULT false,
	"mat_amount" numeric(12, 2),
	"effective_tax_payable" numeric(12, 2),
	"tds_receivable" numeric(12, 2) DEFAULT '0',
	"advance_tax_paid" numeric(12, 2) DEFAULT '0',
	"self_assessment_tax_paid" numeric(12, 2) DEFAULT '0',
	"net_tax_payable" numeric(12, 2),
	"is_latest" boolean DEFAULT false,
	"notes" text,
	"prepared_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_tax_notices" (
	"id" serial PRIMARY KEY NOT NULL,
	"tax_year_id" integer NOT NULL,
	"notice_type" varchar(30),
	"notice_date" timestamp,
	"due_date" timestamp,
	"demand_amount" numeric(12, 2),
	"status" varchar(20) DEFAULT 'received' NOT NULL,
	"remarks" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_tax_provisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"tax_year_id" integer NOT NULL,
	"provision_date" timestamp NOT NULL,
	"provision_period" varchar(30),
	"provision_type" varchar(20),
	"amount" numeric(12, 2) NOT NULL,
	"cumulative_provision" numeric(12, 2),
	"estimate_id" integer,
	"reversed_provision_id" integer,
	"adjustment_reference" varchar(100),
	"sap_je_reference" varchar(50),
	"sap_doc_entry" integer,
	"sap_je_number" varchar(50),
	"sap_posting_status" varchar(20) DEFAULT 'draft',
	"sap_posting_error" text,
	"sap_posted_at" timestamp,
	"reversal_sap_doc_entry" integer,
	"reversal_sap_je_number" varchar(50),
	"reversal_sap_posted_at" timestamp,
	"reversed_by" integer,
	"reversed_at" timestamp,
	"gl_posting_id" integer,
	"posting_status" varchar(20) DEFAULT 'draft' NOT NULL,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_tax_returns" (
	"id" serial PRIMARY KEY NOT NULL,
	"tax_year_id" integer NOT NULL,
	"return_type" varchar(20) NOT NULL,
	"form_type" varchar(10) DEFAULT 'ITR-6',
	"due_date" timestamp,
	"filing_date" timestamp,
	"acknowledgement_number" varchar(50),
	"total_income_reported" numeric(14, 2),
	"total_tax_payable" numeric(12, 2),
	"total_tax_paid" numeric(12, 2),
	"interest_234a" numeric(10, 2) DEFAULT '0',
	"interest_234b" numeric(10, 2) DEFAULT '0',
	"interest_234c" numeric(10, 2) DEFAULT '0',
	"total_interest" numeric(10, 2) DEFAULT '0',
	"refund_claimed" numeric(12, 2) DEFAULT '0',
	"refund_received" numeric(12, 2) DEFAULT '0',
	"refund_date" timestamp,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"remarks" text,
	"filed_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_tax_years" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer DEFAULT 1,
	"assessment_year" varchar(10) NOT NULL,
	"financial_year" varchar(10) NOT NULL,
	"company_pan" varchar(15),
	"tax_regime" varchar(20),
	"base_tax_rate" numeric(5, 2) NOT NULL,
	"surcharge_rate" numeric(5, 2) DEFAULT '0',
	"surcharge_policy" text,
	"cess_rate" numeric(5, 2) DEFAULT '4',
	"effective_rate" numeric(6, 3),
	"rate_override_notes" text,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"remarks" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_register" (
	"id" serial PRIMARY KEY NOT NULL,
	"compliance_type" varchar(100) NOT NULL,
	"regulation_name" varchar(255) NOT NULL,
	"applicable_section" varchar(255),
	"compliance_requirement" text NOT NULL,
	"frequency" varchar(50) NOT NULL,
	"due_date" date NOT NULL,
	"completion_date" date,
	"status" varchar(50) DEFAULT 'Pending' NOT NULL,
	"responsible_person" integer,
	"compliance_evidence" text,
	"file_path" varchar(500),
	"file_url" varchar(500),
	"penalty_amount" numeric(15, 2),
	"remarks" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "concluded_calendar_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"google_event_id" varchar(255) NOT NULL,
	"user_id" integer NOT NULL,
	"event_title" varchar(500),
	"concluded_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "concluded_calendar_events_google_event_id_unique" UNIQUE("google_event_id")
);
--> statement-breakpoint
CREATE TABLE "contract_deliveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"service_id" integer NOT NULL,
	"scheduled_date" date NOT NULL,
	"actual_date" date,
	"status" text DEFAULT 'Scheduled' NOT NULL,
	"notes" text,
	"performed_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_services" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_id" integer NOT NULL,
	"service_type" text NOT NULL,
	"frequency" text,
	"description" text,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"contract_number" varchar(255) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"contract_type" varchar(100) NOT NULL,
	"party_name" varchar(255) NOT NULL,
	"party_contact" varchar(255),
	"party_email" varchar(255),
	"start_date" date NOT NULL,
	"end_date" date,
	"renewal_date" date,
	"contract_value" numeric(15, 2),
	"currency" varchar(10) DEFAULT 'INR' NOT NULL,
	"status" varchar(50) DEFAULT 'Active' NOT NULL,
	"auto_renewal" boolean DEFAULT false NOT NULL,
	"notice_period_days" integer DEFAULT 30 NOT NULL,
	"file_path" varchar(500),
	"file_url" varchar(500),
	"created_by" integer NOT NULL,
	"assigned_to" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_contract_number_unique" UNIQUE("contract_number")
);
--> statement-breakpoint
CREATE TABLE "crew_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"role_types" text[] DEFAULT '{}' NOT NULL,
	"employee_code" varchar(50),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_followups" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"followup_type" text NOT NULL,
	"subject" text NOT NULL,
	"description" text,
	"scheduled_date" date NOT NULL,
	"completed_date" date,
	"outcome" text,
	"status" text DEFAULT 'Scheduled' NOT NULL,
	"created_by" integer NOT NULL,
	"assigned_to" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_order_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"cco_id" integer,
	"project_id" integer NOT NULL,
	"customer_order_number" text NOT NULL,
	"document_label" text NOT NULL,
	"revision_code" text,
	"attachment_seq" integer DEFAULT 1 NOT NULL,
	"gcs_bucket" text NOT NULL,
	"gcs_object_path" text NOT NULL,
	"original_file_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size_bytes" integer,
	"checksum_sha256" text,
	"status" text DEFAULT 'active' NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"uploaded_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" serial PRIMARY KEY NOT NULL,
	"bp_code" text NOT NULL,
	"bp_name" text NOT NULL,
	"contact_person" text,
	"contact_position" text,
	"email" text,
	"phone1" text,
	"contact2_name" text,
	"contact2_position" text,
	"contact2_email" text,
	"contact2_phone" text,
	"contact3_name" text,
	"contact3_position" text,
	"contact3_email" text,
	"contact3_phone" text,
	"card_type" text DEFAULT 'C',
	"glbl_loc_num" text DEFAULT 'NA',
	"u_state_supply" text DEFAULT 'MH',
	"u_bp_gst_type" text DEFAULT 'G',
	"bill_to_address" text,
	"ship_to_address" text,
	"bill_addr_line1" text,
	"bill_addr_line2" text,
	"bill_addr_block" text,
	"bill_addr_building" text,
	"bill_addr_city" text,
	"ship_addr_line1" text,
	"ship_addr_line2" text,
	"ship_addr_block" text,
	"ship_addr_building" text,
	"ship_addr_city" text,
	"currency" text DEFAULT 'USD',
	"continent" text,
	"country_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"sap_card_code" text,
	"sap_card_name" text,
	"sap_card_type" text,
	"sap_phone1" text,
	"sap_phone2" text,
	"sap_fax" text,
	"sap_email" text,
	"sap_mail_address" text,
	"sap_mail_city" text,
	"sap_mail_country" text,
	"sap_mail_zip_code" text,
	"sap_currency" text,
	"sap_credit_line" numeric(15, 2),
	"sap_balance" numeric(15, 2),
	"sap_group_code" integer,
	"sap_license_number" text,
	"sap_vat_reg_number" text,
	"sap_synced_at" timestamp,
	"sap_last_modified" timestamp,
	"sap_sync_status" text DEFAULT 'pending',
	"sap_sync_error" text,
	"short_code" varchar(5) NOT NULL,
	"continent_code" varchar(2),
	"country_code" varchar(2),
	"pan_number" text,
	CONSTRAINT "customers_bp_code_unique" UNIQUE("bp_code"),
	CONSTRAINT "customers_sap_card_code_unique" UNIQUE("sap_card_code"),
	CONSTRAINT "customers_short_code_unique" UNIQUE("short_code")
);
--> statement-breakpoint
CREATE TABLE "daily_quotes" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_of_year" integer NOT NULL,
	"quote_text" text NOT NULL,
	"attribution" varchar(100) DEFAULT 'Buddha',
	"source" varchar(200),
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "daily_quotes_day_of_year_unique" UNIQUE("day_of_year")
);
--> statement-breakpoint
CREATE TABLE "daily_work_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"report_date" date NOT NULL,
	"tasks_completed" integer DEFAULT 0 NOT NULL,
	"tasks_in_progress" integer DEFAULT 0 NOT NULL,
	"hours_worked" numeric(4, 2) DEFAULT '0' NOT NULL,
	"productivity_score" numeric(5, 2) DEFAULT '0',
	"activities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"challenges" text,
	"issues_encountered" text,
	"support_required" text,
	"tomorrow_plans" text,
	"priority_tasks" jsonb DEFAULT '[]'::jsonb,
	"quality_score" numeric(5, 2) DEFAULT '0',
	"efficiency_rating" numeric(5, 2) DEFAULT '0',
	"collaboration_score" numeric(5, 2) DEFAULT '0',
	"plan_follow_through_score" numeric(5, 2) DEFAULT '0',
	"plan_follow_through_details" jsonb DEFAULT 'null'::jsonb,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"approved_by" integer,
	"approved_at" timestamp,
	"manager_feedback" text,
	"manager_rating" integer,
	"satisfaction_rating" integer,
	"challenge_level" integer,
	"blocked_tasks" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliverables" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"phase_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"due_date" text NOT NULL,
	"submitted_date" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"assigned_to" integer,
	"reviewed_by" integer,
	"notes" text,
	"attachments" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "department_master" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"code" varchar(10),
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "department_page_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"department" text NOT NULL,
	"page_key" text NOT NULL,
	"module_name" text NOT NULL,
	"can_view" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"design_project_id" integer NOT NULL,
	"drawing_id" integer,
	"task_title" varchar(255) NOT NULL,
	"task_description" text,
	"task_type" varchar(50) NOT NULL,
	"assigned_to_id" integer NOT NULL,
	"assigned_by_id" integer NOT NULL,
	"status" varchar(50) DEFAULT 'Assigned',
	"priority" varchar(20) DEFAULT 'Medium',
	"assigned_date" timestamp DEFAULT now() NOT NULL,
	"due_date" date,
	"started_date" timestamp,
	"completed_date" timestamp,
	"estimated_hours" numeric(5, 2),
	"actual_hours" numeric(5, 2),
	"progress_percentage" integer DEFAULT 0,
	"assignment_notes" text,
	"completion_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_basic_drawings" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"discipline" varchar(100) NOT NULL,
	"drawing_type" varchar(255) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"original_file_name" varchar(255),
	"revision" varchar(50) DEFAULT 'R1',
	"description" text,
	"file_path" text NOT NULL,
	"file_url" text,
	"file_size" integer,
	"file_type" varchar(50),
	"status" varchar(50) DEFAULT 'current' NOT NULL,
	"is_revision" boolean DEFAULT false NOT NULL,
	"revision_of" integer,
	"revision_reason" text,
	"superseded_at" timestamp,
	"superseded_by" integer,
	"uploaded_by" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_data_sheets" (
	"id" serial PRIMARY KEY NOT NULL,
	"dwg_control_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"design_code" varchar(100) NOT NULL,
	"material_code" varchar(100),
	"equipment_description" text,
	"tag_no" varchar(200),
	"equipment_type" varchar(100),
	"manufacture_serial_no" varchar(200),
	"inspection_by" varchar(80) NOT NULL,
	"equipment_config" varchar(60) NOT NULL,
	"mechanical_data" jsonb NOT NULL,
	"general_data" jsonb NOT NULL,
	"applied_code" varchar(50),
	"hazard_data" jsonb,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"dds_gcs_path" varchar(500),
	"dds_pdf_status" varchar(20),
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "design_data_sheets_dwg_control_id_unique" UNIQUE("dwg_control_id")
);
--> statement-breakpoint
CREATE TABLE "design_drawings" (
	"id" serial PRIMARY KEY NOT NULL,
	"design_project_id" integer NOT NULL,
	"drawing_number" varchar(100) NOT NULL,
	"drawing_title" varchar(255) NOT NULL,
	"category" varchar(50) NOT NULL,
	"discipline_code" varchar(10),
	"description" text,
	"scale" varchar(50),
	"paper_size" varchar(10) DEFAULT 'A1',
	"sheet_count" integer DEFAULT 1,
	"status" varchar(50) DEFAULT 'Draft' NOT NULL,
	"current_revision" varchar(10) DEFAULT 'A',
	"latest_version_id" integer,
	"assigned_to_id" integer,
	"checked_by_id" integer,
	"approved_by_id" integer,
	"due_date" date,
	"approved_date" date,
	"issued_date" date,
	"client_approval_required" boolean DEFAULT false,
	"client_approved_date" date,
	"client_approved_by" text,
	"related_drawings" jsonb DEFAULT '[]'::jsonb,
	"superseded_by" integer,
	"supersedes" integer,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "design_drawings_drawing_number_unique" UNIQUE("drawing_number")
);
--> statement-breakpoint
CREATE TABLE "design_project_backups" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"backup_type" varchar(100) NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"original_file_name" varchar(255),
	"revision" varchar(50) DEFAULT 'R1',
	"description" text,
	"file_path" text NOT NULL,
	"file_url" text,
	"file_size" integer,
	"file_type" varchar(50),
	"status" varchar(50) DEFAULT 'current' NOT NULL,
	"is_revision" boolean DEFAULT false NOT NULL,
	"revision_of" integer,
	"revision_reason" text,
	"superseded_at" timestamp,
	"superseded_by" integer,
	"uploaded_by" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"project_code" text NOT NULL,
	"design_project_name" varchar(255) NOT NULL,
	"description" text,
	"design_phase" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'Draft' NOT NULL,
	"design_manager_id" integer NOT NULL,
	"team_members" jsonb DEFAULT '[]'::jsonb,
	"start_date" date,
	"target_end_date" date,
	"actual_end_date" date,
	"client_approval_required" boolean DEFAULT false,
	"client_contact_info" text,
	"overall_progress" integer DEFAULT 0,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"drawing_id" integer NOT NULL,
	"version_id" integer NOT NULL,
	"review_type" varchar(50) NOT NULL,
	"review_stage" varchar(50),
	"review_title" varchar(255),
	"reviewer_id" integer NOT NULL,
	"reviewer_role" varchar(50),
	"status" varchar(50) DEFAULT 'Pending' NOT NULL,
	"priority" varchar(20) DEFAULT 'Medium',
	"review_comments" text,
	"markup_file_url" text,
	"requested_date" timestamp DEFAULT now() NOT NULL,
	"due_date" date,
	"started_date" timestamp,
	"completed_date" timestamp,
	"recommendation" varchar(50),
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_software_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"revision_id" integer NOT NULL,
	"action" varchar(30) NOT NULL,
	"performed_by" integer NOT NULL,
	"performed_at" timestamp DEFAULT now() NOT NULL,
	"comments" text,
	CONSTRAINT "ds_approvals_action_chk" CHECK (action IN ('submit_for_review', 'return_to_draft', 'check', 'approve', 'issue', 'supersede', 'archive'))
);
--> statement-breakpoint
CREATE TABLE "design_software_assumptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"revision_id" integer NOT NULL,
	"section" varchar(50) NOT NULL,
	"parameter_key" varchar(100) NOT NULL,
	"parameter_label" varchar(200) NOT NULL,
	"assumed_value" jsonb NOT NULL,
	"unit" varchar(30),
	"source_type" varchar(30) NOT NULL,
	"source_reference" text,
	"engineering_basis" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ds_assumptions_source_type_chk" CHECK (source_type IN ('Measured', 'Vendor', 'Literature', 'Assumed'))
);
--> statement-breakpoint
CREATE TABLE "design_software_calculation_runs" (
	"id" serial PRIMARY KEY NOT NULL,
	"revision_id" integer NOT NULL,
	"calculation_type" varchar(50) NOT NULL,
	"engine_name" varchar(100) NOT NULL,
	"engine_version" varchar(20) NOT NULL,
	"calculation_class" varchar(50) DEFAULT 'Preliminary Screening' NOT NULL,
	"input_snapshot" jsonb NOT NULL,
	"result_snapshot" jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]' NOT NULL,
	"validation_issues" jsonb DEFAULT '[]' NOT NULL,
	"calculation_status" varchar(20) DEFAULT 'success' NOT NULL,
	"calculated_by" integer NOT NULL,
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ds_calc_runs_type_chk" CHECK (calculation_type IN ('hydraulics_common', 'ecp', 'ecr')),
	CONSTRAINT "ds_calc_runs_status_chk" CHECK (calculation_status IN ('success', 'warning', 'error'))
);
--> statement-breakpoint
CREATE TABLE "design_software_designs" (
	"id" serial PRIMARY KEY NOT NULL,
	"design_number" varchar(60) NOT NULL,
	"design_sequence" integer NOT NULL,
	"module_type" varchar(20) NOT NULL,
	"design_type" varchar(20) NOT NULL,
	"title" text NOT NULL,
	"project_id" integer,
	"linked_project_id" integer,
	"capacity" varchar(100),
	"rnd_reference" varchar(100),
	"rnd_customer_name" varchar(200),
	"rnd_capacity" varchar(100),
	"rnd_location" varchar(200),
	"rnd_notes" text,
	"current_revision_id" integer,
	"current_status" varchar(30) DEFAULT 'draft' NOT NULL,
	"archived_at" timestamp,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ds_designs_module_type_chk" CHECK (module_type IN ('llx')),
	CONSTRAINT "ds_designs_design_type_chk" CHECK (design_type IN ('project', 'rnd')),
	CONSTRAINT "ds_designs_current_status_chk" CHECK (current_status IN ('draft', 'under_review', 'checked', 'approved', 'issued_for_enquiry', 'superseded', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "design_software_inputs" (
	"id" serial PRIMARY KEY NOT NULL,
	"revision_id" integer NOT NULL,
	"section" varchar(50) NOT NULL,
	"data" jsonb DEFAULT '{}' NOT NULL,
	"engine_version" varchar(20) DEFAULT '1.0.0' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" integer NOT NULL,
	CONSTRAINT "ds_inputs_section_chk" CHECK (section IN ('design_basis', 'fluid_properties', 'technology_selection', 'ecp', 'ecr', 'comparison'))
);
--> statement-breakpoint
CREATE TABLE "design_software_number_sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_type" varchar(20) NOT NULL,
	"scope_key" varchar(100) NOT NULL,
	"last_seq" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "design_software_results" (
	"id" serial PRIMARY KEY NOT NULL,
	"revision_id" integer NOT NULL,
	"section" varchar(50) NOT NULL,
	"data" jsonb DEFAULT '{}' NOT NULL,
	"engine_version" varchar(20) DEFAULT '1.0.0' NOT NULL,
	"calculation_class" varchar(50) DEFAULT 'Preliminary Screening' NOT NULL,
	"computed_at" timestamp DEFAULT now() NOT NULL,
	"computed_by" integer NOT NULL,
	CONSTRAINT "ds_results_section_chk" CHECK (section IN ('hydraulics_common', 'ecp', 'ecr', 'comparison', 'summary'))
);
--> statement-breakpoint
CREATE TABLE "design_software_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"design_id" integer NOT NULL,
	"revision_number" integer DEFAULT 0 NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"is_frozen" boolean DEFAULT false NOT NULL,
	"lock_version" integer DEFAULT 0 NOT NULL,
	"prepared_by_id" integer,
	"checked_by_id" integer,
	"approved_by_id" integer,
	"design_date" date,
	"change_description" text,
	"frozen_at" timestamp,
	"frozen_by_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ds_revisions_status_chk" CHECK (status IN ('draft', 'under_review', 'checked', 'approved', 'issued_for_enquiry', 'superseded', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "design_standards" (
	"id" serial PRIMARY KEY NOT NULL,
	"standard_number" varchar(100) NOT NULL,
	"title" varchar(255) NOT NULL,
	"category" varchar(100) NOT NULL,
	"discipline" varchar(50),
	"description" text,
	"content" text,
	"file_url" text,
	"file_path" text,
	"file_name" varchar(255),
	"file_size" integer,
	"file_type" varchar(50),
	"version" varchar(50) NOT NULL,
	"revision" varchar(10) DEFAULT 'A',
	"effective_date" date,
	"superseded_date" date,
	"is_active" boolean DEFAULT true,
	"access_level" varchar(50) DEFAULT 'Internal',
	"usage_guidelines" text,
	"related_standards" jsonb DEFAULT '[]'::jsonb,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "directory_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"department" text NOT NULL,
	"sub_directory" text,
	"doc_type_code" text,
	"document_title" text,
	"allowed_extensions" text[],
	"upload_mode" text,
	"is_public" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispatch_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"dispatch_id" integer NOT NULL,
	"document_type" text NOT NULL,
	"document_name" text NOT NULL,
	"document_path" text NOT NULL,
	"uploaded_by" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"storage_path" text,
	"storage_url" text,
	"storage_url_expiry" timestamp
);
--> statement-breakpoint
CREATE TABLE "dispatch_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"dispatch_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"quantity" text NOT NULL,
	"unit" text NOT NULL,
	"quality_approved" boolean DEFAULT false NOT NULL,
	"quality_approval_date" timestamp,
	"quality_approved_by" integer,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "dispatch_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"dispatch_number" text NOT NULL,
	"dispatch_date" timestamp NOT NULL,
	"transporter_name" text,
	"transporter_contact" text,
	"vehicle_number" text,
	"gate_pass_number" text,
	"delivery_status" text DEFAULT 'Pending' NOT NULL,
	"estimated_delivery_date" timestamp,
	"actual_delivery_date" timestamp,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_sequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_type" text NOT NULL,
	"fy_code" varchar(4),
	"project_id" integer,
	"next_seq" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_agent_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_type" varchar(50) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"agent_code" varchar(100),
	"relative_path" text NOT NULL,
	"file_url" text,
	"file_name" varchar(255),
	"expected_sha256" varchar(64),
	"actual_sha256" varchar(64),
	"result_local_path" text,
	"input_payload" jsonb,
	"result_payload" jsonb,
	"failed_reason" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"claimed_at" timestamp,
	"completed_at" timestamp,
	"source_ref" varchar(200),
	"source_module" text,
	"source_record_id" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "document_agent_nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"agent_code" varchar(100) NOT NULL,
	"api_key_hash" varchar(255) NOT NULL,
	"machine_name" varchar(255),
	"agent_version" varchar(50),
	"allowed_root_path" varchar(500),
	"environment" varchar(10) DEFAULT 'prod' NOT NULL,
	"agent_state" varchar(50) DEFAULT 'OFFLINE',
	"last_heartbeat_at" timestamp,
	"last_error" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_agent_nodes_agent_code_unique" UNIQUE("agent_code")
);
--> statement-breakpoint
CREATE TABLE "document_path_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_code" varchar(120) NOT NULL,
	"document_type" varchar(50) NOT NULL,
	"document_category" varchar(80),
	"rule_display_name" varchar(200),
	"module_key" varchar(80),
	"submodule_key" varchar(80),
	"relative_path_template" text NOT NULL,
	"file_name_template" varchar(255),
	"revision_mode" varchar(20) DEFAULT 'folder' NOT NULL,
	"file_extension" varchar(20),
	"active" boolean DEFAULT true NOT NULL,
	"gcs_rule_id" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "document_path_templates_template_code_unique" UNIQUE("template_code")
);
--> statement-breakpoint
CREATE TABLE "drawing_transmittals" (
	"id" serial PRIMARY KEY NOT NULL,
	"design_project_id" integer NOT NULL,
	"transmittal_number" varchar(100) NOT NULL,
	"transmittal_title" varchar(255) NOT NULL,
	"purpose" varchar(100),
	"recipient_organization" varchar(255) NOT NULL,
	"recipient_contact" varchar(255),
	"recipient_email" varchar(255),
	"drawing_ids" jsonb NOT NULL,
	"total_drawings" integer NOT NULL,
	"status" varchar(50) DEFAULT 'Draft',
	"sent_date" timestamp,
	"acknowledged_date" timestamp,
	"response_date" timestamp,
	"due_date" date,
	"cover_letter" text,
	"special_instructions" text,
	"client_comments" text,
	"response_document_url" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drawing_transmittals_transmittal_number_unique" UNIQUE("transmittal_number")
);
--> statement-breakpoint
CREATE TABLE "drawing_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"drawing_id" integer NOT NULL,
	"version" integer NOT NULL,
	"revision" varchar(10) NOT NULL,
	"change_description" text,
	"file_name" varchar(255) NOT NULL,
	"file_url" text NOT NULL,
	"file_path" text NOT NULL,
	"file_size" integer,
	"file_type" varchar(50),
	"mime_type" varchar(100),
	"file_format" varchar(10) DEFAULT 'DWG',
	"is_working_copy" boolean DEFAULT false,
	"is_latest_version" boolean DEFAULT true,
	"is_checked_out" boolean DEFAULT false,
	"checked_out_by" integer,
	"checked_out_at" timestamp,
	"review_status" varchar(50) DEFAULT 'Pending',
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dwar_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"event" varchar(100) NOT NULL,
	"actor_id" integer,
	"actor_type" varchar(20) DEFAULT 'user' NOT NULL,
	"target_user_id" integer,
	"report_id" integer,
	"year" integer,
	"month" integer,
	"details" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"integrity_hash" varchar(64)
);
--> statement-breakpoint
CREATE TABLE "email_analysis" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"summary" text NOT NULL,
	"key_points" jsonb NOT NULL,
	"urgency" text NOT NULL,
	"category" text NOT NULL,
	"action_items" jsonb NOT NULL,
	"sentiment" text NOT NULL,
	"analyzed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_replies" (
	"id" serial PRIMARY KEY NOT NULL,
	"message_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"professional_reply" text NOT NULL,
	"brief_reply" text NOT NULL,
	"detailed_reply" text NOT NULL,
	"context" text,
	"generated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_advance_recoveries" (
	"id" serial PRIMARY KEY NOT NULL,
	"advance_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"installment_number" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"recovery_date" text,
	"payroll_record_id" integer,
	"payroll_period_id" integer,
	"run_number" integer,
	"balance_after" numeric(12, 2),
	"status" varchar(20) DEFAULT 'pending',
	"reversed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_advances" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"advance_reference" varchar(50) NOT NULL,
	"approved_request_reference" varchar(100),
	"amount" numeric(12, 2) NOT NULL,
	"recovery_type" varchar(20) NOT NULL,
	"recovery_amount" numeric(10, 2),
	"recovery_months" integer,
	"advance_date" text NOT NULL,
	"start_recovery_date" text NOT NULL,
	"total_recovered" numeric(12, 2) DEFAULT '0',
	"outstanding_balance" numeric(12, 2) NOT NULL,
	"installments_recovered" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'active',
	"reason" text,
	"approved_by" integer,
	"created_by" integer,
	"sap_doc_entry" integer,
	"sap_je_number" varchar(50),
	"sap_posting_status" varchar(20) DEFAULT 'not_posted',
	"sap_posted_at" timestamp,
	"sap_error_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "employee_advances_advance_reference_unique" UNIQUE("advance_reference")
);
--> statement-breakpoint
CREATE TABLE "employee_appraisal_competencies" (
	"id" serial PRIMARY KEY NOT NULL,
	"appraisal_id" integer NOT NULL,
	"competency_name" varchar(300) NOT NULL,
	"competency_description" text,
	"self_score" numeric(3, 1),
	"manager_score" numeric(3, 1),
	"l2_score" numeric(3, 1),
	"self_comments" text,
	"manager_comments" text,
	"l2_comments" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_appraisal_kpis" (
	"id" serial PRIMARY KEY NOT NULL,
	"appraisal_id" integer NOT NULL,
	"kpi_title" varchar(300) NOT NULL,
	"kpi_description" text,
	"weightage" numeric(5, 2) NOT NULL,
	"target_value" text,
	"achieved_value" text,
	"self_score" numeric(3, 1),
	"manager_score" numeric(3, 1),
	"l2_score" numeric(3, 1),
	"self_comments" text,
	"manager_comments" text,
	"l2_comments" text,
	"sort_order" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_appraisals" (
	"id" serial PRIMARY KEY NOT NULL,
	"cycle_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"employee_name" varchar(200) NOT NULL,
	"employee_code" varchar(50),
	"department" varchar(100),
	"designation" varchar(100),
	"date_of_joining" text,
	"l1_reviewer_id" integer NOT NULL,
	"l1_reviewer_name" varchar(200) NOT NULL,
	"l2_reviewer_id" integer NOT NULL,
	"l2_reviewer_name" varchar(200) NOT NULL,
	"l3_approver_id" integer NOT NULL,
	"l3_approver_name" varchar(200) NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"self_assessment_narrative" text,
	"self_submitted_at" timestamp,
	"l1_score" numeric(5, 2),
	"l1_comments" text,
	"l1_reviewed_at" timestamp,
	"l1_increment_recommendation" varchar(50),
	"l1_promotion_recommendation" varchar(50),
	"l1_training_recommendation" text,
	"l2_score" numeric(5, 2),
	"l2_comments" text,
	"l2_reviewed_at" timestamp,
	"l2_override_reason" text,
	"l2_increment_recommendation" varchar(50),
	"l2_promotion_recommendation" varchar(50),
	"l2_training_recommendation" text,
	"l3_comments" text,
	"l3_approved_at" timestamp,
	"l3_increment_type" varchar(20),
	"l3_increment_value" numeric(10, 2),
	"l3_promotion_approved" boolean,
	"l3_new_designation" varchar(200),
	"l3_effective_date" text,
	"l3_final_remarks" text,
	"system_recommendation" jsonb,
	"final_score" numeric(5, 2),
	"final_rating" varchar(30),
	"final_recommendations" jsonb,
	"kpi_weighted_score" numeric(5, 2),
	"competency_avg_score" numeric(5, 2),
	"overall_calculated_score" numeric(5, 2),
	"applied_template_id" integer,
	"applied_template_name" varchar(300),
	"template_changed_at" timestamp,
	"template_changed_by" integer,
	"template_change_count" integer DEFAULT 0,
	"is_locked" boolean DEFAULT false,
	"reopened_at" timestamp,
	"reopened_by" integer,
	"reopen_reason" text,
	"reopen_target_stage" varchar(30),
	"resubmission_count" integer DEFAULT 0 NOT NULL,
	"last_returned_at" timestamp,
	"last_returned_by" integer,
	"last_return_remarks" text,
	"system_suggested_increment_pct" numeric(5, 2),
	"min_increment_pct" numeric(5, 2),
	"max_increment_pct" numeric(5, 2),
	"increment_proposal_id" integer,
	"increment_proposal_created_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_code_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"old_employee_code" text,
	"new_employee_code" text NOT NULL,
	"reason" text NOT NULL,
	"changed_by" integer NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_investment_proofs" (
	"id" serial PRIMARY KEY NOT NULL,
	"declaration_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"section" varchar(20) NOT NULL,
	"description" text NOT NULL,
	"declared_amount" numeric(10, 2) NOT NULL,
	"proof_amount" numeric(10, 2),
	"proof_status" varchar(20) DEFAULT 'pending',
	"proof_document_key" text,
	"verified_by" integer,
	"verified_at" timestamp,
	"verification_notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_loan_repayments" (
	"id" serial PRIMARY KEY NOT NULL,
	"loan_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"installment_number" integer NOT NULL,
	"amount" numeric(10, 2) NOT NULL,
	"repayment_date" text,
	"payroll_record_id" integer,
	"payroll_period_id" integer,
	"run_number" integer,
	"balance_after" numeric(12, 2),
	"status" varchar(20) DEFAULT 'pending',
	"reversed_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_loans" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"loan_type" varchar(30) NOT NULL,
	"loan_reference" varchar(50) NOT NULL,
	"approved_request_reference" varchar(100),
	"principal_amount" numeric(12, 2) NOT NULL,
	"interest_rate" numeric(5, 2) DEFAULT '0',
	"emi_amount" numeric(10, 2) NOT NULL,
	"tenure_months" integer NOT NULL,
	"disbursement_date" text NOT NULL,
	"start_deduction_date" text NOT NULL,
	"total_repaid" numeric(12, 2) DEFAULT '0',
	"outstanding_balance" numeric(12, 2) NOT NULL,
	"installments_paid" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'active',
	"remarks" text,
	"approved_by" integer,
	"created_by" integer,
	"sap_doc_entry" integer,
	"sap_je_number" varchar(50),
	"sap_posting_status" varchar(20) DEFAULT 'not_posted',
	"sap_posted_at" timestamp,
	"sap_error_message" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "employee_loans_loan_reference_unique" UNIQUE("loan_reference")
);
--> statement-breakpoint
CREATE TABLE "employee_salaries" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"base_salary" numeric(12, 2) NOT NULL,
	"salary_start_date" date NOT NULL,
	"basic_salary" numeric(12, 2) NOT NULL,
	"house_rent_allowance" numeric(10, 2) DEFAULT '0',
	"conveyance" numeric(10, 2) DEFAULT '0',
	"lta" numeric(10, 2) DEFAULT '0',
	"special_allowance" numeric(10, 2) DEFAULT '0',
	"supplementary_allowance" numeric(10, 2) DEFAULT '0',
	"bonus" numeric(10, 2) DEFAULT '0',
	"gratuity_cost" numeric(10, 2) DEFAULT '0',
	"kgp_allowance" numeric(10, 2) DEFAULT '0',
	"kpi_percent" numeric(5, 2) DEFAULT '0',
	"employee_pf_contribution" numeric(10, 2) DEFAULT '0',
	"employer_pf_contribution" numeric(10, 2) DEFAULT '0',
	"employee_esic_contribution" numeric(10, 2) DEFAULT '0',
	"employer_esic_contribution" numeric(10, 2) DEFAULT '0',
	"group_insurance" numeric(10, 2) DEFAULT '0',
	"professional_tax" numeric(10, 2) DEFAULT '0',
	"pf_applicable" boolean DEFAULT true,
	"lwp_exempt" boolean DEFAULT false,
	"bank_name" text,
	"bank_account_no" text,
	"debit_account" text,
	"salary_type" varchar(20) DEFAULT 'monthly',
	"hourly_rate" numeric(10, 2),
	"actual_days" integer DEFAULT 30,
	"working_hours_per_day" integer DEFAULT 8,
	"overtime_hours" numeric(5, 2) DEFAULT '0',
	"ot_rate" numeric(3, 1) DEFAULT '1.0',
	"present_days" integer DEFAULT 0,
	"paid_days" integer DEFAULT 0,
	"week_off" integer DEFAULT 0,
	"holidays" integer DEFAULT 0,
	"ot_hours" numeric(5, 2) DEFAULT '0',
	"ot_multiplier" numeric(3, 2) DEFAULT '1.5',
	"ot_amount" numeric(10, 2) DEFAULT '0',
	"absence" integer DEFAULT 0,
	"cl_balance" integer DEFAULT 0,
	"take_home_salary" numeric(12, 2),
	"actual_salary_for_month" numeric(12, 2),
	"ctc_monthly" numeric(12, 2),
	"ctc_yearly" numeric(12, 2),
	"currency" varchar(3) DEFAULT 'INR',
	"pay_frequency" varchar(20) DEFAULT 'monthly',
	"effective_date" date NOT NULL,
	"end_date" date,
	"salary_grade" varchar(10),
	"department" varchar(100),
	"position" varchar(100),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "employee_tax_declarations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"financial_year" varchar(10) NOT NULL,
	"regime" varchar(10) DEFAULT 'new' NOT NULL,
	"regime_locked" boolean DEFAULT false,
	"monthly_rent_paid" numeric(10, 2) DEFAULT '0',
	"is_metro_city" boolean DEFAULT false,
	"section80c" numeric(10, 2) DEFAULT '0',
	"section80ccd1b" numeric(10, 2) DEFAULT '0',
	"section80d" numeric(10, 2) DEFAULT '0',
	"section80d_parents" numeric(10, 2) DEFAULT '0',
	"section80e" numeric(10, 2) DEFAULT '0',
	"section80g" numeric(10, 2) DEFAULT '0',
	"section80tta" numeric(10, 2) DEFAULT '0',
	"section24b" numeric(10, 2) DEFAULT '0',
	"other_deductions" numeric(10, 2) DEFAULT '0',
	"other_deductions_description" text,
	"previous_employer_income" numeric(12, 2) DEFAULT '0',
	"previous_employer_tds" numeric(10, 2) DEFAULT '0',
	"other_income" numeric(12, 2) DEFAULT '0',
	"status" varchar(20) DEFAULT 'draft',
	"submitted_at" timestamp,
	"approved_by" integer,
	"approved_at" timestamp,
	"remarks" text,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "employee_workweek_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"workweek_policy_id" integer NOT NULL,
	"custom_working_days" jsonb,
	"custom_start_time" varchar(8),
	"custom_end_time" varchar(8),
	"custom_weekly_hours" numeric(5, 2),
	"assigned_date" date DEFAULT now() NOT NULL,
	"effective_from" date DEFAULT now() NOT NULL,
	"effective_until" date,
	"assigned_by" integer,
	"notes" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "engineering_change_notices" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_number" text NOT NULL,
	"ecr_id" integer,
	"item_id" integer NOT NULL,
	"description" text NOT NULL,
	"implementation_details" text NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"issued_by" integer NOT NULL,
	"issued_date" timestamp DEFAULT now() NOT NULL,
	"implementation_date" timestamp,
	"implemented_by" integer,
	"notes" text,
	"project_id" integer,
	"project_item_id" integer,
	"drawing_control_id" integer,
	"resulting_revision" text,
	"item_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "engineering_change_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_number" text NOT NULL,
	"item_id" integer NOT NULL,
	"description" text NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"requested_by" integer NOT NULL,
	"requested_date" timestamp DEFAULT now() NOT NULL,
	"approved_by" integer,
	"approved_date" timestamp,
	"notes" text,
	"project_id" integer,
	"project_item_id" integer,
	"drawing_control_id" integer,
	"item_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epc_agent_findings" (
	"id" serial PRIMARY KEY NOT NULL,
	"fingerprint" varchar(255) NOT NULL,
	"project_id" integer,
	"project_item_id" integer,
	"finding_code" varchar(20) NOT NULL,
	"agent_key" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"severity" varchar(20) DEFAULT 'warning' NOT NULL,
	"entity_type" varchar(50),
	"entity_id" integer,
	"first_detected_at" timestamp DEFAULT now() NOT NULL,
	"last_detected_at" timestamp DEFAULT now() NOT NULL,
	"last_alerted_at" timestamp,
	"last_task_created_at" timestamp,
	"resolved_at" timestamp,
	"cooldown_hours" integer DEFAULT 24 NOT NULL,
	"metadata" jsonb,
	"item_code" varchar(100),
	CONSTRAINT "epc_agent_findings_fingerprint_unique" UNIQUE("fingerprint")
);
--> statement-breakpoint
CREATE TABLE "epc_agent_nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"node_id" varchar(100) NOT NULL,
	"token_hash" varchar(255) NOT NULL,
	"machine_name" varchar(255),
	"label" varchar(255),
	"created_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"last_seen_at" timestamp,
	"last_seen_version" varchar(50),
	CONSTRAINT "epc_agent_nodes_node_id_unique" UNIQUE("node_id")
);
--> statement-breakpoint
CREATE TABLE "epc_assignment_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer,
	"workflow_code" text NOT NULL,
	"stage_gate" text NOT NULL,
	"action_type" text NOT NULL,
	"rule_id" integer,
	"resolution_method" text NOT NULL,
	"resolved_department" text,
	"resolved_role" text,
	"resolved_user_id" integer,
	"triggered_by" text,
	"warning_message" text,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epc_assignment_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"workflow_code" text NOT NULL,
	"stage_gate" text NOT NULL,
	"action_type" text NOT NULL,
	"department" text NOT NULL,
	"role" text NOT NULL,
	"fallback_department" text,
	"fallback_role" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"description" text,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "epc_assignment_rules_workflow_code_unique" UNIQUE("workflow_code")
);
--> statement-breakpoint
CREATE TABLE "epc_billing_readiness" (
	"id" serial PRIMARY KEY NOT NULL,
	"br_number" varchar(50) NOT NULL,
	"project_id" integer NOT NULL,
	"project_item_id" integer,
	"dispatch_record_id" integer,
	"commissioning_readiness_id" integer,
	"dispatch_readiness_id" integer,
	"epc_purchase_order_id" integer,
	"epc_work_order_id" integer,
	"inspection_execution_id" integer,
	"quality_plan_id" integer,
	"master_item_id" integer,
	"billing_basis" varchar(30) DEFAULT 'dispatch' NOT NULL,
	"milestone_name" varchar(255),
	"milestone_description" text,
	"item_code" varchar(100),
	"item_description" text,
	"item_specification" text,
	"uom" varchar(30),
	"quantity" numeric(10, 2),
	"unit_price" numeric(15, 2),
	"total_amount" numeric(15, 2),
	"currency" varchar(10) DEFAULT 'INR',
	"tax_applicable" boolean DEFAULT true,
	"tax_percentage" numeric(5, 2),
	"tax_amount" numeric(15, 2),
	"gross_amount" numeric(15, 2),
	"dispatch_number" varchar(50),
	"dispatch_date" timestamp,
	"delivery_date" timestamp,
	"cr_number" varchar(50),
	"commissioning_date" timestamp,
	"handover_date" timestamp,
	"customer_name" varchar(255),
	"customer_address" text,
	"customer_gst" varchar(50),
	"customer_po_number" varchar(100),
	"customer_po_date" timestamp,
	"billing_address" text,
	"shipping_address" text,
	"billing_notes" text,
	"exception_notes" text,
	"supporting_documents" text,
	"source_type" varchar(30) DEFAULT 'purchase_order' NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"review_note" text,
	"ready_marked_by" integer,
	"ready_marked_at" timestamp,
	"ready_note" text,
	"invoiced_by" integer,
	"invoiced_at" timestamp,
	"invoice_reference" varchar(100),
	"invoice_note" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"superseded_by_id" integer,
	"superseded_at" timestamp,
	"supersession_reason" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "epc_billing_readiness_br_number_unique" UNIQUE("br_number")
);
--> statement-breakpoint
CREATE TABLE "epc_bom_headers" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"project_item_id" integer NOT NULL,
	"master_item_id" integer NOT NULL,
	"drawing_control_id" integer,
	"bom_number" varchar(35) NOT NULL,
	"revision_code" varchar(5) DEFAULT 'A' NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"revision_status" varchar(20) DEFAULT 'draft' NOT NULL,
	"supersedes_id" integer,
	"bom_revision" varchar(20) DEFAULT 'A' NOT NULL,
	"bom_type" varchar(30) DEFAULT 'assembly' NOT NULL,
	"bom_title" varchar(255),
	"bom_description" text,
	"item_code" varchar(100),
	"item_description" text,
	"classification_snapshot" varchar(20),
	"drawing_number" varchar(100),
	"drawing_revision" varchar(20),
	"total_line_count" integer DEFAULT 0 NOT NULL,
	"total_estimated_cost" numeric(14, 2),
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"submitted_by" integer,
	"submitted_at" timestamp,
	"submission_note" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"review_note" text,
	"review_recommendation" varchar(30),
	"approved_by" integer,
	"approved_at" timestamp,
	"approval_note" text,
	"released_by" integer,
	"released_at" timestamp,
	"release_note" text,
	"superseded_by" integer,
	"superseded_at" timestamp,
	"supersession_reason" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epc_bom_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"bom_header_id" integer NOT NULL,
	"line_number" integer NOT NULL,
	"component_item_id" integer NOT NULL,
	"component_item_code" varchar(100),
	"component_description" text,
	"component_specification" text,
	"component_uom" varchar(30),
	"component_make_or_buy" varchar(20),
	"quantity_per_unit" numeric(10, 2) DEFAULT '1' NOT NULL,
	"component_drawing_no" varchar(100),
	"estimated_unit_cost" numeric(12, 2),
	"estimated_total_cost" numeric(14, 2),
	"procurement_lead_time_days" integer,
	"preferred_vendor" varchar(255),
	"planning_required" boolean DEFAULT true NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epc_commissioning_readiness" (
	"id" serial PRIMARY KEY NOT NULL,
	"cr_number" varchar(50) NOT NULL,
	"project_id" integer NOT NULL,
	"project_item_id" integer NOT NULL,
	"dispatch_record_id" integer NOT NULL,
	"dispatch_readiness_id" integer,
	"epc_purchase_order_id" integer,
	"epc_work_order_id" integer,
	"inspection_execution_id" integer,
	"quality_plan_id" integer,
	"master_item_id" integer NOT NULL,
	"item_code" varchar(100),
	"item_description" text,
	"item_specification" text,
	"uom" varchar(30),
	"quantity" numeric(10, 2) NOT NULL,
	"dispatch_number" varchar(50),
	"dispatch_date" timestamp,
	"delivery_date" timestamp,
	"site_name" varchar(255),
	"site_address" text,
	"site_contact_person" varchar(255),
	"site_contact_phone" varchar(100),
	"site_readiness_confirmed" boolean DEFAULT false,
	"site_readiness_note" text,
	"installation_required" boolean DEFAULT true,
	"installation_notes" text,
	"utilities_confirmed" boolean DEFAULT false,
	"utilities_note" text,
	"documentation_complete" boolean DEFAULT false,
	"documentation_note" text,
	"test_certificates_available" boolean DEFAULT false,
	"warranty_documents_available" boolean DEFAULT false,
	"operation_manual_available" boolean DEFAULT false,
	"spare_parts_list_available" boolean DEFAULT false,
	"training_required" boolean DEFAULT false,
	"training_notes" text,
	"commissioning_notes" text,
	"handover_notes" text,
	"quality_clearance_reference" text,
	"source_type" varchar(30) DEFAULT 'purchase_order' NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"prepared_by" integer,
	"prepared_at" timestamp,
	"preparation_note" text,
	"ready_marked_by" integer,
	"ready_marked_at" timestamp,
	"ready_note" text,
	"commissioned_by" integer,
	"commissioned_at" timestamp,
	"commissioning_note" text,
	"commissioning_date" timestamp,
	"handed_over_by" integer,
	"handed_over_at" timestamp,
	"handover_date" timestamp,
	"handover_accepted_by" varchar(255),
	"handover_acceptance_note" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"superseded_by_id" integer,
	"superseded_at" timestamp,
	"supersession_reason" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "epc_commissioning_readiness_cr_number_unique" UNIQUE("cr_number")
);
--> statement-breakpoint
CREATE TABLE "epc_dispatch_readiness" (
	"id" serial PRIMARY KEY NOT NULL,
	"dr_number" varchar(50) NOT NULL,
	"project_id" integer NOT NULL,
	"project_item_id" integer NOT NULL,
	"epc_purchase_order_id" integer,
	"epc_work_order_id" integer,
	"inspection_execution_id" integer,
	"quality_plan_id" integer,
	"master_item_id" integer NOT NULL,
	"item_code" varchar(100),
	"item_description" text,
	"item_specification" text,
	"uom" varchar(30),
	"quantity" numeric(10, 2) NOT NULL,
	"dispatch_quantity" numeric(10, 2),
	"packaging_type" varchar(50),
	"packaging_notes" text,
	"shipping_method" varchar(50),
	"shipping_notes" text,
	"dispatch_notes" text,
	"special_handling" text,
	"destination_address" text,
	"estimated_dispatch_date" timestamp,
	"quality_clearance_date" timestamp,
	"quality_clearance_reference" text,
	"source_type" varchar(30) DEFAULT 'purchase_order' NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"prepared_by" integer,
	"prepared_at" timestamp,
	"preparation_note" text,
	"ready_marked_by" integer,
	"ready_marked_at" timestamp,
	"ready_note" text,
	"dispatched_by" integer,
	"dispatched_at" timestamp,
	"dispatch_reference" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"superseded_by_id" integer,
	"superseded_at" timestamp,
	"supersession_reason" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "epc_dispatch_readiness_dr_number_unique" UNIQUE("dr_number")
);
--> statement-breakpoint
CREATE TABLE "epc_dispatch_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"dispatch_number" varchar(50) NOT NULL,
	"project_id" integer NOT NULL,
	"project_item_id" integer NOT NULL,
	"dispatch_readiness_id" integer NOT NULL,
	"epc_purchase_order_id" integer,
	"epc_work_order_id" integer,
	"inspection_execution_id" integer,
	"quality_plan_id" integer,
	"master_item_id" integer NOT NULL,
	"item_code" varchar(100),
	"item_description" text,
	"item_specification" text,
	"uom" varchar(30),
	"quantity" numeric(10, 2) NOT NULL,
	"dispatch_quantity" numeric(10, 2) NOT NULL,
	"packaging_type" varchar(50),
	"packaging_notes" text,
	"shipping_method" varchar(50),
	"shipping_notes" text,
	"dispatch_notes" text,
	"special_handling" text,
	"destination_address" text,
	"quality_clearance_date" timestamp,
	"quality_clearance_reference" text,
	"source_type" varchar(30) DEFAULT 'purchase_order' NOT NULL,
	"dispatch_date" timestamp,
	"transporter_name" varchar(255),
	"transporter_contact" varchar(100),
	"vehicle_number" varchar(100),
	"tracking_number" varchar(100),
	"lr_number" varchar(100),
	"lr_date" timestamp,
	"logistics_notes" text,
	"delivery_address" text,
	"expected_delivery_date" timestamp,
	"actual_delivery_date" timestamp,
	"delivery_confirmed_by" integer,
	"delivery_note" text,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"confirmed_by" integer,
	"confirmed_at" timestamp,
	"confirmation_note" text,
	"shipped_by" integer,
	"shipped_at" timestamp,
	"shipment_note" text,
	"delivered_by" integer,
	"delivered_at" timestamp,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"superseded_by_id" integer,
	"superseded_at" timestamp,
	"supersession_reason" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "epc_dispatch_records_dispatch_number_unique" UNIQUE("dispatch_number")
);
--> statement-breakpoint
CREATE TABLE "epc_doc_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"folder_code" text,
	"allowed_extensions" text[] NOT NULL,
	"upload_mode" text DEFAULT 'single' NOT NULL,
	"max_file_size_mb" integer DEFAULT 50 NOT NULL,
	"is_slot" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"gcs_folder_name" varchar(80),
	CONSTRAINT "epc_doc_types_code_unique" UNIQUE("code"),
	CONSTRAINT "epc_doc_types_folder_code_unique" UNIQUE("folder_code")
);
--> statement-breakpoint
CREATE TABLE "epc_document_access_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"attachment_id" integer NOT NULL,
	"document_number" varchar(40) NOT NULL,
	"revision_code" varchar(4),
	"doc_type" varchar(3) NOT NULL,
	"project_id" integer NOT NULL,
	"action" varchar(20) NOT NULL,
	"accessed_by" integer NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" varchar(45),
	"user_agent" varchar(500)
);
--> statement-breakpoint
CREATE TABLE "epc_document_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_entity_type" varchar(30) NOT NULL,
	"parent_entity_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"doc_type" varchar(3) NOT NULL,
	"document_number" varchar(40) NOT NULL,
	"is_revision_controlled" boolean DEFAULT false NOT NULL,
	"revision_code" varchar(4),
	"attachment_label" varchar(100) NOT NULL,
	"attachment_seq" integer DEFAULT 1 NOT NULL,
	"gcs_bucket" varchar(100) DEFAULT 'thermopac_storage' NOT NULL,
	"gcs_object_path" varchar(500) NOT NULL,
	"original_file_name" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"checksum_sha256" varchar(64) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"uploaded_by" integer NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"superseded_at" timestamp with time zone,
	"superseded_by" integer,
	"withdrawn_at" timestamp with time zone,
	"withdrawn_by" integer,
	"withdraw_reason" text,
	"item_code" varchar(100)
);
--> statement-breakpoint
CREATE TABLE "epc_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"doc_type" text NOT NULL,
	"folder_code" text,
	"document_number" text,
	"revision" text DEFAULT '00' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"title" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer,
	"content_type" text,
	"gcs_object_path" text NOT NULL,
	"checksum_sha256" text,
	"seq_number" integer DEFAULT 1 NOT NULL,
	"uploaded_by" integer,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"superseded_at" timestamp,
	"superseded_by_id" integer,
	"mirror_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"mirror_job_id" integer
);
--> statement-breakpoint
CREATE TABLE "epc_drawing_controls" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"project_item_id" integer,
	"master_item_id" integer,
	"design_drawing_id" integer,
	"legacy_metadata" jsonb,
	"dwg_control_number" varchar(35) NOT NULL,
	"revision_code" varchar(5) DEFAULT 'A' NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"revision_status" varchar(20) DEFAULT 'draft' NOT NULL,
	"supersedes_id" integer,
	"drawing_number" varchar(100),
	"drawing_title" varchar(255),
	"drawing_revision" varchar(20),
	"drawing_category" varchar(50),
	"discipline_code" varchar(50),
	"item_code" varchar(100),
	"item_description" text,
	"classification_snapshot" varchar(20),
	"drawing_purpose" varchar(30) DEFAULT 'general' NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"released_for_procurement" boolean DEFAULT false NOT NULL,
	"released_for_procurement_at" timestamp,
	"released_for_procurement_by" integer,
	"released_for_manufacturing" boolean DEFAULT false NOT NULL,
	"released_for_manufacturing_at" timestamp,
	"released_for_manufacturing_by" integer,
	"procurement_release_required" boolean DEFAULT false NOT NULL,
	"manufacturing_release_required" boolean DEFAULT false NOT NULL,
	"client_approval_required" boolean DEFAULT false NOT NULL,
	"client_approval_status" varchar(30) DEFAULT 'not_required',
	"client_approved_at" timestamp,
	"client_approved_by" text,
	"client_approval_notes" text,
	"submitted_by" integer,
	"submitted_at" timestamp,
	"submission_note" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"review_note" text,
	"review_recommendation" varchar(30),
	"approved_by" integer,
	"approved_at" timestamp,
	"approval_note" text,
	"released_by" integer,
	"released_at" timestamp,
	"release_note" text,
	"superseded_by" integer,
	"superseded_at" timestamp,
	"supersession_reason" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"notes" text,
	"gcs_object_path" text,
	"file_name" text,
	"file_size" integer,
	"checksum_sha256" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"structured_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "epc_drawing_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"do_number" varchar(30) NOT NULL,
	"project_id" integer NOT NULL,
	"project_item_id" integer NOT NULL,
	"master_item_id" integer,
	"item_code" varchar(100),
	"item_description" text,
	"drawing_type" varchar(30),
	"required_by_date" timestamp,
	"assigned_to" integer,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"drawing_no" varchar(100),
	"revision" varchar(10),
	"linked_ecr_number" varchar(30),
	"linked_ecn_number" varchar(30),
	"linked_dwg_control_id" integer,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_source_type" varchar(20) DEFAULT 'manual',
	"created_source_ref" varchar(100),
	"automation_run_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "epc_drawing_orders_do_number_unique" UNIQUE("do_number")
);
--> statement-breakpoint
CREATE TABLE "epc_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" varchar(50) NOT NULL,
	"project_id" integer NOT NULL,
	"project_item_id" integer,
	"billing_readiness_id" integer NOT NULL,
	"dispatch_record_id" integer,
	"commissioning_readiness_id" integer,
	"dispatch_readiness_id" integer,
	"epc_purchase_order_id" integer,
	"epc_work_order_id" integer,
	"inspection_execution_id" integer,
	"quality_plan_id" integer,
	"master_item_id" integer,
	"billing_basis" varchar(30) NOT NULL,
	"milestone_name" varchar(255),
	"milestone_description" text,
	"item_code" varchar(100),
	"item_description" text,
	"item_specification" text,
	"uom" varchar(30),
	"quantity" numeric(10, 2),
	"unit_price" numeric(15, 2),
	"total_amount" numeric(15, 2) NOT NULL,
	"currency" varchar(10) DEFAULT 'INR',
	"tax_applicable" boolean DEFAULT true,
	"tax_percentage" numeric(5, 2),
	"tax_amount" numeric(15, 2),
	"gross_amount" numeric(15, 2) NOT NULL,
	"amount_paid" numeric(15, 2) DEFAULT '0',
	"amount_outstanding" numeric(15, 2),
	"discount_amount" numeric(15, 2) DEFAULT '0',
	"discount_note" text,
	"customer_name" varchar(255),
	"customer_address" text,
	"customer_gst" varchar(50),
	"customer_po_number" varchar(100),
	"customer_po_date" timestamp,
	"billing_address" text,
	"shipping_address" text,
	"dispatch_number" varchar(50),
	"dispatch_date" timestamp,
	"delivery_date" timestamp,
	"cr_number" varchar(50),
	"commissioning_date" timestamp,
	"handover_date" timestamp,
	"br_number" varchar(50),
	"invoice_date" timestamp DEFAULT now() NOT NULL,
	"due_date" timestamp,
	"payment_terms" varchar(255),
	"invoice_notes" text,
	"internal_notes" text,
	"source_type" varchar(30) DEFAULT 'purchase_order' NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"approval_note" text,
	"issued_by" integer,
	"issued_at" timestamp,
	"issue_note" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"superseded_by_id" integer,
	"superseded_at" timestamp,
	"supersession_reason" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "epc_invoices_invoice_number_unique" UNIQUE("invoice_number")
);
--> statement-breakpoint
CREATE TABLE "epc_migration_feature_flags" (
	"id" serial PRIMARY KEY NOT NULL,
	"flag_name" varchar(100) NOT NULL,
	"enabled" boolean DEFAULT false NOT NULL,
	"description" text,
	"updated_by" integer,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "epc_migration_feature_flags_flag_name_unique" UNIQUE("flag_name")
);
--> statement-breakpoint
CREATE TABLE "epc_po_amendments" (
	"id" serial PRIMARY KEY NOT NULL,
	"amendment_number" varchar(60) NOT NULL,
	"epc_po_id" integer NOT NULL,
	"po_group_id" integer,
	"amendment_type" varchar(40) NOT NULL,
	"amendment_summary" text NOT NULL,
	"price_change_delta" numeric(12, 2),
	"qty_change_delta" numeric(10, 2),
	"delivery_date_change" date,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"submitted_by" integer,
	"submitted_at" timestamp,
	"approved_by" integer,
	"approved_at" timestamp,
	"issued_by" integer,
	"issued_at" timestamp,
	"rejected_by" integer,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "epc_po_amendments_amendment_number_unique" UNIQUE("amendment_number")
);
--> statement-breakpoint
CREATE TABLE "epc_po_group_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_group_id" integer NOT NULL,
	"plc_line_id" integer NOT NULL,
	"line_number" integer DEFAULT 1 NOT NULL,
	"line_qty" numeric(10, 2) NOT NULL,
	"line_unit_rate" numeric(12, 2),
	"line_amount" numeric(15, 2),
	"line_notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epc_po_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"pog_number" varchar(60) NOT NULL,
	"project_id" integer NOT NULL,
	"vendor_id" integer,
	"vendor_name" varchar(255),
	"total_lines" integer DEFAULT 0 NOT NULL,
	"total_amount" numeric(15, 2),
	"currency" varchar(10) DEFAULT 'INR' NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"epc_po_id" integer,
	"epc_po_number" varchar(60),
	"delivery_terms" text,
	"payment_terms" text,
	"group_notes" text,
	"submitted_by" integer,
	"submitted_at" timestamp,
	"submission_notes" text,
	"approved_by" integer,
	"approved_at" timestamp,
	"approval_notes" text,
	"rejected_by" integer,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"issued_by" integer,
	"issued_at" timestamp,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancellation_reason" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "epc_po_groups_pog_number_unique" UNIQUE("pog_number")
);
--> statement-breakpoint
CREATE TABLE "epc_purchase_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"epc_purchase_order_id" integer NOT NULL,
	"line_number" integer DEFAULT 1 NOT NULL,
	"master_item_id" integer NOT NULL,
	"item_code" varchar(100),
	"item_description" text,
	"item_specification" text,
	"uom" varchar(30),
	"drawing_no" varchar(100),
	"quantity" numeric(10, 2) NOT NULL,
	"unit_cost" numeric(12, 2),
	"total_cost" numeric(12, 2),
	"source_bom_line_id" integer,
	"plc_line_id" integer,
	"plc_line_qty" numeric(10, 2),
	"plc_line_qty_received" numeric(10, 2) DEFAULT '0',
	"procurement_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epc_purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_number" varchar(50) NOT NULL,
	"project_id" integer NOT NULL,
	"project_item_id" integer NOT NULL,
	"planning_record_id" integer,
	"execution_record_id" integer,
	"po_preparation_id" integer NOT NULL,
	"quality_plan_id" integer,
	"master_item_id" integer NOT NULL,
	"vendor_id" integer,
	"vendor_name" varchar(255),
	"total_amount" numeric(12, 2),
	"currency" varchar(10) DEFAULT 'INR',
	"payment_terms" text,
	"delivery_terms" text,
	"po_notes" text,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"approval_note" text,
	"issued_by" integer,
	"issued_at" timestamp,
	"issue_note" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"superseded_by_id" integer,
	"superseded_at" timestamp,
	"supersession_reason" text,
	"source_bom_header_id" integer,
	"source_bom_line_id" integer,
	"quality_status" varchar(30) DEFAULT 'pending_inspection',
	"quality_cleared_by" integer,
	"quality_cleared_at" timestamp,
	"quality_cleared_inspection_id" integer,
	"quality_failure_reason" text,
	"quality_failed_inspection_id" integer,
	"created_by" integer,
	"created_source_type" varchar(20) DEFAULT 'manual',
	"created_source_ref" varchar(100),
	"automation_run_id" uuid,
	"po_group_id" integer,
	"amendment_count" integer DEFAULT 0,
	"item_code" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "epc_purchase_orders_po_number_unique" UNIQUE("po_number")
);
--> statement-breakpoint
CREATE TABLE "epc_slddrw_extraction_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"drawing_control_id" integer NOT NULL,
	"attachment_id" integer,
	"slddrw_gcs_path" varchar(500) NOT NULL,
	"slddrw_filename" varchar(255),
	"slddrw_sha256" varchar(64),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"node_id" varchar(100),
	"agent_version" varchar(50),
	"machine_name" varchar(255),
	"claimed_at" timestamp,
	"completed_at" timestamp,
	"failed_reason" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"extraction_result" jsonb,
	"dds_comparison_status" varchar(50),
	"dds_comparison_result" jsonb,
	"created_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epc_structure_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"drawing_control_id" integer NOT NULL,
	"drawing_number" varchar(500),
	"revision" varchar(50),
	"base_revision" varchar(50),
	"mode" varchar(50) DEFAULT 'create_new' NOT NULL,
	"dds_payload" jsonb,
	"project_context" jsonb,
	"template_path" varchar(1000),
	"staging_root" varchar(1000),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"node_id" varchar(100),
	"agent_version" varchar(50),
	"machine_name" varchar(255),
	"claimed_at" timestamp,
	"completed_at" timestamp,
	"failed_reason" text,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"result" jsonb,
	"created_by" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epc_structuring_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_path" varchar(1000),
	"staging_root" varchar(1000),
	"updated_by" varchar(255),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "epc_work_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"epc_work_order_id" integer NOT NULL,
	"line_number" integer DEFAULT 1 NOT NULL,
	"master_item_id" integer NOT NULL,
	"item_code" varchar(100),
	"item_description" text,
	"item_specification" text,
	"uom" varchar(30),
	"drawing_no" varchar(100),
	"drawing_revision" integer,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_cost" numeric(12, 2),
	"total_cost" numeric(12, 2),
	"source_bom_line_id" integer,
	"manufacturing_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "epc_work_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"wo_number" varchar(50) NOT NULL,
	"project_id" integer NOT NULL,
	"project_item_id" integer NOT NULL,
	"planning_record_id" integer,
	"execution_record_id" integer,
	"wo_preparation_id" integer NOT NULL,
	"quality_plan_id" integer,
	"master_item_id" integer NOT NULL,
	"item_code" varchar(100),
	"item_description" text,
	"item_specification" text,
	"uom" varchar(30),
	"drawing_no" varchar(100),
	"drawing_revision" integer,
	"quantity" numeric(10, 2) NOT NULL,
	"estimated_unit_cost" numeric(12, 2),
	"estimated_total_cost" numeric(12, 2),
	"make_classification" varchar(50),
	"manufacturing_notes" text,
	"wo_notes" text,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"approval_note" text,
	"released_by" integer,
	"released_at" timestamp,
	"release_note" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"superseded_by_id" integer,
	"superseded_at" timestamp,
	"supersession_reason" text,
	"source_bom_header_id" integer,
	"source_bom_line_id" integer,
	"quality_status" varchar(30) DEFAULT 'pending_inspection',
	"quality_cleared_by" integer,
	"quality_cleared_at" timestamp,
	"quality_cleared_inspection_id" integer,
	"quality_failure_reason" text,
	"quality_failed_inspection_id" integer,
	"created_by" integer,
	"created_source_type" varchar(20) DEFAULT 'manual',
	"created_source_ref" varchar(100),
	"automation_run_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "epc_work_orders_wo_number_unique" UNIQUE("wo_number")
);
--> statement-breakpoint
CREATE TABLE "exchange_rate_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_currency" varchar(3) DEFAULT 'USD' NOT NULL,
	"to_currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"exchange_rate" numeric(10, 4) NOT NULL,
	"source" varchar(50) DEFAULT 'manual' NOT NULL,
	"api_last_updated" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exclusivity_agreements" (
	"id" serial PRIMARY KEY NOT NULL,
	"agreement_number" varchar(255) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"party_name" varchar(255) NOT NULL,
	"party_type" varchar(50) NOT NULL,
	"party_contact" varchar(255),
	"party_email" varchar(255),
	"exclusivity_type" varchar(50) NOT NULL,
	"exclusivity_scope" text NOT NULL,
	"geographical_scope" text,
	"product_service_scope" text,
	"territory_restrictions" text,
	"start_date" date NOT NULL,
	"end_date" date,
	"duration_months" integer,
	"minimum_commitment" numeric(15, 2),
	"performance_targets" text,
	"penalty_clause" text,
	"termination_conditions" text,
	"renewal_terms" text,
	"exclusivity_level" varchar(50) DEFAULT 'Full',
	"competing_restrictions" text,
	"non_compete_period" integer,
	"agreement_value" numeric(15, 2),
	"currency" varchar(10) DEFAULT 'INR',
	"payment_terms" text,
	"milestone_requirements" text,
	"governing_law" varchar(100) DEFAULT 'Indian Law',
	"jurisdiction" varchar(100),
	"status" varchar(50) DEFAULT 'Active',
	"breach_incidents" integer DEFAULT 0,
	"performance_score" integer DEFAULT 0,
	"auto_renewal" boolean DEFAULT false,
	"notice_period_days" integer DEFAULT 60,
	"file_path" varchar(500),
	"file_url" varchar(500),
	"digital_signature_required" boolean DEFAULT false,
	"signed_date" date,
	"witness_required" boolean DEFAULT false,
	"witness_name" varchar(255),
	"witness_contact" varchar(255),
	"created_by" integer,
	"assigned_to" integer,
	"approved_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "exclusivity_agreements_agreement_number_unique" UNIQUE("agreement_number")
);
--> statement-breakpoint
CREATE TABLE "exclusivity_performance" (
	"id" serial PRIMARY KEY NOT NULL,
	"exclusivity_id" integer,
	"evaluation_period" varchar(50) NOT NULL,
	"evaluation_date" date NOT NULL,
	"target_achievement" numeric(5, 2) DEFAULT '0.00',
	"revenue_generated" numeric(15, 2) DEFAULT '0.00',
	"volume_achieved" numeric(15, 2) DEFAULT '0.00',
	"currency" varchar(10) DEFAULT 'INR',
	"performance_rating" varchar(50),
	"performance_score" integer DEFAULT 0,
	"compliance_score" integer DEFAULT 0,
	"feedback_comments" text,
	"improvement_areas" text,
	"recognition_rewards" text,
	"penalty_applied" boolean DEFAULT false,
	"penalty_amount" numeric(15, 2),
	"penalty_reason" text,
	"next_evaluation_date" date,
	"created_by" integer,
	"evaluated_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "execution_drafts" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"project_item_id" integer NOT NULL,
	"doc_type" varchar(10) NOT NULL,
	"applicable" boolean DEFAULT true NOT NULL,
	"doc_number" varchar(30),
	"approval_status" varchar(30) DEFAULT 'draft' NOT NULL,
	"activation_status" varchar(30) DEFAULT 'not_activated' NOT NULL,
	"generated_by" varchar(20) DEFAULT 'system' NOT NULL,
	"generated_by_user_id" integer,
	"approved_by" integer,
	"rejected_by" integer,
	"rejection_remarks" text,
	"hold_remarks" text,
	"linked_task_id" integer,
	"dependency_doc_type" varchar(10),
	"dependency_status" varchar(20) DEFAULT 'not_required' NOT NULL,
	"source_data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"activated_entity_id" integer,
	"activated_entity_type" varchar(50),
	"activated_by" integer,
	"activated_at" timestamp,
	"parent_draft_id" integer,
	"actual_doc_number" varchar(30),
	"error_message" text,
	"created_source_type" varchar(20) DEFAULT 'manual',
	"created_source_ref" varchar(100),
	"automation_run_id" uuid,
	"item_code" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "external_counsel" (
	"id" serial PRIMARY KEY NOT NULL,
	"firm_name" varchar(255) NOT NULL,
	"contact_person" varchar(255) NOT NULL,
	"designation" varchar(255),
	"specialization" varchar(255),
	"phone" varchar(50),
	"email" varchar(255),
	"address" text,
	"city" varchar(100),
	"state" varchar(100),
	"country" varchar(100) DEFAULT 'India' NOT NULL,
	"bar_council_number" varchar(100),
	"years_experience" integer,
	"hourly_rate" numeric(10, 2),
	"currency" varchar(10) DEFAULT 'INR' NOT NULL,
	"rating" integer,
	"status" varchar(50) DEFAULT 'Active' NOT NULL,
	"retainer_agreement" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folder_template_nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"folder_template_id" integer NOT NULL,
	"parent_id" integer,
	"folder_code" varchar(80) NOT NULL,
	"folder_name_template" varchar(255) NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"module" varchar(40),
	"is_dynamic" boolean DEFAULT false NOT NULL,
	"dynamic_source" varchar(80),
	"is_revision_controlled" boolean DEFAULT false NOT NULL,
	"auto_create" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "folder_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_code" varchar(120) NOT NULL,
	"template_name" varchar(120) NOT NULL,
	"description" text,
	"company_code" varchar(20) DEFAULT 'TPEL' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"version" varchar(20) DEFAULT '1' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "folder_templates_template_code_unique" UNIQUE("template_code")
);
--> statement-breakpoint
CREATE TABLE "gads_ad_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"google_ad_group_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"type" text,
	"cpc_bid_micros" numeric(20, 0),
	"synced_at" timestamp DEFAULT now(),
	CONSTRAINT "gads_ad_groups_google_ad_group_id_unique" UNIQUE("google_ad_group_id")
);
--> statement-breakpoint
CREATE TABLE "gads_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"google_campaign_id" text NOT NULL,
	"account_id" integer,
	"name" text NOT NULL,
	"status" text NOT NULL,
	"advertising_channel_type" text,
	"budget_amount_micros" numeric(20, 0),
	"budget_type" text,
	"budget_resource_name" text,
	"start_date" text,
	"end_date" text,
	"synced_at" timestamp DEFAULT now(),
	CONSTRAINT "gads_campaigns_google_campaign_id_unique" UNIQUE("google_campaign_id")
);
--> statement-breakpoint
CREATE TABLE "gads_change_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"action_type" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"before_value" jsonb,
	"after_value" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gads_daily_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"date" text NOT NULL,
	"impressions" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"cost_micros" numeric(20, 0) DEFAULT '0',
	"conversions" numeric(15, 2) DEFAULT '0',
	"conversion_value" numeric(15, 2) DEFAULT '0',
	"all_conversions" numeric(15, 2) DEFAULT '0',
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gads_keywords" (
	"id" serial PRIMARY KEY NOT NULL,
	"google_criterion_id" text NOT NULL,
	"ad_group_id" text NOT NULL,
	"campaign_id" text NOT NULL,
	"text" text NOT NULL,
	"match_type" text NOT NULL,
	"status" text NOT NULL,
	"quality_score" integer,
	"synced_at" timestamp DEFAULT now(),
	CONSTRAINT "gads_keywords_google_criterion_id_unique" UNIQUE("google_criterion_id")
);
--> statement-breakpoint
CREATE TABLE "gads_search_terms" (
	"id" serial PRIMARY KEY NOT NULL,
	"campaign_id" text NOT NULL,
	"ad_group_id" text NOT NULL,
	"search_term" text NOT NULL,
	"impressions" integer DEFAULT 0,
	"clicks" integer DEFAULT 0,
	"cost_micros" numeric(20, 0) DEFAULT '0',
	"conversions" numeric(15, 2) DEFAULT '0',
	"date" text NOT NULL,
	"synced_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "gads_sync_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"error" text,
	"records_synced" integer DEFAULT 0,
	"lock_key" text,
	"last_run_at" timestamp,
	CONSTRAINT "gads_sync_jobs_lock_key_unique" UNIQUE("lock_key")
);
--> statement-breakpoint
CREATE TABLE "gcs_access_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"project_id" integer,
	"access_level" varchar(20) DEFAULT 'viewer' NOT NULL,
	"granted_by" integer NOT NULL,
	"granted_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "gcs_directories" (
	"id" serial PRIMARY KEY NOT NULL,
	"financial_year" text NOT NULL,
	"project_code" text NOT NULL,
	"department" text NOT NULL,
	"sub_directory" text,
	"full_path" text NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_public" boolean DEFAULT false,
	CONSTRAINT "gcs_directories_full_path_unique" UNIQUE("full_path")
);
--> statement-breakpoint
CREATE TABLE "gcs_file_index" (
	"id" serial PRIMARY KEY NOT NULL,
	"bucket_name" varchar(100) NOT NULL,
	"file_path" text NOT NULL,
	"file_name" text NOT NULL,
	"folder_path" text NOT NULL,
	"continent_code" varchar(5),
	"continent_name" varchar(100),
	"country_code" varchar(5),
	"country_name" varchar(100),
	"customer_code" varchar(10),
	"customer_name" varchar(255),
	"fy_code" varchar(10),
	"fy_label" varchar(20),
	"project_code" varchar(50),
	"project_id" integer,
	"doc_type" varchar(20),
	"revision" varchar(20),
	"size_bytes" bigint,
	"content_type" varchar(100),
	"is_resolved" boolean DEFAULT true NOT NULL,
	"unresolved_fields" text[],
	"assurance_flags" text[],
	"gcs_updated_at" timestamp,
	"last_synced_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gcs_file_index_file_path_unique" UNIQUE("file_path")
);
--> statement-breakpoint
CREATE TABLE "gcs_file_migration_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"file_id" integer NOT NULL,
	"table_name" varchar(100) NOT NULL,
	"before_path" text NOT NULL,
	"after_path" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"error" text,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "gcs_file_migration_jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer NOT NULL,
	"document_type" varchar(80) NOT NULL,
	"trigger_reason" varchar(40) DEFAULT 'manual' NOT NULL,
	"triggered_by" integer,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"total_files" integer DEFAULT 0 NOT NULL,
	"processed_files" integer DEFAULT 0 NOT NULL,
	"migrated_files" integer DEFAULT 0 NOT NULL,
	"skipped_files" integer DEFAULT 0 NOT NULL,
	"failed_files" integer DEFAULT 0 NOT NULL,
	"missing_src_files" integer DEFAULT 0 NOT NULL,
	"error_log" jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "gcs_governance_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" varchar(60) NOT NULL,
	"rule_id" integer,
	"version_id" integer,
	"actor_id" integer,
	"actor_role" varchar(50),
	"event_at" timestamp DEFAULT now() NOT NULL,
	"payload" jsonb,
	"ip_address" varchar(45)
);
--> statement-breakpoint
CREATE TABLE "gcs_governance_rule_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer NOT NULL,
	"version_number" integer NOT NULL,
	"path_template" text NOT NULL,
	"revision_mode" varchar(20) DEFAULT 'none' NOT NULL,
	"root_prefix" varchar(100) NOT NULL,
	"display_name" text NOT NULL,
	"notes" text,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"activated_by" integer,
	"activated_at" timestamp,
	"superseded_at" timestamp,
	"validation_evidence" jsonb,
	"diff_from_prev" jsonb
);
--> statement-breakpoint
CREATE TABLE "gcs_governance_rules" (
	"id" serial PRIMARY KEY NOT NULL,
	"module_key" varchar(50) NOT NULL,
	"submodule_key" varchar(50),
	"document_type" varchar(80) NOT NULL,
	"display_name" varchar(120) NOT NULL,
	"root_prefix" text NOT NULL,
	"path_template" text NOT NULL,
	"revision_mode" varchar(20) DEFAULT 'none' NOT NULL,
	"allowed_tokens" text[],
	"required_tokens" text[],
	"max_file_size_mb" integer,
	"allowed_mime_types" text[],
	"active" boolean DEFAULT true NOT NULL,
	"notes" text,
	"governance_mode" varchar(20) DEFAULT 'hardcoded' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"routing_deprecated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "gcs_governance_token_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"token_name" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"example_value" varchar(100) NOT NULL,
	"source_description" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "gcs_governance_token_registry_token_name_unique" UNIQUE("token_name")
);
--> statement-breakpoint
CREATE TABLE "gcs_object_deletions" (
	"id" serial PRIMARY KEY NOT NULL,
	"gcs_bucket" text NOT NULL,
	"gcs_object_path" text NOT NULL,
	"deletion_reason" text NOT NULL,
	"deletion_policy" text NOT NULL,
	"requested_by" integer,
	"executed_at" timestamp with time zone,
	"status" text DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"scheduled_for" timestamp with time zone,
	"document_type" text,
	"document_number" text,
	"project_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gcs_path_migration_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer NOT NULL,
	"route_file" varchar(200) NOT NULL,
	"route_function" varchar(100),
	"old_method" varchar(100) NOT NULL,
	"migration_phase" varchar(10) NOT NULL,
	"migrated_at" timestamp,
	"migrated_by" integer,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "gcs_upload_monitor_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"detected_at" timestamp DEFAULT now() NOT NULL,
	"matched_rule_id" integer,
	"module_key" varchar(50),
	"document_type" varchar(80),
	"detected_gcs_path" text NOT NULL,
	"path_conforms" boolean,
	"violation_reason" text,
	"file_size_bytes" bigint,
	"mime_type" varchar(120),
	"uploaded_by" integer,
	"route_file" varchar(200)
);
--> statement-breakpoint
CREATE TABLE "gcs_upload_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"rule_id" integer NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"resolved_path" text NOT NULL,
	"root_prefix" text NOT NULL,
	"module_key" varchar(50) NOT NULL,
	"document_type" varchar(80) NOT NULL,
	"token_values" jsonb,
	"max_file_size_bytes" bigint,
	"allowed_mime_types" text[],
	"issued_to" integer NOT NULL,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"used_for_path" text,
	"notes" text,
	"version_id" integer,
	CONSTRAINT "gcs_upload_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "generated_qaps" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"template_id" integer NOT NULL,
	"title" varchar(255) NOT NULL,
	"client_name" varchar(255) NOT NULL,
	"equipment_type" varchar(255) NOT NULL,
	"standards" text,
	"revision" varchar(50) DEFAULT '0' NOT NULL,
	"prepared_by" integer NOT NULL,
	"approved_by" integer,
	"itp_references" text,
	"content" text NOT NULL,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gl_account_mappings" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer DEFAULT 1,
	"component_code" varchar(50) NOT NULL,
	"component_name" varchar(100) NOT NULL,
	"category" varchar(30) NOT NULL,
	"posting_context" varchar(30) NOT NULL,
	"gl_account_code" varchar(30) DEFAULT '' NOT NULL,
	"sap_acct_code" varchar(30),
	"gl_account_name" varchar(200),
	"sap_validated_at" timestamp,
	"debit_credit" varchar(10) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gl_posting_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer DEFAULT 1,
	"source_module" varchar(30) NOT NULL,
	"source_reference_id" integer,
	"payroll_period_id" integer,
	"posting_type" varchar(30) NOT NULL,
	"total_debit" numeric(12, 2) NOT NULL,
	"total_credit" numeric(12, 2) NOT NULL,
	"sap_je_number" varchar(50),
	"sap_doc_entry" integer,
	"posting_status" varchar(20) DEFAULT 'draft' NOT NULL,
	"posted_by" integer,
	"posted_at" timestamp,
	"error_message" text,
	"line_items" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gmail_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"message_id" text NOT NULL,
	"thread_id" text,
	"from_address" text NOT NULL,
	"to_address" text NOT NULL,
	"subject" text,
	"snippet" text,
	"body" text,
	"received_at" timestamp,
	"is_read" boolean DEFAULT false,
	"is_important" boolean DEFAULT false,
	"labels" text[],
	"priority" varchar(10),
	"priority_score" integer,
	"classification_reason" text,
	"classification_signals" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gmail_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"auto_sync_enabled" boolean DEFAULT true,
	"sync_frequency_minutes" integer DEFAULT 30,
	"auto_forward_rules" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gmail_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expiry" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "google_ads_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" text NOT NULL,
	"descriptive_name" text,
	"currency_code" text,
	"time_zone" text,
	"is_manager" boolean DEFAULT false,
	"is_active" boolean DEFAULT true,
	"linked_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "google_ads_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text NOT NULL,
	"token_expiry" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "google_calendar_sync_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"meeting_id" integer,
	"user_id" integer,
	"action" varchar(50) NOT NULL,
	"google_event_id" text,
	"status" varchar(20) NOT NULL,
	"error_message" text,
	"sync_details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazop_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"deviation_id" integer NOT NULL,
	"action_number" integer NOT NULL,
	"action_description" text NOT NULL,
	"action_type" varchar(30),
	"assigned_to" integer,
	"due_date" date,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"close_comments" text,
	"closed_at" timestamp,
	"source" varchar(10) DEFAULT 'library' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazop_alarm_trips" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"alarm_number" text NOT NULL,
	"alarm_type" text NOT NULL,
	"event_type" text,
	"protection_layer" text,
	"criticality_class" text,
	"effectiveness_rating" text,
	"human_dependency_level" text,
	"tag_ref" text,
	"description" text NOT NULL,
	"process_parameter" text,
	"set_point" text,
	"alarm_action" text,
	"trip_action" text,
	"response_time_sec" integer,
	"operator_action_required" boolean DEFAULT true NOT NULL,
	"confidence_score" integer,
	"baseline_revision" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"rationalization_status" text DEFAULT 'pending' NOT NULL,
	"source_deviation_id" integer,
	"source_safeguard_id" integer,
	"interlock_id" integer,
	"event_group_id" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"requires_review" boolean DEFAULT false NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hazop_baseline_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"artefact_type" text NOT NULL,
	"artefact_id" integer NOT NULL,
	"baseline_revision" text NOT NULL,
	"baselined_by" integer NOT NULL,
	"countersigned_by" integer NOT NULL,
	"countersigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"countersigner_role" text NOT NULL,
	"approval_discipline" text NOT NULL,
	"approval_token" text NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hazop_baseline_approvals_approval_token_unique" UNIQUE("approval_token")
);
--> statement-breakpoint
CREATE TABLE "hazop_causes" (
	"id" serial PRIMARY KEY NOT NULL,
	"deviation_id" integer NOT NULL,
	"cause_number" integer NOT NULL,
	"cause_description" text NOT NULL,
	"source" varchar(10) DEFAULT 'library' NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazop_ce_causes" (
	"id" serial PRIMARY KEY NOT NULL,
	"matrix_id" integer NOT NULL,
	"row_number" integer NOT NULL,
	"cause_tag" varchar(50) NOT NULL,
	"cause_description" varchar(200) NOT NULL,
	"cause_condition" varchar(100),
	"cause_type" varchar(20),
	"source_sif_id" integer
);
--> statement-breakpoint
CREATE TABLE "hazop_ce_cells" (
	"id" serial PRIMARY KEY NOT NULL,
	"matrix_id" integer NOT NULL,
	"cause_id" integer NOT NULL,
	"effect_id" integer NOT NULL,
	"action" varchar(10),
	"time_delay_sec" integer DEFAULT 0 NOT NULL,
	"notes" varchar(200)
);
--> statement-breakpoint
CREATE TABLE "hazop_ce_columns" (
	"id" serial PRIMARY KEY NOT NULL,
	"matrix_id" integer NOT NULL,
	"col_number" integer NOT NULL,
	"description" text NOT NULL,
	"col_type" text DEFAULT 'interlock' NOT NULL,
	"protection_layer" text,
	"tag_ref" text,
	"source_safeguard_id" integer,
	"source_action_id" integer,
	"response_group_id" integer
);
--> statement-breakpoint
CREATE TABLE "hazop_ce_effects" (
	"id" serial PRIMARY KEY NOT NULL,
	"matrix_id" integer NOT NULL,
	"col_number" integer NOT NULL,
	"effect_tag" varchar(50) NOT NULL,
	"effect_description" varchar(200) NOT NULL,
	"effect_action" varchar(50),
	"source_sif_id" integer
);
--> statement-breakpoint
CREATE TABLE "hazop_ce_matrices" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"node_id" integer,
	"matrix_number" text NOT NULL,
	"title" text,
	"scope_description" text,
	"baseline_revision" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "hazop_ce_matrix" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"project_id" integer,
	"matrix_number" varchar(50) NOT NULL,
	"revision" varchar(10) DEFAULT 'A' NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"generated_at" timestamp,
	"approved_by" integer,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hazop_ce_matrix_study_id_unique" UNIQUE("study_id")
);
--> statement-breakpoint
CREATE TABLE "hazop_ce_rows" (
	"id" serial PRIMARY KEY NOT NULL,
	"matrix_id" integer NOT NULL,
	"row_number" integer NOT NULL,
	"description" text NOT NULL,
	"event_type" text,
	"tag_ref" text,
	"source_deviation_id" integer,
	"source_cause_id" integer,
	"event_group_id" integer
);
--> statement-breakpoint
CREATE TABLE "hazop_concept_equipment" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"equipment_category" varchar(50) NOT NULL,
	"concept_tag" varchar(50) NOT NULL,
	"equipment_role" varchar(100),
	"make" varchar(100),
	"model" varchar(100),
	"kw_rating" numeric,
	"estimated_pressure_min" numeric,
	"estimated_pressure_max" numeric,
	"estimated_temp_min" numeric,
	"estimated_temp_max" numeric,
	"fluid" varchar(100),
	"has_vfd" boolean DEFAULT false NOT NULL,
	"hazardous_area" boolean DEFAULT false NOT NULL,
	"area_classification" varchar(30),
	"design_assumption" text,
	"is_confirmed" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazop_concept_instruments" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"concept_tag" varchar(50) NOT NULL,
	"instrument_class" varchar(30),
	"service_description" varchar(200),
	"signal_type" varchar(20),
	"estimated_range_min" numeric,
	"estimated_range_max" numeric,
	"units" varchar(20),
	"linked_equipment_tag" varchar(50),
	"design_assumption" text,
	"is_confirmed" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazop_consequences" (
	"id" serial PRIMARY KEY NOT NULL,
	"deviation_id" integer NOT NULL,
	"consequence_number" integer NOT NULL,
	"consequence_description" text NOT NULL,
	"severity" varchar(20),
	"source" varchar(10) DEFAULT 'library' NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazop_design_assumptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"assumption_number" integer NOT NULL,
	"assumption_category" varchar(50),
	"description" text NOT NULL,
	"basis" text,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"confirmed_at" timestamp,
	"confirmed_by" integer,
	"preserved_on_conversion" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazop_deviation_library" (
	"id" serial PRIMARY KEY NOT NULL,
	"equipment_category" varchar(50) NOT NULL,
	"guideword" varchar(20) NOT NULL,
	"parameter" varchar(20) NOT NULL,
	"applicable" boolean DEFAULT true NOT NULL,
	"deviation_description" varchar(200) NOT NULL,
	"typical_causes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"typical_consequences" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"typical_safeguards" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"typical_actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazop_deviations" (
	"id" serial PRIMARY KEY NOT NULL,
	"node_id" integer NOT NULL,
	"study_id" integer NOT NULL,
	"deviation_number" varchar(50) NOT NULL,
	"guideword" varchar(20) NOT NULL,
	"parameter" varchar(20) NOT NULL,
	"deviation_description" varchar(200) NOT NULL,
	"is_credible" boolean DEFAULT true NOT NULL,
	"credibility_reason" text,
	"reviewed" boolean DEFAULT false NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazop_event_group_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"deviation_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazop_event_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"group_number" text NOT NULL,
	"group_name" text NOT NULL,
	"event_type" text NOT NULL,
	"process_transition_type" text,
	"consequence_severity" text,
	"operating_mode" text,
	"common_cause_group" text,
	"description" text,
	"operating_regime" text,
	"phase_state" text,
	"process_function" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "hazop_fat_sat_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"project_id" integer,
	"checklist_type" varchar(5) NOT NULL,
	"item_number" integer NOT NULL,
	"sif_id" integer,
	"cause_id" integer,
	"effect_id" integer,
	"test_description" text NOT NULL,
	"expected_result" varchar(300),
	"actual_result" varchar(300),
	"status" varchar(20) DEFAULT 'not_tested' NOT NULL,
	"remarks" text,
	"tested_by" integer,
	"tested_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "hazop_interlock_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"interlock_id" integer NOT NULL,
	"sequence_no" integer NOT NULL,
	"action_description" text NOT NULL,
	"action_type" text,
	"fail_state" text,
	"tag_ref" text,
	"confidence_score" integer,
	"source_safeguard_id" integer
);
--> statement-breakpoint
CREATE TABLE "hazop_interlocks" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"interlock_number" text NOT NULL,
	"interlock_type" text NOT NULL,
	"event_type" text,
	"protection_layer" text,
	"logic_type" text,
	"criticality_class" text,
	"consequence_severity" text,
	"effectiveness_rating" text,
	"is_independent_protection_layer" boolean DEFAULT false NOT NULL,
	"baseline_revision" text,
	"description" text NOT NULL,
	"initiating_condition" text,
	"initiating_tag" text,
	"final_element_tag" text,
	"set_point" text,
	"reset_type" text,
	"bypass_provision" boolean DEFAULT false NOT NULL,
	"sil_level" integer,
	"status" text DEFAULT 'identified' NOT NULL,
	"source_deviation_id" integer,
	"source_safeguard_id" integer,
	"event_group_id" integer,
	"response_group_id" integer,
	"ce_row_id" integer,
	"ce_column_id" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"requires_review" boolean DEFAULT false NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hazop_lopa_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"scenario_id" integer NOT NULL,
	"lopa_number" text NOT NULL,
	"title" text,
	"ie_frequency_per_year" numeric(15, 9) NOT NULL,
	"ie_frequency_basis" text,
	"consequence_category" text NOT NULL,
	"rttf_per_year" numeric(15, 9) NOT NULL,
	"rttf_basis" text,
	"achieved_mef_per_year" numeric(15, 9),
	"pfd_product" numeric(15, 9),
	"risk_gap_ratio" numeric(15, 6),
	"required_additional_pfd" numeric(15, 9),
	"required_sil" integer,
	"lopa_outcome" text,
	"lopa_status" text DEFAULT 'draft' NOT NULL,
	"credited_ipl_count" integer,
	"excluded_ipl_count" integer,
	"ccf_derated_count" integer,
	"arithmetic_version" text,
	"warnings" text[],
	"baseline_revision" text,
	"approved_by" integer,
	"approved_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"requires_review" boolean DEFAULT false NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hazop_moc_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"moc_number" text NOT NULL,
	"scenario_id" integer,
	"safety_function_id" integer,
	"interlock_id" integer,
	"alarm_trip_id" integer,
	"sce_id" integer,
	"lopa_id" integer,
	"srs_id" integer,
	"change_type" text NOT NULL,
	"change_reason" text NOT NULL,
	"change_description" text NOT NULL,
	"safety_impact_assessment" text,
	"baseline_before" text,
	"baseline_after" text,
	"requested_by" integer,
	"requested_at" timestamp DEFAULT now(),
	"approved_by" integer,
	"approved_at" timestamp,
	"rejected_by" integer,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"moc_status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazop_nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"loop_id" integer NOT NULL,
	"node_number" integer NOT NULL,
	"node_name" varchar(200) NOT NULL,
	"node_reference" varchar(100) NOT NULL,
	"node_description" varchar(300),
	"design_intent" text,
	"p_and_id_ref" varchar(100),
	"deviation_count" integer DEFAULT 0 NOT NULL,
	"action_count" integer DEFAULT 0 NOT NULL,
	"generated_at" timestamp,
	"generated_by" integer,
	"process_function" varchar(50),
	"operating_regime" varchar(20) DEFAULT 'atmospheric' NOT NULL,
	"phase_state" varchar(20) DEFAULT 'liquid' NOT NULL,
	"topology_changed_after_review" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazop_process_loops" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"project_id" integer,
	"loop_number" integer NOT NULL,
	"loop_name" varchar(200) NOT NULL,
	"design_intent" text,
	"fluid" varchar(100),
	"operating_pressure_min" numeric,
	"operating_pressure_max" numeric,
	"operating_temp_min" numeric,
	"operating_temp_max" numeric,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"sort_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazop_process_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"node_id" integer NOT NULL,
	"loop_id" integer NOT NULL,
	"project_id" integer,
	"sequence_no" integer NOT NULL,
	"equipment_category" varchar(50) NOT NULL,
	"equipment_tag" varchar(50),
	"equipment_role" varchar(100),
	"connection_type" varchar(50) NOT NULL,
	"from_step" integer,
	"to_step" integer,
	"outlet_type" varchar(50),
	"outlet_destination" varchar(50) NOT NULL,
	"outlet_destination_ref" varchar(100),
	"operating_pressure" numeric,
	"operating_temperature" numeric,
	"fluid" varchar(100),
	"remarks" text,
	"sort_order" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazop_response_group_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"response_group_id" integer NOT NULL,
	"sequence_no" integer NOT NULL,
	"action_description" text NOT NULL,
	"action_type" text,
	"tag_ref" text,
	"confidence_score" integer,
	"source_safeguard_id" integer,
	"source_action_id" integer
);
--> statement-breakpoint
CREATE TABLE "hazop_response_groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"group_number" text NOT NULL,
	"group_name" text NOT NULL,
	"protection_layer" text NOT NULL,
	"logic_type" text,
	"criticality_class" text,
	"effectiveness_rating" text,
	"human_dependency_level" text,
	"operating_mode" text,
	"is_independent_protection_layer" boolean DEFAULT false NOT NULL,
	"common_cause_group" text,
	"description" text,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "hazop_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"document_type" varchar(30),
	"revision" varchar(10) NOT NULL,
	"change_description" text NOT NULL,
	"changed_by" integer NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazop_safeguards" (
	"id" serial PRIMARY KEY NOT NULL,
	"deviation_id" integer NOT NULL,
	"safeguard_number" integer NOT NULL,
	"safeguard_description" text NOT NULL,
	"safeguard_type" varchar(30),
	"tag_ref" varchar(50),
	"source" varchar(10) DEFAULT 'library' NOT NULL,
	"deleted" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazop_safety_critical_elements" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"sce_number" text NOT NULL,
	"tag_ref" text NOT NULL,
	"description" text NOT NULL,
	"equipment_type" text,
	"protection_layer" text,
	"fail_state" text,
	"linked_sif_id" integer,
	"linked_interlock_id" integer,
	"proof_test_required" boolean DEFAULT true NOT NULL,
	"inspection_interval_days" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "hazop_safety_functions" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"project_id" integer,
	"sif_number" varchar(50) NOT NULL,
	"sif_description" varchar(300) NOT NULL,
	"initiating_cause" text NOT NULL,
	"initiator_tag" varchar(50),
	"initiator_condition" varchar(100),
	"final_element_tag" varchar(50),
	"final_element_action" varchar(100),
	"sif_type" varchar(30),
	"safety_critical" boolean DEFAULT false NOT NULL,
	"source_deviation_id" integer,
	"source_action_id" integer,
	"sil_target" varchar(10),
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hazop_scenario_ipl_stack" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"scenario_id" integer NOT NULL,
	"response_group_id" integer,
	"safety_function_id" integer,
	"interlock_id" integer,
	"ipl_type" text NOT NULL,
	"ipl_label" text NOT NULL,
	"protection_layer" text NOT NULL,
	"is_independent" boolean DEFAULT false NOT NULL,
	"effectiveness_rating" text,
	"human_dependency_level" text,
	"fail_state" text,
	"pfd_value" numeric(10, 6),
	"pfd_source" text,
	"pfd_basis" text,
	"credit_applied" boolean DEFAULT false NOT NULL,
	"creditable" boolean,
	"ccf_group" text,
	"stack_position" integer NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "hazop_scenarios" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"scenario_number" text NOT NULL,
	"title" text NOT NULL,
	"initiating_event_group_id" integer,
	"consequence_description" text NOT NULL,
	"consequence_severity" text NOT NULL,
	"operating_mode" text,
	"human_dependency_level" text,
	"residual_risk" text,
	"baseline_revision" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "hazop_srs_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_id" integer NOT NULL,
	"safety_function_id" integer NOT NULL,
	"lopa_id" integer,
	"srs_number" text NOT NULL,
	"sil_required" integer NOT NULL,
	"sil_proposed" integer,
	"pfd_required" numeric(10, 6) NOT NULL,
	"pfd_target" numeric(10, 6),
	"process_demand_description" text NOT NULL,
	"safe_state_description" text NOT NULL,
	"process_input_tag" text,
	"final_element_tag" text,
	"final_element_action" text,
	"fail_state" text,
	"process_safety_time_sec" integer,
	"response_time_required_sec" integer,
	"manual_reset_required" boolean DEFAULT true,
	"proof_test_interval_days" integer,
	"proof_test_coverage" numeric(5, 2),
	"proof_test_procedure_ref" text,
	"architecture_type" text,
	"hardware_fault_tolerance" integer DEFAULT 0,
	"srs_status" text DEFAULT 'draft' NOT NULL,
	"baseline_revision" text,
	"approved_by" integer,
	"approved_at" timestamp,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"requires_review" boolean DEFAULT false NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "hazop_studies" (
	"id" serial PRIMARY KEY NOT NULL,
	"study_mode" varchar(30) NOT NULL,
	"project_id" integer,
	"study_number" varchar(50) NOT NULL,
	"title" varchar(200) NOT NULL,
	"revision" varchar(10) DEFAULT 'A' NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"study_leader" integer,
	"team_members" jsonb,
	"study_date" date,
	"process_description" text,
	"design_basis" text,
	"concept_title" varchar(200),
	"converted_to_study_id" integer,
	"converted_at" timestamp,
	"converted_by" integer,
	"approved_by" integer,
	"approved_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "hazop_studies_study_number_unique" UNIQUE("study_number")
);
--> statement-breakpoint
CREATE TABLE "inspection_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"inspection_order_id" integer NOT NULL,
	"tab_name" text NOT NULL,
	"record_id" text NOT NULL,
	"file_name" text NOT NULL,
	"file_path" text NOT NULL,
	"file_url" text,
	"file_type" text,
	"file_size" integer,
	"uploaded_by" integer,
	"item_code" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_execution_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"inspection_number" varchar(35),
	"project_id" integer NOT NULL,
	"project_item_id" integer NOT NULL,
	"planning_record_id" integer,
	"execution_record_id" integer,
	"quality_plan_id" integer NOT NULL,
	"master_item_id" integer NOT NULL,
	"source_context" varchar(30) NOT NULL,
	"inspection_type" varchar(50) NOT NULL,
	"item_code" varchar(100),
	"item_description" text,
	"item_specification" text,
	"uom" varchar(30),
	"drawing_no" varchar(100),
	"drawing_revision" integer,
	"quantity" numeric(10, 2) NOT NULL,
	"inspection_notes" text,
	"result_notes" text,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"scheduled_by" integer,
	"scheduled_at" timestamp,
	"started_by" integer,
	"started_at" timestamp,
	"completed_by" integer,
	"completed_at" timestamp,
	"failed_by" integer,
	"failed_at" timestamp,
	"failure_reason" text,
	"superseded_by" integer,
	"superseded_at" timestamp,
	"supersession_reason" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"created_by" integer,
	"assigned_to" integer,
	"created_source_type" varchar(20) DEFAULT 'manual',
	"created_source_ref" varchar(100),
	"automation_run_id" uuid,
	"plc_line_id" integer,
	"grn_record_id" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inspection_execution_records_inspection_number_unique" UNIQUE("inspection_number")
);
--> statement-breakpoint
CREATE TABLE "inspection_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"inspection_order_id" integer NOT NULL,
	"item_id" integer,
	"item_code" text,
	"description" text NOT NULL,
	"work_order_item_id" integer,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit" text DEFAULT 'Nos' NOT NULL,
	"make_or_buy" text,
	"sequence_number" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "inspection_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"project_code" text NOT NULL,
	"inspection_order_number" text NOT NULL,
	"title" text NOT NULL,
	"item_id" integer,
	"item_code" text,
	"description" text NOT NULL,
	"drawing_no" text,
	"work_order_id" integer,
	"epc_work_order_id" integer,
	"status" text DEFAULT 'pending' NOT NULL,
	"inspection_type" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit" text DEFAULT 'Nos' NOT NULL,
	"make_or_buy" text,
	"parent_inspection_order_id" integer,
	"sequence_number" integer NOT NULL,
	"ndt_data" text,
	"visual_data" text,
	"weld_data" text,
	"hydrotest_data" text,
	"ncr_data" text,
	"approved_drawing_data" text,
	"dvr_data" text,
	"itp_data" text,
	"pma_data" text,
	"procedure_data" text,
	"shop_data" text,
	"material_traceability_data" text,
	"planned_date" timestamp,
	"completed_date" timestamp,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inspection_orders_inspection_order_number_unique" UNIQUE("inspection_order_number")
);
--> statement-breakpoint
CREATE TABLE "inspection_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"project_code" text NOT NULL,
	"work_order_id" integer,
	"report_number" text NOT NULL,
	"report_type" text NOT NULL,
	"title" text NOT NULL,
	"inspection_date" timestamp NOT NULL,
	"location" text NOT NULL,
	"inspector_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"findings" text,
	"recommendations" text,
	"project_item_id" integer,
	"batch_number" text,
	"quantity_inspected" integer NOT NULL,
	"quantity_accepted" integer DEFAULT 0 NOT NULL,
	"quantity_rejected" integer DEFAULT 0 NOT NULL,
	"reference_documents" text[],
	"approved_by" integer,
	"approved_date" timestamp,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "inspection_reports_report_number_unique" UNIQUE("report_number")
);
--> statement-breakpoint
CREATE TABLE "internal_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"sender_id" integer NOT NULL,
	"sender_name" text NOT NULL,
	"recipient_id" integer NOT NULL,
	"recipient_name" text NOT NULL,
	"subject" text NOT NULL,
	"content" text NOT NULL,
	"is_read" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoice_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_id" integer NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"unit_price" numeric(15, 2) NOT NULL,
	"amount" numeric(15, 2) NOT NULL,
	"amount_lc" numeric(15, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"invoice_number" varchar(50) NOT NULL,
	"customer_id" integer NOT NULL,
	"project_id" integer,
	"issue_date" date NOT NULL,
	"due_date" date NOT NULL,
	"total_amount" numeric(15, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"exchange_rate" numeric(10, 4) DEFAULT '1.0000',
	"status" varchar(20) DEFAULT 'Pending' NOT NULL,
	"notes" text,
	"is_export" boolean DEFAULT false,
	"export_destination_country" varchar(100),
	"export_port" varchar(100),
	"shipping_bill_number" varchar(100),
	"shipping_bill_date" date,
	"brc_required" boolean DEFAULT false,
	"brc_received" boolean DEFAULT false,
	"credit_note_number" varchar(50),
	"credit_note_date" date,
	"credit_note_amount" numeric(15, 2),
	"credit_note_reason" text,
	"credited_by" integer,
	"credited_at" timestamp,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_code_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"registry_type" varchar(20) NOT NULL,
	"scope_group" varchar(5) DEFAULT '' NOT NULL,
	"scope_subgroup" varchar(5) DEFAULT '' NOT NULL,
	"entity_key" varchar(60) NOT NULL,
	"abbr" varchar(10) NOT NULL,
	"label" varchar(150) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "item_components" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_item_id" integer NOT NULL,
	"component_item_id" integer NOT NULL,
	"quantity" numeric DEFAULT '1' NOT NULL,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "item_planning_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"planning_number" varchar(35),
	"project_id" integer NOT NULL,
	"project_item_id" integer NOT NULL,
	"master_item_id" integer NOT NULL,
	"planning_type" varchar(30) NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"classification_snapshot" varchar(20),
	"superseded_by" integer,
	"superseded_at" timestamp,
	"supersession_reason" text,
	"linked_task_id" integer,
	"assigned_to" integer,
	"notes" text,
	"created_by" integer,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"review_note" text,
	"released_by" integer,
	"released_at" timestamp,
	"release_note" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"source" varchar(30),
	"source_bom_header_id" integer,
	"source_bom_line_id" integer,
	"source_buy_list_header_id" integer,
	"source_buy_list_line_id" integer,
	"parent_project_item_id" integer,
	"quantity" numeric(12, 2),
	"item_code" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "item_planning_records_planning_number_unique" UNIQUE("planning_number")
);
--> statement-breakpoint
CREATE TABLE "itp_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"itp_id" integer NOT NULL,
	"sequence_number" integer NOT NULL,
	"activity_name" varchar(255) NOT NULL,
	"characteristics" varchar(255),
	"reference_documents" text,
	"acceptance_criteria" text,
	"record_format" varchar(255),
	"inspection_by" jsonb,
	"remarks" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itp_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"content" text NOT NULL,
	"placeholders" jsonb,
	"version" varchar(50) NOT NULL,
	"category" varchar(100),
	"tags" text[],
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itp_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"itp_id" integer NOT NULL,
	"version" integer NOT NULL,
	"revision" varchar(50) NOT NULL,
	"content" jsonb NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "itps" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(255) NOT NULL,
	"project_id" integer NOT NULL,
	"qap_id" integer,
	"template_id" integer,
	"equipment_name" varchar(255) NOT NULL,
	"drawing_number" varchar(255),
	"revision" varchar(50) DEFAULT 'A' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"status" varchar(50) DEFAULT 'draft' NOT NULL,
	"notified_body" varchar(255),
	"hazard_level" varchar(50),
	"prepared_by" integer NOT NULL,
	"approved_by" integer,
	"content" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "l1_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer,
	"worker_key" varchar(100) NOT NULL,
	"user_id" integer NOT NULL,
	"user_name" varchar(200),
	"priority" varchar(20) DEFAULT 'P2' NOT NULL,
	"what" varchar(200) NOT NULL,
	"where" varchar(500),
	"when_to" varchar(200),
	"why" varchar(500),
	"action_label" varchar(100),
	"action_url" varchar(500),
	"entity_type" varchar(100),
	"entity_id" varchar(100),
	"status" varchar(50) DEFAULT 'open' NOT NULL,
	"warning_type" varchar(100),
	"dismiss_count" integer DEFAULT 0 NOT NULL,
	"resolved_at" timestamp,
	"dismissed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "l1_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"worker_key" varchar(100) NOT NULL,
	"user_id" integer,
	"user_name" varchar(200),
	"entity_type" varchar(100),
	"entity_id" varchar(100),
	"entity_label" varchar(500),
	"checks_run" integer DEFAULT 0 NOT NULL,
	"checks_passed" integer DEFAULT 0 NOT NULL,
	"actions_generated" integer DEFAULT 0 NOT NULL,
	"result_status" varchar(50) DEFAULT 'passed' NOT NULL,
	"result_summary" varchar(500),
	"processing_ms" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "l1_workers" (
	"id" serial PRIMARY KEY NOT NULL,
	"worker_key" varchar(100) NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"description" text,
	"listen_events" text[] NOT NULL,
	"checks" text[],
	"module" varchar(100),
	"phase" varchar(20) DEFAULT 'phase1',
	"is_enabled" boolean DEFAULT false NOT NULL,
	"is_suspended" boolean DEFAULT false NOT NULL,
	"events_consumed" integer DEFAULT 0 NOT NULL,
	"actions_created" integer DEFAULT 0 NOT NULL,
	"actions_resolved" integer DEFAULT 0 NOT NULL,
	"avg_response_ms" integer DEFAULT 0 NOT NULL,
	"consecutive_errors" integer DEFAULT 0 NOT NULL,
	"last_event_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "l1_workers_worker_key_unique" UNIQUE("worker_key")
);
--> statement-breakpoint
CREATE TABLE "lead_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"lead_id" integer NOT NULL,
	"activity_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"activity_date" timestamp DEFAULT now() NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lead_sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_sources_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "lead_statuses" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"display_order" integer NOT NULL,
	"color" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "lead_statuses_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_name" text NOT NULL,
	"industry" text,
	"website" text,
	"currency" text,
	"expected_revenue" numeric(15, 2),
	"contact_name" text NOT NULL,
	"contact_title" text,
	"contact_email" text,
	"contact_phone" text,
	"country_code" text,
	"source_id" integer,
	"status_id" integer,
	"assigned_to" integer,
	"address_line1" text,
	"address_line2" text,
	"city" text,
	"state" text,
	"postal_code" text,
	"country" text,
	"notes" text,
	"requirements" text,
	"potential_value" numeric(15, 2),
	"probability" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"last_contacted_at" timestamp,
	"expected_close_date" date,
	"is_converted" boolean DEFAULT false,
	"customer_id" integer
);
--> statement-breakpoint
CREATE TABLE "leave_accrual_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"leave_type_id" integer NOT NULL,
	"accrual_month" varchar(7) NOT NULL,
	"days_accrued" numeric(5, 2) NOT NULL,
	"balance_after" numeric(5, 2),
	"run_by" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"leave_request_id" integer NOT NULL,
	"approver_id" integer NOT NULL,
	"approval_level" integer NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"comments" text,
	"approved_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_balance_adjustments" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"leave_type_id" integer NOT NULL,
	"year" integer NOT NULL,
	"adjustment_days" numeric(6, 2) NOT NULL,
	"reason" text NOT NULL,
	"adjusted_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_balances" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"leave_type_id" integer NOT NULL,
	"year" integer NOT NULL,
	"allocated_days" numeric(5, 2) DEFAULT '0' NOT NULL,
	"used_days" numeric(5, 2) DEFAULT '0' NOT NULL,
	"pending_days" numeric(5, 2) DEFAULT '0' NOT NULL,
	"carryover_days" numeric(5, 2) DEFAULT '0' NOT NULL,
	"adjustment_days" numeric(6, 2) DEFAULT '0' NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "leave_carryover_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"from_year" integer NOT NULL,
	"to_year" integer NOT NULL,
	"run_at" timestamp DEFAULT now() NOT NULL,
	"run_by" integer,
	"processed" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"errors" text[],
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "leave_deductions" (
	"id" serial PRIMARY KEY NOT NULL,
	"leave_request_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"leave_type_id" integer NOT NULL,
	"deduction_date" date NOT NULL,
	"days" numeric(4, 2) DEFAULT '1' NOT NULL,
	"deduction_type" varchar(30) DEFAULT 'sandwich' NOT NULL,
	"reason" text,
	"status" varchar(20) DEFAULT 'approved' NOT NULL,
	"voided_by" integer,
	"voided_at" timestamp,
	"void_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"policy_name" varchar(100) NOT NULL,
	"policy_value" text NOT NULL,
	"data_type" varchar(20) DEFAULT 'string' NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" integer,
	CONSTRAINT "leave_policies_policy_name_unique" UNIQUE("policy_name")
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"leave_type_id" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"total_days" numeric(5, 2) NOT NULL,
	"is_half_day" boolean DEFAULT false,
	"half_day_period" varchar(10),
	"reason" text NOT NULL,
	"emergency_contact" text,
	"work_handover_notes" text,
	"attachment_url" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"applied_date" timestamp DEFAULT now() NOT NULL,
	"manager_id" integer,
	"manager_approval_status" varchar(20),
	"manager_approval_date" timestamp,
	"manager_comments" text,
	"hr_approval_id" integer,
	"hr_approval_status" varchar(20),
	"hr_approval_date" timestamp,
	"hr_comments" text,
	"approved_by" integer,
	"approved_date" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leave_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(100) NOT NULL,
	"code" varchar(20) NOT NULL,
	"description" text,
	"max_days_per_year" numeric(5, 2) DEFAULT '0',
	"carryover_allowed" boolean DEFAULT false,
	"max_carryover_days" numeric(5, 2) DEFAULT '0',
	"is_paid" boolean DEFAULT true,
	"requires_approval" boolean DEFAULT true,
	"notice_days_required" integer DEFAULT 1,
	"can_be_half_day" boolean DEFAULT true,
	"sandwich_applicable" boolean DEFAULT false,
	"color_code" varchar(7) DEFAULT '#3B82F6',
	"is_active" boolean DEFAULT true,
	"accrual_type" varchar(20) DEFAULT 'manual',
	"monthly_accrual_rate" numeric(5, 2) DEFAULT '0',
	"accrual_day_of_month" integer DEFAULT 1,
	"accrual_pro_rate" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "leave_types_name_unique" UNIQUE("name"),
	CONSTRAINT "leave_types_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "legacy_file_access_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"legacy_path" varchar(500) NOT NULL,
	"path_family" varchar(20) NOT NULL,
	"project_id" integer,
	"accessed_by" integer NOT NULL,
	"accessed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" varchar(20) DEFAULT 'download' NOT NULL,
	"migrated_to_epc" boolean DEFAULT false NOT NULL,
	"epc_attachment_id" integer
);
--> statement-breakpoint
CREATE TABLE "legal_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"alert_type" varchar(100) NOT NULL,
	"reference_type" varchar(100) NOT NULL,
	"reference_id" integer NOT NULL,
	"alert_date" date NOT NULL,
	"alert_title" varchar(255) NOT NULL,
	"alert_message" text NOT NULL,
	"status" varchar(50) DEFAULT 'Active' NOT NULL,
	"priority" varchar(20) DEFAULT 'Medium' NOT NULL,
	"assigned_to" integer,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_number" varchar(255) NOT NULL,
	"case_title" varchar(500) NOT NULL,
	"case_type" varchar(100) NOT NULL,
	"case_status" varchar(50) DEFAULT 'Active' NOT NULL,
	"court_name" varchar(255),
	"judge_name" varchar(255),
	"opposing_party" varchar(255),
	"case_value" numeric(15, 2),
	"currency" varchar(10) DEFAULT 'INR' NOT NULL,
	"filing_date" date,
	"next_hearing_date" date,
	"expected_closure_date" date,
	"priority" varchar(20) DEFAULT 'Medium' NOT NULL,
	"description" text,
	"outcome" text,
	"internal_counsel" integer,
	"external_counsel_id" integer,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "legal_cases_case_number_unique" UNIQUE("case_number")
);
--> statement-breakpoint
CREATE TABLE "legal_notices" (
	"id" serial PRIMARY KEY NOT NULL,
	"notice_number" varchar(255) NOT NULL,
	"notice_type" varchar(100) NOT NULL,
	"from_party" varchar(255) NOT NULL,
	"to_party" varchar(255) NOT NULL,
	"subject" varchar(500) NOT NULL,
	"notice_date" date NOT NULL,
	"response_due_date" date,
	"response_date" date,
	"status" varchar(50) DEFAULT 'Pending' NOT NULL,
	"priority" varchar(20) DEFAULT 'Medium' NOT NULL,
	"description" text NOT NULL,
	"response_summary" text,
	"action_required" text,
	"assigned_to" integer,
	"file_path" varchar(500),
	"file_url" varchar(500),
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "legal_notices_notice_number_unique" UNIQUE("notice_number")
);
--> statement-breakpoint
CREATE TABLE "llm_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"prompt_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"model" varchar(100) NOT NULL,
	"execution_timestamp" timestamp DEFAULT now() NOT NULL,
	"masked_input" text,
	"llm_response" text,
	"execution_status" varchar(50) NOT NULL,
	"execution_time_ms" integer,
	"token_usage_input" integer,
	"token_usage_output" integer,
	"cost_usd" numeric(10, 6),
	"error_message" text,
	"is_test_mode" boolean DEFAULT false,
	"routing_reason" varchar(200),
	"original_model_request" varchar(100),
	"fallback_used" boolean DEFAULT false,
	"masking_rules_applied" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_prompts_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"template" text NOT NULL,
	"category" varchar(100) NOT NULL,
	"model" varchar(50) DEFAULT 'gpt-4o',
	"frequency" varchar(20) DEFAULT 'daily',
	"active" boolean DEFAULT true,
	"version" integer DEFAULT 1,
	"priority" integer DEFAULT 5,
	"temperature" numeric(3, 2) DEFAULT '0.70',
	"data_query" text,
	"data_parameters" jsonb,
	"output_format" varchar(50) DEFAULT 'markdown',
	"preferred_model" varchar(100),
	"masking_rules" jsonb,
	"is_sensitive" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "llm_prompts_registry_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "login_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"username" varchar(100),
	"ip_address" varchar(45),
	"user_agent" text,
	"outcome" varchar(30) NOT NULL,
	"policy_level" varchar(20),
	"is_trusted_device" boolean DEFAULT false,
	"network_flag" boolean DEFAULT false,
	"failed_attempt_count" integer,
	"severity" varchar(20) DEFAULT 'info' NOT NULL,
	"archived_at" timestamp,
	"archive_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_security_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"policy_level" varchar(20) NOT NULL,
	"apply_to_roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"require_2fa" boolean DEFAULT false NOT NULL,
	"require_device_trust" boolean DEFAULT false NOT NULL,
	"max_session_hours" integer DEFAULT 24 NOT NULL,
	"max_failed_attempts" integer DEFAULT 5 NOT NULL,
	"lockout_minutes" integer DEFAULT 15 NOT NULL,
	"reauth_timeout_minutes" integer DEFAULT 60 NOT NULL,
	"allowed_networks" text[],
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "login_security_policies_policy_level_unique" UNIQUE("policy_level")
);
--> statement-breakpoint
CREATE TABLE "lwp_exemption_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"action" varchar(20) NOT NULL,
	"granted_by" integer,
	"reason" text,
	"effective_from" date,
	"next_review" date,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "machine_allocations" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_order_id" integer NOT NULL,
	"machine_name" text NOT NULL,
	"machine_code" text,
	"start_time" timestamp NOT NULL,
	"end_time" timestamp,
	"setup_time_minutes" integer DEFAULT 0 NOT NULL,
	"downtime_minutes" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "makes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"normalized" text NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "makes_normalized_unique" UNIQUE("normalized")
);
--> statement-breakpoint
CREATE TABLE "manual_salary_entries" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"payroll_record_id" integer,
	"entry_type" varchar(20) DEFAULT 'daily',
	"days_worked" numeric(5, 2) DEFAULT '0',
	"hours_worked" numeric(6, 2) DEFAULT '0',
	"quantity" numeric(10, 2) DEFAULT '0',
	"base_rate" numeric(12, 2) NOT NULL,
	"overtime_hours" numeric(6, 2) DEFAULT '0',
	"overtime_rate_multiplier" numeric(3, 2) DEFAULT '1.5',
	"overtime_earned" numeric(12, 2) DEFAULT '0',
	"base_earnings" numeric(12, 2) DEFAULT '0',
	"gross_earnings" numeric(12, 2) DEFAULT '0',
	"pf_amount" numeric(10, 2) DEFAULT '0',
	"pt_amount" numeric(10, 2) DEFAULT '0',
	"esic_amount" numeric(10, 2) DEFAULT '0',
	"tds_amount" numeric(10, 2) DEFAULT '0',
	"tds_section" varchar(10) DEFAULT '194C',
	"total_deductions" numeric(10, 2) DEFAULT '0',
	"net_pay" numeric(12, 2) DEFAULT '0',
	"entry_purpose" varchar(30) DEFAULT 'full_salary',
	"remarks" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "marketing_campaigns" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"objective" text,
	"channel_id" integer,
	"start_date" date,
	"end_date" date,
	"budget" numeric(15, 2),
	"actual_cost" numeric(15, 2),
	"status" text NOT NULL,
	"goals" text,
	"target_audience" text,
	"ctr" numeric(10, 2),
	"cpc" numeric(10, 2),
	"conversions" integer,
	"conversion_rate" numeric(10, 2),
	"cpa" numeric(10, 2),
	"impressions" integer,
	"quality_score" numeric(5, 2),
	"roas" numeric(10, 2),
	"impression_share" numeric(10, 2),
	"bounce_rate" numeric(10, 2),
	"expected_lead_count" integer,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "master_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_code" text NOT NULL,
	"description" text NOT NULL,
	"specification" text,
	"uom" text NOT NULL,
	"make_or_buy" text,
	"drawing_no" text,
	"latest_revision" integer DEFAULT 0,
	"item_type" text DEFAULT 'project',
	"buy_group_id" integer,
	"buy_subgroup_id" integer,
	"catalog_make" text,
	"catalog_model" text,
	"standard_cost" numeric(12, 2),
	"supplier" text,
	"notes" text,
	"preferred_vendor_id" integer,
	"estimated_cost" numeric(12, 2),
	"unit" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "master_items_item_code_unique" UNIQUE("item_code")
);
--> statement-breakpoint
CREATE TABLE "material_consumption" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_order_id" integer NOT NULL,
	"component_item_id" integer NOT NULL,
	"quantity_required" numeric(10, 2) NOT NULL,
	"quantity_consumed" numeric(10, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'allocated' NOT NULL,
	"recorded_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_identification" (
	"id" serial PRIMARY KEY NOT NULL,
	"material_identification_id" varchar(255) NOT NULL,
	"project_id" integer NOT NULL,
	"project_number" varchar(255),
	"project_name" varchar(255),
	"inspection_order_number" varchar(255),
	"material_type" varchar(255),
	"material_description" text NOT NULL,
	"material_code" varchar(255) NOT NULL,
	"specification" varchar(255) NOT NULL,
	"material_grade" varchar(255) NOT NULL,
	"heat_number" varchar(255) NOT NULL,
	"batch_number" varchar(255),
	"mill_name" varchar(255) NOT NULL,
	"mill_test_certificate_number" varchar(255) NOT NULL,
	"quantity" varchar(255) NOT NULL,
	"unit" varchar(50) NOT NULL,
	"dimensions" varchar(255) NOT NULL,
	"material_status" varchar(255) NOT NULL,
	"inspector_name" varchar(255) NOT NULL,
	"inspection_date" date NOT NULL,
	"remarks" text,
	"created_by" integer NOT NULL,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "material_identification_material_identification_id_unique" UNIQUE("material_identification_id")
);
--> statement-breakpoint
CREATE TABLE "material_identification_counter" (
	"year" integer PRIMARY KEY NOT NULL,
	"sequence_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_inspection_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"inspection_order_id" integer NOT NULL,
	"material_id" integer NOT NULL,
	"material_identification_id" text NOT NULL,
	"material_certificate_number" text,
	"heat_number" text,
	"material_grade" text,
	"material_specification" text,
	"allocated_quantity" text,
	"quantity_unit" text,
	"description" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_analytics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"team_id" integer,
	"period_type" varchar(20) NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"total_meetings" integer DEFAULT 0,
	"meetings_organized" integer DEFAULT 0,
	"meetings_attended" integer DEFAULT 0,
	"meeting_hours" numeric(6, 2) DEFAULT '0',
	"average_meeting_duration" numeric(5, 2) DEFAULT '0',
	"meeting_effectiveness_score" numeric(5, 2) DEFAULT '0',
	"total_commitments" integer DEFAULT 0,
	"commitments_assigned" integer DEFAULT 0,
	"commitments_completed" integer DEFAULT 0,
	"commitments_overdue" integer DEFAULT 0,
	"average_completion_time" numeric(5, 2) DEFAULT '0',
	"commitment_completion_rate" numeric(5, 2) DEFAULT '0',
	"kpi_impact_score" numeric(5, 2) DEFAULT '0',
	"business_value_generated" numeric(10, 2) DEFAULT '0',
	"participation_score" numeric(5, 2) DEFAULT '0',
	"feedback_score" numeric(5, 2) DEFAULT '0',
	"punctuality_score" numeric(5, 2) DEFAULT '0',
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_attendance" (
	"id" serial PRIMARY KEY NOT NULL,
	"meeting_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"status" varchar(20) DEFAULT 'Invited' NOT NULL,
	"response_date" timestamp,
	"attendance_confirmed" boolean DEFAULT false,
	"join_time" timestamp,
	"leave_time" timestamp,
	"participation_minutes" integer,
	"participation_score" integer,
	"meeting_feedback" text,
	"action_items_received" integer DEFAULT 0,
	"action_items_completed" integer DEFAULT 0,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_commitments" (
	"id" serial PRIMARY KEY NOT NULL,
	"meeting_id" integer,
	"meeting_type" varchar(20) DEFAULT 'internal' NOT NULL,
	"google_calendar_event_id" text,
	"meeting_title" text,
	"meeting_date" date,
	"meeting_start_time" time,
	"title" text NOT NULL,
	"description" text,
	"priority" varchar(20) DEFAULT 'Medium' NOT NULL,
	"category" varchar(50) DEFAULT 'Action Item',
	"assigned_to_id" integer NOT NULL,
	"assigned_by_id" integer NOT NULL,
	"collaborators" jsonb DEFAULT '[]'::jsonb,
	"due_date" date NOT NULL,
	"estimated_hours" numeric(5, 2),
	"actual_hours" numeric(5, 2),
	"status" varchar(20) DEFAULT 'Pending' NOT NULL,
	"progress_percentage" integer DEFAULT 0,
	"completion_date" date,
	"status_updates" jsonb DEFAULT '[]'::jsonb,
	"blockers" text,
	"dependencies" jsonb DEFAULT '[]'::jsonb,
	"reminder_days" integer DEFAULT 1,
	"escalation_days" integer DEFAULT 3,
	"last_reminder_sent" timestamp,
	"escalation_sent" boolean DEFAULT false,
	"escalated_at" timestamp,
	"escalated_to_id" integer,
	"impact_level" varchar(20) DEFAULT 'Medium',
	"business_value" text,
	"success_criteria" text,
	"deliverables" jsonb DEFAULT '[]'::jsonb,
	"linked_kpis" jsonb DEFAULT '[]'::jsonb,
	"kpi_weight" numeric(5, 2) DEFAULT '0',
	"kpi_impact_percentage" numeric(5, 2) DEFAULT '0',
	"requires_approval" boolean DEFAULT false,
	"approved_by" integer,
	"approved_at" timestamp,
	"approval_notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_kpi_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"meeting_id" integer,
	"commitment_id" integer,
	"kpi_id" integer,
	"kpi_name" text NOT NULL,
	"kpi_category" varchar(50),
	"baseline_value" numeric(15, 6),
	"target_value" numeric(15, 6),
	"current_value" numeric(15, 6),
	"impact_weight" numeric(5, 2) DEFAULT '0',
	"measurement_date" date,
	"progress_percentage" numeric(5, 2) DEFAULT '0',
	"is_positive_impact" boolean DEFAULT true,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_reminders" (
	"id" serial PRIMARY KEY NOT NULL,
	"meeting_id" integer,
	"commitment_id" integer,
	"reminder_type" varchar(30) NOT NULL,
	"recipient_id" integer NOT NULL,
	"reminder_message" text NOT NULL,
	"delivery_method" varchar(20) DEFAULT 'email' NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"delivery_status" varchar(20) DEFAULT 'sent' NOT NULL,
	"acknowledged" boolean DEFAULT false,
	"acknowledged_at" timestamp,
	"response_action" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meeting_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"meeting_type" varchar(50) NOT NULL,
	"default_duration_minutes" integer DEFAULT 60,
	"default_location" text,
	"agenda_template" jsonb DEFAULT '[]'::jsonb,
	"standard_attendees" jsonb DEFAULT '[]'::jsonb,
	"linked_kpis" jsonb DEFAULT '[]'::jsonb,
	"default_kpi_weight" numeric(5, 2) DEFAULT '0',
	"is_active" boolean DEFAULT true,
	"is_public" boolean DEFAULT false,
	"usage_count" integer DEFAULT 0,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "module_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"module_name" text NOT NULL,
	"can_view" boolean DEFAULT false NOT NULL,
	"can_create" boolean DEFAULT false NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL,
	"can_delete" boolean DEFAULT false NOT NULL,
	"can_upload" boolean DEFAULT false NOT NULL,
	"can_download" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monthly_kpi_summary" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"total_working_days" integer DEFAULT 0 NOT NULL,
	"days_present" integer DEFAULT 0 NOT NULL,
	"days_absent" integer DEFAULT 0 NOT NULL,
	"days_late" integer DEFAULT 0 NOT NULL,
	"total_hours_worked" numeric(6, 2) DEFAULT '0',
	"overtime_hours" numeric(6, 2) DEFAULT '0',
	"attendance_percentage" numeric(5, 2) DEFAULT '0',
	"total_tasks_completed" integer DEFAULT 0,
	"average_productivity_score" numeric(5, 2) DEFAULT '0',
	"average_quality_score" numeric(5, 2) DEFAULT '0',
	"average_efficiency_rating" numeric(5, 2) DEFAULT '0',
	"average_collaboration_score" numeric(5, 2) DEFAULT '0',
	"dwar_submission_rate" numeric(5, 2) DEFAULT '0',
	"average_manager_rating" numeric(3, 2) DEFAULT '0',
	"total_approved_reports" integer DEFAULT 0,
	"total_rejected_reports" integer DEFAULT 0,
	"overall_performance_score" numeric(5, 2) DEFAULT '0',
	"performance_grade" varchar(2) DEFAULT 'C',
	"calculated_at" timestamp DEFAULT now() NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "nda_agreements" (
	"id" serial PRIMARY KEY NOT NULL,
	"agreement_number" varchar(255) NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"party_name" varchar(255) NOT NULL,
	"party_type" varchar(50) NOT NULL,
	"party_contact" varchar(255),
	"party_email" varchar(255),
	"nda_type" varchar(50) NOT NULL,
	"disclosure_scope" text NOT NULL,
	"purpose" text NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"duration_months" integer,
	"confidentiality_level" varchar(50) DEFAULT 'Standard',
	"permitted_use" text,
	"exceptions" text,
	"return_obligation" boolean DEFAULT true,
	"monetary_damages" numeric(15, 2),
	"currency" varchar(10) DEFAULT 'INR',
	"governing_law" varchar(100) DEFAULT 'Indian Law',
	"jurisdiction" varchar(100),
	"status" varchar(50) DEFAULT 'Active',
	"breach_incidents" integer DEFAULT 0,
	"auto_renewal" boolean DEFAULT false,
	"notice_period_days" integer DEFAULT 30,
	"file_path" varchar(500),
	"file_url" varchar(500),
	"digital_signature_required" boolean DEFAULT false,
	"signed_date" date,
	"witness_required" boolean DEFAULT false,
	"witness_name" varchar(255),
	"witness_contact" varchar(255),
	"created_by" integer,
	"assigned_to" integer,
	"approved_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "nda_agreements_agreement_number_unique" UNIQUE("agreement_number")
);
--> statement-breakpoint
CREATE TABLE "nda_breach_incidents" (
	"id" serial PRIMARY KEY NOT NULL,
	"nda_id" integer,
	"incident_number" varchar(255) NOT NULL,
	"incident_date" date NOT NULL,
	"incident_type" varchar(100) NOT NULL,
	"severity" varchar(50) NOT NULL,
	"description" text NOT NULL,
	"discovered_by" varchar(255),
	"discovery_date" date,
	"investigation_status" varchar(50) DEFAULT 'Open',
	"investigation_findings" text,
	"remedial_actions" text,
	"legal_action_taken" boolean DEFAULT false,
	"legal_action_details" text,
	"damages_claimed" numeric(15, 2),
	"damages_awarded" numeric(15, 2),
	"currency" varchar(10) DEFAULT 'INR',
	"resolution_date" date,
	"lessons_learned" text,
	"preventive_measures" text,
	"created_by" integer,
	"assigned_to" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "nda_breach_incidents_incident_number_unique" UNIQUE("incident_number")
);
--> statement-breakpoint
CREATE TABLE "non_conformance_reports" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"project_code" text NOT NULL,
	"inspection_report_id" integer,
	"ncr_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"severity" text NOT NULL,
	"category" text NOT NULL,
	"identified_date" timestamp NOT NULL,
	"identified_by" integer NOT NULL,
	"location" text,
	"project_item_id" integer,
	"work_order_id" integer,
	"batch_number" text,
	"plc_line_id" integer,
	"grn_record_id" integer,
	"quantity_affected" integer NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"disposition" text,
	"root_cause" text,
	"corrective_action" text,
	"preventive_action" text,
	"reviewed_by" integer,
	"reviewed_date" timestamp,
	"approved_by" integer,
	"approved_date" timestamp,
	"closed_by" integer,
	"closed_date" timestamp,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "non_conformance_reports_ncr_number_unique" UNIQUE("ncr_number")
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"type" varchar(50) NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"link" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"priority" varchar(20) DEFAULT 'medium' NOT NULL,
	"category" varchar(50) DEFAULT 'general' NOT NULL,
	"status" varchar(20) DEFAULT 'new' NOT NULL,
	"source_type" varchar(50),
	"source_id" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_archive_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"offer_id" integer NOT NULL,
	"revision" integer NOT NULL,
	"action_type" varchar(10) NOT NULL,
	"status" varchar(20) DEFAULT 'archiving' NOT NULL,
	"archived_by" integer,
	"archived_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"error_detail" text
);
--> statement-breakpoint
CREATE TABLE "offer_comm_categories" (
	"id" serial PRIMARY KEY NOT NULL,
	"category_code" varchar(60) NOT NULL,
	"category_path" varchar(120) NOT NULL,
	"display_label" text NOT NULL,
	"section" varchar(20) NOT NULL,
	"sort_order" integer NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "offer_comm_categories_category_code_unique" UNIQUE("category_code"),
	CONSTRAINT "offer_comm_categories_category_path_unique" UNIQUE("category_path")
);
--> statement-breakpoint
CREATE TABLE "offer_comm_doc_conversions" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_doc_id" integer NOT NULL,
	"snapshot_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"source_gcs_path" text NOT NULL,
	"dest_gcs_path" text NOT NULL,
	"gcs_copy_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"mirror_job_id" integer,
	"mirror_status" varchar(20) DEFAULT 'not_started' NOT NULL,
	"error_detail" text,
	"gcs_rule_id" integer,
	"converted_by" integer NOT NULL,
	"converted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_comm_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"communication_id" integer NOT NULL,
	"document_type" varchar(40) NOT NULL,
	"file_name" text NOT NULL,
	"gcs_path" text NOT NULL,
	"sha256" text NOT NULL,
	"revision" varchar(10) DEFAULT '00' NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"file_size_bytes" integer,
	"mime_type" varchar(100),
	"mirror_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"mirror_job_id" integer,
	"gcs_rule_id" integer,
	"template_id" integer,
	"uploaded_by" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "offer_comm_documents_gcs_path_unique" UNIQUE("gcs_path")
);
--> statement-breakpoint
CREATE TABLE "offer_comm_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"template_type" varchar(10) NOT NULL,
	"comm_category_id" integer,
	"is_default" boolean DEFAULT false NOT NULL,
	"gcs_object_path" text,
	"gcs_bucket" text,
	"file_name" text NOT NULL,
	"file_size" integer,
	"checksum_sha256" text,
	"version_seq" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"mirror_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"mirror_job_id" integer,
	"uploaded_by" integer,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_communications" (
	"id" serial PRIMARY KEY NOT NULL,
	"offer_id" integer NOT NULL,
	"communication_category_id" integer NOT NULL,
	"comm_date" date NOT NULL,
	"title" text NOT NULL,
	"direction" varchar(20) NOT NULL,
	"channel" varchar(30) NOT NULL,
	"customer_contact" text,
	"from_party" text,
	"to_party" text,
	"cc_party" text,
	"customer_question" text,
	"summary" text,
	"action_required" boolean DEFAULT false NOT NULL,
	"responsible_user_id" integer,
	"due_date" date,
	"status" varchar(30) DEFAULT 'Open' NOT NULL,
	"response_type" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer_conversion_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"conversion_id" uuid NOT NULL,
	"offer_id" integer NOT NULL,
	"offer_revision" integer NOT NULL,
	"order_number" varchar(15) NOT NULL,
	"header_snapshot" jsonb NOT NULL,
	"items_snapshot" jsonb NOT NULL,
	"epc_params_snapshot" jsonb NOT NULL,
	"project_id" integer,
	"conversion_status" varchar(20) DEFAULT 'initiated' NOT NULL,
	"error_detail" text,
	"converted_by" integer NOT NULL,
	"converted_at" timestamp DEFAULT now() NOT NULL,
	"final_offer_gcs_path" text,
	"final_offer_mirror_status" varchar(20),
	"final_offer_mirror_job_id" integer,
	CONSTRAINT "offer_conversion_snapshots_conversion_id_unique" UNIQUE("conversion_id"),
	CONSTRAINT "offer_conversion_snapshots_offer_id_unique" UNIQUE("offer_id"),
	CONSTRAINT "offer_conversion_snapshots_order_number_unique" UNIQUE("order_number")
);
--> statement-breakpoint
CREATE TABLE "offer_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"offer_id" integer NOT NULL,
	"product_id" integer,
	"product_code" text,
	"description" text NOT NULL,
	"unit" text NOT NULL,
	"quantity" numeric(15, 3) NOT NULL,
	"unit_price" numeric(15, 2) NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT '0',
	"total_price" numeric(15, 2) NOT NULL,
	"hsn_sac_code" text,
	"is_sub_item" boolean DEFAULT false,
	"parent_item_id" integer,
	"sort_order" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "offer_subjects" (
	"id" serial PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "offer_subjects_subject_unique" UNIQUE("subject")
);
--> statement-breakpoint
CREATE TABLE "offer_template_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"action" text NOT NULL,
	"performed_by" integer,
	"performed_at" timestamp DEFAULT now(),
	"version_seq" integer,
	"meta" text
);
--> statement-breakpoint
CREATE TABLE "offer_template_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"version_seq" integer NOT NULL,
	"gcs_object_path" text,
	"gcs_bucket" text,
	"file_name" text NOT NULL,
	"file_size" integer,
	"checksum_sha256" text,
	"label" text,
	"uploaded_by" integer,
	"uploaded_at" timestamp DEFAULT now(),
	"status" text DEFAULT 'superseded' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "offer_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"subject" text NOT NULL,
	"description" text,
	"file_path" text NOT NULL,
	"file_name" text NOT NULL,
	"file_size" integer,
	"position" text DEFAULT 'after' NOT NULL,
	"language" text DEFAULT 'English' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"start_page" integer,
	"end_page" integer,
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"gcs_object_path" text,
	"gcs_bucket" text,
	"checksum_sha256" text,
	"version_seq" integer DEFAULT 1 NOT NULL,
	"current_label" text,
	"mirror_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"mirror_job_id" integer
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"id" serial PRIMARY KEY NOT NULL,
	"offer_number" text NOT NULL,
	"customer_id" integer,
	"customer_name" text NOT NULL,
	"customer_email" text,
	"customer_address" text,
	"contact_person" text,
	"subject" text NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"subtotal" numeric(15, 2) DEFAULT '0' NOT NULL,
	"discount_percent" numeric(5, 2) DEFAULT '0',
	"discount_amount" numeric(15, 2) DEFAULT '0',
	"tax_percent" numeric(5, 2) DEFAULT '0',
	"tax_amount" numeric(15, 2) DEFAULT '0',
	"total_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'Draft' NOT NULL,
	"valid_until" timestamp,
	"payment_terms" text,
	"delivery_terms" text,
	"notes" text,
	"terms_and_conditions" text,
	"template_pdf_path" text,
	"template_pdf_name" text,
	"template_pdf_position" text DEFAULT 'middle',
	"language" text DEFAULT 'English',
	"created_by" integer,
	"approved_by" integer,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"commercial_chain_id" uuid DEFAULT gen_random_uuid() NOT NULL,
	"parent_offer_id" integer,
	"root_offer_id" integer,
	"is_test" boolean DEFAULT false NOT NULL,
	"offer_type" text DEFAULT 'standalone' NOT NULL,
	"confirmation_doc_gcs_path" text,
	"confirmation_doc_filename" text,
	"final_offer_gcs_path" text,
	"final_offer_mirror_status" varchar(20),
	"final_offer_mirror_job_id" integer,
	"offer_scope" varchar(10),
	"freight_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"freight_tax_amount" numeric(15, 2) DEFAULT '0' NOT NULL,
	"final_value" numeric(15, 2) DEFAULT '0' NOT NULL,
	CONSTRAINT "offers_offer_number_unique" UNIQUE("offer_number")
);
--> statement-breakpoint
CREATE TABLE "oi_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_id" integer NOT NULL,
	"action" "oi_audit_action" NOT NULL,
	"actor_id" integer NOT NULL,
	"actor_name" text NOT NULL,
	"actor_role" text NOT NULL,
	"field_name" text,
	"old_value" text,
	"new_value" text,
	"context" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_capa_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"capa_id" integer NOT NULL,
	"action_no" integer NOT NULL,
	"description" text NOT NULL,
	"assigned_to" integer,
	"due_date" timestamp,
	"status" text DEFAULT 'open' NOT NULL,
	"completed_at" timestamp,
	"completed_by" integer,
	"completion_note" text,
	"verification_status" text DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp,
	"verified_by" integer,
	"verification_note" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_capa_effectiveness" (
	"id" serial PRIMARY KEY NOT NULL,
	"capa_id" integer NOT NULL,
	"review_cycle" integer DEFAULT 1 NOT NULL,
	"reviewer_id" integer NOT NULL,
	"reviewed_at" timestamp DEFAULT now() NOT NULL,
	"effectiveness_score" integer NOT NULL,
	"is_effective" boolean NOT NULL,
	"recurrence_observed" boolean DEFAULT false NOT NULL,
	"evidence_notes" text,
	"recommendation" text
);
--> statement-breakpoint
CREATE TABLE "oi_capa_escalation_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"capa_id" integer NOT NULL,
	"level" integer NOT NULL,
	"fired_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_capa_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"capa_number" text NOT NULL,
	"issue_id" integer NOT NULL,
	"rca_id" integer NOT NULL,
	"capa_type" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"root_cause_ref" text,
	"priority" text DEFAULT 'medium' NOT NULL,
	"assigned_to" integer,
	"verifier_id" integer,
	"approver_id" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"due_date" timestamp,
	"extended_due_date" timestamp,
	"opened_at" timestamp,
	"in_progress_at" timestamp,
	"pending_verification_at" timestamp,
	"effectiveness_review_at" timestamp,
	"closed_at" timestamp,
	"cancelled_at" timestamp,
	"cancellation_reason" text,
	"re_open_count" integer DEFAULT 0 NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oi_capa_records_capa_number_unique" UNIQUE("capa_number")
);
--> statement-breakpoint
CREATE TABLE "oi_enforcement_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"control_id" integer,
	"hold_id" integer,
	"action" "oi_audit_action" NOT NULL,
	"actor_id" integer NOT NULL,
	"actor_name" text NOT NULL,
	"actor_role" text NOT NULL,
	"field_name" text,
	"old_value" text,
	"new_value" text,
	"context" text,
	"ip_address" text,
	"is_override_event" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_enforcement_checklist_responses" (
	"id" serial PRIMARY KEY NOT NULL,
	"hold_id" integer NOT NULL,
	"checklist_item_id" integer NOT NULL,
	"sop_revision_number" integer NOT NULL,
	"checklist_revision_number" integer NOT NULL,
	"response_status" text DEFAULT 'pending' NOT NULL,
	"is_checked" boolean DEFAULT false NOT NULL,
	"evidence_note" text,
	"responded_by" integer,
	"responded_at" timestamp,
	"rejection_reason" text,
	"rejected_by" integer,
	"rejected_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_enforcement_checklists" (
	"id" serial PRIMARY KEY NOT NULL,
	"control_id" integer NOT NULL,
	"item_number" integer NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"is_required" boolean DEFAULT true NOT NULL,
	"evidence_required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_enforcement_controls" (
	"id" serial PRIMARY KEY NOT NULL,
	"control_number" text NOT NULL,
	"sop_id" integer NOT NULL,
	"sop_revision_number" integer NOT NULL,
	"erp_entity_type" text NOT NULL,
	"control_type" text NOT NULL,
	"enforcement_level" text DEFAULT 'advisory' NOT NULL,
	"enforcement_scope" text DEFAULT 'global' NOT NULL,
	"scope_project_id" integer,
	"scope_equipment_type" text,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"rationale" text NOT NULL,
	"department" text NOT NULL,
	"process_area" text,
	"control_checklist_version" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"owner_id" integer NOT NULL,
	"approver_id" integer NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"suspended_by" integer,
	"suspended_at" timestamp,
	"suspension_reason" text,
	"retired_by" integer,
	"retired_at" timestamp,
	"retirement_reason" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oi_enforcement_controls_control_number_unique" UNIQUE("control_number")
);
--> statement-breakpoint
CREATE TABLE "oi_enforcement_holds" (
	"id" serial PRIMARY KEY NOT NULL,
	"hold_number" text NOT NULL,
	"control_id" integer NOT NULL,
	"erp_entity_type" text NOT NULL,
	"erp_entity_id" integer NOT NULL,
	"erp_entity_ref" text,
	"enforcement_level" text NOT NULL,
	"hold_type" text NOT NULL,
	"enforcement_scope" text NOT NULL,
	"is_primary_hold" boolean DEFAULT false NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"hold_owner_id" integer NOT NULL,
	"responsible_department" text NOT NULL,
	"escalation_owner_id" integer NOT NULL,
	"hold_approver_id" integer,
	"raised_by" integer NOT NULL,
	"raised_at" timestamp DEFAULT now() NOT NULL,
	"approved_to_proceed_by" integer,
	"approved_to_proceed_at" timestamp,
	"approved_to_proceed_note" text,
	"released_by" integer,
	"released_at" timestamp,
	"release_note" text,
	"override_by" integer,
	"override_at" timestamp,
	"override_reason" text,
	"bypass_by" integer,
	"bypass_at" timestamp,
	"bypass_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oi_enforcement_holds_hold_number_unique" UNIQUE("hold_number")
);
--> statement-breakpoint
CREATE TABLE "oi_escalations" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_id" integer NOT NULL,
	"escalation_type" "oi_escalation_type" NOT NULL,
	"triggered_by" integer,
	"triggered_at" timestamp DEFAULT now() NOT NULL,
	"escalated_to" integer,
	"notification_sent" boolean DEFAULT false NOT NULL,
	"notification_sent_at" timestamp,
	"context" text,
	"resolved" boolean DEFAULT false NOT NULL,
	"resolved_at" timestamp,
	"resolved_by" integer
);
--> statement-breakpoint
CREATE TABLE "oi_issue_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_id" integer NOT NULL,
	"gcs_path" text NOT NULL,
	"file_name" text NOT NULL,
	"original_name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"seq" integer DEFAULT 1 NOT NULL,
	"uploaded_by" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_issue_title_master" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"department" text,
	"category" text,
	"project_phase" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"department" text,
	"category" "oi_category" NOT NULL,
	"sub_category" text,
	"project_phase" "oi_project_phase" NOT NULL,
	"severity" "oi_severity" NOT NULL,
	"status" "oi_issue_status" DEFAULT 'captured' NOT NULL,
	"project_id" integer,
	"equipment_family" text,
	"equipment_type" text,
	"package_type" text,
	"process_system" text,
	"utility_system" text,
	"skid_system" text,
	"customer_industry" text,
	"critical_equipment_flag" boolean DEFAULT false NOT NULL,
	"critical_path_flag" boolean DEFAULT false NOT NULL,
	"project_complexity" text,
	"probability_level" "oi_probability_level",
	"impact_level" "oi_impact_level",
	"risk_score" integer,
	"risk_rating" "oi_risk_rating",
	"recurrence_risk" text,
	"business_criticality" "oi_criticality_level",
	"customer_criticality" "oi_criticality_level",
	"safety_criticality" "oi_criticality_level",
	"statutory_criticality" "oi_criticality_level",
	"financial_criticality" "oi_criticality_level",
	"operational_criticality" "oi_criticality_level",
	"schedule_criticality" "oi_criticality_level",
	"oi_risk_score" integer,
	"reported_by" integer NOT NULL,
	"assigned_to" integer,
	"risk_owner" integer,
	"escalation_owner" integer,
	"technical_owner" integer,
	"compliance_owner" integer,
	"financial_owner" integer,
	"legal_owner" integer,
	"business_owner" integer,
	"classified_by" integer,
	"classified_at" timestamp,
	"investigating_started_at" timestamp,
	"verified_by" integer,
	"verified_at" timestamp,
	"closed_by" integer,
	"closed_at" timestamp,
	"reopened_by" integer,
	"reopened_at" timestamp,
	"reopen_reason" text,
	"withdrawn_by" integer,
	"withdrawn_at" timestamp,
	"withdrawal_reason" text,
	"severity_changed_by" integer,
	"severity_changed_at" timestamp,
	"severity_change_reason" text,
	"previous_severity" "oi_severity",
	"occurred_at" timestamp,
	"detected_at" timestamp,
	"response_due_at" timestamp,
	"closure_due_at" timestamp,
	"response_sla_breached" boolean DEFAULT false NOT NULL,
	"closure_sla_breached" boolean DEFAULT false NOT NULL,
	"repeat_issue" boolean DEFAULT false NOT NULL,
	"parent_issue_id" integer,
	"estimated_loss_amount" numeric(15, 2),
	"liability_severity" text,
	"consequential_damage_flag" boolean DEFAULT false NOT NULL,
	"business_interruption_flag" boolean DEFAULT false NOT NULL,
	"statutory_authority" text,
	"compliance_status" text,
	"statutory_severity" text,
	"legal_review_required" boolean DEFAULT false NOT NULL,
	"fat_reference" text,
	"sat_reference" text,
	"punch_point_reference" text,
	"readiness_status" text,
	"customer_id" integer,
	"vendor_id" integer,
	"epc_drawing_control_id" integer,
	"epc_po_id" integer,
	"epc_wo_id" integer,
	"inspection_order_id" integer,
	"fat_inspection_order_id" integer,
	"sat_inspection_order_id" integer,
	"contract_id" integer,
	"technical_score" smallint,
	"quality_score" smallint,
	"safety_score" smallint,
	"financial_score" smallint,
	"compliance_score" smallint,
	"schedule_score" smallint,
	"liability_score" smallint,
	"customer_score" smallint,
	"operational_score" smallint,
	"actual_loss_amount" numeric(15, 2),
	"insurance_claim_flag" boolean DEFAULT false NOT NULL,
	"claim_reference" text,
	"recovery_amount" numeric(15, 2),
	"net_financial_exposure" numeric(15, 2),
	"liability_type" text,
	"indemnity_required" boolean DEFAULT false NOT NULL,
	"warranty_claim_flag" boolean DEFAULT false NOT NULL,
	"warranty_claim_reference" text,
	"capture_delay_hours" numeric(10, 2),
	"response_time_actual_hours" numeric(10, 2),
	"investigation_duration_hours" numeric(10, 2),
	"total_resolution_hours" numeric(10, 2),
	"rca_required" boolean DEFAULT false NOT NULL,
	"rca_due_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oi_issues_issue_number_unique" UNIQUE("issue_number")
);
--> statement-breakpoint
CREATE TABLE "oi_lesson_acknowledgments" (
	"id" serial PRIMARY KEY NOT NULL,
	"lesson_id" integer NOT NULL,
	"acknowledgment_type" varchar(20) NOT NULL,
	"target_department" varchar(100),
	"target_project_id" integer,
	"is_required" boolean DEFAULT true NOT NULL,
	"due_date" timestamp,
	"acknowledged_by" integer,
	"acknowledged_at" timestamp,
	"acknowledgment_note" text,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"assigned_by" integer NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_lesson_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"lesson_id" integer NOT NULL,
	"action" "oi_audit_action" NOT NULL,
	"actor_id" integer NOT NULL,
	"actor_name" text NOT NULL,
	"actor_role" text NOT NULL,
	"field_name" text,
	"old_value" text,
	"new_value" text,
	"context" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_lesson_effectiveness_reviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"lesson_id" integer NOT NULL,
	"review_date" timestamp NOT NULL,
	"reviewer_id" integer NOT NULL,
	"review_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"effectiveness_rating" varchar(30),
	"observations" text,
	"recommendation" text,
	"next_review_due" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_lesson_linkages" (
	"id" serial PRIMARY KEY NOT NULL,
	"lesson_id" integer NOT NULL,
	"link_type" varchar(30) NOT NULL,
	"linked_entity_id" integer NOT NULL,
	"linked_entity_ref" varchar(100),
	"link_note" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_lesson_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"lesson_number" varchar(20) NOT NULL,
	"parent_lesson_id" integer,
	"revision_number" integer DEFAULT 1 NOT NULL,
	"is_current_revision" boolean DEFAULT true NOT NULL,
	"title" text NOT NULL,
	"title_hash" varchar(32) NOT NULL,
	"description" text NOT NULL,
	"lesson_category" varchar(50) NOT NULL,
	"lesson_type" varchar(30) NOT NULL,
	"applicability_scope" varchar(30) DEFAULT 'global' NOT NULL,
	"scope_department" varchar(100),
	"scope_project_id" integer,
	"scope_equipment_type" varchar(100),
	"tags" text[],
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"process_area" varchar(100),
	"root_cause_summary" text,
	"recommendation" text NOT NULL,
	"implementation_guidance" text,
	"priority" varchar(20) DEFAULT 'normal' NOT NULL,
	"recurrence_risk" varchar(20),
	"cross_project_applicable" boolean DEFAULT false NOT NULL,
	"cross_project_approved_by" integer,
	"cross_project_approved_at" timestamp,
	"effectiveness_review_due_months" integer DEFAULT 6,
	"author_id" integer NOT NULL,
	"submitted_at" timestamp,
	"review_due_at" timestamp,
	"approved_by" integer,
	"approved_at" timestamp,
	"published_by" integer,
	"published_at" timestamp,
	"archived_by" integer,
	"archived_at" timestamp,
	"archive_reason" text,
	"rejected_by" integer,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oi_lesson_records_lesson_number_unique" UNIQUE("lesson_number")
);
--> statement-breakpoint
CREATE TABLE "oi_lesson_recurrence_checks" (
	"id" serial PRIMARY KEY NOT NULL,
	"lesson_id" integer NOT NULL,
	"check_date" timestamp NOT NULL,
	"checker_id" integer NOT NULL,
	"recurrence_found" boolean DEFAULT false NOT NULL,
	"recurrence_detail" text,
	"linked_issue_id" integer,
	"linked_rca_id" integer,
	"recommendation" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_lesson_reviewers" (
	"id" serial PRIMARY KEY NOT NULL,
	"lesson_id" integer NOT NULL,
	"reviewer_id" integer NOT NULL,
	"review_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"review_note" text,
	"reviewed_at" timestamp,
	"assigned_by" integer NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_rca_evidence" (
	"id" serial PRIMARY KEY NOT NULL,
	"rca_id" integer NOT NULL,
	"file_name" text NOT NULL,
	"gcs_path" text NOT NULL,
	"file_size_bytes" integer,
	"content_type" text,
	"uploaded_by" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_rca_failure_tree_nodes" (
	"id" serial PRIMARY KEY NOT NULL,
	"rca_id" integer NOT NULL,
	"parent_id" integer,
	"node_type" text NOT NULL,
	"node_label" text NOT NULL,
	"node_note" text,
	"is_top_event" boolean DEFAULT false NOT NULL,
	"sequence_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_rca_fishbone" (
	"id" serial PRIMARY KEY NOT NULL,
	"rca_id" integer NOT NULL,
	"category" text NOT NULL,
	"cause_description" text NOT NULL,
	"is_primary_cause" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_rca_five_why" (
	"id" serial PRIMARY KEY NOT NULL,
	"rca_id" integer NOT NULL,
	"why_level" integer NOT NULL,
	"why_question" text NOT NULL,
	"why_answer" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_rca_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_id" integer NOT NULL,
	"methodology" text NOT NULL,
	"root_cause_code" text DEFAULT 'UNKNOWN' NOT NULL,
	"root_cause_summary" text DEFAULT '' NOT NULL,
	"contributing_factors" text,
	"immediate_cause" text,
	"underlying_cause" text,
	"systemic_cause" text,
	"assigned_to" integer,
	"reviewer_id" integer,
	"approver_id" integer,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"review_started_at" timestamp,
	"approved_at" timestamp,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"revision_number" integer DEFAULT 1 NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_rca_similar_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"issue_id_a" integer NOT NULL,
	"issue_id_b" integer NOT NULL,
	"link_type" text DEFAULT 'same_root_cause' NOT NULL,
	"link_note" text,
	"linked_by" integer NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_risk_matrix_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"probability" integer NOT NULL,
	"impact" integer NOT NULL,
	"risk_rating" "oi_risk_rating" NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_risk_weight_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"technical_weight" numeric(4, 2) DEFAULT '1.0' NOT NULL,
	"quality_weight" numeric(4, 2) DEFAULT '1.2' NOT NULL,
	"safety_weight" numeric(4, 2) DEFAULT '2.0' NOT NULL,
	"financial_weight" numeric(4, 2) DEFAULT '1.5' NOT NULL,
	"compliance_weight" numeric(4, 2) DEFAULT '1.8' NOT NULL,
	"schedule_weight" numeric(4, 2) DEFAULT '1.0' NOT NULL,
	"liability_weight" numeric(4, 2) DEFAULT '2.0' NOT NULL,
	"customer_weight" numeric(4, 2) DEFAULT '1.5' NOT NULL,
	"operational_weight" numeric(4, 2) DEFAULT '1.0' NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_sop_acknowledgments" (
	"id" serial PRIMARY KEY NOT NULL,
	"sop_id" integer NOT NULL,
	"revision_number" integer NOT NULL,
	"user_id" integer NOT NULL,
	"assigned_by" integer NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"due_date" timestamp,
	"acknowledged_at" timestamp,
	"acknowledgment_note" text
);
--> statement-breakpoint
CREATE TABLE "oi_sop_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"sop_id" integer,
	"action" "oi_audit_action" NOT NULL,
	"actor_id" integer NOT NULL,
	"actor_name" text NOT NULL,
	"actor_role" text NOT NULL,
	"field_name" text,
	"old_value" text,
	"new_value" text,
	"department" text,
	"applicable_role" text,
	"context" text,
	"ip_address" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_sop_effectiveness" (
	"id" serial PRIMARY KEY NOT NULL,
	"sop_id" integer NOT NULL,
	"review_cycle" integer DEFAULT 1 NOT NULL,
	"reviewer_id" integer NOT NULL,
	"reviewed_at" timestamp DEFAULT now() NOT NULL,
	"effectiveness_score" integer NOT NULL,
	"is_effective" boolean NOT NULL,
	"deviation_observed" boolean DEFAULT false NOT NULL,
	"requires_revision" boolean DEFAULT false NOT NULL,
	"evidence_notes" text,
	"recommendation" text
);
--> statement-breakpoint
CREATE TABLE "oi_sop_linkages" (
	"id" serial PRIMARY KEY NOT NULL,
	"sop_id" integer NOT NULL,
	"linked_type" text NOT NULL,
	"linked_id" integer NOT NULL,
	"link_note" text NOT NULL,
	"linked_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_sop_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"sop_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"sop_type" text NOT NULL,
	"department" text NOT NULL,
	"applicable_role" text DEFAULT 'Employee' NOT NULL,
	"process_area" text NOT NULL,
	"document_reference" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"owner_id" integer,
	"approver_id" integer,
	"revision_number" integer DEFAULT 0 NOT NULL,
	"effective_date" timestamp,
	"review_due_date" timestamp,
	"next_review_date" timestamp,
	"activated_at" timestamp,
	"retired_at" timestamp,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "oi_sop_records_sop_number_unique" UNIQUE("sop_number")
);
--> statement-breakpoint
CREATE TABLE "oi_sop_revision_suggestions" (
	"id" serial PRIMARY KEY NOT NULL,
	"sop_id" integer NOT NULL,
	"source_type" text NOT NULL,
	"source_id" integer,
	"suggested_change" text NOT NULL,
	"rationale" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"suggested_by" integer,
	"suggested_at" timestamp DEFAULT now() NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"review_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_sop_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"sop_id" integer NOT NULL,
	"revision_number" integer NOT NULL,
	"change_summary" text NOT NULL,
	"change_rationale" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_by" integer,
	"submitted_at" timestamp,
	"reviewed_by" integer,
	"review_notes" text,
	"approved_by" integer,
	"approved_at" timestamp,
	"rejected_by" integer,
	"rejection_reason" text,
	"rejected_at" timestamp,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oi_sop_sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"sop_id" integer NOT NULL,
	"section_no" varchar(20) NOT NULL,
	"section_title" text NOT NULL,
	"section_content" text DEFAULT '' NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" integer NOT NULL,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "page_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"page_key" text NOT NULL,
	"module_name" text NOT NULL,
	"can_view" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "password_reset_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer,
	"email_attempted" text NOT NULL,
	"username_attempted" text DEFAULT '' NOT NULL,
	"event_type" varchar(30) NOT NULL,
	"failure_reason" text,
	"ip_address" text,
	"user_agent" text,
	"request_source" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_invoice_links" (
	"id" serial PRIMARY KEY NOT NULL,
	"payment_id" integer NOT NULL,
	"invoice_id" integer NOT NULL,
	"amount_applied" numeric(15, 2) NOT NULL,
	"allocated_by" integer,
	"allocated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "payment_invoice_links_payment_id_invoice_id_pk" PRIMARY KEY("payment_id","invoice_id")
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" serial PRIMARY KEY NOT NULL,
	"irm_no" varchar(100),
	"payment_date" date NOT NULL,
	"sap_payment_no" varchar(100),
	"payment_type" varchar(20),
	"amount" numeric(15, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'INR' NOT NULL,
	"payment_method" varchar(50) NOT NULL,
	"reference_number" varchar(100),
	"notes" text,
	"proof_document_path" varchar(255),
	"is_advance_payment" boolean DEFAULT false,
	"unallocated_amount" numeric(15, 2),
	"allocated_amount" numeric(15, 2) DEFAULT '0',
	"customer_id" integer,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payroll_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"approved_by" integer NOT NULL,
	"approval_level" integer DEFAULT 1,
	"approval_status" varchar(20) DEFAULT 'pending',
	"approval_comments" text,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_attendance_snapshot" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"run_number" integer NOT NULL,
	"user_id" integer NOT NULL,
	"total_working_days" integer NOT NULL,
	"present_days" numeric(5, 2) NOT NULL,
	"absent_days" numeric(5, 2) NOT NULL,
	"half_days" numeric(5, 2) DEFAULT '0',
	"late_days" integer DEFAULT 0,
	"paid_leave_days" numeric(5, 2) DEFAULT '0',
	"unpaid_leave_days" numeric(5, 2) DEFAULT '0',
	"lop_days" numeric(5, 2) DEFAULT '0',
	"overtime_hours" numeric(6, 2) DEFAULT '0',
	"company_holidays" integer DEFAULT 0,
	"weekly_offs" integer DEFAULT 0,
	"paid_days" numeric(5, 2) NOT NULL,
	"auto_leave_applied" jsonb DEFAULT '[]'::jsonb,
	"daily_breakdown" jsonb,
	"sandwich_paid_days" numeric(5, 2) DEFAULT '0',
	"sandwich_lwp_days" numeric(5, 2) DEFAULT '0',
	"lop_days_computed" numeric(5, 2),
	"lop_days_confirmed" numeric(5, 2),
	"lop_confirmed_by" integer,
	"lop_confirmed_at" timestamp,
	"lop_override_notes" text,
	"lwp_exempt_applied" boolean DEFAULT false,
	"balance_covered_days" numeric(5, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_exceptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"run_number" integer NOT NULL,
	"step" varchar(30) NOT NULL,
	"user_id" integer,
	"exception_type" varchar(30) NOT NULL,
	"severity" varchar(10) DEFAULT 'warning' NOT NULL,
	"title" varchar(200) NOT NULL,
	"details" text,
	"data_snapshot" jsonb,
	"resolution" varchar(20) DEFAULT 'unresolved',
	"resolved_by" integer,
	"resolved_at" timestamp,
	"resolution_notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_leave_autocover" (
	"id" serial PRIMARY KEY NOT NULL,
	"payroll_record_id" integer NOT NULL,
	"period_id" integer NOT NULL,
	"run_number" integer NOT NULL,
	"user_id" integer NOT NULL,
	"leave_type_id" integer NOT NULL,
	"days_deducted" numeric(5, 2) NOT NULL,
	"status" varchar(20) DEFAULT 'applied' NOT NULL,
	"applied_at" timestamp DEFAULT now() NOT NULL,
	"reversed_by" integer,
	"reversed_at" timestamp,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "payroll_lock_exceptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"lock_id" integer NOT NULL,
	"period_id" integer NOT NULL,
	"requested_by" integer,
	"request_reason" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending',
	"approved_by" integer,
	"approved_at" timestamp,
	"rejection_reason" text,
	"changes_description" text,
	"closed_at" timestamp,
	"closed_by" integer,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_locks" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"lock_type" varchar(20) NOT NULL,
	"is_locked" boolean DEFAULT true NOT NULL,
	"locked_at" timestamp DEFAULT now() NOT NULL,
	"locked_by" integer NOT NULL,
	"lock_reason" text,
	"unlocked_at" timestamp,
	"unlocked_by" integer,
	"unlock_reason" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_periods" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_name" varchar(50) NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"pay_date" date NOT NULL,
	"status" varchar(20) DEFAULT 'draft',
	"current_run_number" integer DEFAULT 0,
	"finalized_run_number" integer,
	"is_locked" boolean DEFAULT false,
	"total_employees" integer DEFAULT 0,
	"total_gross_pay" numeric(15, 2) DEFAULT '0',
	"total_deductions" numeric(15, 2) DEFAULT '0',
	"total_net_pay" numeric(15, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now(),
	"processed_at" timestamp,
	"processed_by" integer,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"approved_at" timestamp,
	"paid_at" timestamp,
	"paid_by" integer,
	"locked_at" timestamp,
	"locked_by" integer
);
--> statement-breakpoint
CREATE TABLE "payroll_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"run_number" integer,
	"base_salary" numeric(12, 2) NOT NULL,
	"working_days" integer,
	"paid_days" numeric(5, 2),
	"lop_days" numeric(5, 2),
	"present_days" numeric(5, 2),
	"paid_leave_days" numeric(5, 2),
	"unpaid_leave_days" numeric(5, 2),
	"productivity_bonus" numeric(10, 2) DEFAULT '0',
	"attendance_bonus" numeric(10, 2) DEFAULT '0',
	"task_completion_bonus" numeric(10, 2) DEFAULT '0',
	"satisfaction_bonus" numeric(10, 2) DEFAULT '0',
	"hra" numeric(10, 2) DEFAULT '0',
	"conveyance_allowance" numeric(10, 2) DEFAULT '0',
	"lta_allowance" numeric(10, 2) DEFAULT '0',
	"special_allowance" numeric(10, 2) DEFAULT '0',
	"supplementary_allowance" numeric(10, 2) DEFAULT '0',
	"kgp_allowance" numeric(10, 2) DEFAULT '0',
	"bonus" numeric(10, 2) DEFAULT '0',
	"overtime_hours" numeric(5, 2) DEFAULT '0',
	"overtime_pay" numeric(10, 2) DEFAULT '0',
	"other_allowances" numeric(10, 2) DEFAULT '0',
	"gross_pay" numeric(12, 2) NOT NULL,
	"income_tax" numeric(10, 2) DEFAULT '0',
	"professional_tax" numeric(10, 2) DEFAULT '0',
	"provident_fund" numeric(10, 2) DEFAULT '0',
	"esi_deduction" numeric(10, 2) DEFAULT '0',
	"esic" numeric(10, 2) DEFAULT '0',
	"group_insurance" numeric(10, 2) DEFAULT '0',
	"other_deductions" numeric(10, 2) DEFAULT '0',
	"total_deductions" numeric(10, 2) DEFAULT '0',
	"employee_pf" numeric(10, 2) DEFAULT '0',
	"employee_esic" numeric(10, 2) DEFAULT '0',
	"employer_pf" numeric(10, 2) DEFAULT '0',
	"employer_esic" numeric(10, 2) DEFAULT '0',
	"gratuity" numeric(10, 2) DEFAULT '0',
	"loan_deductions" numeric(10, 2) DEFAULT '0',
	"advance_deductions" numeric(10, 2) DEFAULT '0',
	"reimbursements" numeric(10, 2) DEFAULT '0',
	"tds_amount" numeric(10, 2) DEFAULT '0',
	"net_pay" numeric(12, 2) NOT NULL,
	"calculation_snapshot" jsonb,
	"dwar_productivity_score" numeric(5, 2),
	"attendance_percentage" numeric(5, 2),
	"tasks_completed" integer DEFAULT 0,
	"average_satisfaction_rating" numeric(3, 2),
	"status" varchar(20) DEFAULT 'generated',
	"payment_reference" varchar(100),
	"payment_date" date,
	"verified_by" integer,
	"verified_at" timestamp,
	"held_reason" text,
	"held_by" integer,
	"held_at" timestamp,
	"status_history" jsonb DEFAULT '[]'::jsonb,
	"sap_doc_entry" integer,
	"sap_je_number" text,
	"sap_posted_at" timestamp,
	"sap_posting_status" varchar(20),
	"sap_error_message" text,
	"sap_payload_status" varchar(20) DEFAULT 'not_ready',
	"sap_request_log" jsonb,
	"sap_response_log" jsonb,
	"reversal_sap_doc_entry" integer,
	"reversal_sap_je_number" text,
	"reversal_sap_posted_at" timestamp,
	"reversed_by" integer,
	"reversed_at" timestamp,
	"reversal_memo" text,
	"record_type" varchar(10) DEFAULT 'official' NOT NULL,
	"trial_run_no" integer,
	"trial_status" varchar(15),
	"calculation_engine_version" varchar(20) DEFAULT 'legacy' NOT NULL,
	"salary_source" varchar(20) DEFAULT 'payroll_engine',
	"worker_type" varchar(20) DEFAULT 'regular',
	"manual_salary_entry_id" integer,
	"verification_status" varchar(20) DEFAULT 'pending',
	"verification_run_at" timestamp,
	"verification_run_by" integer,
	"verification_details" jsonb,
	"verification_override_reason" text,
	"verification_override_by" integer,
	"verification_override_at" timestamp,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_run_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"run_number" integer NOT NULL,
	"step" varchar(30) NOT NULL,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"started_at" timestamp,
	"completed_at" timestamp,
	"executed_by" integer,
	"employees_processed" integer DEFAULT 0,
	"employees_skipped" integer DEFAULT 0,
	"error_count" integer DEFAULT 0,
	"summary" jsonb DEFAULT '{}'::jsonb,
	"notes" text,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_salary_snapshot" (
	"id" serial PRIMARY KEY NOT NULL,
	"period_id" integer NOT NULL,
	"run_number" integer NOT NULL,
	"user_id" integer NOT NULL,
	"salary_record_id" integer NOT NULL,
	"base_salary" numeric(12, 2) NOT NULL,
	"basic_salary" numeric(12, 2),
	"house_rent_allowance" numeric(10, 2),
	"conveyance" numeric(10, 2),
	"lta" numeric(10, 2),
	"special_allowance" numeric(10, 2),
	"supplementary_allowance" numeric(10, 2),
	"kgp_allowance" numeric(10, 2),
	"bonus" numeric(10, 2),
	"salary_type" varchar(20),
	"working_hours_per_day" integer,
	"ot_rate" numeric(10, 2),
	"ot_multiplier" numeric(5, 2),
	"employee_pf_contribution" numeric(10, 2),
	"employer_pf_contribution" numeric(10, 2),
	"employee_esic_contribution" numeric(10, 2),
	"employer_esic_contribution" numeric(10, 2),
	"group_insurance" numeric(10, 2),
	"professional_tax" numeric(10, 2),
	"take_home_salary" numeric(12, 2),
	"ctc_monthly" numeric(12, 2),
	"ctc_yearly" numeric(12, 2),
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "payroll_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"setting_name" varchar(100) NOT NULL,
	"setting_value" text NOT NULL,
	"data_type" varchar(20) DEFAULT 'string',
	"description" text,
	"is_active" boolean DEFAULT true,
	"updated_at" timestamp DEFAULT now(),
	"updated_by" integer,
	CONSTRAINT "payroll_settings_setting_name_unique" UNIQUE("setting_name")
);
--> statement-breakpoint
CREATE TABLE "permission_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"action" text NOT NULL,
	"change_request_id" integer,
	"snapshot_id" integer,
	"batch_id" text,
	"user_id" integer NOT NULL,
	"username" text NOT NULL,
	"role" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "permission_change_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"batch_id" text,
	"request_type" text NOT NULL,
	"target_entity" text NOT NULL,
	"target_id" text NOT NULL,
	"page_key" text,
	"action_id" text,
	"current_value" jsonb,
	"requested_value" jsonb,
	"requested_by" integer NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"rejection_reason" text,
	"applied_at" timestamp,
	"emergency_override" boolean DEFAULT false,
	"emergency_reason" text
);
--> statement-breakpoint
CREATE TABLE "permission_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"snapshot_type" text NOT NULL,
	"snapshot_data" jsonb NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "phase_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"phase_id" integer NOT NULL,
	"approver_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requested_at" timestamp DEFAULT now() NOT NULL,
	"responded_at" timestamp,
	"comments" text,
	"requirements_met" boolean DEFAULT false,
	"deliverables_fulfilled" boolean DEFAULT false
);
--> statement-breakpoint
CREATE TABLE "plant_costs" (
	"id" serial PRIMARY KEY NOT NULL,
	"capacity" integer NOT NULL,
	"price_usd" numeric(12, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer NOT NULL,
	"updated_by" integer,
	CONSTRAINT "plant_costs_capacity_unique" UNIQUE("capacity")
);
--> statement-breakpoint
CREATE TABLE "plc_document_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"plc_line_id" integer,
	"po_group_id" integer,
	"epc_po_id" integer,
	"document_type" varchar(30) DEFAULT 'other' NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"file_size" integer,
	"mime_type" varchar(100),
	"gcs_path" text NOT NULL,
	"sha256_hash" varchar(64),
	"is_current" boolean DEFAULT true NOT NULL,
	"uploaded_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plc_grn_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"grn_number" varchar(60) NOT NULL,
	"project_id" integer NOT NULL,
	"plc_line_id" integer NOT NULL,
	"epc_po_id" integer,
	"po_group_id" integer,
	"vendor_id" integer,
	"vendor_name" varchar(255),
	"challan_number" varchar(80),
	"challan_date" date,
	"received_date" date NOT NULL,
	"grn_qty" numeric(10, 2) NOT NULL,
	"accepted_qty" numeric(10, 2) DEFAULT '0',
	"rejected_qty" numeric(10, 2) DEFAULT '0',
	"inspection_status" varchar(30) DEFAULT 'pending' NOT NULL,
	"inspection_notes" text,
	"inspection_by" integer,
	"inspection_at" timestamp,
	"stores_accepted_by" integer,
	"stores_accepted_at" timestamp,
	"stores_notes" text,
	"status" varchar(30) DEFAULT 'received' NOT NULL,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plc_grn_records_grn_number_unique" UNIQUE("grn_number")
);
--> statement-breakpoint
CREATE TABLE "plc_material_issues" (
	"id" serial PRIMARY KEY NOT NULL,
	"mir_number" varchar(60) NOT NULL,
	"project_id" integer NOT NULL,
	"plc_line_id" integer NOT NULL,
	"grn_record_id" integer,
	"issued_qty" numeric(10, 2) NOT NULL,
	"issued_to" varchar(255),
	"purpose_notes" text,
	"issued_by" integer,
	"issued_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "plc_material_issues_mir_number_unique" UNIQUE("mir_number")
);
--> statement-breakpoint
CREATE TABLE "plc_rfq_attachments" (
	"id" serial PRIMARY KEY NOT NULL,
	"rfq_id" integer NOT NULL,
	"plc_line_id" integer,
	"attachment_type" varchar(30) NOT NULL,
	"gcs_bucket" varchar(100) NOT NULL,
	"gcs_path" text NOT NULL,
	"original_filename" varchar(255),
	"file_size_bytes" bigint,
	"mime_type" varchar(100),
	"checksum_sha256" varchar(64),
	"source_revision_seq" integer,
	"frozen_at" timestamp DEFAULT now() NOT NULL,
	"frozen_by" integer
);
--> statement-breakpoint
CREATE TABLE "plc_rfq_dispatch_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"rfq_id" integer NOT NULL,
	"vendor_id" integer NOT NULL,
	"email_to" text NOT NULL,
	"email_cc" text[],
	"dispatch_status" varchar(20) NOT NULL,
	"nodemailer_message_id" text,
	"failure_reason" text,
	"attachment_count" integer DEFAULT 0,
	"dispatched_at" timestamp DEFAULT now() NOT NULL,
	"dispatched_by" integer,
	"is_resend" boolean DEFAULT false NOT NULL,
	"resend_number" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pma_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"pma_number" varchar(50) NOT NULL,
	"specification" varchar(100) NOT NULL,
	"grade" varchar(100) NOT NULL,
	"certified_by" varchar(100) NOT NULL,
	"status" varchar(20) DEFAULT 'Draft' NOT NULL,
	"remarks" text,
	"issue_date" date NOT NULL,
	"expiry_date" date NOT NULL,
	"file_path" varchar(255),
	"file_url" text,
	"original_file_name" varchar(255),
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pma_documents_pma_number_unique" UNIQUE("pma_number")
);
--> statement-breakpoint
CREATE TABLE "po_preparation_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"po_prep_number" varchar(35),
	"project_id" integer NOT NULL,
	"project_item_id" integer NOT NULL,
	"planning_record_id" integer NOT NULL,
	"execution_record_id" integer NOT NULL,
	"quality_plan_id" integer,
	"master_item_id" integer NOT NULL,
	"item_code" varchar(100),
	"item_description" text,
	"item_specification" text,
	"uom" varchar(30),
	"drawing_no" varchar(100),
	"quantity" numeric(10, 2) NOT NULL,
	"estimated_unit_cost" numeric(12, 2),
	"estimated_total_cost" numeric(14, 2),
	"preferred_vendor_id" integer,
	"preferred_vendor_name" varchar(255),
	"procurement_notes" text,
	"review_notes" text,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"ready_by" integer,
	"ready_at" timestamp,
	"superseded_by" integer,
	"superseded_at" timestamp,
	"supersession_reason" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"created_by" integer,
	"assigned_to" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "po_preparation_records_po_prep_number_unique" UNIQUE("po_prep_number")
);
--> statement-breakpoint
CREATE TABLE "policy_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_name" varchar(255) NOT NULL,
	"template_type" varchar(100) NOT NULL,
	"category" varchar(100),
	"version" varchar(50) NOT NULL,
	"effective_date" date NOT NULL,
	"review_date" date,
	"approval_status" varchar(50) DEFAULT 'Draft' NOT NULL,
	"approved_by" integer,
	"approval_date" date,
	"template_content" text NOT NULL,
	"file_path" varchar(500),
	"file_url" varchar(500),
	"applicable_locations" text,
	"mandatory" boolean DEFAULT false NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "posh_cases" (
	"id" serial PRIMARY KEY NOT NULL,
	"case_number" varchar(255) NOT NULL,
	"complaint_date" date NOT NULL,
	"complainant_name" varchar(255) NOT NULL,
	"complainant_designation" varchar(255),
	"complainant_department" varchar(255),
	"respondent_name" varchar(255) NOT NULL,
	"respondent_designation" varchar(255),
	"respondent_department" varchar(255),
	"incident_date" date,
	"incident_location" varchar(255),
	"case_type" varchar(100) NOT NULL,
	"case_status" varchar(50) DEFAULT 'Investigation' NOT NULL,
	"priority" varchar(20) DEFAULT 'High' NOT NULL,
	"description" text NOT NULL,
	"action_taken" text,
	"outcome" varchar(100),
	"closure_date" date,
	"committee_members" text,
	"investigation_officer" integer,
	"file_path" varchar(500),
	"file_url" varchar(500),
	"confidentiality_level" varchar(50) DEFAULT 'Confidential' NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "posh_cases_case_number_unique" UNIQUE("case_number")
);
--> statement-breakpoint
CREATE TABLE "procurement_execution_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"procurement_number" varchar(35),
	"project_id" integer NOT NULL,
	"project_item_id" integer NOT NULL,
	"planning_record_id" integer NOT NULL,
	"master_item_id" integer NOT NULL,
	"item_code" varchar(100),
	"item_description" text,
	"item_specification" text,
	"uom" varchar(30),
	"drawing_no" varchar(100),
	"quantity" numeric(10, 2) NOT NULL,
	"estimated_unit_cost" numeric(12, 2),
	"estimated_total_cost" numeric(14, 2),
	"preferred_vendor_id" integer,
	"preferred_vendor_name" varchar(255),
	"procurement_notes" text,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"prepared_by" integer,
	"prepared_at" timestamp,
	"preparation_note" text,
	"superseded_by" integer,
	"superseded_at" timestamp,
	"supersession_reason" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"created_by" integer,
	"assigned_to" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "procurement_execution_records_procurement_number_unique" UNIQUE("procurement_number")
);
--> statement-breakpoint
CREATE TABLE "procurement_list_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"entity_type" varchar(40) NOT NULL,
	"entity_id" integer NOT NULL,
	"event_type" varchar(80) NOT NULL,
	"old_status" varchar(40),
	"new_status" varchar(40),
	"changed_by" integer,
	"changed_at" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "procurement_list_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"plc_number" varchar(60) NOT NULL,
	"project_id" integer NOT NULL,
	"planning_record_id" integer,
	"planning_number" varchar(60),
	"source_buy_list_header_id" integer,
	"source_buy_list_line_id" integer,
	"master_item_id" integer,
	"tag_no" varchar(50),
	"service_description" text,
	"equipment_reference" varchar(150),
	"subgroup_code" varchar(20),
	"subgroup_label" varchar(120),
	"qty_required" numeric(10, 2) NOT NULL,
	"qty_ordered" numeric(10, 2) DEFAULT '0' NOT NULL,
	"qty_received" numeric(10, 2) DEFAULT '0' NOT NULL,
	"qty_balance" numeric(10, 2) DEFAULT '0' NOT NULL,
	"qty_over_procured" numeric(10, 2) DEFAULT '0' NOT NULL,
	"status" varchar(30) DEFAULT 'pr_raised' NOT NULL,
	"active_po_group_id" integer,
	"active_epc_po_id" integer,
	"vendor_id" integer,
	"vendor_name" varchar(255),
	"priority" varchar(20) DEFAULT 'standard' NOT NULL,
	"required_by_date" date,
	"avl_status" varchar(30) DEFAULT 'not_checked' NOT NULL,
	"avl_bypass_reason" text,
	"avl_bypassed_by" integer,
	"avl_bypassed_at" timestamp,
	"revision_action_required" varchar(30) DEFAULT 'none' NOT NULL,
	"specification_notes" text,
	"internal_notes" text,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "procurement_list_lines_plc_number_unique" UNIQUE("plc_number")
);
--> statement-breakpoint
CREATE TABLE "product_attribute_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"attribute_type" text NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"tag" text NOT NULL,
	"parent_id" integer,
	"sort_order" integer DEFAULT 0,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "chk_attr_option_type" CHECK (attribute_type IN ('item_family', 'property_1', 'property_2'))
);
--> statement-breakpoint
CREATE TABLE "product_children" (
	"id" serial PRIMARY KEY NOT NULL,
	"parent_product_id" integer NOT NULL,
	"child_product_id" integer NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "production_execution_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"production_number" varchar(35),
	"project_id" integer NOT NULL,
	"project_item_id" integer NOT NULL,
	"planning_record_id" integer NOT NULL,
	"master_item_id" integer NOT NULL,
	"item_code" varchar(100),
	"item_description" text,
	"item_specification" text,
	"uom" varchar(30),
	"drawing_no" varchar(100),
	"drawing_revision" integer,
	"quantity" numeric(10, 2) NOT NULL,
	"estimated_unit_cost" numeric(12, 2),
	"estimated_total_cost" numeric(14, 2),
	"make_classification" varchar(30),
	"manufacturing_notes" text,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"prepared_by" integer,
	"prepared_at" timestamp,
	"preparation_note" text,
	"superseded_by" integer,
	"superseded_at" timestamp,
	"supersession_reason" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"created_by" integer,
	"assigned_to" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "production_execution_records_production_number_unique" UNIQUE("production_number")
);
--> statement-breakpoint
CREATE TABLE "production_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_order_id" integer NOT NULL,
	"work_order_item_id" integer,
	"date" date NOT NULL,
	"shift" text NOT NULL,
	"quantity_produced" integer NOT NULL,
	"quantity_rejected" integer DEFAULT 0 NOT NULL,
	"hours_worked" numeric(8, 2) NOT NULL,
	"issues_encountered" text,
	"recorded_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "productivity_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"tasks_completed" integer DEFAULT 0 NOT NULL,
	"tasks_created" integer DEFAULT 0 NOT NULL,
	"recommendations_accepted" integer DEFAULT 0 NOT NULL,
	"average_completion_time" integer DEFAULT 0 NOT NULL,
	"on_time_completion" integer DEFAULT 0 NOT NULL,
	"last_updated" text NOT NULL,
	"weekly_score" integer DEFAULT 0 NOT NULL,
	"monthly_score" integer DEFAULT 0 NOT NULL,
	"total_points" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" serial PRIMARY KEY NOT NULL,
	"item_family" text NOT NULL,
	"item_family_label" text NOT NULL,
	"item_property_1" text NOT NULL,
	"item_property_1_label" text NOT NULL,
	"item_property_2" text NOT NULL,
	"item_property_2_label" text NOT NULL,
	"item_property_3" text NOT NULL,
	"parent_id" integer,
	"product_code" text NOT NULL,
	"description" text NOT NULL,
	"unit" text NOT NULL,
	"unit_price" numeric(15, 2) NOT NULL,
	"currency" text DEFAULT 'USD' NOT NULL,
	"category" text,
	"hsn_sac_code" text,
	"make_or_buy" text DEFAULT 'Make',
	"preferred_vendor" text,
	"is_active" boolean DEFAULT true,
	"is_grandparent" boolean DEFAULT false,
	"tag_no" text,
	"equipment_configuration" text DEFAULT 'Vessel',
	"created_by" integer,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	CONSTRAINT "products_product_code_unique" UNIQUE("product_code")
);
--> statement-breakpoint
CREATE TABLE "project_buy_list_headers" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"project_item_id" integer NOT NULL,
	"source_package_id" integer,
	"latest_synced_package_id" integer,
	"list_number" varchar(35) NOT NULL,
	"revision_code" varchar(5) DEFAULT 'A' NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"supersedes_id" integer,
	"superseded_by" integer,
	"superseded_at" timestamp,
	"supersession_reason" text,
	"revision_notes" text,
	"submitted_by" integer,
	"submitted_at" timestamp,
	"submission_note" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"review_note" text,
	"review_recommendation" varchar(30),
	"released_by" integer,
	"released_at" timestamp,
	"release_note" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"created_by" integer,
	"item_code" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_buy_list_headers_list_number_unique" UNIQUE("list_number")
);
--> statement-breakpoint
CREATE TABLE "project_buy_list_lines" (
	"id" serial PRIMARY KEY NOT NULL,
	"buy_list_header_id" integer NOT NULL,
	"project_id" integer,
	"line_number" integer NOT NULL,
	"buy_group_id" integer NOT NULL,
	"buy_subgroup_id" integer NOT NULL,
	"uom_id" integer NOT NULL,
	"generic_requirement" text NOT NULL,
	"quantity" numeric(10, 2) DEFAULT '1' NOT NULL,
	"required_date" date,
	"specification" text,
	"technical_attributes" jsonb,
	"tag_no" varchar(80) DEFAULT '' NOT NULL,
	"equipment_reference" varchar(120) DEFAULT '' NOT NULL,
	"service_description" varchar(255) DEFAULT '' NOT NULL,
	"selection_required" boolean DEFAULT true NOT NULL,
	"datasheet_required" boolean DEFAULT false NOT NULL,
	"inspection_required" boolean DEFAULT false NOT NULL,
	"certificate_required" boolean DEFAULT false NOT NULL,
	"compliance_required" boolean DEFAULT false NOT NULL,
	"status" varchar(30) DEFAULT 'open' NOT NULL,
	"selected_master_item_id" integer,
	"source_package_line_id" integer,
	"planning_record_id" integer,
	"is_user_modified" boolean DEFAULT false NOT NULL,
	"notes" text,
	"approved_by" integer,
	"approved_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_cancellation_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"module" varchar(100) NOT NULL,
	"table_name" varchar(100) NOT NULL,
	"record_id" integer NOT NULL,
	"status_before" varchar(100) NOT NULL,
	"status_after" varchar(100) NOT NULL,
	"key_data" jsonb DEFAULT '{}'::jsonb,
	"restoration_eligible" boolean DEFAULT false NOT NULL,
	"restored" boolean DEFAULT false NOT NULL,
	"cancellation_type" varchar(50),
	"cancelled_at" timestamp DEFAULT now(),
	"restored_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "project_commercial_snapshots" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"snapshot_number" text NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"selling_currency" varchar(10) DEFAULT 'USD' NOT NULL,
	"exchange_rate" numeric(14, 6) NOT NULL,
	"total_cost_inr" numeric(15, 2) NOT NULL,
	"total_selling_inr" numeric(15, 2) NOT NULL,
	"total_selling_foreign" numeric(15, 2),
	"incoterms" varchar(20),
	"payment_terms" text,
	"delivery_terms" text,
	"offer_validity_days" integer DEFAULT 30,
	"notes" text,
	"items_snapshot" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" integer,
	"approved_by" integer,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_document_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"document_type" varchar(50) NOT NULL,
	"document_category" varchar(80),
	"relative_folder_path" text NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"relative_file_path" text NOT NULL,
	"revision" varchar(10) DEFAULT '00' NOT NULL,
	"sha256" varchar(64),
	"file_size_bytes" bigint,
	"storage_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"phase_id" integer,
	"name" text NOT NULL,
	"description" text,
	"type" text NOT NULL,
	"url" text NOT NULL,
	"version" text DEFAULT '1.0' NOT NULL,
	"uploaded_by" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"size" integer,
	"format" text,
	"is_public" boolean DEFAULT false,
	"tags" text[],
	"storage_path" text,
	"storage_url" text,
	"storage_url_expiry" timestamp
);
--> statement-breakpoint
CREATE TABLE "project_folder_template_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_id" integer NOT NULL,
	"relative_path" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_folder_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"template_code" varchar(50) NOT NULL,
	"template_name" varchar(200) NOT NULL,
	"description" text,
	"project_type" varchar(50),
	"version" integer DEFAULT 1 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "project_folder_templates_template_code_unique" UNIQUE("template_code")
);
--> statement-breakpoint
CREATE TABLE "project_item_drawings" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_item_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"drawing_number" varchar(80) NOT NULL,
	"title" text NOT NULL,
	"revision" varchar(10) DEFAULT '00' NOT NULL,
	"revision_date" timestamp DEFAULT now() NOT NULL,
	"status" varchar(30) DEFAULT 'Draft' NOT NULL,
	"format" varchar(10),
	"sheet_size" varchar(10),
	"scale" varchar(20),
	"gcs_object_path" text,
	"checksum_sha256" text,
	"file_size" integer,
	"file_name" text,
	"mime_type" varchar(100),
	"superseded_by_id" integer,
	"notes" text,
	"uploaded_by" integer,
	"item_code" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"project_code" text NOT NULL,
	"item_id" integer,
	"item_code" text,
	"description" text,
	"uom" text,
	"make_or_buy" text,
	"quantity" numeric(10, 2) NOT NULL,
	"estimated_cost" numeric(12, 2),
	"actual_cost" numeric(12, 2),
	"rolled_up_cost" numeric(14, 2),
	"rolled_up_at" timestamp,
	"margin_percent" numeric(6, 2),
	"selling_price_inr" numeric(15, 2),
	"selling_price" numeric(15, 2),
	"pricing_locked_at" timestamp,
	"notes" text,
	"status" text DEFAULT 'Not Started',
	"parent_project_item_id" integer,
	"source_bom_header_id" integer,
	"source_bom_line_id" integer,
	"source" varchar(30),
	"required_quantity" numeric(12, 2),
	"tag_no" varchar(80),
	"source_offer_id" integer,
	"source_offer_item_id" integer,
	"source_order_number" varchar(15),
	"bp_code" text,
	"product_code" text,
	"inherited_master_revision" text,
	"deviation_notes" text,
	"code_bars" varchar(16),
	"sap_synced" boolean DEFAULT false,
	"sap_synced_at" timestamp,
	"sap_sync_error" text,
	"sap_sync_status" varchar(20) DEFAULT 'not_synced',
	"sap_item_code" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "project_items_item_code_unique" UNIQUE("item_code")
);
--> statement-breakpoint
CREATE TABLE "project_key_stages" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"stage_number" integer NOT NULL,
	"stage_name" text NOT NULL,
	"phase" text NOT NULL,
	"description" text,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_date" timestamp,
	"completed_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_members" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	"phase_id" integer,
	"assigned_date" timestamp DEFAULT now() NOT NULL,
	"hourly_rate" numeric(10, 2),
	"estimated_hours" integer,
	"actual_hours" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"visibility_scope" varchar(20) DEFAULT 'department_records' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "project_phases" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"order" integer NOT NULL,
	"start_date" text NOT NULL,
	"target_end_date" text NOT NULL,
	"actual_end_date" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"progress" integer DEFAULT 0,
	"phase_lead_id" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"phase_id" integer,
	"deliverable_id" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_workflow_events" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"event_name" varchar(200) NOT NULL,
	"event_payload" jsonb NOT NULL,
	"emitted_by" varchar(200) NOT NULL,
	"emitted_at" timestamp DEFAULT now() NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text NOT NULL,
	"code" text NOT NULL,
	"project_type" text,
	"status" text DEFAULT 'planning' NOT NULL,
	"priority" text DEFAULT 'Medium' NOT NULL,
	"financial_year" text NOT NULL,
	"customer_id" integer,
	"client_name" text,
	"client_contact" text,
	"client_email" text,
	"start_date" text NOT NULL,
	"target_end_date" text NOT NULL,
	"actual_end_date" text,
	"estimated_budget" numeric(12, 2),
	"actual_cost" numeric(12, 2),
	"currency" text DEFAULT 'INR',
	"progress" integer DEFAULT 0,
	"manager_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"notes" text,
	"tags" text[],
	"continent_code" varchar(2) NOT NULL,
	"country_code" varchar(2) NOT NULL,
	"fy_code" varchar(4) NOT NULL,
	"project_seq" varchar(3) NOT NULL,
	"legacy_code" varchar(20),
	"source_offer_id" integer,
	"source_offer_revision" integer,
	"source_order_number" varchar(15),
	"source_conversion_id" uuid,
	"project_origin" varchar(20),
	"automation_mode" varchar(20) DEFAULT 'manual',
	"automation_run_id" uuid,
	"automation_completed_at" timestamp,
	"discipline_code" varchar(30),
	"mdmt" varchar(20),
	"inspection_by" varchar(80),
	"voltage_frequency" varchar(20),
	"electrical_voltage" varchar(10),
	"electrical_frequency" varchar(5),
	"electrical_phase" varchar(5),
	"selling_currency" varchar(10) DEFAULT 'USD',
	"exchange_rate" numeric(14, 6),
	"exchange_rate_frozen_at" timestamp,
	"total_selling_price_inr" numeric(15, 2),
	"total_selling_price" numeric(15, 2),
	"incoterms" varchar(20),
	"payment_terms" text,
	"delivery_terms" text,
	"offer_validity_days" integer DEFAULT 30,
	"default_margin_percent" numeric(6, 2),
	"cost_lock_status" varchar(20) DEFAULT 'unlocked',
	"cost_lock_submitted_by" integer,
	"cost_lock_submitted_at" timestamp,
	"cost_lock_reviewed_by" integer,
	"cost_lock_reviewed_at" timestamp,
	"cost_lock_note" text,
	"is_test" boolean DEFAULT false NOT NULL,
	"offer_subject" text DEFAULT '' NOT NULL,
	"customer_name" text DEFAULT '' NOT NULL,
	"project_display_name" text DEFAULT '' NOT NULL,
	CONSTRAINT "projects_code_unique" UNIQUE("code"),
	CONSTRAINT "projects_source_offer_id_unique" UNIQUE("source_offer_id")
);
--> statement-breakpoint
CREATE TABLE "pt_state_config" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer DEFAULT 1,
	"state" varchar(50) NOT NULL,
	"ptrc_number" varchar(30),
	"filing_frequency" varchar(20) DEFAULT 'monthly' NOT NULL,
	"payment_due_day" integer DEFAULT 0,
	"is_active" boolean DEFAULT true NOT NULL,
	"slab_config" jsonb,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_order_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_order_id" integer NOT NULL,
	"document_type" text NOT NULL,
	"document_name" text NOT NULL,
	"document_path" text NOT NULL,
	"uploaded_by" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"storage_path" text,
	"storage_url" text,
	"storage_url_expiry" timestamp
);
--> statement-breakpoint
CREATE TABLE "purchase_order_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_order_id" integer NOT NULL,
	"status" text NOT NULL,
	"comments" text,
	"changed_by" integer NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL,
	"additional_data" jsonb
);
--> statement-breakpoint
CREATE TABLE "purchase_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_order_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"project_item_id" integer,
	"quantity" numeric(10, 2) NOT NULL,
	"unit" text NOT NULL,
	"unit_price" numeric(10, 2) NOT NULL,
	"total_price" numeric(12, 2) NOT NULL,
	"description" text,
	"delivery_status" text DEFAULT 'pending',
	"received_quantity" numeric(10, 2) DEFAULT '0',
	"quality_status" text,
	"line_number" integer NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"purchase_order_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"project_id" integer NOT NULL,
	"vendor_id" integer NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"priority" text DEFAULT 'Medium' NOT NULL,
	"requested_date" timestamp NOT NULL,
	"required_by_date" timestamp NOT NULL,
	"estimated_delivery_date" timestamp,
	"actual_delivery_date" timestamp,
	"payment_terms" text,
	"shipping_terms" text,
	"total_amount" numeric(12, 2),
	"currency" text DEFAULT 'INR',
	"tracking_number" text,
	"notes" text,
	"created_by" integer NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_purchase_order_number_unique" UNIQUE("purchase_order_number")
);
--> statement-breakpoint
CREATE TABLE "qap_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"content" text NOT NULL,
	"version" varchar(50) NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qap_versions" (
	"id" serial PRIMARY KEY NOT NULL,
	"qap_id" integer NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"revision" varchar(50) NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qms_document_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"module" varchar(30) NOT NULL,
	"document_number" varchar(100) NOT NULL,
	"revision_id" integer,
	"action" varchar(30) NOT NULL,
	"gcs_path" varchar(500),
	"user_id" integer NOT NULL,
	"user_role" varchar(50),
	"ip_address" varchar(45),
	"details" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "qms_document_revisions" (
	"id" serial PRIMARY KEY NOT NULL,
	"module" varchar(30) NOT NULL,
	"document_number" varchar(100) NOT NULL,
	"revision_number" integer DEFAULT 1 NOT NULL,
	"sequence" integer DEFAULT 1 NOT NULL,
	"label" varchar(100) NOT NULL,
	"file_extension" varchar(20) NOT NULL,
	"gcs_path" varchar(500) NOT NULL,
	"checksum_sha256" varchar(64) NOT NULL,
	"file_size_bytes" bigint DEFAULT 0 NOT NULL,
	"original_file_name" varchar(255),
	"content_type" varchar(100),
	"is_latest" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"parent_entity_type" varchar(50) NOT NULL,
	"parent_entity_id" integer NOT NULL,
	"revision_of" integer,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deleted_by" integer,
	"deleted_at" timestamp,
	"delete_reason" text
);
--> statement-breakpoint
CREATE TABLE "quality_checklists" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"project_code" text NOT NULL,
	"checklist_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"checklist_type" text NOT NULL,
	"applicable_items" text[],
	"version" text DEFAULT '1.0' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"prepared_by" integer NOT NULL,
	"approved_by" integer,
	"approval_date" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quality_checklists_checklist_number_unique" UNIQUE("checklist_number")
);
--> statement-breakpoint
CREATE TABLE "quality_planning_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"quality_plan_number" varchar(35),
	"project_id" integer NOT NULL,
	"project_item_id" integer NOT NULL,
	"master_item_id" integer NOT NULL,
	"source_context" varchar(30) NOT NULL,
	"procurement_exec_id" integer,
	"production_exec_id" integer,
	"planning_record_id" integer,
	"item_code" varchar(100),
	"item_description" text,
	"item_specification" text,
	"uom" varchar(30),
	"drawing_no" varchar(100),
	"drawing_revision" integer,
	"quantity" numeric(10, 2) NOT NULL,
	"quality_requirement_type" varchar(50) NOT NULL,
	"quality_notes" text,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"prepared_by" integer,
	"prepared_at" timestamp,
	"preparation_note" text,
	"superseded_by" integer,
	"superseded_at" timestamp,
	"supersession_reason" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"created_by" integer,
	"assigned_to" integer,
	"created_source_type" varchar(20) DEFAULT 'manual',
	"created_source_ref" varchar(100),
	"automation_run_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quality_planning_records_quality_plan_number_unique" UNIQUE("quality_plan_number")
);
--> statement-breakpoint
CREATE TABLE "quotation_pdf_artifacts" (
	"id" serial PRIMARY KEY NOT NULL,
	"offer_id" integer NOT NULL,
	"revision" integer NOT NULL,
	"price_mode" varchar(20) NOT NULL,
	"gcs_bucket" varchar(100) DEFAULT 'thermopac_storage' NOT NULL,
	"gcs_object_path" varchar(500) NOT NULL,
	"checksum_sha256" varchar(64) NOT NULL,
	"file_size_bytes" bigint NOT NULL,
	"artifact_status" varchar(20) DEFAULT 'active' NOT NULL,
	"is_confirmed" boolean DEFAULT false NOT NULL,
	"confirmed_at" timestamp with time zone,
	"epc_attachment_status" varchar(20),
	"epc_attachment_id" integer,
	"epc_attachment_error" text,
	"archive_revision_id" integer,
	"action_type" varchar(10),
	"generated_by" integer NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quotation_pdf_artifacts_gcs_object_path_unique" UNIQUE("gcs_object_path")
);
--> statement-breakpoint
CREATE TABLE "reauth_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"action_key" varchar(80) NOT NULL,
	"challenge_type" varchar(20),
	"outcome" varchar(30) NOT NULL,
	"ip_address" varchar(45),
	"severity" varchar(20) DEFAULT 'info' NOT NULL,
	"archived_at" timestamp,
	"archive_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_patterns" (
	"id" serial PRIMARY KEY NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" text NOT NULL,
	"user_id" integer NOT NULL,
	"pattern" text NOT NULL,
	"interval" integer DEFAULT 1 NOT NULL,
	"days_of_week" text,
	"day_of_month" integer,
	"month_of_year" integer,
	"start_date" text NOT NULL,
	"end_date" text,
	"max_occurrences" integer,
	"template_title" text NOT NULL,
	"template_description" text NOT NULL,
	"template_priority" text NOT NULL,
	"template_assigned_to" integer,
	"template_category" text,
	"template_duration_days" integer DEFAULT 1 NOT NULL,
	"template_planned_hours" real DEFAULT 0,
	"last_generated_date" text,
	"next_generation_date" text,
	"generated_count" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recurring_tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'Medium' NOT NULL,
	"start_date" text NOT NULL,
	"finish_date" text NOT NULL,
	"assigned_to" integer,
	"completed_at" text,
	"category" text,
	"recurring_pattern_id" integer NOT NULL,
	"created_at" text NOT NULL,
	"occurrence_number" integer NOT NULL,
	"due_date" text NOT NULL,
	"planned_hours" real DEFAULT 0
);
--> statement-breakpoint
CREATE TABLE "report_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" text DEFAULT 'QMS Final Dossier' NOT NULL,
	"has_cover_page" boolean DEFAULT true NOT NULL,
	"has_footer" boolean DEFAULT true NOT NULL,
	"font_size" text DEFAULT 'Medium' NOT NULL,
	"header_text" text,
	"footer_text" text,
	"paper_size" text DEFAULT 'A4',
	"orientation" text DEFAULT 'Portrait',
	"margin_top" integer DEFAULT 25,
	"margin_bottom" integer DEFAULT 25,
	"margin_left" integer DEFAULT 25,
	"margin_right" integer DEFAULT 25,
	"section_configurations" jsonb,
	"section_order" jsonb,
	"show_company_logo" boolean DEFAULT true,
	"logo_position" text DEFAULT 'header',
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resolved_project_folders" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"folder_template_id" integer NOT NULL,
	"folder_node_id" integer,
	"relative_path" text NOT NULL,
	"folder_code" varchar(80),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resource_assignments" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_order_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"role" text NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"hours_allocated" numeric(8, 2),
	"hours_spent" numeric(8, 2) DEFAULT '0',
	"status" text DEFAULT 'assigned' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_comments" (
	"id" serial PRIMARY KEY NOT NULL,
	"review_id" integer NOT NULL,
	"comment_number" integer NOT NULL,
	"comment_type" varchar(50) DEFAULT 'General',
	"discipline" varchar(50),
	"comment" text NOT NULL,
	"location" varchar(255),
	"category" varchar(100),
	"designer_response" text,
	"resolution_action" text,
	"resolution_status" varchar(50) DEFAULT 'Open',
	"raised_date" timestamp DEFAULT now() NOT NULL,
	"target_resolution_date" date,
	"resolved_date" timestamp,
	"verified_date" timestamp,
	"assigned_to_id" integer,
	"verified_by_id" integer,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "roi_project_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"roi_project_id" uuid NOT NULL,
	"step_number" integer NOT NULL,
	"step_data" jsonb NOT NULL,
	"updated_by" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_module_permissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"module_name" text NOT NULL,
	"can_view" boolean DEFAULT false NOT NULL,
	"can_create" boolean DEFAULT false NOT NULL,
	"can_edit" boolean DEFAULT false NOT NULL,
	"can_delete" boolean DEFAULT false NOT NULL,
	"can_upload" boolean DEFAULT false NOT NULL,
	"can_download" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_increment_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"proposal_id" integer NOT NULL,
	"employee_salary_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"action" varchar(20) NOT NULL,
	"actor_id" integer NOT NULL,
	"old_values" jsonb,
	"new_values" jsonb,
	"remarks" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "salary_increment_proposals" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_salary_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"increment_percentage" numeric(5, 2) NOT NULL,
	"old_basic_salary" numeric(15, 2) NOT NULL,
	"proposed_basic_salary" numeric(15, 2) NOT NULL,
	"old_ctc" numeric(15, 2),
	"proposed_ctc" numeric(15, 2),
	"effective_date" date NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"remarks" text DEFAULT 'Yearly Increment',
	"proposed_by" integer NOT NULL,
	"proposed_at" timestamp DEFAULT now() NOT NULL,
	"approved_by" integer,
	"approved_at" timestamp,
	"rejected_by" integer,
	"rejected_at" timestamp,
	"rejection_reason" text,
	"applied_at" timestamp,
	"applied_by" integer,
	"appraisal_id" integer,
	"appraisal_final_score" numeric(5, 2),
	"appraisal_rating" varchar(30),
	"system_suggested_increment_pct" numeric(5, 2),
	"min_increment_pct" numeric(5, 2),
	"max_increment_pct" numeric(5, 2),
	"final_proposed_increment_pct" numeric(5, 2),
	"edited_by" integer,
	"edited_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "sap_goods_receipt_po" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_entry" integer NOT NULL,
	"doc_num" varchar(50) NOT NULL,
	"doc_type" varchar(10) DEFAULT 'GR',
	"series" integer,
	"doc_date" date NOT NULL,
	"posting_date" date,
	"vendor_code" varchar(50) NOT NULL,
	"vendor_name" varchar(255),
	"base_doc_type" varchar(10),
	"base_doc_entry" integer,
	"base_doc_num" varchar(50),
	"doc_total" numeric(15, 2) DEFAULT '0',
	"vat_sum" numeric(15, 2) DEFAULT '0',
	"doc_currency" varchar(10) DEFAULT 'INR',
	"doc_status" varchar(10) DEFAULT 'O',
	"cancelled" varchar(1) DEFAULT 'N',
	"comments" text,
	"reference_1" varchar(100),
	"sap_synced_at" timestamp,
	"sap_last_modified" timestamp,
	"sap_sync_status" varchar(20) DEFAULT 'pending',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "sap_goods_receipt_po_doc_entry_unique" UNIQUE("doc_entry")
);
--> statement-breakpoint
CREATE TABLE "sap_purchase_invoices" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_entry" integer NOT NULL,
	"doc_num" varchar(50) NOT NULL,
	"doc_type" varchar(10) DEFAULT 'PI',
	"series" integer,
	"doc_date" date NOT NULL,
	"doc_due_date" date,
	"tax_date" date,
	"vendor_code" varchar(50) NOT NULL,
	"vendor_name" varchar(255),
	"base_doc_type" varchar(10),
	"base_doc_entry" integer,
	"base_doc_num" varchar(50),
	"doc_total" numeric(15, 2) DEFAULT '0',
	"vat_sum" numeric(15, 2) DEFAULT '0',
	"paid_sum" numeric(15, 2) DEFAULT '0',
	"doc_total_fc" numeric(15, 2) DEFAULT '0',
	"doc_currency" varchar(10) DEFAULT 'INR',
	"doc_rate" numeric(10, 4) DEFAULT '1',
	"doc_status" varchar(10) DEFAULT 'O',
	"cancelled" varchar(1) DEFAULT 'N',
	"comments" text,
	"reference_1" varchar(100),
	"reference_2" varchar(100),
	"sap_synced_at" timestamp,
	"sap_last_modified" timestamp,
	"sap_sync_status" varchar(20) DEFAULT 'pending',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "sap_purchase_invoices_doc_entry_unique" UNIQUE("doc_entry")
);
--> statement-breakpoint
CREATE TABLE "sap_purchase_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_entry" integer NOT NULL,
	"line_num" integer NOT NULL,
	"item_code" varchar(50) NOT NULL,
	"item_description" varchar(255),
	"quantity" numeric(15, 4) DEFAULT '0',
	"open_qty" numeric(15, 4) DEFAULT '0',
	"unit_price" numeric(15, 4) DEFAULT '0',
	"price_after_vat" numeric(15, 4) DEFAULT '0',
	"line_total" numeric(15, 2) DEFAULT '0',
	"tax_code" varchar(20),
	"tax_rate" numeric(5, 2) DEFAULT '0',
	"tax_sum" numeric(15, 2) DEFAULT '0',
	"gst_type" varchar(20) DEFAULT 'IGST',
	"gst_treatment" varchar(30) DEFAULT 'taxable',
	"place_of_supply" varchar(50),
	"vendor_state" varchar(50),
	"buyer_state" varchar(50),
	"cgst_rate" numeric(5, 2) DEFAULT '0',
	"cgst_amount" numeric(15, 2) DEFAULT '0',
	"sgst_rate" numeric(5, 2) DEFAULT '0',
	"sgst_amount" numeric(15, 2) DEFAULT '0',
	"igst_rate" numeric(5, 2) DEFAULT '0',
	"igst_amount" numeric(15, 2) DEFAULT '0',
	"total_gst_amount" numeric(15, 2) DEFAULT '0',
	"itc_eligible" boolean DEFAULT true,
	"itc_claim_amount" numeric(15, 2) DEFAULT '0',
	"expenditure_type" varchar(20) DEFAULT 'OpEx',
	"line_total_before_gst" numeric(15, 2) DEFAULT '0',
	"line_total_after_gst" numeric(15, 2) DEFAULT '0',
	"hsn_sac_code" varchar(20),
	"commodity_description" varchar(255),
	"financial_year" varchar(20),
	"warehouse_code" varchar(20),
	"uom" varchar(20),
	"uom_code" varchar(20),
	"cost_center" varchar(50),
	"project_code" varchar(50),
	"ship_date" date,
	"delivery_date" date,
	"line_status" varchar(10) DEFAULT 'bost_Open',
	"sap_synced_at" timestamp,
	"sap_last_modified" timestamp,
	"sap_sync_status" varchar(20) DEFAULT 'pending',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "sap_purchase_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_entry" integer NOT NULL,
	"doc_num" varchar(50) NOT NULL,
	"doc_type" varchar(10) DEFAULT 'PO',
	"series" integer,
	"doc_date" date NOT NULL,
	"doc_due_date" date,
	"tax_date" date,
	"vendor_code" varchar(50) NOT NULL,
	"vendor_name" varchar(255),
	"contact_person" varchar(100),
	"doc_total" numeric(15, 2) DEFAULT '0',
	"vat_sum" numeric(15, 2) DEFAULT '0',
	"doc_total_fc" numeric(15, 2) DEFAULT '0',
	"doc_currency" varchar(10) DEFAULT 'INR',
	"doc_rate" numeric(10, 4) DEFAULT '1',
	"doc_status" varchar(10) DEFAULT 'O',
	"cancelled" varchar(1) DEFAULT 'N',
	"comments" text,
	"reference_1" varchar(100),
	"reference_2" varchar(100),
	"project_code" varchar(50),
	"sap_synced_at" timestamp,
	"sap_last_modified" timestamp,
	"sap_sync_status" varchar(20) DEFAULT 'pending',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "sap_purchase_orders_doc_entry_unique" UNIQUE("doc_entry")
);
--> statement-breakpoint
CREATE TABLE "sap_purchase_requisitions" (
	"id" serial PRIMARY KEY NOT NULL,
	"doc_entry" integer NOT NULL,
	"doc_num" varchar(50) NOT NULL,
	"doc_type" varchar(10) DEFAULT 'PR',
	"series" integer,
	"doc_date" date NOT NULL,
	"due_date" date,
	"requester_code" varchar(50),
	"requester_name" varchar(255),
	"doc_status" varchar(10) DEFAULT 'O',
	"priority" varchar(10) DEFAULT 'Normal',
	"comments" text,
	"reference_1" varchar(100),
	"department" varchar(50),
	"sap_synced_at" timestamp,
	"sap_last_modified" timestamp,
	"sap_sync_status" varchar(20) DEFAULT 'pending',
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer,
	"updated_by" integer,
	CONSTRAINT "sap_purchase_requisitions_doc_entry_unique" UNIQUE("doc_entry")
);
--> statement-breakpoint
CREATE TABLE "sap_wht_sync_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"sync_batch_id" varchar(50) NOT NULL,
	"financial_year" varchar(10) NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"records_fetched" integer DEFAULT 0,
	"records_inserted" integer DEFAULT 0,
	"records_skipped" integer DEFAULT 0,
	"records_updated" integer DEFAULT 0,
	"sync_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"error_message" text,
	"sap_doc_types_queried" text,
	"synced_by" integer,
	"synced_at" timestamp DEFAULT now(),
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sap_wht_sync_log_sync_batch_id_unique" UNIQUE("sync_batch_id")
);
--> statement-breakpoint
CREATE TABLE "schengen_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"alert_type" varchar(50) NOT NULL,
	"days_used" integer NOT NULL,
	"calculation_date" date NOT NULL,
	"is_acknowledged" boolean DEFAULT false NOT NULL,
	"acknowledged_by" integer,
	"acknowledged_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "schengen_travel_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"country" varchar(100) NOT NULL,
	"entry_date" date NOT NULL,
	"exit_date" date,
	"purpose" varchar(200),
	"notes" text,
	"is_business_trip" boolean DEFAULT false NOT NULL,
	"source" varchar(100) DEFAULT 'Manual Entry',
	"business_trip_id" integer,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_archival_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_run_at" timestamp DEFAULT now() NOT NULL,
	"target_table" varchar(80) NOT NULL,
	"rows_archived" integer DEFAULT 0 NOT NULL,
	"archive_path" text,
	"checksum_sha256" varchar(64),
	"status" varchar(20) DEFAULT 'success' NOT NULL,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "security_emergency_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"initiated_by" varchar(100) NOT NULL,
	"witness_name" varchar(100),
	"scenario" varchar(50) NOT NULL,
	"affected_action" text,
	"target_user_id" integer,
	"passphrase_attempts" integer DEFAULT 1 NOT NULL,
	"outcome" varchar(30) NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sensitive_action_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"action_key" varchar(80) NOT NULL,
	"action_label" text NOT NULL,
	"apply_to_roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"challenge_type" varchar(20) DEFAULT 'any' NOT NULL,
	"timeout_minutes" integer DEFAULT 30 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sensitive_action_policies_action_key_unique" UNIQUE("action_key")
);
--> statement-breakpoint
CREATE TABLE "service_activities" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_request_id" integer NOT NULL,
	"activity_type" text NOT NULL,
	"scheduled_date" date,
	"actual_date" date,
	"description" text,
	"outcome" text,
	"status" text DEFAULT 'Scheduled' NOT NULL,
	"performed_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_contracts" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"project_id" integer,
	"contract_number" text NOT NULL,
	"description" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"contract_value" numeric(12, 2) NOT NULL,
	"status" text DEFAULT 'Active' NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_contracts_contract_number_unique" UNIQUE("contract_number")
);
--> statement-breakpoint
CREATE TABLE "service_parts" (
	"id" serial PRIMARY KEY NOT NULL,
	"service_activity_id" integer NOT NULL,
	"item_id" integer NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price" numeric(10, 2),
	"is_billable" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "service_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"customer_id" integer NOT NULL,
	"project_id" integer,
	"request_type" text NOT NULL,
	"subject" text NOT NULL,
	"description" text,
	"priority" text DEFAULT 'Medium' NOT NULL,
	"status" text DEFAULT 'New' NOT NULL,
	"created_by" integer NOT NULL,
	"assigned_to" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statutory_challan_details" (
	"id" serial PRIMARY KEY NOT NULL,
	"challan_id" integer NOT NULL,
	"employee_id" integer NOT NULL,
	"payroll_record_id" integer,
	"employee_contribution" numeric(10, 2) DEFAULT '0',
	"employer_contribution" numeric(10, 2) DEFAULT '0',
	"gross_salary" numeric(12, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statutory_challans" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer DEFAULT 1,
	"challan_reference" varchar(50) NOT NULL,
	"module_type" varchar(10) NOT NULL,
	"payroll_period_id" integer,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"financial_year" varchar(10) NOT NULL,
	"state" varchar(50),
	"employee_count" integer DEFAULT 0,
	"total_employee_contribution" numeric(12, 2) DEFAULT '0' NOT NULL,
	"total_employer_contribution" numeric(12, 2) DEFAULT '0' NOT NULL,
	"admin_charges" numeric(10, 2) DEFAULT '0',
	"interest" numeric(10, 2) DEFAULT '0',
	"penalty" numeric(10, 2) DEFAULT '0',
	"total_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tds_section" varchar(10),
	"tds_quarter" varchar(5),
	"bsr_code" varchar(20),
	"cin_number" varchar(50),
	"establishment_code" varchar(30),
	"trrn_number" varchar(50),
	"employer_eps" numeric(12, 2),
	"ecr_generated" boolean DEFAULT false,
	"ecr_file_key" text,
	"esic_employer_code" varchar(30),
	"ptrc_number" varchar(30),
	"grn_number" varchar(50),
	"payment_date" timestamp,
	"payment_mode" varchar(20),
	"payment_reference" varchar(100),
	"bank_name" varchar(100),
	"challan_serial" varchar(30),
	"sap_je_reference" varchar(50),
	"sap_doc_entry" integer,
	"sap_je_number" varchar(50),
	"sap_bank_account_code" varchar(50),
	"sap_posting_status" varchar(20) DEFAULT 'draft',
	"sap_posting_error" text,
	"sap_posted_at" timestamp,
	"reversal_sap_doc_entry" integer,
	"reversal_sap_je_number" varchar(50),
	"reversal_sap_posted_at" timestamp,
	"reversed_by" integer,
	"reversed_at" timestamp,
	"gl_posting_id" integer,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"created_by" integer,
	"updated_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "statutory_challans_challan_reference_unique" UNIQUE("challan_reference")
);
--> statement-breakpoint
CREATE TABLE "statutory_filing_status" (
	"id" serial PRIMARY KEY NOT NULL,
	"company_id" integer DEFAULT 1,
	"module_type" varchar(10) NOT NULL,
	"financial_year" varchar(10) NOT NULL,
	"filing_period" varchar(30) NOT NULL,
	"form_type" varchar(20),
	"state" varchar(50),
	"due_date" timestamp,
	"filing_date" timestamp,
	"acknowledgement_number" varchar(50),
	"total_amount" numeric(12, 2) DEFAULT '0',
	"employee_count" integer DEFAULT 0,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"remarks" text,
	"filed_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tag_no_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"line_id" integer NOT NULL,
	"header_id" integer NOT NULL,
	"project_id" integer NOT NULL,
	"old_tag_no" varchar(80) DEFAULT '' NOT NULL,
	"new_tag_no" varchar(80) DEFAULT '' NOT NULL,
	"changed_by" integer,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tank_prices" (
	"id" serial PRIMARY KEY NOT NULL,
	"capacity" integer NOT NULL,
	"price_usd" numeric(10, 2) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer NOT NULL,
	"updated_by" integer,
	CONSTRAINT "tank_prices_capacity_unique" UNIQUE("capacity")
);
--> statement-breakpoint
CREATE TABLE "task_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"action" text NOT NULL,
	"timestamp" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"priority" text DEFAULT 'Medium' NOT NULL,
	"start_date" text NOT NULL,
	"finish_date" text NOT NULL,
	"due_date" text,
	"assigned_to" integer,
	"created_by" integer,
	"created_at" text NOT NULL,
	"completed_at" text,
	"category" text,
	"source_type" text,
	"source_id" integer,
	"source_agent" text,
	"completion_rejection_reason" text,
	"is_archived" boolean DEFAULT false NOT NULL,
	"archived_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tax_slabs" (
	"id" serial PRIMARY KEY NOT NULL,
	"regime" varchar(10) NOT NULL,
	"financial_year" varchar(10) NOT NULL,
	"slab_order" integer NOT NULL,
	"min_income" numeric(15, 2) NOT NULL,
	"max_income" numeric(15, 2),
	"rate" numeric(5, 2) NOT NULL,
	"cess_rate" numeric(5, 2) DEFAULT '4.00',
	"surcharge_rate" numeric(5, 2) DEFAULT '0',
	"surcharge_threshold" numeric(15, 2),
	"standard_deduction" numeric(10, 2) DEFAULT '50000',
	"section87a_rebate_limit" numeric(10, 2),
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tds_compliance_register" (
	"id" serial PRIMARY KEY NOT NULL,
	"source_category" varchar(30) NOT NULL,
	"tds_section" varchar(10) NOT NULL,
	"financial_year" varchar(10) NOT NULL,
	"quarter" varchar(5) NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"deductee_name" varchar(200) NOT NULL,
	"deductee_pan" varchar(15),
	"pan_status" varchar(20) DEFAULT 'unverified' NOT NULL,
	"pan_validation_error" varchar(100),
	"deductee_type" varchar(20) NOT NULL,
	"employee_id" integer,
	"payroll_record_id" integer,
	"sap_vendor_code" varchar(50),
	"sap_doc_entry" integer,
	"sap_doc_type" varchar(30),
	"sap_wt_code" varchar(20),
	"sap_line_index" integer,
	"deduction_stage" varchar(20),
	"base_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tds_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"tds_rate" numeric(5, 2),
	"deduction_date" timestamp,
	"challan_id" integer,
	"challan_status" varchar(20) DEFAULT 'pending' NOT NULL,
	"sync_batch_id" varchar(50),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tds_monthly_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"period_id" integer,
	"financial_year" varchar(10) NOT NULL,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"gross_salary_monthly" numeric(12, 2) NOT NULL,
	"gross_salary_ytd" numeric(12, 2) NOT NULL,
	"gross_salary_projected" numeric(15, 2) NOT NULL,
	"standard_deduction" numeric(10, 2) DEFAULT '50000',
	"hra_exemption" numeric(10, 2) DEFAULT '0',
	"section80c_deduction" numeric(10, 2) DEFAULT '0',
	"section80d_deduction" numeric(10, 2) DEFAULT '0',
	"other_chapter6a_deductions" numeric(10, 2) DEFAULT '0',
	"section24b_deduction" numeric(10, 2) DEFAULT '0',
	"total_deductions" numeric(12, 2) DEFAULT '0',
	"taxable_income_projected" numeric(15, 2) NOT NULL,
	"tax_on_projected_income" numeric(12, 2) NOT NULL,
	"cess_amount" numeric(10, 2) DEFAULT '0',
	"surcharge_amount" numeric(10, 2) DEFAULT '0',
	"section87a_rebate" numeric(10, 2) DEFAULT '0',
	"total_tax_liability_annual" numeric(12, 2) NOT NULL,
	"tds_deducted_ytd" numeric(12, 2) DEFAULT '0',
	"previous_employer_tds" numeric(10, 2) DEFAULT '0',
	"tds_required_monthly" numeric(10, 2) NOT NULL,
	"catch_up_adjustment" numeric(10, 2) DEFAULT '0',
	"tds_actual_monthly" numeric(10, 2) NOT NULL,
	"regime" varchar(10) NOT NULL,
	"calculation_snapshot" jsonb,
	"created_at" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "tds_payroll_sap_reconciliation" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"employee_name" varchar(200) NOT NULL,
	"employee_code" varchar(20),
	"period_id" integer,
	"month" integer NOT NULL,
	"year" integer NOT NULL,
	"financial_year" varchar(10) NOT NULL,
	"quarter" varchar(5) NOT NULL,
	"payroll_tds_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"sap_posting_status" varchar(20) DEFAULT 'sap_missing' NOT NULL,
	"sap_doc_entry" integer,
	"sap_je_number" varchar(50),
	"sap_posting_date" timestamp,
	"sap_verified_tds_amount" numeric(12, 2),
	"sap_verification_status" varchar(20) DEFAULT 'not_verified',
	"variance" numeric(12, 2),
	"tolerance_applied" numeric(10, 2),
	"payroll_record_id" integer,
	"last_reconciled_at" timestamp,
	"last_verified_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_leader_config" (
	"team_number" integer PRIMARY KEY NOT NULL,
	"leader_name" varchar(100) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_procedures" (
	"id" serial PRIMARY KEY NOT NULL,
	"procedure_number" varchar(100) NOT NULL,
	"procedure_name" varchar(255) NOT NULL,
	"ndt_method" varchar(50) NOT NULL,
	"applicable_standard" varchar(255),
	"procedure_revision" varchar(20) DEFAULT 'R1',
	"scope" text,
	"technique" varchar(255),
	"sensitivity" varchar(100),
	"preparation" text,
	"procedure_steps" text,
	"evaluation" text,
	"documentation" text,
	"personnel_qualification" varchar(255),
	"acceptance_criteria" text,
	"limitations" text,
	"environmental_conditions" text,
	"status" varchar(50) DEFAULT 'Draft' NOT NULL,
	"approval_level" varchar(50),
	"approved_by" integer,
	"approved_at" timestamp,
	"is_revision" boolean DEFAULT false NOT NULL,
	"revision_of" integer,
	"revision_reason" text,
	"superseded_at" timestamp,
	"superseded_by" integer,
	"remarks" text,
	"tags" text,
	"attachments" jsonb,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "test_procedures_procedure_number_unique" UNIQUE("procedure_number")
);
--> statement-breakpoint
CREATE TABLE "transporters" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"contact_person" text,
	"email" text,
	"phone" text,
	"address" text,
	"gst_number" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_approvals" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"approver_id" integer NOT NULL,
	"approval_type" varchar(50) NOT NULL,
	"status" varchar(50) NOT NULL,
	"comments" text,
	"approved_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"booking_type" varchar(50) NOT NULL,
	"booking_details" text,
	"pnr_reference" varchar(255),
	"hotel_name" varchar(255),
	"visa_status" varchar(100),
	"booking_document_url" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"document_type" varchar(100) NOT NULL,
	"document_name" varchar(500) NOT NULL,
	"file_path" text NOT NULL,
	"file_url" text,
	"file_size" integer,
	"file_type" varchar(100),
	"description" text,
	"uploaded_by" integer NOT NULL,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"category" varchar(50) NOT NULL,
	"description" text,
	"amount" numeric(10, 2) NOT NULL,
	"receipt_url" text,
	"expense_date" date NOT NULL,
	"submitted_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trip_reimbursements" (
	"id" serial PRIMARY KEY NOT NULL,
	"trip_id" integer NOT NULL,
	"total_expenses" numeric(10, 2) NOT NULL,
	"advance_given" numeric(10, 2) DEFAULT '0',
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"processed_by" integer,
	"processed_at" timestamp,
	"payment_reference" varchar(255),
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trusted_device_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"device_id" integer,
	"action" varchar(30) NOT NULL,
	"performed_by" integer,
	"ip_address" varchar(45),
	"severity" varchar(20) DEFAULT 'info' NOT NULL,
	"notes" text,
	"archived_at" timestamp,
	"archive_path" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trusted_devices" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"device_fingerprint" text NOT NULL,
	"device_name" varchar(100),
	"trust_token" varchar(255) NOT NULL,
	"trust_token_expires_at" timestamp,
	"is_active" boolean DEFAULT true NOT NULL,
	"registered_by_admin" boolean DEFAULT false NOT NULL,
	"registered_by" integer,
	"last_used_at" timestamp,
	"revoked_at" timestamp,
	"revoked_by" integer,
	"revoked_reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trusted_devices_trust_token_unique" UNIQUE("trust_token")
);
--> statement-breakpoint
CREATE TABLE "two_fa_global_policy" (
	"id" serial PRIMARY KEY NOT NULL,
	"enforcement_mode" varchar(30) DEFAULT 'optional' NOT NULL,
	"apply_to_roles" text[] DEFAULT '{}'::text[] NOT NULL,
	"enforcement_from_date" date,
	"grace_period_enabled" boolean DEFAULT true NOT NULL,
	"grace_period_days" integer DEFAULT 14 NOT NULL,
	"updated_by" integer,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_fa_policy_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"changed_by" integer,
	"previous_mode" varchar(30),
	"new_mode" varchar(30) NOT NULL,
	"previous_roles" text[],
	"new_roles" text[],
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "two_factor_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"action" varchar(50) NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"metadata" jsonb DEFAULT '{}',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "uom_master" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(20) NOT NULL,
	"label" varchar(60) NOT NULL,
	"category" varchar(40),
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uom_master_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "user_achievements" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"achievement_id" integer NOT NULL,
	"earned_at" text NOT NULL,
	"level" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_activity_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"module" varchar(50) NOT NULL,
	"action" varchar(100) NOT NULL,
	"resource_type" varchar(50),
	"resource_id" varchar(50),
	"ip_address" varchar(45),
	"user_agent" text,
	"session_duration" integer DEFAULT 0,
	"meta" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_compliance_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"compliance_type" varchar(50) NOT NULL,
	"status" varchar(20) NOT NULL,
	"due_date" date,
	"completed_date" date,
	"score" numeric(5, 2),
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_module_stats" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"module" varchar(50) NOT NULL,
	"date" date NOT NULL,
	"time_spent" integer DEFAULT 0,
	"actions_count" integer DEFAULT 0,
	"documents_created" integer DEFAULT 0,
	"documents_modified" integer DEFAULT 0,
	"last_activity" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_productivity_metrics" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"date" date NOT NULL,
	"tasks_completed" integer DEFAULT 0,
	"inspections_processed" integer DEFAULT 0,
	"documents_generated" integer DEFAULT 0,
	"quality_records_created" integer DEFAULT 0,
	"financial_transactions" integer DEFAULT 0,
	"attendance_score" numeric(5, 2) DEFAULT '0',
	"efficiency_score" numeric(5, 2) DEFAULT '0',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_session_registry" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"session_id" varchar(255) NOT NULL,
	"ip_address" varchar(45),
	"user_agent" text,
	"device_fingerprint" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_activity_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_session_registry_session_id_unique" UNIQUE("session_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"email" text NOT NULL,
	"mobile_number" text NOT NULL,
	"country_code" text NOT NULL,
	"role" text NOT NULL,
	"employee_type" text DEFAULT 'PERMANENT',
	"first_name" text,
	"middle_name" text,
	"last_name" text,
	"job_title" text,
	"department" text,
	"branch" text,
	"employee_code" text,
	"phone" text,
	"fax" text,
	"linked_vendor" text,
	"epf_no" text,
	"date_of_birth" date,
	"esic_no" text,
	"std_code" text,
	"pan_number" text,
	"card_code" text,
	"card_name" text,
	"loan_card_code" text,
	"loan_card_name" text,
	"date_of_joining" text,
	"is_active" boolean DEFAULT true,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"google_calendar_connected" boolean DEFAULT false,
	"google_access_token" text,
	"google_refresh_token" text,
	"google_token_expires_at" timestamp,
	"google_email" text,
	"google_calendar_sync_enabled" boolean DEFAULT true,
	"password_needs_update" boolean DEFAULT false,
	"password_history" jsonb DEFAULT '[]'::jsonb,
	"last_password_change" timestamp,
	"reset_token" varchar(255),
	"reset_token_expires_at" timestamp,
	"two_factor_enabled" boolean DEFAULT false,
	"two_factor_secret" text,
	"two_factor_backup_codes" jsonb DEFAULT '[]',
	"two_factor_failed_attempts" integer DEFAULT 0,
	"two_factor_locked_until" timestamp,
	"two_factor_challenge_nonce" text,
	"user_type" text DEFAULT 'system_user',
	"salary_type" varchar(20) DEFAULT 'monthly',
	"ot_applicable" varchar(10) DEFAULT 'no',
	"weekly_off_days" jsonb DEFAULT '[0,6]',
	"duty_time_in" text DEFAULT '09:00',
	"duty_time_out" text DEFAULT '18:00',
	"allowed_late_minutes" integer DEFAULT 15,
	"early_exit_minutes" integer DEFAULT 15,
	"work_time_policy" text DEFAULT 'Fixed',
	"minimum_daily_hours" double precision DEFAULT 8,
	"half_day_minimum_hours" double precision DEFAULT 4,
	"lwp_exempt" boolean DEFAULT false,
	"lwp_exempt_reason" text,
	"lwp_exempt_granted_by" integer,
	"lwp_exempt_granted_at" timestamp,
	"lwp_exempt_next_review" date,
	"failed_login_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp,
	"last_login_at" timestamp,
	"last_login_ip" varchar(45),
	"last_login_device" text,
	"reporting_manager_id" integer,
	"work_location_id" integer,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_employee_code_unique" UNIQUE("employee_code")
);
--> statement-breakpoint
CREATE TABLE "vendor_compliance_docs" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"bp_code" varchar(50) NOT NULL,
	"doc_type" varchar(50) NOT NULL,
	"revision_number" integer DEFAULT 0 NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"gcs_path" text NOT NULL,
	"content_type" varchar(100),
	"size_bytes" bigint,
	"status" varchar(30) DEFAULT 'uploaded' NOT NULL,
	"expiry_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"uploaded_by" integer,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendor_subgroup_qualification" (
	"id" serial PRIMARY KEY NOT NULL,
	"vendor_id" integer NOT NULL,
	"subgroup_code" varchar(20) NOT NULL,
	"subgroup_label" varchar(120),
	"status" varchar(30) DEFAULT 'under_review' NOT NULL,
	"qualified_by" integer,
	"qualified_at" timestamp,
	"valid_until" date,
	"performance_score" numeric(5, 2),
	"notes" text,
	"conditions" text,
	"annual_review_due" date,
	"last_reviewed_by" integer,
	"last_reviewed_at" timestamp,
	"created_by" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendors" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"display_name" text,
	"sap_card_code" varchar(50),
	"vendor_type" varchar(1),
	"sap_group_code" integer,
	"sap_group_name" text,
	"sap_sync_status" varchar(20),
	"last_synced_at" timestamp,
	"contact_person" text,
	"email" text,
	"phone" text,
	"address" text,
	"city" text,
	"state" text,
	"country" text,
	"postal_code" text,
	"tax_id" text,
	"payment_terms" text,
	"delivery_terms" text,
	"performance_rating" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "vendors_sap_card_code_unique" UNIQUE("sap_card_code")
);
--> statement-breakpoint
CREATE TABLE "visa_alerts" (
	"id" serial PRIMARY KEY NOT NULL,
	"visa_record_id" integer NOT NULL,
	"alert_type" varchar(20) NOT NULL,
	"alert_date" date NOT NULL,
	"is_sent" boolean DEFAULT false NOT NULL,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visa_quota_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"country" varchar(100) NOT NULL,
	"visa_type" varchar(100) NOT NULL,
	"total_quota" integer DEFAULT 0 NOT NULL,
	"used_quota" integer DEFAULT 0 NOT NULL,
	"financial_year" varchar(10) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "visa_quota_settings_country_unique" UNIQUE("country")
);
--> statement-breakpoint
CREATE TABLE "visa_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"employee_id" integer NOT NULL,
	"visa_type" varchar(100) NOT NULL,
	"country" varchar(100) NOT NULL,
	"visa_number" varchar(100) NOT NULL,
	"issue_date" date NOT NULL,
	"expiry_date" date NOT NULL,
	"status" varchar(50) DEFAULT 'Active' NOT NULL,
	"quota_reference" varchar(100),
	"file_path" text,
	"file_url" text,
	"notes" text,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "visa_records_visa_number_unique" UNIQUE("visa_number")
);
--> statement-breakpoint
CREATE TABLE "welder_certificates" (
	"id" serial PRIMARY KEY NOT NULL,
	"welder_id" integer NOT NULL,
	"certificate_no" varchar(30) NOT NULL,
	"certificate_type" varchar(50) NOT NULL,
	"description" text,
	"issue_date" date NOT NULL,
	"expiry_date" date NOT NULL,
	"file_path" varchar(255) NOT NULL,
	"file_url" varchar(255),
	"status" varchar(20) DEFAULT 'Active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "welders" (
	"id" serial PRIMARY KEY NOT NULL,
	"welderId" varchar(10) NOT NULL,
	"name" varchar(100) NOT NULL,
	"trade" varchar(50) NOT NULL,
	"status" varchar(20) DEFAULT 'Active' NOT NULL,
	"remarks" text,
	"photo_path" varchar(255),
	"date_of_birth" date,
	"contact_number" varchar(20),
	"hire_date" date,
	"identification_type" varchar(50),
	"identification_number" varchar(50),
	"createdAt" timestamp DEFAULT now(),
	"updatedAt" timestamp DEFAULT now(),
	CONSTRAINT "welders_welderId_unique" UNIQUE("welderId")
);
--> statement-breakpoint
CREATE TABLE "wo_crew_slot_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"slot_id" integer NOT NULL,
	"previous_name" varchar(200),
	"new_name" varchar(200),
	"changed_by" integer NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wo_crew_slots" (
	"id" serial PRIMARY KEY NOT NULL,
	"epc_work_order_id" integer NOT NULL,
	"role_type" varchar(20) NOT NULL,
	"slot_number" smallint NOT NULL,
	"slot_label" varchar(40) NOT NULL,
	"assigned_name" varchar(200),
	"crew_member_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"added_by" integer NOT NULL,
	"added_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wo_daily_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"epc_work_order_id" integer NOT NULL,
	"log_date" date NOT NULL,
	"reported_by" integer NOT NULL,
	"status" varchar(20) DEFAULT 'draft' NOT NULL,
	"progress_percent" smallint DEFAULT 0 NOT NULL,
	"work_done_today" text,
	"manpower_count" smallint DEFAULT 0 NOT NULL,
	"manpower_breakdown" jsonb DEFAULT '{}'::jsonb,
	"hours_worked" numeric(6, 2) DEFAULT '0' NOT NULL,
	"issues_encountered" text,
	"next_day_plan" text,
	"crew_note" text,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wo_hold_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"epc_work_order_id" integer NOT NULL,
	"hold_type" varchar(40) NOT NULL,
	"hold_reason" text NOT NULL,
	"held_by" integer NOT NULL,
	"held_at" timestamp DEFAULT now() NOT NULL,
	"resolved_by" integer,
	"resolved_at" timestamp,
	"resolution_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wo_preparation_records" (
	"id" serial PRIMARY KEY NOT NULL,
	"wo_prep_number" varchar(35),
	"project_id" integer NOT NULL,
	"project_item_id" integer NOT NULL,
	"planning_record_id" integer NOT NULL,
	"execution_record_id" integer NOT NULL,
	"quality_plan_id" integer,
	"master_item_id" integer NOT NULL,
	"item_code" varchar(100),
	"item_description" text,
	"item_specification" text,
	"uom" varchar(30),
	"drawing_no" varchar(100),
	"drawing_revision" integer,
	"quantity" numeric(10, 2) NOT NULL,
	"estimated_unit_cost" numeric(12, 2),
	"estimated_total_cost" numeric(14, 2),
	"make_classification" varchar(30),
	"manufacturing_notes" text,
	"review_notes" text,
	"status" varchar(30) DEFAULT 'draft' NOT NULL,
	"reviewed_by" integer,
	"reviewed_at" timestamp,
	"ready_by" integer,
	"ready_at" timestamp,
	"superseded_by" integer,
	"superseded_at" timestamp,
	"supersession_reason" text,
	"cancelled_by" integer,
	"cancelled_at" timestamp,
	"cancel_reason" text,
	"created_by" integer,
	"assigned_to" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wo_preparation_records_wo_prep_number_unique" UNIQUE("wo_prep_number")
);
--> statement-breakpoint
CREATE TABLE "wo_schedule" (
	"id" serial PRIMARY KEY NOT NULL,
	"epc_work_order_id" integer NOT NULL,
	"target_start_date" date,
	"target_completion_date" date,
	"actual_start_date" date,
	"actual_completion_date" date,
	"schedule_set_by" integer,
	"schedule_set_at" timestamp,
	"actual_start_recorded_by" integer,
	"actual_start_recorded_at" timestamp,
	"actual_end_recorded_by" integer,
	"actual_end_recorded_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wo_schedule_epc_work_order_id_unique" UNIQUE("epc_work_order_id")
);
--> statement-breakpoint
CREATE TABLE "work_location_audit_log" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_location_id" integer,
	"action" text NOT NULL,
	"changed_by" integer,
	"changed_at" timestamp DEFAULT now() NOT NULL,
	"previous_values" jsonb,
	"new_values" jsonb
);
--> statement-breakpoint
CREATE TABLE "work_locations" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text NOT NULL,
	"city" text NOT NULL,
	"state" text NOT NULL,
	"pincode" text NOT NULL,
	"country" text DEFAULT 'India' NOT NULL,
	"latitude" double precision,
	"longitude" double precision,
	"radius_meters" integer DEFAULT 100,
	"ip_restrictions" text[],
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"location_country_code" varchar(5),
	"created_by" integer,
	"updated_by" integer
);
--> statement-breakpoint
CREATE TABLE "work_order_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_order_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	"username" text NOT NULL,
	"change_type" text NOT NULL,
	"field_name" text,
	"old_value" text,
	"new_value" text,
	"change_description" text NOT NULL,
	"comment" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"work_order_id" integer NOT NULL,
	"project_item_id" integer NOT NULL,
	"quantity" numeric(10, 2) NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"sequence_number" integer NOT NULL,
	"notes" text,
	"unit" text,
	"item_code" varchar(100),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"project_id" integer NOT NULL,
	"project_code" text NOT NULL,
	"work_order_number" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'planned' NOT NULL,
	"priority" text DEFAULT 'Medium' NOT NULL,
	"planned_start_date" timestamp NOT NULL,
	"planned_end_date" timestamp NOT NULL,
	"actual_start_date" timestamp,
	"actual_end_date" timestamp,
	"production_line" text,
	"batch_number" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"estimated_hours" integer,
	"actual_hours" integer,
	"estimated_cost" numeric(12, 2),
	"actual_cost" numeric(12, 2),
	"supervisor_id" integer NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "work_orders_work_order_number_unique" UNIQUE("work_order_number")
);
--> statement-breakpoint
CREATE TABLE "workflow_recommendations" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text,
	"recommendation_type" text NOT NULL,
	"recommendation_data" jsonb,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" text NOT NULL,
	"updated_at" text,
	"is_read" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workweek_calendar_overrides" (
	"id" serial PRIMARY KEY NOT NULL,
	"workweek_policy_id" integer NOT NULL,
	"override_date" date NOT NULL,
	"override_type" varchar(50) NOT NULL,
	"is_working_day" boolean NOT NULL,
	"custom_start_time" varchar(8),
	"custom_end_time" varchar(8),
	"reason" varchar(255),
	"description" text,
	"created_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "workweek_policies" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"policy_type" varchar(50) NOT NULL,
	"location_id" integer,
	"department" varchar(255),
	"working_days" jsonb DEFAULT '[1,2,3,4,5]' NOT NULL,
	"start_time" varchar(8) DEFAULT '09:00:00' NOT NULL,
	"end_time" varchar(8) DEFAULT '18:00:00' NOT NULL,
	"break_duration_minutes" integer DEFAULT 60,
	"weekly_hours" numeric(5, 2) DEFAULT '40.00',
	"overtime_threshold_daily" numeric(5, 2) DEFAULT '8.00',
	"overtime_threshold_weekly" numeric(5, 2) DEFAULT '40.00',
	"overtime_rate_multiplier" numeric(4, 2) DEFAULT '1.50',
	"half_day_hours" numeric(4, 2) DEFAULT '4.00',
	"includes_saturdays" boolean DEFAULT false,
	"includes_sundays" boolean DEFAULT false,
	"follows_national_holidays" boolean DEFAULT true,
	"is_active" boolean DEFAULT true,
	"effective_from" date DEFAULT now() NOT NULL,
	"effective_until" date,
	"created_at" timestamp DEFAULT now(),
	"updated_at" timestamp DEFAULT now(),
	"created_by" integer
);
--> statement-breakpoint
CREATE TABLE "wpqr_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"document_id" varchar(50) NOT NULL,
	"title" varchar(100) NOT NULL,
	"description" text,
	"welder_process" varchar(50) NOT NULL,
	"base_metal_grade" varchar(100) NOT NULL,
	"joint_type" varchar(50) NOT NULL,
	"certificate_no" varchar(100),
	"inspection_authority" varchar(50),
	"file_path" varchar(255),
	"file_url" text,
	"status" varchar(20) DEFAULT 'Active' NOT NULL,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wpqr_documents_document_id_unique" UNIQUE("document_id")
);
--> statement-breakpoint
CREATE TABLE "wpqr_welders" (
	"id" serial PRIMARY KEY NOT NULL,
	"wpqr_document_id" integer NOT NULL,
	"welder_id" integer NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	"linked_by" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "wps_documents" (
	"id" serial PRIMARY KEY NOT NULL,
	"wps_id" varchar(50) NOT NULL,
	"pqr_id" varchar(50) NOT NULL,
	"revision_no" varchar(10) DEFAULT '0' NOT NULL,
	"welder_process" varchar(50) NOT NULL,
	"base_metal_grade" varchar(100) NOT NULL,
	"base_metal_thickness" varchar(50) NOT NULL,
	"filler_material" varchar(100) NOT NULL,
	"joint_type" varchar(50) NOT NULL,
	"weld_position" varchar(50) NOT NULL,
	"preheating_temp" varchar(50),
	"post_weld_heat_treatment" varchar(100),
	"electrical_parameters" jsonb,
	"shielding_gas" varchar(100),
	"document_file_path" varchar(255),
	"document_url" text,
	"combined_document_file_path" varchar(255),
	"combined_document_url" text,
	"status" varchar(20) DEFAULT 'Draft' NOT NULL,
	"remarks" text,
	"approved_by" integer,
	"approval_date" timestamp,
	"created_by" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "wps_documents_wps_id_unique" UNIQUE("wps_id"),
	CONSTRAINT "wps_documents_pqr_id_unique" UNIQUE("pqr_id")
);
--> statement-breakpoint
ALTER TABLE "advance_tax_calculations" ADD CONSTRAINT "advance_tax_calculations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_tax_payments" ADD CONSTRAINT "advance_tax_payments_calculation_id_advance_tax_calculations_id_fk" FOREIGN KEY ("calculation_id") REFERENCES "public"."advance_tax_calculations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_actions" ADD CONSTRAINT "agent_actions_recommendation_id_agent_recommendations_id_fk" FOREIGN KEY ("recommendation_id") REFERENCES "public"."agent_recommendations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_entity_overrides" ADD CONSTRAINT "agent_entity_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_findings" ADD CONSTRAINT "agent_findings_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_findings" ADD CONSTRAINT "agent_findings_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_findings" ADD CONSTRAINT "agent_findings_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_findings" ADD CONSTRAINT "agent_findings_dismissed_by_users_id_fk" FOREIGN KEY ("dismissed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_insights" ADD CONSTRAINT "agent_insights_run_id_agent_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_policies" ADD CONSTRAINT "agent_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_recommendations" ADD CONSTRAINT "agent_recommendations_finding_id_agent_findings_id_fk" FOREIGN KEY ("finding_id") REFERENCES "public"."agent_findings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_recommendations" ADD CONSTRAINT "agent_recommendations_insight_id_agent_insights_id_fk" FOREIGN KEY ("insight_id") REFERENCES "public"."agent_insights"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_recommendations" ADD CONSTRAINT "agent_recommendations_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_recommendations" ADD CONSTRAINT "agent_recommendations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_registry" ADD CONSTRAINT "agent_registry_suspended_by_users_id_fk" FOREIGN KEY ("suspended_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_subscriptions" ADD CONSTRAINT "agent_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_usage_daily_log" ADD CONSTRAINT "agent_usage_daily_log_logged_by_users_id_fk" FOREIGN KEY ("logged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_usage_limits" ADD CONSTRAINT "agent_usage_limits_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_amendments" ADD CONSTRAINT "agreement_amendments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_amendments" ADD CONSTRAINT "agreement_amendments_legal_reviewer_users_id_fk" FOREIGN KEY ("legal_reviewer") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agreement_amendments" ADD CONSTRAINT "agreement_amendments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisal_approvals" ADD CONSTRAINT "appraisal_approvals_appraisal_id_employee_appraisals_id_fk" FOREIGN KEY ("appraisal_id") REFERENCES "public"."employee_appraisals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisal_approvals" ADD CONSTRAINT "appraisal_approvals_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisal_audit_log" ADD CONSTRAINT "appraisal_audit_log_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisal_comments" ADD CONSTRAINT "appraisal_comments_appraisal_id_employee_appraisals_id_fk" FOREIGN KEY ("appraisal_id") REFERENCES "public"."employee_appraisals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisal_comments" ADD CONSTRAINT "appraisal_comments_comment_by_users_id_fk" FOREIGN KEY ("comment_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisal_cycles" ADD CONSTRAINT "appraisal_cycles_template_id_appraisal_cycle_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."appraisal_cycle_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisal_cycles" ADD CONSTRAINT "appraisal_cycles_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisal_cycles" ADD CONSTRAINT "appraisal_cycles_paused_by_users_id_fk" FOREIGN KEY ("paused_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisal_kpi_template_items" ADD CONSTRAINT "appraisal_kpi_template_items_template_id_appraisal_kpi_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."appraisal_kpi_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "appraisal_kpi_templates" ADD CONSTRAINT "appraisal_kpi_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_issues" ADD CONSTRAINT "attendance_issues_attendance_record_id_attendance_records_id_fk" FOREIGN KEY ("attendance_record_id") REFERENCES "public"."attendance_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_issues" ADD CONSTRAINT "attendance_issues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_issues" ADD CONSTRAINT "attendance_issues_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_location_audit_log" ADD CONSTRAINT "attendance_location_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_location_audit_log" ADD CONSTRAINT "attendance_location_audit_log_attendance_record_id_attendance_records_id_fk" FOREIGN KEY ("attendance_record_id") REFERENCES "public"."attendance_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_location_audit_log" ADD CONSTRAINT "attendance_location_audit_log_work_location_id_work_locations_id_fk" FOREIGN KEY ("work_location_id") REFERENCES "public"."work_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_override_log" ADD CONSTRAINT "attendance_override_log_record_id_attendance_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."attendance_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_override_log" ADD CONSTRAINT "attendance_override_log_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_override_log" ADD CONSTRAINT "attendance_override_log_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_work_location_id_work_locations_id_fk" FOREIGN KEY ("work_location_id") REFERENCES "public"."work_locations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_adjusted_by_users_id_fk" FOREIGN KEY ("adjusted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_regularizations" ADD CONSTRAINT "attendance_regularizations_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_regularizations" ADD CONSTRAINT "attendance_regularizations_attendance_record_id_attendance_records_id_fk" FOREIGN KEY ("attendance_record_id") REFERENCES "public"."attendance_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_regularizations" ADD CONSTRAINT "attendance_regularizations_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_regularizations" ADD CONSTRAINT "attendance_regularizations_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_security_policies" ADD CONSTRAINT "attendance_security_policies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_settings" ADD CONSTRAINT "attendance_settings_work_location_id_work_locations_id_fk" FOREIGN KEY ("work_location_id") REFERENCES "public"."work_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_option_audit_log" ADD CONSTRAINT "attribute_option_audit_log_option_id_product_attribute_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."product_attribute_options"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attribute_option_audit_log" ADD CONSTRAINT "attribute_option_audit_log_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_pipeline_runs" ADD CONSTRAINT "automation_pipeline_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_pipeline_runs" ADD CONSTRAINT "automation_pipeline_runs_trigger_user_id_users_id_fk" FOREIGN KEY ("trigger_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_realization_certificates" ADD CONSTRAINT "bank_realization_certificates_related_invoice_id_invoices_id_fk" FOREIGN KEY ("related_invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bom_gating_bypass_log" ADD CONSTRAINT "bom_gating_bypass_log_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_meetings" ADD CONSTRAINT "business_meetings_organizer_id_users_id_fk" FOREIGN KEY ("organizer_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_meetings" ADD CONSTRAINT "business_meetings_parent_meeting_id_business_meetings_id_fk" FOREIGN KEY ("parent_meeting_id") REFERENCES "public"."business_meetings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_meetings" ADD CONSTRAINT "business_meetings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_opportunities" ADD CONSTRAINT "business_opportunities_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_opportunities" ADD CONSTRAINT "business_opportunities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_opportunities" ADD CONSTRAINT "business_opportunities_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "business_trips" ADD CONSTRAINT "business_trips_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_list_line_selections" ADD CONSTRAINT "buy_list_line_selections_buy_list_line_id_project_buy_list_lines_id_fk" FOREIGN KEY ("buy_list_line_id") REFERENCES "public"."project_buy_list_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_package_headers" ADD CONSTRAINT "buy_package_headers_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_package_headers" ADD CONSTRAINT "buy_package_headers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_package_lines" ADD CONSTRAINT "buy_package_lines_buy_package_header_id_buy_package_headers_id_fk" FOREIGN KEY ("buy_package_header_id") REFERENCES "public"."buy_package_headers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_package_lines" ADD CONSTRAINT "buy_package_lines_buy_group_id_buy_groups_id_fk" FOREIGN KEY ("buy_group_id") REFERENCES "public"."buy_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_package_lines" ADD CONSTRAINT "buy_package_lines_buy_subgroup_id_buy_subgroups_id_fk" FOREIGN KEY ("buy_subgroup_id") REFERENCES "public"."buy_subgroups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_package_lines" ADD CONSTRAINT "buy_package_lines_uom_id_uom_master_id_fk" FOREIGN KEY ("uom_id") REFERENCES "public"."uom_master"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_package_lines" ADD CONSTRAINT "buy_package_lines_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buy_subgroups" ADD CONSTRAINT "buy_subgroups_buy_group_id_buy_groups_id_fk" FOREIGN KEY ("buy_group_id") REFERENCES "public"."buy_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_activities" ADD CONSTRAINT "campaign_activities_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_activities" ADD CONSTRAINT "campaign_activities_channel_id_campaign_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."campaign_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD CONSTRAINT "campaign_leads_campaign_id_marketing_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."marketing_campaigns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_leads" ADD CONSTRAINT "campaign_leads_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_documents" ADD CONSTRAINT "change_documents_ecr_id_engineering_change_requests_id_fk" FOREIGN KEY ("ecr_id") REFERENCES "public"."engineering_change_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_documents" ADD CONSTRAINT "change_documents_ecn_id_engineering_change_notices_id_fk" FOREIGN KEY ("ecn_id") REFERENCES "public"."engineering_change_notices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "change_documents" ADD CONSTRAINT "change_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_executions" ADD CONSTRAINT "checklist_executions_checklist_id_quality_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."quality_checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_executions" ADD CONSTRAINT "checklist_executions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_executions" ADD CONSTRAINT "checklist_executions_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_executions" ADD CONSTRAINT "checklist_executions_executed_by_users_id_fk" FOREIGN KEY ("executed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_executions" ADD CONSTRAINT "checklist_executions_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_item_results" ADD CONSTRAINT "checklist_item_results_execution_id_checklist_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."checklist_executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_item_results" ADD CONSTRAINT "checklist_item_results_checklist_item_id_checklist_items_id_fk" FOREIGN KEY ("checklist_item_id") REFERENCES "public"."checklist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_items" ADD CONSTRAINT "checklist_items_checklist_id_quality_checklists_id_fk" FOREIGN KEY ("checklist_id") REFERENCES "public"."quality_checklists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_change_orders" ADD CONSTRAINT "commercial_change_orders_original_offer_id_offers_id_fk" FOREIGN KEY ("original_offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_change_orders" ADD CONSTRAINT "commercial_change_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_change_orders" ADD CONSTRAINT "commercial_change_orders_revised_offer_id_offers_id_fk" FOREIGN KEY ("revised_offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_change_orders" ADD CONSTRAINT "commercial_change_orders_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "commercial_change_orders" ADD CONSTRAINT "commercial_change_orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_advance_tax" ADD CONSTRAINT "company_advance_tax_tax_year_id_company_tax_years_id_fk" FOREIGN KEY ("tax_year_id") REFERENCES "public"."company_tax_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_holidays" ADD CONSTRAINT "company_holidays_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_tax_challans" ADD CONSTRAINT "company_tax_challans_tax_year_id_company_tax_years_id_fk" FOREIGN KEY ("tax_year_id") REFERENCES "public"."company_tax_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_tax_challans" ADD CONSTRAINT "company_tax_challans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_tax_estimates" ADD CONSTRAINT "company_tax_estimates_tax_year_id_company_tax_years_id_fk" FOREIGN KEY ("tax_year_id") REFERENCES "public"."company_tax_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_tax_estimates" ADD CONSTRAINT "company_tax_estimates_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_tax_notices" ADD CONSTRAINT "company_tax_notices_tax_year_id_company_tax_years_id_fk" FOREIGN KEY ("tax_year_id") REFERENCES "public"."company_tax_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_tax_notices" ADD CONSTRAINT "company_tax_notices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_tax_provisions" ADD CONSTRAINT "company_tax_provisions_tax_year_id_company_tax_years_id_fk" FOREIGN KEY ("tax_year_id") REFERENCES "public"."company_tax_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_tax_provisions" ADD CONSTRAINT "company_tax_provisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_tax_returns" ADD CONSTRAINT "company_tax_returns_tax_year_id_company_tax_years_id_fk" FOREIGN KEY ("tax_year_id") REFERENCES "public"."company_tax_years"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_tax_returns" ADD CONSTRAINT "company_tax_returns_filed_by_users_id_fk" FOREIGN KEY ("filed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_tax_years" ADD CONSTRAINT "company_tax_years_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_register" ADD CONSTRAINT "compliance_register_responsible_person_users_id_fk" FOREIGN KEY ("responsible_person") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compliance_register" ADD CONSTRAINT "compliance_register_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "concluded_calendar_events" ADD CONSTRAINT "concluded_calendar_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_deliveries" ADD CONSTRAINT "contract_deliveries_contract_id_service_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."service_contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_deliveries" ADD CONSTRAINT "contract_deliveries_service_id_contract_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."contract_services"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_deliveries" ADD CONSTRAINT "contract_deliveries_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_services" ADD CONSTRAINT "contract_services_contract_id_service_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."service_contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crew_members" ADD CONSTRAINT "crew_members_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_followups" ADD CONSTRAINT "customer_followups_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_followups" ADD CONSTRAINT "customer_followups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_followups" ADD CONSTRAINT "customer_followups_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_order_documents" ADD CONSTRAINT "customer_order_documents_cco_id_commercial_change_orders_id_fk" FOREIGN KEY ("cco_id") REFERENCES "public"."commercial_change_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_order_documents" ADD CONSTRAINT "customer_order_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_order_documents" ADD CONSTRAINT "customer_order_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_work_reports" ADD CONSTRAINT "daily_work_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_work_reports" ADD CONSTRAINT "daily_work_reports_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliverables" ADD CONSTRAINT "deliverables_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_assignments" ADD CONSTRAINT "design_assignments_design_project_id_design_projects_id_fk" FOREIGN KEY ("design_project_id") REFERENCES "public"."design_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_assignments" ADD CONSTRAINT "design_assignments_drawing_id_design_drawings_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."design_drawings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_assignments" ADD CONSTRAINT "design_assignments_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_assignments" ADD CONSTRAINT "design_assignments_assigned_by_id_users_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_basic_drawings" ADD CONSTRAINT "design_basic_drawings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_basic_drawings" ADD CONSTRAINT "design_basic_drawings_revision_of_design_basic_drawings_id_fk" FOREIGN KEY ("revision_of") REFERENCES "public"."design_basic_drawings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_basic_drawings" ADD CONSTRAINT "design_basic_drawings_superseded_by_users_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_basic_drawings" ADD CONSTRAINT "design_basic_drawings_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_data_sheets" ADD CONSTRAINT "design_data_sheets_dwg_control_id_epc_drawing_controls_id_fk" FOREIGN KEY ("dwg_control_id") REFERENCES "public"."epc_drawing_controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_data_sheets" ADD CONSTRAINT "design_data_sheets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_data_sheets" ADD CONSTRAINT "design_data_sheets_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_data_sheets" ADD CONSTRAINT "design_data_sheets_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_drawings" ADD CONSTRAINT "design_drawings_design_project_id_design_projects_id_fk" FOREIGN KEY ("design_project_id") REFERENCES "public"."design_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_drawings" ADD CONSTRAINT "design_drawings_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_drawings" ADD CONSTRAINT "design_drawings_checked_by_id_users_id_fk" FOREIGN KEY ("checked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_drawings" ADD CONSTRAINT "design_drawings_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_drawings" ADD CONSTRAINT "design_drawings_superseded_by_design_drawings_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."design_drawings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_drawings" ADD CONSTRAINT "design_drawings_supersedes_design_drawings_id_fk" FOREIGN KEY ("supersedes") REFERENCES "public"."design_drawings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_drawings" ADD CONSTRAINT "design_drawings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_project_backups" ADD CONSTRAINT "design_project_backups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_project_backups" ADD CONSTRAINT "design_project_backups_revision_of_design_project_backups_id_fk" FOREIGN KEY ("revision_of") REFERENCES "public"."design_project_backups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_project_backups" ADD CONSTRAINT "design_project_backups_superseded_by_users_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_project_backups" ADD CONSTRAINT "design_project_backups_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_projects" ADD CONSTRAINT "design_projects_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_projects" ADD CONSTRAINT "design_projects_design_manager_id_users_id_fk" FOREIGN KEY ("design_manager_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_projects" ADD CONSTRAINT "design_projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_reviews" ADD CONSTRAINT "design_reviews_drawing_id_design_drawings_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."design_drawings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_reviews" ADD CONSTRAINT "design_reviews_version_id_drawing_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."drawing_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_reviews" ADD CONSTRAINT "design_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_reviews" ADD CONSTRAINT "design_reviews_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_software_approvals" ADD CONSTRAINT "design_software_approvals_revision_id_design_software_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."design_software_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_software_approvals" ADD CONSTRAINT "design_software_approvals_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_software_assumptions" ADD CONSTRAINT "design_software_assumptions_revision_id_design_software_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."design_software_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_software_assumptions" ADD CONSTRAINT "design_software_assumptions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_software_calculation_runs" ADD CONSTRAINT "design_software_calculation_runs_revision_id_design_software_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."design_software_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_software_calculation_runs" ADD CONSTRAINT "design_software_calculation_runs_calculated_by_users_id_fk" FOREIGN KEY ("calculated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_software_designs" ADD CONSTRAINT "design_software_designs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_software_designs" ADD CONSTRAINT "design_software_designs_linked_project_id_projects_id_fk" FOREIGN KEY ("linked_project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_software_designs" ADD CONSTRAINT "design_software_designs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_software_inputs" ADD CONSTRAINT "design_software_inputs_revision_id_design_software_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."design_software_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_software_inputs" ADD CONSTRAINT "design_software_inputs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_software_results" ADD CONSTRAINT "design_software_results_revision_id_design_software_revisions_id_fk" FOREIGN KEY ("revision_id") REFERENCES "public"."design_software_revisions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_software_results" ADD CONSTRAINT "design_software_results_computed_by_users_id_fk" FOREIGN KEY ("computed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_software_revisions" ADD CONSTRAINT "design_software_revisions_design_id_design_software_designs_id_fk" FOREIGN KEY ("design_id") REFERENCES "public"."design_software_designs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_software_revisions" ADD CONSTRAINT "design_software_revisions_prepared_by_id_users_id_fk" FOREIGN KEY ("prepared_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_software_revisions" ADD CONSTRAINT "design_software_revisions_checked_by_id_users_id_fk" FOREIGN KEY ("checked_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_software_revisions" ADD CONSTRAINT "design_software_revisions_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_software_revisions" ADD CONSTRAINT "design_software_revisions_frozen_by_id_users_id_fk" FOREIGN KEY ("frozen_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "design_standards" ADD CONSTRAINT "design_standards_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_documents" ADD CONSTRAINT "dispatch_documents_dispatch_id_dispatch_records_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatch_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_documents" ADD CONSTRAINT "dispatch_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_dispatch_id_dispatch_records_id_fk" FOREIGN KEY ("dispatch_id") REFERENCES "public"."dispatch_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_item_id_master_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_items" ADD CONSTRAINT "dispatch_items_quality_approved_by_users_id_fk" FOREIGN KEY ("quality_approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_records" ADD CONSTRAINT "dispatch_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispatch_records" ADD CONSTRAINT "dispatch_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "doc_sequences" ADD CONSTRAINT "doc_sequences_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_transmittals" ADD CONSTRAINT "drawing_transmittals_design_project_id_design_projects_id_fk" FOREIGN KEY ("design_project_id") REFERENCES "public"."design_projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_transmittals" ADD CONSTRAINT "drawing_transmittals_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_versions" ADD CONSTRAINT "drawing_versions_drawing_id_design_drawings_id_fk" FOREIGN KEY ("drawing_id") REFERENCES "public"."design_drawings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_versions" ADD CONSTRAINT "drawing_versions_checked_out_by_users_id_fk" FOREIGN KEY ("checked_out_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "drawing_versions" ADD CONSTRAINT "drawing_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dwar_audit_log" ADD CONSTRAINT "dwar_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dwar_audit_log" ADD CONSTRAINT "dwar_audit_log_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_analysis" ADD CONSTRAINT "email_analysis_message_id_gmail_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."gmail_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_analysis" ADD CONSTRAINT "email_analysis_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_replies" ADD CONSTRAINT "email_replies_message_id_gmail_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."gmail_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_replies" ADD CONSTRAINT "email_replies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_advance_recoveries" ADD CONSTRAINT "employee_advance_recoveries_advance_id_employee_advances_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."employee_advances"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_advance_recoveries" ADD CONSTRAINT "employee_advance_recoveries_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_advance_recoveries" ADD CONSTRAINT "employee_advance_recoveries_payroll_record_id_payroll_records_id_fk" FOREIGN KEY ("payroll_record_id") REFERENCES "public"."payroll_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_advance_recoveries" ADD CONSTRAINT "employee_advance_recoveries_payroll_period_id_payroll_periods_id_fk" FOREIGN KEY ("payroll_period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_advances" ADD CONSTRAINT "employee_advances_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_appraisal_competencies" ADD CONSTRAINT "employee_appraisal_competencies_appraisal_id_employee_appraisals_id_fk" FOREIGN KEY ("appraisal_id") REFERENCES "public"."employee_appraisals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_appraisal_kpis" ADD CONSTRAINT "employee_appraisal_kpis_appraisal_id_employee_appraisals_id_fk" FOREIGN KEY ("appraisal_id") REFERENCES "public"."employee_appraisals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_appraisals" ADD CONSTRAINT "employee_appraisals_cycle_id_appraisal_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."appraisal_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_appraisals" ADD CONSTRAINT "employee_appraisals_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_appraisals" ADD CONSTRAINT "employee_appraisals_l1_reviewer_id_users_id_fk" FOREIGN KEY ("l1_reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_appraisals" ADD CONSTRAINT "employee_appraisals_l2_reviewer_id_users_id_fk" FOREIGN KEY ("l2_reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_appraisals" ADD CONSTRAINT "employee_appraisals_l3_approver_id_users_id_fk" FOREIGN KEY ("l3_approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_appraisals" ADD CONSTRAINT "employee_appraisals_applied_template_id_appraisal_kpi_templates_id_fk" FOREIGN KEY ("applied_template_id") REFERENCES "public"."appraisal_kpi_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_appraisals" ADD CONSTRAINT "employee_appraisals_template_changed_by_users_id_fk" FOREIGN KEY ("template_changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_appraisals" ADD CONSTRAINT "employee_appraisals_reopened_by_users_id_fk" FOREIGN KEY ("reopened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_code_audit_log" ADD CONSTRAINT "employee_code_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_code_audit_log" ADD CONSTRAINT "employee_code_audit_log_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_investment_proofs" ADD CONSTRAINT "employee_investment_proofs_declaration_id_employee_tax_declarations_id_fk" FOREIGN KEY ("declaration_id") REFERENCES "public"."employee_tax_declarations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_investment_proofs" ADD CONSTRAINT "employee_investment_proofs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_investment_proofs" ADD CONSTRAINT "employee_investment_proofs_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_loan_repayments" ADD CONSTRAINT "employee_loan_repayments_loan_id_employee_loans_id_fk" FOREIGN KEY ("loan_id") REFERENCES "public"."employee_loans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_loan_repayments" ADD CONSTRAINT "employee_loan_repayments_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_loan_repayments" ADD CONSTRAINT "employee_loan_repayments_payroll_record_id_payroll_records_id_fk" FOREIGN KEY ("payroll_record_id") REFERENCES "public"."payroll_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_loan_repayments" ADD CONSTRAINT "employee_loan_repayments_payroll_period_id_payroll_periods_id_fk" FOREIGN KEY ("payroll_period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_loans" ADD CONSTRAINT "employee_loans_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_loans" ADD CONSTRAINT "employee_loans_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_loans" ADD CONSTRAINT "employee_loans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_salaries" ADD CONSTRAINT "employee_salaries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_tax_declarations" ADD CONSTRAINT "employee_tax_declarations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_tax_declarations" ADD CONSTRAINT "employee_tax_declarations_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_workweek_assignments" ADD CONSTRAINT "employee_workweek_assignments_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_workweek_assignments" ADD CONSTRAINT "employee_workweek_assignments_workweek_policy_id_workweek_policies_id_fk" FOREIGN KEY ("workweek_policy_id") REFERENCES "public"."workweek_policies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_workweek_assignments" ADD CONSTRAINT "employee_workweek_assignments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_change_notices" ADD CONSTRAINT "engineering_change_notices_ecr_id_engineering_change_requests_id_fk" FOREIGN KEY ("ecr_id") REFERENCES "public"."engineering_change_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_change_notices" ADD CONSTRAINT "engineering_change_notices_item_id_master_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_change_notices" ADD CONSTRAINT "engineering_change_notices_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_change_notices" ADD CONSTRAINT "engineering_change_notices_implemented_by_users_id_fk" FOREIGN KEY ("implemented_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_change_notices" ADD CONSTRAINT "engineering_change_notices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_change_notices" ADD CONSTRAINT "engineering_change_notices_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_change_notices" ADD CONSTRAINT "engineering_change_notices_drawing_control_id_epc_drawing_controls_id_fk" FOREIGN KEY ("drawing_control_id") REFERENCES "public"."epc_drawing_controls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_change_requests" ADD CONSTRAINT "engineering_change_requests_item_id_master_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_change_requests" ADD CONSTRAINT "engineering_change_requests_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_change_requests" ADD CONSTRAINT "engineering_change_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_change_requests" ADD CONSTRAINT "engineering_change_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_change_requests" ADD CONSTRAINT "engineering_change_requests_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "engineering_change_requests" ADD CONSTRAINT "engineering_change_requests_drawing_control_id_epc_drawing_controls_id_fk" FOREIGN KEY ("drawing_control_id") REFERENCES "public"."epc_drawing_controls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_assignment_audit_log" ADD CONSTRAINT "epc_assignment_audit_log_rule_id_epc_assignment_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."epc_assignment_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_assignment_rules" ADD CONSTRAINT "epc_assignment_rules_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_assignment_rules" ADD CONSTRAINT "epc_assignment_rules_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_billing_readiness" ADD CONSTRAINT "epc_billing_readiness_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_billing_readiness" ADD CONSTRAINT "epc_billing_readiness_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_billing_readiness" ADD CONSTRAINT "epc_billing_readiness_dispatch_record_id_epc_dispatch_records_id_fk" FOREIGN KEY ("dispatch_record_id") REFERENCES "public"."epc_dispatch_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_billing_readiness" ADD CONSTRAINT "epc_billing_readiness_commissioning_readiness_id_epc_commissioning_readiness_id_fk" FOREIGN KEY ("commissioning_readiness_id") REFERENCES "public"."epc_commissioning_readiness"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_billing_readiness" ADD CONSTRAINT "epc_billing_readiness_dispatch_readiness_id_epc_dispatch_readiness_id_fk" FOREIGN KEY ("dispatch_readiness_id") REFERENCES "public"."epc_dispatch_readiness"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_billing_readiness" ADD CONSTRAINT "epc_billing_readiness_epc_purchase_order_id_epc_purchase_orders_id_fk" FOREIGN KEY ("epc_purchase_order_id") REFERENCES "public"."epc_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_billing_readiness" ADD CONSTRAINT "epc_billing_readiness_epc_work_order_id_epc_work_orders_id_fk" FOREIGN KEY ("epc_work_order_id") REFERENCES "public"."epc_work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_billing_readiness" ADD CONSTRAINT "epc_billing_readiness_inspection_execution_id_inspection_execution_records_id_fk" FOREIGN KEY ("inspection_execution_id") REFERENCES "public"."inspection_execution_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_billing_readiness" ADD CONSTRAINT "epc_billing_readiness_quality_plan_id_quality_planning_records_id_fk" FOREIGN KEY ("quality_plan_id") REFERENCES "public"."quality_planning_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_billing_readiness" ADD CONSTRAINT "epc_billing_readiness_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_billing_readiness" ADD CONSTRAINT "epc_billing_readiness_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_billing_readiness" ADD CONSTRAINT "epc_billing_readiness_ready_marked_by_users_id_fk" FOREIGN KEY ("ready_marked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_billing_readiness" ADD CONSTRAINT "epc_billing_readiness_invoiced_by_users_id_fk" FOREIGN KEY ("invoiced_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_billing_readiness" ADD CONSTRAINT "epc_billing_readiness_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_billing_readiness" ADD CONSTRAINT "epc_billing_readiness_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_bom_headers" ADD CONSTRAINT "epc_bom_headers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_bom_headers" ADD CONSTRAINT "epc_bom_headers_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_bom_headers" ADD CONSTRAINT "epc_bom_headers_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_bom_headers" ADD CONSTRAINT "epc_bom_headers_drawing_control_id_epc_drawing_controls_id_fk" FOREIGN KEY ("drawing_control_id") REFERENCES "public"."epc_drawing_controls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_bom_headers" ADD CONSTRAINT "epc_bom_headers_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_bom_headers" ADD CONSTRAINT "epc_bom_headers_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_bom_headers" ADD CONSTRAINT "epc_bom_headers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_bom_headers" ADD CONSTRAINT "epc_bom_headers_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_bom_headers" ADD CONSTRAINT "epc_bom_headers_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_bom_headers" ADD CONSTRAINT "epc_bom_headers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_bom_lines" ADD CONSTRAINT "epc_bom_lines_bom_header_id_epc_bom_headers_id_fk" FOREIGN KEY ("bom_header_id") REFERENCES "public"."epc_bom_headers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_bom_lines" ADD CONSTRAINT "epc_bom_lines_component_item_id_master_items_id_fk" FOREIGN KEY ("component_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_commissioning_readiness" ADD CONSTRAINT "epc_commissioning_readiness_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_commissioning_readiness" ADD CONSTRAINT "epc_commissioning_readiness_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_commissioning_readiness" ADD CONSTRAINT "epc_commissioning_readiness_dispatch_record_id_epc_dispatch_records_id_fk" FOREIGN KEY ("dispatch_record_id") REFERENCES "public"."epc_dispatch_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_commissioning_readiness" ADD CONSTRAINT "epc_commissioning_readiness_dispatch_readiness_id_epc_dispatch_readiness_id_fk" FOREIGN KEY ("dispatch_readiness_id") REFERENCES "public"."epc_dispatch_readiness"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_commissioning_readiness" ADD CONSTRAINT "epc_commissioning_readiness_epc_purchase_order_id_epc_purchase_orders_id_fk" FOREIGN KEY ("epc_purchase_order_id") REFERENCES "public"."epc_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_commissioning_readiness" ADD CONSTRAINT "epc_commissioning_readiness_epc_work_order_id_epc_work_orders_id_fk" FOREIGN KEY ("epc_work_order_id") REFERENCES "public"."epc_work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_commissioning_readiness" ADD CONSTRAINT "epc_commissioning_readiness_inspection_execution_id_inspection_execution_records_id_fk" FOREIGN KEY ("inspection_execution_id") REFERENCES "public"."inspection_execution_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_commissioning_readiness" ADD CONSTRAINT "epc_commissioning_readiness_quality_plan_id_quality_planning_records_id_fk" FOREIGN KEY ("quality_plan_id") REFERENCES "public"."quality_planning_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_commissioning_readiness" ADD CONSTRAINT "epc_commissioning_readiness_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_commissioning_readiness" ADD CONSTRAINT "epc_commissioning_readiness_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_commissioning_readiness" ADD CONSTRAINT "epc_commissioning_readiness_ready_marked_by_users_id_fk" FOREIGN KEY ("ready_marked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_commissioning_readiness" ADD CONSTRAINT "epc_commissioning_readiness_commissioned_by_users_id_fk" FOREIGN KEY ("commissioned_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_commissioning_readiness" ADD CONSTRAINT "epc_commissioning_readiness_handed_over_by_users_id_fk" FOREIGN KEY ("handed_over_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_commissioning_readiness" ADD CONSTRAINT "epc_commissioning_readiness_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_commissioning_readiness" ADD CONSTRAINT "epc_commissioning_readiness_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_readiness" ADD CONSTRAINT "epc_dispatch_readiness_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_readiness" ADD CONSTRAINT "epc_dispatch_readiness_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_readiness" ADD CONSTRAINT "epc_dispatch_readiness_epc_purchase_order_id_epc_purchase_orders_id_fk" FOREIGN KEY ("epc_purchase_order_id") REFERENCES "public"."epc_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_readiness" ADD CONSTRAINT "epc_dispatch_readiness_epc_work_order_id_epc_work_orders_id_fk" FOREIGN KEY ("epc_work_order_id") REFERENCES "public"."epc_work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_readiness" ADD CONSTRAINT "epc_dispatch_readiness_inspection_execution_id_inspection_execution_records_id_fk" FOREIGN KEY ("inspection_execution_id") REFERENCES "public"."inspection_execution_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_readiness" ADD CONSTRAINT "epc_dispatch_readiness_quality_plan_id_quality_planning_records_id_fk" FOREIGN KEY ("quality_plan_id") REFERENCES "public"."quality_planning_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_readiness" ADD CONSTRAINT "epc_dispatch_readiness_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_readiness" ADD CONSTRAINT "epc_dispatch_readiness_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_readiness" ADD CONSTRAINT "epc_dispatch_readiness_ready_marked_by_users_id_fk" FOREIGN KEY ("ready_marked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_readiness" ADD CONSTRAINT "epc_dispatch_readiness_dispatched_by_users_id_fk" FOREIGN KEY ("dispatched_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_readiness" ADD CONSTRAINT "epc_dispatch_readiness_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_readiness" ADD CONSTRAINT "epc_dispatch_readiness_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_records" ADD CONSTRAINT "epc_dispatch_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_records" ADD CONSTRAINT "epc_dispatch_records_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_records" ADD CONSTRAINT "epc_dispatch_records_dispatch_readiness_id_epc_dispatch_readiness_id_fk" FOREIGN KEY ("dispatch_readiness_id") REFERENCES "public"."epc_dispatch_readiness"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_records" ADD CONSTRAINT "epc_dispatch_records_epc_purchase_order_id_epc_purchase_orders_id_fk" FOREIGN KEY ("epc_purchase_order_id") REFERENCES "public"."epc_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_records" ADD CONSTRAINT "epc_dispatch_records_epc_work_order_id_epc_work_orders_id_fk" FOREIGN KEY ("epc_work_order_id") REFERENCES "public"."epc_work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_records" ADD CONSTRAINT "epc_dispatch_records_inspection_execution_id_inspection_execution_records_id_fk" FOREIGN KEY ("inspection_execution_id") REFERENCES "public"."inspection_execution_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_records" ADD CONSTRAINT "epc_dispatch_records_quality_plan_id_quality_planning_records_id_fk" FOREIGN KEY ("quality_plan_id") REFERENCES "public"."quality_planning_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_records" ADD CONSTRAINT "epc_dispatch_records_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_records" ADD CONSTRAINT "epc_dispatch_records_delivery_confirmed_by_users_id_fk" FOREIGN KEY ("delivery_confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_records" ADD CONSTRAINT "epc_dispatch_records_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_records" ADD CONSTRAINT "epc_dispatch_records_shipped_by_users_id_fk" FOREIGN KEY ("shipped_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_records" ADD CONSTRAINT "epc_dispatch_records_delivered_by_users_id_fk" FOREIGN KEY ("delivered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_records" ADD CONSTRAINT "epc_dispatch_records_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_dispatch_records" ADD CONSTRAINT "epc_dispatch_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_document_access_log" ADD CONSTRAINT "epc_document_access_log_attachment_id_epc_document_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."epc_document_attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_document_access_log" ADD CONSTRAINT "epc_document_access_log_accessed_by_users_id_fk" FOREIGN KEY ("accessed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_document_attachments" ADD CONSTRAINT "epc_document_attachments_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_document_attachments" ADD CONSTRAINT "epc_document_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_document_attachments" ADD CONSTRAINT "epc_document_attachments_superseded_by_users_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_document_attachments" ADD CONSTRAINT "epc_document_attachments_withdrawn_by_users_id_fk" FOREIGN KEY ("withdrawn_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_documents" ADD CONSTRAINT "epc_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_documents" ADD CONSTRAINT "epc_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_drawing_controls" ADD CONSTRAINT "epc_drawing_controls_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_drawing_controls" ADD CONSTRAINT "epc_drawing_controls_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_drawing_controls" ADD CONSTRAINT "epc_drawing_controls_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_drawing_controls" ADD CONSTRAINT "epc_drawing_controls_design_drawing_id_design_drawings_id_fk" FOREIGN KEY ("design_drawing_id") REFERENCES "public"."design_drawings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_drawing_controls" ADD CONSTRAINT "epc_drawing_controls_released_for_procurement_by_users_id_fk" FOREIGN KEY ("released_for_procurement_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_drawing_controls" ADD CONSTRAINT "epc_drawing_controls_released_for_manufacturing_by_users_id_fk" FOREIGN KEY ("released_for_manufacturing_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_drawing_controls" ADD CONSTRAINT "epc_drawing_controls_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_drawing_controls" ADD CONSTRAINT "epc_drawing_controls_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_drawing_controls" ADD CONSTRAINT "epc_drawing_controls_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_drawing_controls" ADD CONSTRAINT "epc_drawing_controls_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_drawing_controls" ADD CONSTRAINT "epc_drawing_controls_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_drawing_controls" ADD CONSTRAINT "epc_drawing_controls_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_drawing_orders" ADD CONSTRAINT "epc_drawing_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_drawing_orders" ADD CONSTRAINT "epc_drawing_orders_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_drawing_orders" ADD CONSTRAINT "epc_drawing_orders_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_drawing_orders" ADD CONSTRAINT "epc_drawing_orders_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_drawing_orders" ADD CONSTRAINT "epc_drawing_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_invoices" ADD CONSTRAINT "epc_invoices_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_invoices" ADD CONSTRAINT "epc_invoices_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_invoices" ADD CONSTRAINT "epc_invoices_billing_readiness_id_epc_billing_readiness_id_fk" FOREIGN KEY ("billing_readiness_id") REFERENCES "public"."epc_billing_readiness"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_invoices" ADD CONSTRAINT "epc_invoices_dispatch_record_id_epc_dispatch_records_id_fk" FOREIGN KEY ("dispatch_record_id") REFERENCES "public"."epc_dispatch_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_invoices" ADD CONSTRAINT "epc_invoices_commissioning_readiness_id_epc_commissioning_readiness_id_fk" FOREIGN KEY ("commissioning_readiness_id") REFERENCES "public"."epc_commissioning_readiness"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_invoices" ADD CONSTRAINT "epc_invoices_dispatch_readiness_id_epc_dispatch_readiness_id_fk" FOREIGN KEY ("dispatch_readiness_id") REFERENCES "public"."epc_dispatch_readiness"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_invoices" ADD CONSTRAINT "epc_invoices_epc_purchase_order_id_epc_purchase_orders_id_fk" FOREIGN KEY ("epc_purchase_order_id") REFERENCES "public"."epc_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_invoices" ADD CONSTRAINT "epc_invoices_epc_work_order_id_epc_work_orders_id_fk" FOREIGN KEY ("epc_work_order_id") REFERENCES "public"."epc_work_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_invoices" ADD CONSTRAINT "epc_invoices_inspection_execution_id_inspection_execution_records_id_fk" FOREIGN KEY ("inspection_execution_id") REFERENCES "public"."inspection_execution_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_invoices" ADD CONSTRAINT "epc_invoices_quality_plan_id_quality_planning_records_id_fk" FOREIGN KEY ("quality_plan_id") REFERENCES "public"."quality_planning_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_invoices" ADD CONSTRAINT "epc_invoices_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_invoices" ADD CONSTRAINT "epc_invoices_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_invoices" ADD CONSTRAINT "epc_invoices_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_invoices" ADD CONSTRAINT "epc_invoices_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_invoices" ADD CONSTRAINT "epc_invoices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_migration_feature_flags" ADD CONSTRAINT "epc_migration_feature_flags_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_po_amendments" ADD CONSTRAINT "epc_po_amendments_epc_po_id_epc_purchase_orders_id_fk" FOREIGN KEY ("epc_po_id") REFERENCES "public"."epc_purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_po_amendments" ADD CONSTRAINT "epc_po_amendments_po_group_id_epc_po_groups_id_fk" FOREIGN KEY ("po_group_id") REFERENCES "public"."epc_po_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_po_amendments" ADD CONSTRAINT "epc_po_amendments_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_po_amendments" ADD CONSTRAINT "epc_po_amendments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_po_amendments" ADD CONSTRAINT "epc_po_amendments_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_po_amendments" ADD CONSTRAINT "epc_po_amendments_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_po_amendments" ADD CONSTRAINT "epc_po_amendments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_po_group_lines" ADD CONSTRAINT "epc_po_group_lines_po_group_id_epc_po_groups_id_fk" FOREIGN KEY ("po_group_id") REFERENCES "public"."epc_po_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_po_groups" ADD CONSTRAINT "epc_po_groups_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_po_groups" ADD CONSTRAINT "epc_po_groups_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_po_groups" ADD CONSTRAINT "epc_po_groups_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_po_groups" ADD CONSTRAINT "epc_po_groups_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_po_groups" ADD CONSTRAINT "epc_po_groups_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_po_groups" ADD CONSTRAINT "epc_po_groups_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_po_groups" ADD CONSTRAINT "epc_po_groups_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_po_groups" ADD CONSTRAINT "epc_po_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_purchase_order_items" ADD CONSTRAINT "epc_purchase_order_items_epc_purchase_order_id_epc_purchase_orders_id_fk" FOREIGN KEY ("epc_purchase_order_id") REFERENCES "public"."epc_purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_purchase_order_items" ADD CONSTRAINT "epc_purchase_order_items_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_purchase_orders" ADD CONSTRAINT "epc_purchase_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_purchase_orders" ADD CONSTRAINT "epc_purchase_orders_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_purchase_orders" ADD CONSTRAINT "epc_purchase_orders_planning_record_id_item_planning_records_id_fk" FOREIGN KEY ("planning_record_id") REFERENCES "public"."item_planning_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_purchase_orders" ADD CONSTRAINT "epc_purchase_orders_execution_record_id_procurement_execution_records_id_fk" FOREIGN KEY ("execution_record_id") REFERENCES "public"."procurement_execution_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_purchase_orders" ADD CONSTRAINT "epc_purchase_orders_po_preparation_id_po_preparation_records_id_fk" FOREIGN KEY ("po_preparation_id") REFERENCES "public"."po_preparation_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_purchase_orders" ADD CONSTRAINT "epc_purchase_orders_quality_plan_id_quality_planning_records_id_fk" FOREIGN KEY ("quality_plan_id") REFERENCES "public"."quality_planning_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_purchase_orders" ADD CONSTRAINT "epc_purchase_orders_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_purchase_orders" ADD CONSTRAINT "epc_purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_purchase_orders" ADD CONSTRAINT "epc_purchase_orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_purchase_orders" ADD CONSTRAINT "epc_purchase_orders_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_purchase_orders" ADD CONSTRAINT "epc_purchase_orders_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_purchase_orders" ADD CONSTRAINT "epc_purchase_orders_source_bom_header_id_epc_bom_headers_id_fk" FOREIGN KEY ("source_bom_header_id") REFERENCES "public"."epc_bom_headers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_purchase_orders" ADD CONSTRAINT "epc_purchase_orders_quality_cleared_by_users_id_fk" FOREIGN KEY ("quality_cleared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_purchase_orders" ADD CONSTRAINT "epc_purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_slddrw_extraction_jobs" ADD CONSTRAINT "epc_slddrw_extraction_jobs_drawing_control_id_epc_drawing_controls_id_fk" FOREIGN KEY ("drawing_control_id") REFERENCES "public"."epc_drawing_controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_slddrw_extraction_jobs" ADD CONSTRAINT "epc_slddrw_extraction_jobs_attachment_id_epc_document_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."epc_document_attachments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_structure_jobs" ADD CONSTRAINT "epc_structure_jobs_drawing_control_id_epc_drawing_controls_id_fk" FOREIGN KEY ("drawing_control_id") REFERENCES "public"."epc_drawing_controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_work_order_items" ADD CONSTRAINT "epc_work_order_items_epc_work_order_id_epc_work_orders_id_fk" FOREIGN KEY ("epc_work_order_id") REFERENCES "public"."epc_work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_work_order_items" ADD CONSTRAINT "epc_work_order_items_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_work_orders" ADD CONSTRAINT "epc_work_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_work_orders" ADD CONSTRAINT "epc_work_orders_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_work_orders" ADD CONSTRAINT "epc_work_orders_planning_record_id_item_planning_records_id_fk" FOREIGN KEY ("planning_record_id") REFERENCES "public"."item_planning_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_work_orders" ADD CONSTRAINT "epc_work_orders_execution_record_id_production_execution_records_id_fk" FOREIGN KEY ("execution_record_id") REFERENCES "public"."production_execution_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_work_orders" ADD CONSTRAINT "epc_work_orders_wo_preparation_id_wo_preparation_records_id_fk" FOREIGN KEY ("wo_preparation_id") REFERENCES "public"."wo_preparation_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_work_orders" ADD CONSTRAINT "epc_work_orders_quality_plan_id_quality_planning_records_id_fk" FOREIGN KEY ("quality_plan_id") REFERENCES "public"."quality_planning_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_work_orders" ADD CONSTRAINT "epc_work_orders_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_work_orders" ADD CONSTRAINT "epc_work_orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_work_orders" ADD CONSTRAINT "epc_work_orders_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_work_orders" ADD CONSTRAINT "epc_work_orders_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_work_orders" ADD CONSTRAINT "epc_work_orders_source_bom_header_id_epc_bom_headers_id_fk" FOREIGN KEY ("source_bom_header_id") REFERENCES "public"."epc_bom_headers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_work_orders" ADD CONSTRAINT "epc_work_orders_quality_cleared_by_users_id_fk" FOREIGN KEY ("quality_cleared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "epc_work_orders" ADD CONSTRAINT "epc_work_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_rate_settings" ADD CONSTRAINT "exchange_rate_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusivity_agreements" ADD CONSTRAINT "exclusivity_agreements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusivity_agreements" ADD CONSTRAINT "exclusivity_agreements_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusivity_agreements" ADD CONSTRAINT "exclusivity_agreements_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusivity_performance" ADD CONSTRAINT "exclusivity_performance_exclusivity_id_exclusivity_agreements_id_fk" FOREIGN KEY ("exclusivity_id") REFERENCES "public"."exclusivity_agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusivity_performance" ADD CONSTRAINT "exclusivity_performance_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exclusivity_performance" ADD CONSTRAINT "exclusivity_performance_evaluated_by_users_id_fk" FOREIGN KEY ("evaluated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_drafts" ADD CONSTRAINT "execution_drafts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_drafts" ADD CONSTRAINT "execution_drafts_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_drafts" ADD CONSTRAINT "execution_drafts_generated_by_user_id_users_id_fk" FOREIGN KEY ("generated_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_drafts" ADD CONSTRAINT "execution_drafts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_drafts" ADD CONSTRAINT "execution_drafts_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_drafts" ADD CONSTRAINT "execution_drafts_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_counsel" ADD CONSTRAINT "external_counsel_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "folder_template_nodes" ADD CONSTRAINT "folder_template_nodes_folder_template_id_folder_templates_id_fk" FOREIGN KEY ("folder_template_id") REFERENCES "public"."folder_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gads_campaigns" ADD CONSTRAINT "gads_campaigns_account_id_google_ads_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."google_ads_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gads_change_log" ADD CONSTRAINT "gads_change_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gcs_access_permissions" ADD CONSTRAINT "gcs_access_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gcs_access_permissions" ADD CONSTRAINT "gcs_access_permissions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gcs_access_permissions" ADD CONSTRAINT "gcs_access_permissions_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gcs_directories" ADD CONSTRAINT "gcs_directories_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gcs_file_index" ADD CONSTRAINT "gcs_file_index_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gcs_file_migration_jobs" ADD CONSTRAINT "gcs_file_migration_jobs_rule_id_gcs_governance_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."gcs_governance_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gcs_governance_audit_log" ADD CONSTRAINT "gcs_governance_audit_log_rule_id_gcs_governance_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."gcs_governance_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gcs_governance_audit_log" ADD CONSTRAINT "gcs_governance_audit_log_version_id_gcs_governance_rule_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."gcs_governance_rule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gcs_governance_rule_versions" ADD CONSTRAINT "gcs_governance_rule_versions_rule_id_gcs_governance_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."gcs_governance_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gcs_object_deletions" ADD CONSTRAINT "gcs_object_deletions_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gcs_object_deletions" ADD CONSTRAINT "gcs_object_deletions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gcs_path_migration_log" ADD CONSTRAINT "gcs_path_migration_log_rule_id_gcs_governance_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."gcs_governance_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gcs_upload_monitor_log" ADD CONSTRAINT "gcs_upload_monitor_log_matched_rule_id_gcs_governance_rules_id_fk" FOREIGN KEY ("matched_rule_id") REFERENCES "public"."gcs_governance_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gcs_upload_tokens" ADD CONSTRAINT "gcs_upload_tokens_rule_id_gcs_governance_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."gcs_governance_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gcs_upload_tokens" ADD CONSTRAINT "gcs_upload_tokens_version_id_gcs_governance_rule_versions_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."gcs_governance_rule_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_qaps" ADD CONSTRAINT "generated_qaps_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_qaps" ADD CONSTRAINT "generated_qaps_template_id_qap_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."qap_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_qaps" ADD CONSTRAINT "generated_qaps_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generated_qaps" ADD CONSTRAINT "generated_qaps_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_account_mappings" ADD CONSTRAINT "gl_account_mappings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_account_mappings" ADD CONSTRAINT "gl_account_mappings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_posting_log" ADD CONSTRAINT "gl_posting_log_payroll_period_id_payroll_periods_id_fk" FOREIGN KEY ("payroll_period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gl_posting_log" ADD CONSTRAINT "gl_posting_log_posted_by_users_id_fk" FOREIGN KEY ("posted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gmail_messages" ADD CONSTRAINT "gmail_messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gmail_settings" ADD CONSTRAINT "gmail_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gmail_tokens" ADD CONSTRAINT "gmail_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_ads_tokens" ADD CONSTRAINT "google_ads_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_sync_log" ADD CONSTRAINT "google_calendar_sync_log_meeting_id_business_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."business_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "google_calendar_sync_log" ADD CONSTRAINT "google_calendar_sync_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_actions" ADD CONSTRAINT "hazop_actions_deviation_id_hazop_deviations_id_fk" FOREIGN KEY ("deviation_id") REFERENCES "public"."hazop_deviations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_actions" ADD CONSTRAINT "hazop_actions_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_alarm_trips" ADD CONSTRAINT "hazop_alarm_trips_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_alarm_trips" ADD CONSTRAINT "hazop_alarm_trips_source_deviation_id_hazop_deviations_id_fk" FOREIGN KEY ("source_deviation_id") REFERENCES "public"."hazop_deviations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_alarm_trips" ADD CONSTRAINT "hazop_alarm_trips_source_safeguard_id_hazop_safeguards_id_fk" FOREIGN KEY ("source_safeguard_id") REFERENCES "public"."hazop_safeguards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_alarm_trips" ADD CONSTRAINT "hazop_alarm_trips_interlock_id_hazop_interlocks_id_fk" FOREIGN KEY ("interlock_id") REFERENCES "public"."hazop_interlocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_alarm_trips" ADD CONSTRAINT "hazop_alarm_trips_event_group_id_hazop_event_groups_id_fk" FOREIGN KEY ("event_group_id") REFERENCES "public"."hazop_event_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_alarm_trips" ADD CONSTRAINT "hazop_alarm_trips_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_alarm_trips" ADD CONSTRAINT "hazop_alarm_trips_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_baseline_approvals" ADD CONSTRAINT "hazop_baseline_approvals_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_baseline_approvals" ADD CONSTRAINT "hazop_baseline_approvals_baselined_by_users_id_fk" FOREIGN KEY ("baselined_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_baseline_approvals" ADD CONSTRAINT "hazop_baseline_approvals_countersigned_by_users_id_fk" FOREIGN KEY ("countersigned_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_causes" ADD CONSTRAINT "hazop_causes_deviation_id_hazop_deviations_id_fk" FOREIGN KEY ("deviation_id") REFERENCES "public"."hazop_deviations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_causes" ADD CONSTRAINT "hazop_ce_causes_matrix_id_hazop_ce_matrix_id_fk" FOREIGN KEY ("matrix_id") REFERENCES "public"."hazop_ce_matrix"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_causes" ADD CONSTRAINT "hazop_ce_causes_source_sif_id_hazop_safety_functions_id_fk" FOREIGN KEY ("source_sif_id") REFERENCES "public"."hazop_safety_functions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_cells" ADD CONSTRAINT "hazop_ce_cells_matrix_id_hazop_ce_matrix_id_fk" FOREIGN KEY ("matrix_id") REFERENCES "public"."hazop_ce_matrix"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_cells" ADD CONSTRAINT "hazop_ce_cells_cause_id_hazop_ce_causes_id_fk" FOREIGN KEY ("cause_id") REFERENCES "public"."hazop_ce_causes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_cells" ADD CONSTRAINT "hazop_ce_cells_effect_id_hazop_ce_effects_id_fk" FOREIGN KEY ("effect_id") REFERENCES "public"."hazop_ce_effects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_columns" ADD CONSTRAINT "hazop_ce_columns_matrix_id_hazop_ce_matrices_id_fk" FOREIGN KEY ("matrix_id") REFERENCES "public"."hazop_ce_matrices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_columns" ADD CONSTRAINT "hazop_ce_columns_source_safeguard_id_hazop_safeguards_id_fk" FOREIGN KEY ("source_safeguard_id") REFERENCES "public"."hazop_safeguards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_columns" ADD CONSTRAINT "hazop_ce_columns_source_action_id_hazop_actions_id_fk" FOREIGN KEY ("source_action_id") REFERENCES "public"."hazop_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_columns" ADD CONSTRAINT "hazop_ce_columns_response_group_id_hazop_response_groups_id_fk" FOREIGN KEY ("response_group_id") REFERENCES "public"."hazop_response_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_effects" ADD CONSTRAINT "hazop_ce_effects_matrix_id_hazop_ce_matrix_id_fk" FOREIGN KEY ("matrix_id") REFERENCES "public"."hazop_ce_matrix"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_effects" ADD CONSTRAINT "hazop_ce_effects_source_sif_id_hazop_safety_functions_id_fk" FOREIGN KEY ("source_sif_id") REFERENCES "public"."hazop_safety_functions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_matrices" ADD CONSTRAINT "hazop_ce_matrices_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_matrices" ADD CONSTRAINT "hazop_ce_matrices_node_id_hazop_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."hazop_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_matrices" ADD CONSTRAINT "hazop_ce_matrices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_matrix" ADD CONSTRAINT "hazop_ce_matrix_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_matrix" ADD CONSTRAINT "hazop_ce_matrix_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_rows" ADD CONSTRAINT "hazop_ce_rows_matrix_id_hazop_ce_matrices_id_fk" FOREIGN KEY ("matrix_id") REFERENCES "public"."hazop_ce_matrices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_rows" ADD CONSTRAINT "hazop_ce_rows_source_deviation_id_hazop_deviations_id_fk" FOREIGN KEY ("source_deviation_id") REFERENCES "public"."hazop_deviations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_rows" ADD CONSTRAINT "hazop_ce_rows_source_cause_id_hazop_causes_id_fk" FOREIGN KEY ("source_cause_id") REFERENCES "public"."hazop_causes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_ce_rows" ADD CONSTRAINT "hazop_ce_rows_event_group_id_hazop_event_groups_id_fk" FOREIGN KEY ("event_group_id") REFERENCES "public"."hazop_event_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_concept_equipment" ADD CONSTRAINT "hazop_concept_equipment_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_concept_instruments" ADD CONSTRAINT "hazop_concept_instruments_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_consequences" ADD CONSTRAINT "hazop_consequences_deviation_id_hazop_deviations_id_fk" FOREIGN KEY ("deviation_id") REFERENCES "public"."hazop_deviations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_design_assumptions" ADD CONSTRAINT "hazop_design_assumptions_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_design_assumptions" ADD CONSTRAINT "hazop_design_assumptions_confirmed_by_users_id_fk" FOREIGN KEY ("confirmed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_deviations" ADD CONSTRAINT "hazop_deviations_node_id_hazop_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."hazop_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_deviations" ADD CONSTRAINT "hazop_deviations_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_deviations" ADD CONSTRAINT "hazop_deviations_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_event_group_members" ADD CONSTRAINT "hazop_event_group_members_group_id_hazop_event_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."hazop_event_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_event_group_members" ADD CONSTRAINT "hazop_event_group_members_deviation_id_hazop_deviations_id_fk" FOREIGN KEY ("deviation_id") REFERENCES "public"."hazop_deviations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_event_groups" ADD CONSTRAINT "hazop_event_groups_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_event_groups" ADD CONSTRAINT "hazop_event_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_fat_sat_items" ADD CONSTRAINT "hazop_fat_sat_items_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_fat_sat_items" ADD CONSTRAINT "hazop_fat_sat_items_sif_id_hazop_safety_functions_id_fk" FOREIGN KEY ("sif_id") REFERENCES "public"."hazop_safety_functions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_fat_sat_items" ADD CONSTRAINT "hazop_fat_sat_items_cause_id_hazop_ce_causes_id_fk" FOREIGN KEY ("cause_id") REFERENCES "public"."hazop_ce_causes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_fat_sat_items" ADD CONSTRAINT "hazop_fat_sat_items_effect_id_hazop_ce_effects_id_fk" FOREIGN KEY ("effect_id") REFERENCES "public"."hazop_ce_effects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_fat_sat_items" ADD CONSTRAINT "hazop_fat_sat_items_tested_by_users_id_fk" FOREIGN KEY ("tested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_interlock_actions" ADD CONSTRAINT "hazop_interlock_actions_interlock_id_hazop_interlocks_id_fk" FOREIGN KEY ("interlock_id") REFERENCES "public"."hazop_interlocks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_interlock_actions" ADD CONSTRAINT "hazop_interlock_actions_source_safeguard_id_hazop_safeguards_id_fk" FOREIGN KEY ("source_safeguard_id") REFERENCES "public"."hazop_safeguards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_interlocks" ADD CONSTRAINT "hazop_interlocks_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_interlocks" ADD CONSTRAINT "hazop_interlocks_source_deviation_id_hazop_deviations_id_fk" FOREIGN KEY ("source_deviation_id") REFERENCES "public"."hazop_deviations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_interlocks" ADD CONSTRAINT "hazop_interlocks_source_safeguard_id_hazop_safeguards_id_fk" FOREIGN KEY ("source_safeguard_id") REFERENCES "public"."hazop_safeguards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_interlocks" ADD CONSTRAINT "hazop_interlocks_event_group_id_hazop_event_groups_id_fk" FOREIGN KEY ("event_group_id") REFERENCES "public"."hazop_event_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_interlocks" ADD CONSTRAINT "hazop_interlocks_response_group_id_hazop_response_groups_id_fk" FOREIGN KEY ("response_group_id") REFERENCES "public"."hazop_response_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_interlocks" ADD CONSTRAINT "hazop_interlocks_ce_row_id_hazop_ce_rows_id_fk" FOREIGN KEY ("ce_row_id") REFERENCES "public"."hazop_ce_rows"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_interlocks" ADD CONSTRAINT "hazop_interlocks_ce_column_id_hazop_ce_columns_id_fk" FOREIGN KEY ("ce_column_id") REFERENCES "public"."hazop_ce_columns"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_interlocks" ADD CONSTRAINT "hazop_interlocks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_interlocks" ADD CONSTRAINT "hazop_interlocks_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_lopa_records" ADD CONSTRAINT "hazop_lopa_records_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_lopa_records" ADD CONSTRAINT "hazop_lopa_records_scenario_id_hazop_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."hazop_scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_lopa_records" ADD CONSTRAINT "hazop_lopa_records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_lopa_records" ADD CONSTRAINT "hazop_lopa_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_lopa_records" ADD CONSTRAINT "hazop_lopa_records_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_moc_records" ADD CONSTRAINT "hazop_moc_records_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_moc_records" ADD CONSTRAINT "hazop_moc_records_scenario_id_hazop_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."hazop_scenarios"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_moc_records" ADD CONSTRAINT "hazop_moc_records_safety_function_id_hazop_safety_functions_id_fk" FOREIGN KEY ("safety_function_id") REFERENCES "public"."hazop_safety_functions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_moc_records" ADD CONSTRAINT "hazop_moc_records_interlock_id_hazop_interlocks_id_fk" FOREIGN KEY ("interlock_id") REFERENCES "public"."hazop_interlocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_moc_records" ADD CONSTRAINT "hazop_moc_records_alarm_trip_id_hazop_alarm_trips_id_fk" FOREIGN KEY ("alarm_trip_id") REFERENCES "public"."hazop_alarm_trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_moc_records" ADD CONSTRAINT "hazop_moc_records_sce_id_hazop_safety_critical_elements_id_fk" FOREIGN KEY ("sce_id") REFERENCES "public"."hazop_safety_critical_elements"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_moc_records" ADD CONSTRAINT "hazop_moc_records_lopa_id_hazop_lopa_records_id_fk" FOREIGN KEY ("lopa_id") REFERENCES "public"."hazop_lopa_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_moc_records" ADD CONSTRAINT "hazop_moc_records_srs_id_hazop_srs_records_id_fk" FOREIGN KEY ("srs_id") REFERENCES "public"."hazop_srs_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_moc_records" ADD CONSTRAINT "hazop_moc_records_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_moc_records" ADD CONSTRAINT "hazop_moc_records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_moc_records" ADD CONSTRAINT "hazop_moc_records_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_nodes" ADD CONSTRAINT "hazop_nodes_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_nodes" ADD CONSTRAINT "hazop_nodes_loop_id_hazop_process_loops_id_fk" FOREIGN KEY ("loop_id") REFERENCES "public"."hazop_process_loops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_nodes" ADD CONSTRAINT "hazop_nodes_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_process_loops" ADD CONSTRAINT "hazop_process_loops_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_process_steps" ADD CONSTRAINT "hazop_process_steps_node_id_hazop_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."hazop_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_process_steps" ADD CONSTRAINT "hazop_process_steps_loop_id_hazop_process_loops_id_fk" FOREIGN KEY ("loop_id") REFERENCES "public"."hazop_process_loops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_response_group_actions" ADD CONSTRAINT "hazop_response_group_actions_response_group_id_hazop_response_groups_id_fk" FOREIGN KEY ("response_group_id") REFERENCES "public"."hazop_response_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_response_group_actions" ADD CONSTRAINT "hazop_response_group_actions_source_safeguard_id_hazop_safeguards_id_fk" FOREIGN KEY ("source_safeguard_id") REFERENCES "public"."hazop_safeguards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_response_group_actions" ADD CONSTRAINT "hazop_response_group_actions_source_action_id_hazop_actions_id_fk" FOREIGN KEY ("source_action_id") REFERENCES "public"."hazop_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_response_groups" ADD CONSTRAINT "hazop_response_groups_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_response_groups" ADD CONSTRAINT "hazop_response_groups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_revisions" ADD CONSTRAINT "hazop_revisions_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_revisions" ADD CONSTRAINT "hazop_revisions_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_safeguards" ADD CONSTRAINT "hazop_safeguards_deviation_id_hazop_deviations_id_fk" FOREIGN KEY ("deviation_id") REFERENCES "public"."hazop_deviations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_safety_critical_elements" ADD CONSTRAINT "hazop_safety_critical_elements_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_safety_critical_elements" ADD CONSTRAINT "hazop_safety_critical_elements_linked_sif_id_hazop_safety_functions_id_fk" FOREIGN KEY ("linked_sif_id") REFERENCES "public"."hazop_safety_functions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_safety_critical_elements" ADD CONSTRAINT "hazop_safety_critical_elements_linked_interlock_id_hazop_interlocks_id_fk" FOREIGN KEY ("linked_interlock_id") REFERENCES "public"."hazop_interlocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_safety_critical_elements" ADD CONSTRAINT "hazop_safety_critical_elements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_safety_functions" ADD CONSTRAINT "hazop_safety_functions_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_safety_functions" ADD CONSTRAINT "hazop_safety_functions_source_deviation_id_hazop_deviations_id_fk" FOREIGN KEY ("source_deviation_id") REFERENCES "public"."hazop_deviations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_safety_functions" ADD CONSTRAINT "hazop_safety_functions_source_action_id_hazop_actions_id_fk" FOREIGN KEY ("source_action_id") REFERENCES "public"."hazop_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_scenario_ipl_stack" ADD CONSTRAINT "hazop_scenario_ipl_stack_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_scenario_ipl_stack" ADD CONSTRAINT "hazop_scenario_ipl_stack_scenario_id_hazop_scenarios_id_fk" FOREIGN KEY ("scenario_id") REFERENCES "public"."hazop_scenarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_scenario_ipl_stack" ADD CONSTRAINT "hazop_scenario_ipl_stack_response_group_id_hazop_response_groups_id_fk" FOREIGN KEY ("response_group_id") REFERENCES "public"."hazop_response_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_scenario_ipl_stack" ADD CONSTRAINT "hazop_scenario_ipl_stack_safety_function_id_hazop_safety_functions_id_fk" FOREIGN KEY ("safety_function_id") REFERENCES "public"."hazop_safety_functions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_scenario_ipl_stack" ADD CONSTRAINT "hazop_scenario_ipl_stack_interlock_id_hazop_interlocks_id_fk" FOREIGN KEY ("interlock_id") REFERENCES "public"."hazop_interlocks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_scenario_ipl_stack" ADD CONSTRAINT "hazop_scenario_ipl_stack_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_scenarios" ADD CONSTRAINT "hazop_scenarios_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_scenarios" ADD CONSTRAINT "hazop_scenarios_initiating_event_group_id_hazop_event_groups_id_fk" FOREIGN KEY ("initiating_event_group_id") REFERENCES "public"."hazop_event_groups"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_scenarios" ADD CONSTRAINT "hazop_scenarios_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_srs_records" ADD CONSTRAINT "hazop_srs_records_study_id_hazop_studies_id_fk" FOREIGN KEY ("study_id") REFERENCES "public"."hazop_studies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_srs_records" ADD CONSTRAINT "hazop_srs_records_safety_function_id_hazop_safety_functions_id_fk" FOREIGN KEY ("safety_function_id") REFERENCES "public"."hazop_safety_functions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_srs_records" ADD CONSTRAINT "hazop_srs_records_lopa_id_hazop_lopa_records_id_fk" FOREIGN KEY ("lopa_id") REFERENCES "public"."hazop_lopa_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_srs_records" ADD CONSTRAINT "hazop_srs_records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_srs_records" ADD CONSTRAINT "hazop_srs_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_srs_records" ADD CONSTRAINT "hazop_srs_records_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_studies" ADD CONSTRAINT "hazop_studies_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_studies" ADD CONSTRAINT "hazop_studies_study_leader_users_id_fk" FOREIGN KEY ("study_leader") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_studies" ADD CONSTRAINT "hazop_studies_converted_by_users_id_fk" FOREIGN KEY ("converted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_studies" ADD CONSTRAINT "hazop_studies_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hazop_studies" ADD CONSTRAINT "hazop_studies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_documents" ADD CONSTRAINT "inspection_documents_inspection_order_id_inspection_orders_id_fk" FOREIGN KEY ("inspection_order_id") REFERENCES "public"."inspection_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_documents" ADD CONSTRAINT "inspection_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_execution_records" ADD CONSTRAINT "inspection_execution_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_execution_records" ADD CONSTRAINT "inspection_execution_records_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_execution_records" ADD CONSTRAINT "inspection_execution_records_planning_record_id_item_planning_records_id_fk" FOREIGN KEY ("planning_record_id") REFERENCES "public"."item_planning_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_execution_records" ADD CONSTRAINT "inspection_execution_records_quality_plan_id_quality_planning_records_id_fk" FOREIGN KEY ("quality_plan_id") REFERENCES "public"."quality_planning_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_execution_records" ADD CONSTRAINT "inspection_execution_records_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_execution_records" ADD CONSTRAINT "inspection_execution_records_scheduled_by_users_id_fk" FOREIGN KEY ("scheduled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_execution_records" ADD CONSTRAINT "inspection_execution_records_started_by_users_id_fk" FOREIGN KEY ("started_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_execution_records" ADD CONSTRAINT "inspection_execution_records_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_execution_records" ADD CONSTRAINT "inspection_execution_records_failed_by_users_id_fk" FOREIGN KEY ("failed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_execution_records" ADD CONSTRAINT "inspection_execution_records_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_execution_records" ADD CONSTRAINT "inspection_execution_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_execution_records" ADD CONSTRAINT "inspection_execution_records_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_order_items" ADD CONSTRAINT "inspection_order_items_inspection_order_id_inspection_orders_id_fk" FOREIGN KEY ("inspection_order_id") REFERENCES "public"."inspection_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_order_items" ADD CONSTRAINT "inspection_order_items_item_id_project_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."project_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_order_items" ADD CONSTRAINT "inspection_order_items_work_order_item_id_work_order_items_id_fk" FOREIGN KEY ("work_order_item_id") REFERENCES "public"."work_order_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_orders" ADD CONSTRAINT "inspection_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_orders" ADD CONSTRAINT "inspection_orders_item_id_project_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."project_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_orders" ADD CONSTRAINT "inspection_orders_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_orders" ADD CONSTRAINT "inspection_orders_epc_work_order_id_epc_work_orders_id_fk" FOREIGN KEY ("epc_work_order_id") REFERENCES "public"."epc_work_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_orders" ADD CONSTRAINT "inspection_orders_parent_inspection_order_id_inspection_orders_id_fk" FOREIGN KEY ("parent_inspection_order_id") REFERENCES "public"."inspection_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_orders" ADD CONSTRAINT "inspection_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_inspector_id_users_id_fk" FOREIGN KEY ("inspector_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inspection_reports" ADD CONSTRAINT "inspection_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_messages" ADD CONSTRAINT "internal_messages_sender_id_users_id_fk" FOREIGN KEY ("sender_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "internal_messages" ADD CONSTRAINT "internal_messages_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoice_items" ADD CONSTRAINT "invoice_items_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_components" ADD CONSTRAINT "item_components_parent_item_id_master_items_id_fk" FOREIGN KEY ("parent_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_components" ADD CONSTRAINT "item_components_component_item_id_master_items_id_fk" FOREIGN KEY ("component_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_planning_records" ADD CONSTRAINT "item_planning_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_planning_records" ADD CONSTRAINT "item_planning_records_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_planning_records" ADD CONSTRAINT "item_planning_records_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_planning_records" ADD CONSTRAINT "item_planning_records_linked_task_id_tasks_id_fk" FOREIGN KEY ("linked_task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_planning_records" ADD CONSTRAINT "item_planning_records_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_planning_records" ADD CONSTRAINT "item_planning_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_planning_records" ADD CONSTRAINT "item_planning_records_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_planning_records" ADD CONSTRAINT "item_planning_records_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "item_planning_records" ADD CONSTRAINT "item_planning_records_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itp_activities" ADD CONSTRAINT "itp_activities_itp_id_itps_id_fk" FOREIGN KEY ("itp_id") REFERENCES "public"."itps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itp_templates" ADD CONSTRAINT "itp_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itp_versions" ADD CONSTRAINT "itp_versions_itp_id_itps_id_fk" FOREIGN KEY ("itp_id") REFERENCES "public"."itps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itp_versions" ADD CONSTRAINT "itp_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itps" ADD CONSTRAINT "itps_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itps" ADD CONSTRAINT "itps_qap_id_generated_qaps_id_fk" FOREIGN KEY ("qap_id") REFERENCES "public"."generated_qaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itps" ADD CONSTRAINT "itps_template_id_itp_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."itp_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itps" ADD CONSTRAINT "itps_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "itps" ADD CONSTRAINT "itps_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lead_activities" ADD CONSTRAINT "lead_activities_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_source_id_lead_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."lead_sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_status_id_lead_statuses_id_fk" FOREIGN KEY ("status_id") REFERENCES "public"."lead_statuses"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_accrual_log" ADD CONSTRAINT "leave_accrual_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_accrual_log" ADD CONSTRAINT "leave_accrual_log_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_accrual_log" ADD CONSTRAINT "leave_accrual_log_run_by_users_id_fk" FOREIGN KEY ("run_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_approvals" ADD CONSTRAINT "leave_approvals_leave_request_id_leave_requests_id_fk" FOREIGN KEY ("leave_request_id") REFERENCES "public"."leave_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_approvals" ADD CONSTRAINT "leave_approvals_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_adjustments" ADD CONSTRAINT "leave_balance_adjustments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_adjustments" ADD CONSTRAINT "leave_balance_adjustments_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balance_adjustments" ADD CONSTRAINT "leave_balance_adjustments_adjusted_by_users_id_fk" FOREIGN KEY ("adjusted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_carryover_log" ADD CONSTRAINT "leave_carryover_log_run_by_users_id_fk" FOREIGN KEY ("run_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_deductions" ADD CONSTRAINT "leave_deductions_leave_request_id_leave_requests_id_fk" FOREIGN KEY ("leave_request_id") REFERENCES "public"."leave_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_deductions" ADD CONSTRAINT "leave_deductions_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_deductions" ADD CONSTRAINT "leave_deductions_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_deductions" ADD CONSTRAINT "leave_deductions_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_policies" ADD CONSTRAINT "leave_policies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_hr_approval_id_users_id_fk" FOREIGN KEY ("hr_approval_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legacy_file_access_log" ADD CONSTRAINT "legacy_file_access_log_accessed_by_users_id_fk" FOREIGN KEY ("accessed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_alerts" ADD CONSTRAINT "legal_alerts_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_alerts" ADD CONSTRAINT "legal_alerts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_cases" ADD CONSTRAINT "legal_cases_internal_counsel_users_id_fk" FOREIGN KEY ("internal_counsel") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_cases" ADD CONSTRAINT "legal_cases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_notices" ADD CONSTRAINT "legal_notices_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_notices" ADD CONSTRAINT "legal_notices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_logs" ADD CONSTRAINT "llm_logs_prompt_id_llm_prompts_registry_id_fk" FOREIGN KEY ("prompt_id") REFERENCES "public"."llm_prompts_registry"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_logs" ADD CONSTRAINT "llm_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_prompts_registry" ADD CONSTRAINT "llm_prompts_registry_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_prompts_registry" ADD CONSTRAINT "llm_prompts_registry_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_audit_log" ADD CONSTRAINT "login_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "login_security_policies" ADD CONSTRAINT "login_security_policies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lwp_exemption_audit_log" ADD CONSTRAINT "lwp_exemption_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lwp_exemption_audit_log" ADD CONSTRAINT "lwp_exemption_audit_log_granted_by_users_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_allocations" ADD CONSTRAINT "machine_allocations_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "makes" ADD CONSTRAINT "makes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_salary_entries" ADD CONSTRAINT "manual_salary_entries_period_id_payroll_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_salary_entries" ADD CONSTRAINT "manual_salary_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_salary_entries" ADD CONSTRAINT "manual_salary_entries_payroll_record_id_payroll_records_id_fk" FOREIGN KEY ("payroll_record_id") REFERENCES "public"."payroll_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manual_salary_entries" ADD CONSTRAINT "manual_salary_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_channel_id_campaign_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."campaign_channels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "marketing_campaigns" ADD CONSTRAINT "marketing_campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "master_items" ADD CONSTRAINT "master_items_preferred_vendor_id_vendors_id_fk" FOREIGN KEY ("preferred_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_consumption" ADD CONSTRAINT "material_consumption_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_consumption" ADD CONSTRAINT "material_consumption_component_item_id_master_items_id_fk" FOREIGN KEY ("component_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_consumption" ADD CONSTRAINT "material_consumption_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_identification" ADD CONSTRAINT "material_identification_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_identification" ADD CONSTRAINT "material_identification_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_identification" ADD CONSTRAINT "material_identification_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_inspection_links" ADD CONSTRAINT "material_inspection_links_inspection_order_id_inspection_orders_id_fk" FOREIGN KEY ("inspection_order_id") REFERENCES "public"."inspection_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_inspection_links" ADD CONSTRAINT "material_inspection_links_material_id_material_identification_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material_identification"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_analytics" ADD CONSTRAINT "meeting_analytics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_meeting_id_business_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."business_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_attendance" ADD CONSTRAINT "meeting_attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_commitments" ADD CONSTRAINT "meeting_commitments_meeting_id_business_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."business_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_commitments" ADD CONSTRAINT "meeting_commitments_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_commitments" ADD CONSTRAINT "meeting_commitments_assigned_by_id_users_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_commitments" ADD CONSTRAINT "meeting_commitments_escalated_to_id_users_id_fk" FOREIGN KEY ("escalated_to_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_commitments" ADD CONSTRAINT "meeting_commitments_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_commitments" ADD CONSTRAINT "meeting_commitments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_kpi_links" ADD CONSTRAINT "meeting_kpi_links_meeting_id_business_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."business_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_kpi_links" ADD CONSTRAINT "meeting_kpi_links_commitment_id_meeting_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."meeting_commitments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_kpi_links" ADD CONSTRAINT "meeting_kpi_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_reminders" ADD CONSTRAINT "meeting_reminders_meeting_id_business_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."business_meetings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_reminders" ADD CONSTRAINT "meeting_reminders_commitment_id_meeting_commitments_id_fk" FOREIGN KEY ("commitment_id") REFERENCES "public"."meeting_commitments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_reminders" ADD CONSTRAINT "meeting_reminders_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meeting_templates" ADD CONSTRAINT "meeting_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "module_permissions" ADD CONSTRAINT "module_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monthly_kpi_summary" ADD CONSTRAINT "monthly_kpi_summary_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nda_agreements" ADD CONSTRAINT "nda_agreements_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nda_agreements" ADD CONSTRAINT "nda_agreements_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nda_agreements" ADD CONSTRAINT "nda_agreements_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nda_breach_incidents" ADD CONSTRAINT "nda_breach_incidents_nda_id_nda_agreements_id_fk" FOREIGN KEY ("nda_id") REFERENCES "public"."nda_agreements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nda_breach_incidents" ADD CONSTRAINT "nda_breach_incidents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "nda_breach_incidents" ADD CONSTRAINT "nda_breach_incidents_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_conformance_reports" ADD CONSTRAINT "non_conformance_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_conformance_reports" ADD CONSTRAINT "non_conformance_reports_inspection_report_id_inspection_reports_id_fk" FOREIGN KEY ("inspection_report_id") REFERENCES "public"."inspection_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_conformance_reports" ADD CONSTRAINT "non_conformance_reports_identified_by_users_id_fk" FOREIGN KEY ("identified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_conformance_reports" ADD CONSTRAINT "non_conformance_reports_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_conformance_reports" ADD CONSTRAINT "non_conformance_reports_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_conformance_reports" ADD CONSTRAINT "non_conformance_reports_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_conformance_reports" ADD CONSTRAINT "non_conformance_reports_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_conformance_reports" ADD CONSTRAINT "non_conformance_reports_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "non_conformance_reports" ADD CONSTRAINT "non_conformance_reports_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_archive_revisions" ADD CONSTRAINT "offer_archive_revisions_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_archive_revisions" ADD CONSTRAINT "offer_archive_revisions_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_comm_doc_conversions" ADD CONSTRAINT "offer_comm_doc_conversions_source_doc_id_offer_comm_documents_id_fk" FOREIGN KEY ("source_doc_id") REFERENCES "public"."offer_comm_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_comm_doc_conversions" ADD CONSTRAINT "offer_comm_doc_conversions_snapshot_id_offer_conversion_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."offer_conversion_snapshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_comm_doc_conversions" ADD CONSTRAINT "offer_comm_doc_conversions_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_comm_doc_conversions" ADD CONSTRAINT "offer_comm_doc_conversions_mirror_job_id_document_agent_jobs_id_fk" FOREIGN KEY ("mirror_job_id") REFERENCES "public"."document_agent_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_comm_doc_conversions" ADD CONSTRAINT "offer_comm_doc_conversions_converted_by_users_id_fk" FOREIGN KEY ("converted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_comm_documents" ADD CONSTRAINT "offer_comm_documents_communication_id_offer_communications_id_fk" FOREIGN KEY ("communication_id") REFERENCES "public"."offer_communications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_comm_documents" ADD CONSTRAINT "offer_comm_documents_mirror_job_id_document_agent_jobs_id_fk" FOREIGN KEY ("mirror_job_id") REFERENCES "public"."document_agent_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_comm_documents" ADD CONSTRAINT "offer_comm_documents_template_id_offer_comm_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."offer_comm_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_comm_documents" ADD CONSTRAINT "offer_comm_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_comm_templates" ADD CONSTRAINT "offer_comm_templates_comm_category_id_offer_comm_categories_id_fk" FOREIGN KEY ("comm_category_id") REFERENCES "public"."offer_comm_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_comm_templates" ADD CONSTRAINT "offer_comm_templates_mirror_job_id_document_agent_jobs_id_fk" FOREIGN KEY ("mirror_job_id") REFERENCES "public"."document_agent_jobs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_comm_templates" ADD CONSTRAINT "offer_comm_templates_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_communications" ADD CONSTRAINT "offer_communications_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_communications" ADD CONSTRAINT "offer_communications_communication_category_id_offer_comm_categories_id_fk" FOREIGN KEY ("communication_category_id") REFERENCES "public"."offer_comm_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_communications" ADD CONSTRAINT "offer_communications_responsible_user_id_users_id_fk" FOREIGN KEY ("responsible_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_communications" ADD CONSTRAINT "offer_communications_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_conversion_snapshots" ADD CONSTRAINT "offer_conversion_snapshots_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_conversion_snapshots" ADD CONSTRAINT "offer_conversion_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_conversion_snapshots" ADD CONSTRAINT "offer_conversion_snapshots_converted_by_users_id_fk" FOREIGN KEY ("converted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_items" ADD CONSTRAINT "offer_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_template_audit_log" ADD CONSTRAINT "offer_template_audit_log_template_id_offer_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."offer_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_template_audit_log" ADD CONSTRAINT "offer_template_audit_log_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_template_revisions" ADD CONSTRAINT "offer_template_revisions_template_id_offer_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."offer_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_template_revisions" ADD CONSTRAINT "offer_template_revisions_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offer_templates" ADD CONSTRAINT "offer_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_audit_log" ADD CONSTRAINT "oi_audit_log_issue_id_oi_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."oi_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_audit_log" ADD CONSTRAINT "oi_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_capa_actions" ADD CONSTRAINT "oi_capa_actions_capa_id_oi_capa_records_id_fk" FOREIGN KEY ("capa_id") REFERENCES "public"."oi_capa_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_capa_actions" ADD CONSTRAINT "oi_capa_actions_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_capa_actions" ADD CONSTRAINT "oi_capa_actions_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_capa_actions" ADD CONSTRAINT "oi_capa_actions_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_capa_actions" ADD CONSTRAINT "oi_capa_actions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_capa_effectiveness" ADD CONSTRAINT "oi_capa_effectiveness_capa_id_oi_capa_records_id_fk" FOREIGN KEY ("capa_id") REFERENCES "public"."oi_capa_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_capa_effectiveness" ADD CONSTRAINT "oi_capa_effectiveness_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_capa_escalation_log" ADD CONSTRAINT "oi_capa_escalation_log_capa_id_oi_capa_records_id_fk" FOREIGN KEY ("capa_id") REFERENCES "public"."oi_capa_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_capa_records" ADD CONSTRAINT "oi_capa_records_issue_id_oi_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."oi_issues"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_capa_records" ADD CONSTRAINT "oi_capa_records_rca_id_oi_rca_records_id_fk" FOREIGN KEY ("rca_id") REFERENCES "public"."oi_rca_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_capa_records" ADD CONSTRAINT "oi_capa_records_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_capa_records" ADD CONSTRAINT "oi_capa_records_verifier_id_users_id_fk" FOREIGN KEY ("verifier_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_capa_records" ADD CONSTRAINT "oi_capa_records_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_capa_records" ADD CONSTRAINT "oi_capa_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_audit_log" ADD CONSTRAINT "oi_enforcement_audit_log_control_id_oi_enforcement_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."oi_enforcement_controls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_audit_log" ADD CONSTRAINT "oi_enforcement_audit_log_hold_id_oi_enforcement_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."oi_enforcement_holds"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_audit_log" ADD CONSTRAINT "oi_enforcement_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_checklist_responses" ADD CONSTRAINT "oi_enforcement_checklist_responses_hold_id_oi_enforcement_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."oi_enforcement_holds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_checklist_responses" ADD CONSTRAINT "oi_enforcement_checklist_responses_checklist_item_id_oi_enforcement_checklists_id_fk" FOREIGN KEY ("checklist_item_id") REFERENCES "public"."oi_enforcement_checklists"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_checklist_responses" ADD CONSTRAINT "oi_enforcement_checklist_responses_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_checklist_responses" ADD CONSTRAINT "oi_enforcement_checklist_responses_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_checklists" ADD CONSTRAINT "oi_enforcement_checklists_control_id_oi_enforcement_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."oi_enforcement_controls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_controls" ADD CONSTRAINT "oi_enforcement_controls_sop_id_oi_sop_records_id_fk" FOREIGN KEY ("sop_id") REFERENCES "public"."oi_sop_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_controls" ADD CONSTRAINT "oi_enforcement_controls_scope_project_id_projects_id_fk" FOREIGN KEY ("scope_project_id") REFERENCES "public"."projects"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_controls" ADD CONSTRAINT "oi_enforcement_controls_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_controls" ADD CONSTRAINT "oi_enforcement_controls_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_controls" ADD CONSTRAINT "oi_enforcement_controls_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_controls" ADD CONSTRAINT "oi_enforcement_controls_suspended_by_users_id_fk" FOREIGN KEY ("suspended_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_controls" ADD CONSTRAINT "oi_enforcement_controls_retired_by_users_id_fk" FOREIGN KEY ("retired_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_controls" ADD CONSTRAINT "oi_enforcement_controls_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_holds" ADD CONSTRAINT "oi_enforcement_holds_control_id_oi_enforcement_controls_id_fk" FOREIGN KEY ("control_id") REFERENCES "public"."oi_enforcement_controls"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_holds" ADD CONSTRAINT "oi_enforcement_holds_hold_owner_id_users_id_fk" FOREIGN KEY ("hold_owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_holds" ADD CONSTRAINT "oi_enforcement_holds_escalation_owner_id_users_id_fk" FOREIGN KEY ("escalation_owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_holds" ADD CONSTRAINT "oi_enforcement_holds_hold_approver_id_users_id_fk" FOREIGN KEY ("hold_approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_holds" ADD CONSTRAINT "oi_enforcement_holds_raised_by_users_id_fk" FOREIGN KEY ("raised_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_holds" ADD CONSTRAINT "oi_enforcement_holds_approved_to_proceed_by_users_id_fk" FOREIGN KEY ("approved_to_proceed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_holds" ADD CONSTRAINT "oi_enforcement_holds_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_holds" ADD CONSTRAINT "oi_enforcement_holds_override_by_users_id_fk" FOREIGN KEY ("override_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_enforcement_holds" ADD CONSTRAINT "oi_enforcement_holds_bypass_by_users_id_fk" FOREIGN KEY ("bypass_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_escalations" ADD CONSTRAINT "oi_escalations_issue_id_oi_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."oi_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_escalations" ADD CONSTRAINT "oi_escalations_triggered_by_users_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_escalations" ADD CONSTRAINT "oi_escalations_escalated_to_users_id_fk" FOREIGN KEY ("escalated_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_escalations" ADD CONSTRAINT "oi_escalations_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issue_attachments" ADD CONSTRAINT "oi_issue_attachments_issue_id_oi_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."oi_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issue_attachments" ADD CONSTRAINT "oi_issue_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_risk_owner_users_id_fk" FOREIGN KEY ("risk_owner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_escalation_owner_users_id_fk" FOREIGN KEY ("escalation_owner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_technical_owner_users_id_fk" FOREIGN KEY ("technical_owner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_compliance_owner_users_id_fk" FOREIGN KEY ("compliance_owner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_financial_owner_users_id_fk" FOREIGN KEY ("financial_owner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_legal_owner_users_id_fk" FOREIGN KEY ("legal_owner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_business_owner_users_id_fk" FOREIGN KEY ("business_owner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_classified_by_users_id_fk" FOREIGN KEY ("classified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_reopened_by_users_id_fk" FOREIGN KEY ("reopened_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_withdrawn_by_users_id_fk" FOREIGN KEY ("withdrawn_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_severity_changed_by_users_id_fk" FOREIGN KEY ("severity_changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_epc_drawing_control_id_epc_drawing_controls_id_fk" FOREIGN KEY ("epc_drawing_control_id") REFERENCES "public"."epc_drawing_controls"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_epc_po_id_epc_purchase_orders_id_fk" FOREIGN KEY ("epc_po_id") REFERENCES "public"."epc_purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_epc_wo_id_epc_work_orders_id_fk" FOREIGN KEY ("epc_wo_id") REFERENCES "public"."epc_work_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_inspection_order_id_inspection_orders_id_fk" FOREIGN KEY ("inspection_order_id") REFERENCES "public"."inspection_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_fat_inspection_order_id_inspection_orders_id_fk" FOREIGN KEY ("fat_inspection_order_id") REFERENCES "public"."inspection_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_sat_inspection_order_id_inspection_orders_id_fk" FOREIGN KEY ("sat_inspection_order_id") REFERENCES "public"."inspection_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_issues" ADD CONSTRAINT "oi_issues_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_acknowledgments" ADD CONSTRAINT "oi_lesson_acknowledgments_lesson_id_oi_lesson_records_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."oi_lesson_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_acknowledgments" ADD CONSTRAINT "oi_lesson_acknowledgments_target_project_id_projects_id_fk" FOREIGN KEY ("target_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_acknowledgments" ADD CONSTRAINT "oi_lesson_acknowledgments_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_acknowledgments" ADD CONSTRAINT "oi_lesson_acknowledgments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_audit_log" ADD CONSTRAINT "oi_lesson_audit_log_lesson_id_oi_lesson_records_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."oi_lesson_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_effectiveness_reviews" ADD CONSTRAINT "oi_lesson_effectiveness_reviews_lesson_id_oi_lesson_records_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."oi_lesson_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_effectiveness_reviews" ADD CONSTRAINT "oi_lesson_effectiveness_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_linkages" ADD CONSTRAINT "oi_lesson_linkages_lesson_id_oi_lesson_records_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."oi_lesson_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_linkages" ADD CONSTRAINT "oi_lesson_linkages_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_records" ADD CONSTRAINT "oi_lesson_records_parent_lesson_id_oi_lesson_records_id_fk" FOREIGN KEY ("parent_lesson_id") REFERENCES "public"."oi_lesson_records"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_records" ADD CONSTRAINT "oi_lesson_records_scope_project_id_projects_id_fk" FOREIGN KEY ("scope_project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_records" ADD CONSTRAINT "oi_lesson_records_cross_project_approved_by_users_id_fk" FOREIGN KEY ("cross_project_approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_records" ADD CONSTRAINT "oi_lesson_records_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_records" ADD CONSTRAINT "oi_lesson_records_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_records" ADD CONSTRAINT "oi_lesson_records_published_by_users_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_records" ADD CONSTRAINT "oi_lesson_records_archived_by_users_id_fk" FOREIGN KEY ("archived_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_records" ADD CONSTRAINT "oi_lesson_records_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_recurrence_checks" ADD CONSTRAINT "oi_lesson_recurrence_checks_lesson_id_oi_lesson_records_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."oi_lesson_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_recurrence_checks" ADD CONSTRAINT "oi_lesson_recurrence_checks_checker_id_users_id_fk" FOREIGN KEY ("checker_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_recurrence_checks" ADD CONSTRAINT "oi_lesson_recurrence_checks_linked_issue_id_oi_issues_id_fk" FOREIGN KEY ("linked_issue_id") REFERENCES "public"."oi_issues"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_recurrence_checks" ADD CONSTRAINT "oi_lesson_recurrence_checks_linked_rca_id_oi_rca_records_id_fk" FOREIGN KEY ("linked_rca_id") REFERENCES "public"."oi_rca_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_reviewers" ADD CONSTRAINT "oi_lesson_reviewers_lesson_id_oi_lesson_records_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."oi_lesson_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_reviewers" ADD CONSTRAINT "oi_lesson_reviewers_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_lesson_reviewers" ADD CONSTRAINT "oi_lesson_reviewers_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_rca_evidence" ADD CONSTRAINT "oi_rca_evidence_rca_id_oi_rca_records_id_fk" FOREIGN KEY ("rca_id") REFERENCES "public"."oi_rca_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_rca_evidence" ADD CONSTRAINT "oi_rca_evidence_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_rca_failure_tree_nodes" ADD CONSTRAINT "oi_rca_failure_tree_nodes_rca_id_oi_rca_records_id_fk" FOREIGN KEY ("rca_id") REFERENCES "public"."oi_rca_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_rca_fishbone" ADD CONSTRAINT "oi_rca_fishbone_rca_id_oi_rca_records_id_fk" FOREIGN KEY ("rca_id") REFERENCES "public"."oi_rca_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_rca_five_why" ADD CONSTRAINT "oi_rca_five_why_rca_id_oi_rca_records_id_fk" FOREIGN KEY ("rca_id") REFERENCES "public"."oi_rca_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_rca_records" ADD CONSTRAINT "oi_rca_records_issue_id_oi_issues_id_fk" FOREIGN KEY ("issue_id") REFERENCES "public"."oi_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_rca_records" ADD CONSTRAINT "oi_rca_records_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_rca_records" ADD CONSTRAINT "oi_rca_records_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_rca_records" ADD CONSTRAINT "oi_rca_records_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_rca_records" ADD CONSTRAINT "oi_rca_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_rca_similar_links" ADD CONSTRAINT "oi_rca_similar_links_issue_id_a_oi_issues_id_fk" FOREIGN KEY ("issue_id_a") REFERENCES "public"."oi_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_rca_similar_links" ADD CONSTRAINT "oi_rca_similar_links_issue_id_b_oi_issues_id_fk" FOREIGN KEY ("issue_id_b") REFERENCES "public"."oi_issues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_rca_similar_links" ADD CONSTRAINT "oi_rca_similar_links_linked_by_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_risk_matrix_config" ADD CONSTRAINT "oi_risk_matrix_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_risk_weight_config" ADD CONSTRAINT "oi_risk_weight_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_acknowledgments" ADD CONSTRAINT "oi_sop_acknowledgments_sop_id_oi_sop_records_id_fk" FOREIGN KEY ("sop_id") REFERENCES "public"."oi_sop_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_acknowledgments" ADD CONSTRAINT "oi_sop_acknowledgments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_acknowledgments" ADD CONSTRAINT "oi_sop_acknowledgments_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_audit_log" ADD CONSTRAINT "oi_sop_audit_log_sop_id_oi_sop_records_id_fk" FOREIGN KEY ("sop_id") REFERENCES "public"."oi_sop_records"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_audit_log" ADD CONSTRAINT "oi_sop_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_effectiveness" ADD CONSTRAINT "oi_sop_effectiveness_sop_id_oi_sop_records_id_fk" FOREIGN KEY ("sop_id") REFERENCES "public"."oi_sop_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_effectiveness" ADD CONSTRAINT "oi_sop_effectiveness_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_linkages" ADD CONSTRAINT "oi_sop_linkages_sop_id_oi_sop_records_id_fk" FOREIGN KEY ("sop_id") REFERENCES "public"."oi_sop_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_linkages" ADD CONSTRAINT "oi_sop_linkages_linked_by_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_records" ADD CONSTRAINT "oi_sop_records_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_records" ADD CONSTRAINT "oi_sop_records_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_records" ADD CONSTRAINT "oi_sop_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_revision_suggestions" ADD CONSTRAINT "oi_sop_revision_suggestions_sop_id_oi_sop_records_id_fk" FOREIGN KEY ("sop_id") REFERENCES "public"."oi_sop_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_revision_suggestions" ADD CONSTRAINT "oi_sop_revision_suggestions_suggested_by_users_id_fk" FOREIGN KEY ("suggested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_revision_suggestions" ADD CONSTRAINT "oi_sop_revision_suggestions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_revisions" ADD CONSTRAINT "oi_sop_revisions_sop_id_oi_sop_records_id_fk" FOREIGN KEY ("sop_id") REFERENCES "public"."oi_sop_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_revisions" ADD CONSTRAINT "oi_sop_revisions_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_revisions" ADD CONSTRAINT "oi_sop_revisions_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_revisions" ADD CONSTRAINT "oi_sop_revisions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_revisions" ADD CONSTRAINT "oi_sop_revisions_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_revisions" ADD CONSTRAINT "oi_sop_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_sections" ADD CONSTRAINT "oi_sop_sections_sop_id_oi_sop_records_id_fk" FOREIGN KEY ("sop_id") REFERENCES "public"."oi_sop_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_sections" ADD CONSTRAINT "oi_sop_sections_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oi_sop_sections" ADD CONSTRAINT "oi_sop_sections_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_permissions" ADD CONSTRAINT "page_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "password_reset_audit_log" ADD CONSTRAINT "password_reset_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_invoice_links" ADD CONSTRAINT "payment_invoice_links_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_invoice_links" ADD CONSTRAINT "payment_invoice_links_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_invoice_links" ADD CONSTRAINT "payment_invoice_links_allocated_by_users_id_fk" FOREIGN KEY ("allocated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_approvals" ADD CONSTRAINT "payroll_approvals_period_id_payroll_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_approvals" ADD CONSTRAINT "payroll_approvals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_attendance_snapshot" ADD CONSTRAINT "payroll_attendance_snapshot_period_id_payroll_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_attendance_snapshot" ADD CONSTRAINT "payroll_attendance_snapshot_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_exceptions" ADD CONSTRAINT "payroll_exceptions_period_id_payroll_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_exceptions" ADD CONSTRAINT "payroll_exceptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_exceptions" ADD CONSTRAINT "payroll_exceptions_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_leave_autocover" ADD CONSTRAINT "payroll_leave_autocover_payroll_record_id_payroll_records_id_fk" FOREIGN KEY ("payroll_record_id") REFERENCES "public"."payroll_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_leave_autocover" ADD CONSTRAINT "payroll_leave_autocover_period_id_payroll_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_leave_autocover" ADD CONSTRAINT "payroll_leave_autocover_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_leave_autocover" ADD CONSTRAINT "payroll_leave_autocover_leave_type_id_leave_types_id_fk" FOREIGN KEY ("leave_type_id") REFERENCES "public"."leave_types"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_leave_autocover" ADD CONSTRAINT "payroll_leave_autocover_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lock_exceptions" ADD CONSTRAINT "payroll_lock_exceptions_lock_id_payroll_locks_id_fk" FOREIGN KEY ("lock_id") REFERENCES "public"."payroll_locks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lock_exceptions" ADD CONSTRAINT "payroll_lock_exceptions_period_id_payroll_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lock_exceptions" ADD CONSTRAINT "payroll_lock_exceptions_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lock_exceptions" ADD CONSTRAINT "payroll_lock_exceptions_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lock_exceptions" ADD CONSTRAINT "payroll_lock_exceptions_closed_by_users_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_locks" ADD CONSTRAINT "payroll_locks_period_id_payroll_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_locks" ADD CONSTRAINT "payroll_locks_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_locks" ADD CONSTRAINT "payroll_locks_unlocked_by_users_id_fk" FOREIGN KEY ("unlocked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_period_id_payroll_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_verified_by_users_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_held_by_users_id_fk" FOREIGN KEY ("held_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_reversed_by_users_id_fk" FOREIGN KEY ("reversed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_verification_run_by_users_id_fk" FOREIGN KEY ("verification_run_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_records" ADD CONSTRAINT "payroll_records_verification_override_by_users_id_fk" FOREIGN KEY ("verification_override_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_log" ADD CONSTRAINT "payroll_run_log_period_id_payroll_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_run_log" ADD CONSTRAINT "payroll_run_log_executed_by_users_id_fk" FOREIGN KEY ("executed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_salary_snapshot" ADD CONSTRAINT "payroll_salary_snapshot_period_id_payroll_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_salary_snapshot" ADD CONSTRAINT "payroll_salary_snapshot_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_salary_snapshot" ADD CONSTRAINT "payroll_salary_snapshot_salary_record_id_employee_salaries_id_fk" FOREIGN KEY ("salary_record_id") REFERENCES "public"."employee_salaries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_settings" ADD CONSTRAINT "payroll_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_approvals" ADD CONSTRAINT "phase_approvals_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "phase_approvals" ADD CONSTRAINT "phase_approvals_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_costs" ADD CONSTRAINT "plant_costs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plant_costs" ADD CONSTRAINT "plant_costs_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plc_document_attachments" ADD CONSTRAINT "plc_document_attachments_po_group_id_epc_po_groups_id_fk" FOREIGN KEY ("po_group_id") REFERENCES "public"."epc_po_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plc_document_attachments" ADD CONSTRAINT "plc_document_attachments_epc_po_id_epc_purchase_orders_id_fk" FOREIGN KEY ("epc_po_id") REFERENCES "public"."epc_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plc_document_attachments" ADD CONSTRAINT "plc_document_attachments_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plc_grn_records" ADD CONSTRAINT "plc_grn_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plc_grn_records" ADD CONSTRAINT "plc_grn_records_epc_po_id_epc_purchase_orders_id_fk" FOREIGN KEY ("epc_po_id") REFERENCES "public"."epc_purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plc_grn_records" ADD CONSTRAINT "plc_grn_records_po_group_id_epc_po_groups_id_fk" FOREIGN KEY ("po_group_id") REFERENCES "public"."epc_po_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plc_grn_records" ADD CONSTRAINT "plc_grn_records_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plc_grn_records" ADD CONSTRAINT "plc_grn_records_inspection_by_users_id_fk" FOREIGN KEY ("inspection_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plc_grn_records" ADD CONSTRAINT "plc_grn_records_stores_accepted_by_users_id_fk" FOREIGN KEY ("stores_accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plc_grn_records" ADD CONSTRAINT "plc_grn_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plc_material_issues" ADD CONSTRAINT "plc_material_issues_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plc_material_issues" ADD CONSTRAINT "plc_material_issues_grn_record_id_plc_grn_records_id_fk" FOREIGN KEY ("grn_record_id") REFERENCES "public"."plc_grn_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plc_material_issues" ADD CONSTRAINT "plc_material_issues_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plc_rfq_attachments" ADD CONSTRAINT "plc_rfq_attachments_frozen_by_users_id_fk" FOREIGN KEY ("frozen_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plc_rfq_dispatch_log" ADD CONSTRAINT "plc_rfq_dispatch_log_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plc_rfq_dispatch_log" ADD CONSTRAINT "plc_rfq_dispatch_log_dispatched_by_users_id_fk" FOREIGN KEY ("dispatched_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pma_documents" ADD CONSTRAINT "pma_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_preparation_records" ADD CONSTRAINT "po_preparation_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_preparation_records" ADD CONSTRAINT "po_preparation_records_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_preparation_records" ADD CONSTRAINT "po_preparation_records_planning_record_id_item_planning_records_id_fk" FOREIGN KEY ("planning_record_id") REFERENCES "public"."item_planning_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_preparation_records" ADD CONSTRAINT "po_preparation_records_execution_record_id_procurement_execution_records_id_fk" FOREIGN KEY ("execution_record_id") REFERENCES "public"."procurement_execution_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_preparation_records" ADD CONSTRAINT "po_preparation_records_quality_plan_id_quality_planning_records_id_fk" FOREIGN KEY ("quality_plan_id") REFERENCES "public"."quality_planning_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_preparation_records" ADD CONSTRAINT "po_preparation_records_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_preparation_records" ADD CONSTRAINT "po_preparation_records_preferred_vendor_id_vendors_id_fk" FOREIGN KEY ("preferred_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_preparation_records" ADD CONSTRAINT "po_preparation_records_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_preparation_records" ADD CONSTRAINT "po_preparation_records_ready_by_users_id_fk" FOREIGN KEY ("ready_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_preparation_records" ADD CONSTRAINT "po_preparation_records_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_preparation_records" ADD CONSTRAINT "po_preparation_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "po_preparation_records" ADD CONSTRAINT "po_preparation_records_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_templates" ADD CONSTRAINT "policy_templates_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_templates" ADD CONSTRAINT "policy_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posh_cases" ADD CONSTRAINT "posh_cases_investigation_officer_users_id_fk" FOREIGN KEY ("investigation_officer") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posh_cases" ADD CONSTRAINT "posh_cases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_execution_records" ADD CONSTRAINT "procurement_execution_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_execution_records" ADD CONSTRAINT "procurement_execution_records_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_execution_records" ADD CONSTRAINT "procurement_execution_records_planning_record_id_item_planning_records_id_fk" FOREIGN KEY ("planning_record_id") REFERENCES "public"."item_planning_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_execution_records" ADD CONSTRAINT "procurement_execution_records_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_execution_records" ADD CONSTRAINT "procurement_execution_records_preferred_vendor_id_vendors_id_fk" FOREIGN KEY ("preferred_vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_execution_records" ADD CONSTRAINT "procurement_execution_records_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_execution_records" ADD CONSTRAINT "procurement_execution_records_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_execution_records" ADD CONSTRAINT "procurement_execution_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_execution_records" ADD CONSTRAINT "procurement_execution_records_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_list_audit_log" ADD CONSTRAINT "procurement_list_audit_log_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_list_audit_log" ADD CONSTRAINT "procurement_list_audit_log_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_list_lines" ADD CONSTRAINT "procurement_list_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_list_lines" ADD CONSTRAINT "procurement_list_lines_planning_record_id_item_planning_records_id_fk" FOREIGN KEY ("planning_record_id") REFERENCES "public"."item_planning_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_list_lines" ADD CONSTRAINT "procurement_list_lines_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_list_lines" ADD CONSTRAINT "procurement_list_lines_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_list_lines" ADD CONSTRAINT "procurement_list_lines_avl_bypassed_by_users_id_fk" FOREIGN KEY ("avl_bypassed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_list_lines" ADD CONSTRAINT "procurement_list_lines_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_attribute_options" ADD CONSTRAINT "fk_attr_option_parent" FOREIGN KEY ("parent_id") REFERENCES "public"."product_attribute_options"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_children" ADD CONSTRAINT "product_children_parent_product_id_products_id_fk" FOREIGN KEY ("parent_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_children" ADD CONSTRAINT "product_children_child_product_id_products_id_fk" FOREIGN KEY ("child_product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_execution_records" ADD CONSTRAINT "production_execution_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_execution_records" ADD CONSTRAINT "production_execution_records_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_execution_records" ADD CONSTRAINT "production_execution_records_planning_record_id_item_planning_records_id_fk" FOREIGN KEY ("planning_record_id") REFERENCES "public"."item_planning_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_execution_records" ADD CONSTRAINT "production_execution_records_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_execution_records" ADD CONSTRAINT "production_execution_records_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_execution_records" ADD CONSTRAINT "production_execution_records_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_execution_records" ADD CONSTRAINT "production_execution_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_execution_records" ADD CONSTRAINT "production_execution_records_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_records" ADD CONSTRAINT "production_records_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_records" ADD CONSTRAINT "production_records_work_order_item_id_work_order_items_id_fk" FOREIGN KEY ("work_order_item_id") REFERENCES "public"."work_order_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_records" ADD CONSTRAINT "production_records_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productivity_metrics" ADD CONSTRAINT "productivity_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_buy_list_headers" ADD CONSTRAINT "project_buy_list_headers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_buy_list_headers" ADD CONSTRAINT "project_buy_list_headers_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_buy_list_headers" ADD CONSTRAINT "project_buy_list_headers_source_package_id_buy_package_headers_id_fk" FOREIGN KEY ("source_package_id") REFERENCES "public"."buy_package_headers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_buy_list_headers" ADD CONSTRAINT "project_buy_list_headers_latest_synced_package_id_buy_package_headers_id_fk" FOREIGN KEY ("latest_synced_package_id") REFERENCES "public"."buy_package_headers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_buy_list_headers" ADD CONSTRAINT "project_buy_list_headers_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_buy_list_headers" ADD CONSTRAINT "project_buy_list_headers_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_buy_list_headers" ADD CONSTRAINT "project_buy_list_headers_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_buy_list_headers" ADD CONSTRAINT "project_buy_list_headers_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_buy_list_headers" ADD CONSTRAINT "project_buy_list_headers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_buy_list_lines" ADD CONSTRAINT "project_buy_list_lines_buy_list_header_id_project_buy_list_headers_id_fk" FOREIGN KEY ("buy_list_header_id") REFERENCES "public"."project_buy_list_headers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_buy_list_lines" ADD CONSTRAINT "project_buy_list_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_buy_list_lines" ADD CONSTRAINT "project_buy_list_lines_buy_group_id_buy_groups_id_fk" FOREIGN KEY ("buy_group_id") REFERENCES "public"."buy_groups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_buy_list_lines" ADD CONSTRAINT "project_buy_list_lines_buy_subgroup_id_buy_subgroups_id_fk" FOREIGN KEY ("buy_subgroup_id") REFERENCES "public"."buy_subgroups"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_buy_list_lines" ADD CONSTRAINT "project_buy_list_lines_uom_id_uom_master_id_fk" FOREIGN KEY ("uom_id") REFERENCES "public"."uom_master"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_buy_list_lines" ADD CONSTRAINT "project_buy_list_lines_selected_master_item_id_master_items_id_fk" FOREIGN KEY ("selected_master_item_id") REFERENCES "public"."master_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_buy_list_lines" ADD CONSTRAINT "project_buy_list_lines_source_package_line_id_buy_package_lines_id_fk" FOREIGN KEY ("source_package_line_id") REFERENCES "public"."buy_package_lines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_buy_list_lines" ADD CONSTRAINT "project_buy_list_lines_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_commercial_snapshots" ADD CONSTRAINT "project_commercial_snapshots_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_commercial_snapshots" ADD CONSTRAINT "project_commercial_snapshots_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_commercial_snapshots" ADD CONSTRAINT "project_commercial_snapshots_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_document_files" ADD CONSTRAINT "project_document_files_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_documents" ADD CONSTRAINT "project_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_folder_template_items" ADD CONSTRAINT "project_folder_template_items_template_id_project_folder_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."project_folder_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_item_drawings" ADD CONSTRAINT "project_item_drawings_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_item_drawings" ADD CONSTRAINT "project_item_drawings_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_item_drawings" ADD CONSTRAINT "project_item_drawings_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_items" ADD CONSTRAINT "project_items_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_items" ADD CONSTRAINT "project_items_item_id_master_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_key_stages" ADD CONSTRAINT "project_key_stages_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_key_stages" ADD CONSTRAINT "project_key_stages_completed_by_users_id_fk" FOREIGN KEY ("completed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_phase_lead_id_users_id_fk" FOREIGN KEY ("phase_lead_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_phase_id_project_phases_id_fk" FOREIGN KEY ("phase_id") REFERENCES "public"."project_phases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_tasks" ADD CONSTRAINT "project_tasks_deliverable_id_deliverables_id_fk" FOREIGN KEY ("deliverable_id") REFERENCES "public"."deliverables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_id_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_source_offer_id_offers_id_fk" FOREIGN KEY ("source_offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_cost_lock_submitted_by_users_id_fk" FOREIGN KEY ("cost_lock_submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_cost_lock_reviewed_by_users_id_fk" FOREIGN KEY ("cost_lock_reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pt_state_config" ADD CONSTRAINT "pt_state_config_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_documents" ADD CONSTRAINT "purchase_order_documents_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_documents" ADD CONSTRAINT "purchase_order_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_history" ADD CONSTRAINT "purchase_order_history_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_history" ADD CONSTRAINT "purchase_order_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_purchase_order_id_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_item_id_master_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_items" ADD CONSTRAINT "purchase_order_items_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qap_templates" ADD CONSTRAINT "qap_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qap_versions" ADD CONSTRAINT "qap_versions_qap_id_generated_qaps_id_fk" FOREIGN KEY ("qap_id") REFERENCES "public"."generated_qaps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qap_versions" ADD CONSTRAINT "qap_versions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qms_document_audit_log" ADD CONSTRAINT "qms_document_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qms_document_revisions" ADD CONSTRAINT "qms_document_revisions_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "qms_document_revisions" ADD CONSTRAINT "qms_document_revisions_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_checklists" ADD CONSTRAINT "quality_checklists_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_checklists" ADD CONSTRAINT "quality_checklists_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_checklists" ADD CONSTRAINT "quality_checklists_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_planning_records" ADD CONSTRAINT "quality_planning_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_planning_records" ADD CONSTRAINT "quality_planning_records_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_planning_records" ADD CONSTRAINT "quality_planning_records_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_planning_records" ADD CONSTRAINT "quality_planning_records_procurement_exec_id_procurement_execution_records_id_fk" FOREIGN KEY ("procurement_exec_id") REFERENCES "public"."procurement_execution_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_planning_records" ADD CONSTRAINT "quality_planning_records_production_exec_id_production_execution_records_id_fk" FOREIGN KEY ("production_exec_id") REFERENCES "public"."production_execution_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_planning_records" ADD CONSTRAINT "quality_planning_records_planning_record_id_item_planning_records_id_fk" FOREIGN KEY ("planning_record_id") REFERENCES "public"."item_planning_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_planning_records" ADD CONSTRAINT "quality_planning_records_prepared_by_users_id_fk" FOREIGN KEY ("prepared_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_planning_records" ADD CONSTRAINT "quality_planning_records_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_planning_records" ADD CONSTRAINT "quality_planning_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quality_planning_records" ADD CONSTRAINT "quality_planning_records_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_pdf_artifacts" ADD CONSTRAINT "quotation_pdf_artifacts_offer_id_offers_id_fk" FOREIGN KEY ("offer_id") REFERENCES "public"."offers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_pdf_artifacts" ADD CONSTRAINT "quotation_pdf_artifacts_epc_attachment_id_epc_document_attachments_id_fk" FOREIGN KEY ("epc_attachment_id") REFERENCES "public"."epc_document_attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_pdf_artifacts" ADD CONSTRAINT "quotation_pdf_artifacts_archive_revision_id_offer_archive_revisions_id_fk" FOREIGN KEY ("archive_revision_id") REFERENCES "public"."offer_archive_revisions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotation_pdf_artifacts" ADD CONSTRAINT "quotation_pdf_artifacts_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reauth_audit_log" ADD CONSTRAINT "reauth_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_patterns" ADD CONSTRAINT "recurring_patterns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_patterns" ADD CONSTRAINT "recurring_patterns_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_patterns" ADD CONSTRAINT "recurring_patterns_template_assigned_to_users_id_fk" FOREIGN KEY ("template_assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_tasks" ADD CONSTRAINT "recurring_tasks_recurring_pattern_id_recurring_patterns_id_fk" FOREIGN KEY ("recurring_pattern_id") REFERENCES "public"."recurring_patterns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolved_project_folders" ADD CONSTRAINT "resolved_project_folders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolved_project_folders" ADD CONSTRAINT "resolved_project_folders_folder_template_id_folder_templates_id_fk" FOREIGN KEY ("folder_template_id") REFERENCES "public"."folder_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resolved_project_folders" ADD CONSTRAINT "resolved_project_folders_folder_node_id_folder_template_nodes_id_fk" FOREIGN KEY ("folder_node_id") REFERENCES "public"."folder_template_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resource_assignments" ADD CONSTRAINT "resource_assignments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_review_id_design_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."design_reviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_assigned_to_id_users_id_fk" FOREIGN KEY ("assigned_to_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_verified_by_id_users_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "roi_project_steps" ADD CONSTRAINT "roi_project_steps_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_increment_audit_log" ADD CONSTRAINT "salary_increment_audit_log_proposal_id_salary_increment_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."salary_increment_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_increment_proposals" ADD CONSTRAINT "salary_increment_proposals_employee_salary_id_employee_salaries_id_fk" FOREIGN KEY ("employee_salary_id") REFERENCES "public"."employee_salaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_increment_proposals" ADD CONSTRAINT "salary_increment_proposals_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_increment_proposals" ADD CONSTRAINT "salary_increment_proposals_proposed_by_users_id_fk" FOREIGN KEY ("proposed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_increment_proposals" ADD CONSTRAINT "salary_increment_proposals_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_increment_proposals" ADD CONSTRAINT "salary_increment_proposals_rejected_by_users_id_fk" FOREIGN KEY ("rejected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_increment_proposals" ADD CONSTRAINT "salary_increment_proposals_applied_by_users_id_fk" FOREIGN KEY ("applied_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_increment_proposals" ADD CONSTRAINT "salary_increment_proposals_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sap_wht_sync_log" ADD CONSTRAINT "sap_wht_sync_log_synced_by_users_id_fk" FOREIGN KEY ("synced_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schengen_alerts" ADD CONSTRAINT "schengen_alerts_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schengen_alerts" ADD CONSTRAINT "schengen_alerts_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schengen_travel_log" ADD CONSTRAINT "schengen_travel_log_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schengen_travel_log" ADD CONSTRAINT "schengen_travel_log_business_trip_id_business_trips_id_fk" FOREIGN KEY ("business_trip_id") REFERENCES "public"."business_trips"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schengen_travel_log" ADD CONSTRAINT "schengen_travel_log_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sensitive_action_policies" ADD CONSTRAINT "sensitive_action_policies_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_activities" ADD CONSTRAINT "service_activities_service_request_id_service_requests_id_fk" FOREIGN KEY ("service_request_id") REFERENCES "public"."service_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_activities" ADD CONSTRAINT "service_activities_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_contracts" ADD CONSTRAINT "service_contracts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_parts" ADD CONSTRAINT "service_parts_service_activity_id_service_activities_id_fk" FOREIGN KEY ("service_activity_id") REFERENCES "public"."service_activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_parts" ADD CONSTRAINT "service_parts_item_id_master_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_requests" ADD CONSTRAINT "service_requests_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statutory_challan_details" ADD CONSTRAINT "statutory_challan_details_challan_id_statutory_challans_id_fk" FOREIGN KEY ("challan_id") REFERENCES "public"."statutory_challans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statutory_challan_details" ADD CONSTRAINT "statutory_challan_details_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statutory_challan_details" ADD CONSTRAINT "statutory_challan_details_payroll_record_id_payroll_records_id_fk" FOREIGN KEY ("payroll_record_id") REFERENCES "public"."payroll_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statutory_challans" ADD CONSTRAINT "statutory_challans_payroll_period_id_payroll_periods_id_fk" FOREIGN KEY ("payroll_period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statutory_challans" ADD CONSTRAINT "statutory_challans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statutory_challans" ADD CONSTRAINT "statutory_challans_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statutory_filing_status" ADD CONSTRAINT "statutory_filing_status_filed_by_users_id_fk" FOREIGN KEY ("filed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tag_no_audit_log" ADD CONSTRAINT "tag_no_audit_log_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tank_prices" ADD CONSTRAINT "tank_prices_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tank_prices" ADD CONSTRAINT "tank_prices_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_history" ADD CONSTRAINT "task_history_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_history" ADD CONSTRAINT "task_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tds_compliance_register" ADD CONSTRAINT "tds_compliance_register_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tds_compliance_register" ADD CONSTRAINT "tds_compliance_register_payroll_record_id_payroll_records_id_fk" FOREIGN KEY ("payroll_record_id") REFERENCES "public"."payroll_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tds_compliance_register" ADD CONSTRAINT "tds_compliance_register_challan_id_statutory_challans_id_fk" FOREIGN KEY ("challan_id") REFERENCES "public"."statutory_challans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tds_monthly_records" ADD CONSTRAINT "tds_monthly_records_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tds_monthly_records" ADD CONSTRAINT "tds_monthly_records_period_id_payroll_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tds_payroll_sap_reconciliation" ADD CONSTRAINT "tds_payroll_sap_reconciliation_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tds_payroll_sap_reconciliation" ADD CONSTRAINT "tds_payroll_sap_reconciliation_period_id_payroll_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tds_payroll_sap_reconciliation" ADD CONSTRAINT "tds_payroll_sap_reconciliation_payroll_record_id_payroll_records_id_fk" FOREIGN KEY ("payroll_record_id") REFERENCES "public"."payroll_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_leader_config" ADD CONSTRAINT "team_leader_config_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_procedures" ADD CONSTRAINT "test_procedures_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_procedures" ADD CONSTRAINT "test_procedures_revision_of_test_procedures_id_fk" FOREIGN KEY ("revision_of") REFERENCES "public"."test_procedures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_procedures" ADD CONSTRAINT "test_procedures_superseded_by_users_id_fk" FOREIGN KEY ("superseded_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_procedures" ADD CONSTRAINT "test_procedures_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_procedures" ADD CONSTRAINT "test_procedures_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_approvals" ADD CONSTRAINT "trip_approvals_trip_id_business_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."business_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_approvals" ADD CONSTRAINT "trip_approvals_approver_id_users_id_fk" FOREIGN KEY ("approver_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_bookings" ADD CONSTRAINT "trip_bookings_trip_id_business_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."business_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_bookings" ADD CONSTRAINT "trip_bookings_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_documents" ADD CONSTRAINT "trip_documents_trip_id_business_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."business_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_documents" ADD CONSTRAINT "trip_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_trip_id_business_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."business_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_expenses" ADD CONSTRAINT "trip_expenses_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_reimbursements" ADD CONSTRAINT "trip_reimbursements_trip_id_business_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."business_trips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trip_reimbursements" ADD CONSTRAINT "trip_reimbursements_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_device_audit_log" ADD CONSTRAINT "trusted_device_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_device_audit_log" ADD CONSTRAINT "trusted_device_audit_log_device_id_trusted_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."trusted_devices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_device_audit_log" ADD CONSTRAINT "trusted_device_audit_log_performed_by_users_id_fk" FOREIGN KEY ("performed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_registered_by_users_id_fk" FOREIGN KEY ("registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_revoked_by_users_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_fa_global_policy" ADD CONSTRAINT "two_fa_global_policy_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_fa_policy_audit_log" ADD CONSTRAINT "two_fa_policy_audit_log_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "two_factor_audit_log" ADD CONSTRAINT "two_factor_audit_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_activity_logs" ADD CONSTRAINT "user_activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_compliance_metrics" ADD CONSTRAINT "user_compliance_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_module_stats" ADD CONSTRAINT "user_module_stats_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_productivity_metrics" ADD CONSTRAINT "user_productivity_metrics_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_session_registry" ADD CONSTRAINT "user_session_registry_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_work_location_id_work_locations_id_fk" FOREIGN KEY ("work_location_id") REFERENCES "public"."work_locations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_subgroup_qualification" ADD CONSTRAINT "vendor_subgroup_qualification_vendor_id_vendors_id_fk" FOREIGN KEY ("vendor_id") REFERENCES "public"."vendors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_subgroup_qualification" ADD CONSTRAINT "vendor_subgroup_qualification_qualified_by_users_id_fk" FOREIGN KEY ("qualified_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_subgroup_qualification" ADD CONSTRAINT "vendor_subgroup_qualification_last_reviewed_by_users_id_fk" FOREIGN KEY ("last_reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendor_subgroup_qualification" ADD CONSTRAINT "vendor_subgroup_qualification_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_alerts" ADD CONSTRAINT "visa_alerts_visa_record_id_visa_records_id_fk" FOREIGN KEY ("visa_record_id") REFERENCES "public"."visa_records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_records" ADD CONSTRAINT "visa_records_employee_id_users_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visa_records" ADD CONSTRAINT "visa_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welder_certificates" ADD CONSTRAINT "welder_certificates_welder_id_welders_id_fk" FOREIGN KEY ("welder_id") REFERENCES "public"."welders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "welder_certificates" ADD CONSTRAINT "welder_certificates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_crew_slot_history" ADD CONSTRAINT "wo_crew_slot_history_changed_by_users_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_crew_slots" ADD CONSTRAINT "wo_crew_slots_epc_work_order_id_epc_work_orders_id_fk" FOREIGN KEY ("epc_work_order_id") REFERENCES "public"."epc_work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_crew_slots" ADD CONSTRAINT "wo_crew_slots_crew_member_id_crew_members_id_fk" FOREIGN KEY ("crew_member_id") REFERENCES "public"."crew_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_crew_slots" ADD CONSTRAINT "wo_crew_slots_added_by_users_id_fk" FOREIGN KEY ("added_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_daily_logs" ADD CONSTRAINT "wo_daily_logs_epc_work_order_id_epc_work_orders_id_fk" FOREIGN KEY ("epc_work_order_id") REFERENCES "public"."epc_work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_daily_logs" ADD CONSTRAINT "wo_daily_logs_reported_by_users_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_daily_logs" ADD CONSTRAINT "wo_daily_logs_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_hold_records" ADD CONSTRAINT "wo_hold_records_epc_work_order_id_epc_work_orders_id_fk" FOREIGN KEY ("epc_work_order_id") REFERENCES "public"."epc_work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_hold_records" ADD CONSTRAINT "wo_hold_records_held_by_users_id_fk" FOREIGN KEY ("held_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_hold_records" ADD CONSTRAINT "wo_hold_records_resolved_by_users_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_preparation_records" ADD CONSTRAINT "wo_preparation_records_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_preparation_records" ADD CONSTRAINT "wo_preparation_records_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_preparation_records" ADD CONSTRAINT "wo_preparation_records_planning_record_id_item_planning_records_id_fk" FOREIGN KEY ("planning_record_id") REFERENCES "public"."item_planning_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_preparation_records" ADD CONSTRAINT "wo_preparation_records_execution_record_id_production_execution_records_id_fk" FOREIGN KEY ("execution_record_id") REFERENCES "public"."production_execution_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_preparation_records" ADD CONSTRAINT "wo_preparation_records_quality_plan_id_quality_planning_records_id_fk" FOREIGN KEY ("quality_plan_id") REFERENCES "public"."quality_planning_records"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_preparation_records" ADD CONSTRAINT "wo_preparation_records_master_item_id_master_items_id_fk" FOREIGN KEY ("master_item_id") REFERENCES "public"."master_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_preparation_records" ADD CONSTRAINT "wo_preparation_records_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_preparation_records" ADD CONSTRAINT "wo_preparation_records_ready_by_users_id_fk" FOREIGN KEY ("ready_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_preparation_records" ADD CONSTRAINT "wo_preparation_records_cancelled_by_users_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_preparation_records" ADD CONSTRAINT "wo_preparation_records_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_preparation_records" ADD CONSTRAINT "wo_preparation_records_assigned_to_users_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_schedule" ADD CONSTRAINT "wo_schedule_epc_work_order_id_epc_work_orders_id_fk" FOREIGN KEY ("epc_work_order_id") REFERENCES "public"."epc_work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_schedule" ADD CONSTRAINT "wo_schedule_schedule_set_by_users_id_fk" FOREIGN KEY ("schedule_set_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_schedule" ADD CONSTRAINT "wo_schedule_actual_start_recorded_by_users_id_fk" FOREIGN KEY ("actual_start_recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wo_schedule" ADD CONSTRAINT "wo_schedule_actual_end_recorded_by_users_id_fk" FOREIGN KEY ("actual_end_recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_history" ADD CONSTRAINT "work_order_history_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_history" ADD CONSTRAINT "work_order_history_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_order_items" ADD CONSTRAINT "work_order_items_project_item_id_project_items_id_fk" FOREIGN KEY ("project_item_id") REFERENCES "public"."project_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_supervisor_id_users_id_fk" FOREIGN KEY ("supervisor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_recommendations" ADD CONSTRAINT "workflow_recommendations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workweek_calendar_overrides" ADD CONSTRAINT "workweek_calendar_overrides_workweek_policy_id_workweek_policies_id_fk" FOREIGN KEY ("workweek_policy_id") REFERENCES "public"."workweek_policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workweek_calendar_overrides" ADD CONSTRAINT "workweek_calendar_overrides_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workweek_policies" ADD CONSTRAINT "workweek_policies_location_id_work_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."work_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workweek_policies" ADD CONSTRAINT "workweek_policies_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wpqr_documents" ADD CONSTRAINT "wpqr_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wpqr_welders" ADD CONSTRAINT "wpqr_welders_wpqr_document_id_wpqr_documents_id_fk" FOREIGN KEY ("wpqr_document_id") REFERENCES "public"."wpqr_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wpqr_welders" ADD CONSTRAINT "wpqr_welders_welder_id_welders_id_fk" FOREIGN KEY ("welder_id") REFERENCES "public"."welders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wpqr_welders" ADD CONSTRAINT "wpqr_welders_linked_by_users_id_fk" FOREIGN KEY ("linked_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wps_documents" ADD CONSTRAINT "wps_documents_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wps_documents" ADD CONSTRAINT "wps_documents_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_attendance_user_date" ON "attendance_records" USING btree ("user_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "buy_package_headers_product_version_unique" ON "buy_package_headers" USING btree ("product_id","version");--> statement-breakpoint
CREATE UNIQUE INDEX "buy_package_headers_code_version_unique" ON "buy_package_headers" USING btree ("package_code","version");--> statement-breakpoint
CREATE UNIQUE INDEX "buy_subgroups_group_code_unique" ON "buy_subgroups" USING btree ("buy_group_id","code");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_dept_master_name_ci" ON "department_master" USING btree (LOWER("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_dept_master_code" ON "department_master" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_dept_master_active" ON "department_master" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX "ds_approvals_revision_at_idx" ON "design_software_approvals" USING btree ("revision_id","performed_at");--> statement-breakpoint
CREATE INDEX "ds_assumptions_revision_id_idx" ON "design_software_assumptions" USING btree ("revision_id");--> statement-breakpoint
CREATE INDEX "ds_calc_runs_revision_at_idx" ON "design_software_calculation_runs" USING btree ("revision_id","calculated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ds_designs_module_number_uniq" ON "design_software_designs" USING btree ("module_type","design_number");--> statement-breakpoint
CREATE INDEX "ds_designs_project_id_idx" ON "design_software_designs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "ds_designs_linked_project_id_idx" ON "design_software_designs" USING btree ("linked_project_id");--> statement-breakpoint
CREATE INDEX "ds_designs_module_status_idx" ON "design_software_designs" USING btree ("module_type","current_status");--> statement-breakpoint
CREATE INDEX "ds_designs_created_by_idx" ON "design_software_designs" USING btree ("created_by");--> statement-breakpoint
CREATE UNIQUE INDEX "ds_inputs_revision_section_uniq" ON "design_software_inputs" USING btree ("revision_id","section");--> statement-breakpoint
CREATE INDEX "ds_inputs_revision_id_idx" ON "design_software_inputs" USING btree ("revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "dsn_seq_module_scope_uniq" ON "design_software_number_sequences" USING btree ("module_type","scope_key");--> statement-breakpoint
CREATE UNIQUE INDEX "ds_results_revision_section_uniq" ON "design_software_results" USING btree ("revision_id","section");--> statement-breakpoint
CREATE INDEX "ds_results_revision_id_idx" ON "design_software_results" USING btree ("revision_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ds_revisions_design_rev_uniq" ON "design_software_revisions" USING btree ("design_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "ds_revisions_one_current_uniq" ON "design_software_revisions" USING btree ("design_id") WHERE is_current = true;--> statement-breakpoint
CREATE INDEX "ds_revisions_design_rev_idx" ON "design_software_revisions" USING btree ("design_id","revision_number");--> statement-breakpoint
CREATE UNIQUE INDEX "emp_tax_decl_user_fy" ON "employee_tax_declarations" USING btree ("user_id","financial_year");--> statement-breakpoint
CREATE UNIQUE INDEX "gcs_rule_versions_one_active" ON "gcs_governance_rule_versions" USING btree ("rule_id") WHERE status = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "gcs_rule_versions_rule_ver_num" ON "gcs_governance_rule_versions" USING btree ("rule_id","version_number");--> statement-breakpoint
CREATE UNIQUE INDEX "gl_component_context_uniq" ON "gl_account_mappings" USING btree ("component_code","posting_context","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_at_study_num" ON "hazop_alarm_trips" USING btree ("study_id","alarm_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_ba_artefact_rev" ON "hazop_baseline_approvals" USING btree ("artefact_type","artefact_id","baseline_revision");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_ce_cell" ON "hazop_ce_cells" USING btree ("cause_id","effect_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_cec_mat_col" ON "hazop_ce_columns" USING btree ("matrix_id","col_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_cem_study_num" ON "hazop_ce_matrices" USING btree ("study_id","matrix_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_cer_mat_row" ON "hazop_ce_rows" USING btree ("matrix_id","row_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_concept_eq_tag" ON "hazop_concept_equipment" USING btree ("study_id","concept_tag");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_concept_inst_tag" ON "hazop_concept_instruments" USING btree ("study_id","concept_tag");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_lib_cat_gp" ON "hazop_deviation_library" USING btree ("equipment_category","guideword","parameter");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_dev_node_gp" ON "hazop_deviations" USING btree ("node_id","guideword","parameter");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_egm_group_dev" ON "hazop_event_group_members" USING btree ("group_id","deviation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_eg_study_num" ON "hazop_event_groups" USING btree ("study_id","group_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_ila_il_seq" ON "hazop_interlock_actions" USING btree ("interlock_id","sequence_no");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_il_study_num" ON "hazop_interlocks" USING btree ("study_id","interlock_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_lopa_study_num" ON "hazop_lopa_records" USING btree ("study_id","lopa_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_lopa_scenario" ON "hazop_lopa_records" USING btree ("scenario_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_moc_study_num" ON "hazop_moc_records" USING btree ("study_id","moc_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_node_loop_num" ON "hazop_nodes" USING btree ("loop_id","node_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_step_node_seq" ON "hazop_process_steps" USING btree ("node_id","sequence_no");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_rga_rg_seq" ON "hazop_response_group_actions" USING btree ("response_group_id","sequence_no");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_rg_study_num" ON "hazop_response_groups" USING btree ("study_id","group_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_sce_study_num" ON "hazop_safety_critical_elements" USING btree ("study_id","sce_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_sf_study_sif" ON "hazop_safety_functions" USING btree ("study_id","sif_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_ipl_scenario_pos" ON "hazop_scenario_ipl_stack" USING btree ("scenario_id","stack_position");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_sc_study_num" ON "hazop_scenarios" USING btree ("study_id","scenario_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_srs_study_num" ON "hazop_srs_records" USING btree ("study_id","srs_number");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_hazop_srs_sif" ON "hazop_srs_records" USING btree ("safety_function_id");--> statement-breakpoint
CREATE INDEX "idx_hazop_studies_mode" ON "hazop_studies" USING btree ("study_mode");--> statement-breakpoint
CREATE INDEX "idx_hazop_studies_project" ON "hazop_studies" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_hazop_studies_status" ON "hazop_studies" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "icr_type_scope_key_unique" ON "item_code_registry" USING btree ("registry_type","scope_group","scope_subgroup","entity_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_occ_source_project" ON "offer_comm_doc_conversions" USING btree ("source_doc_id","project_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_occ_dest_gcs_path" ON "offer_comm_doc_conversions" USING btree ("dest_gcs_path");--> statement-breakpoint
CREATE INDEX "idx_oi_audit_issue_id" ON "oi_audit_log" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_oi_audit_actor_id" ON "oi_audit_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "idx_oi_audit_created_at" ON "oi_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_oi_audit_action" ON "oi_audit_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_oi_escalations_issue_id" ON "oi_escalations" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_oi_escalations_type" ON "oi_escalations" USING btree ("escalation_type");--> statement-breakpoint
CREATE INDEX "idx_oi_att_issue_id" ON "oi_issue_attachments" USING btree ("issue_id");--> statement-breakpoint
CREATE INDEX "idx_oi_issues_status" ON "oi_issues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_oi_issues_severity" ON "oi_issues" USING btree ("severity");--> statement-breakpoint
CREATE INDEX "idx_oi_issues_category" ON "oi_issues" USING btree ("category");--> statement-breakpoint
CREATE INDEX "idx_oi_issues_reported_by" ON "oi_issues" USING btree ("reported_by");--> statement-breakpoint
CREATE INDEX "idx_oi_issues_assigned_to" ON "oi_issues" USING btree ("assigned_to");--> statement-breakpoint
CREATE INDEX "idx_oi_issues_project_id" ON "oi_issues" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "idx_oi_issues_created_at" ON "oi_issues" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_oi_issues_severity_status" ON "oi_issues" USING btree ("severity","status");--> statement-breakpoint
CREATE INDEX "idx_oi_issues_status_severity_created" ON "oi_issues" USING btree ("status","severity","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_oi_risk_matrix_prob_impact" ON "oi_risk_matrix_config" USING btree ("probability","impact");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_att_snap_period_run_user" ON "payroll_attendance_snapshot" USING btree ("period_id","run_number","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_autocover_run_user_type" ON "payroll_leave_autocover" USING btree ("period_id","run_number","user_id","leave_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_sal_snap_period_run_user" ON "payroll_salary_snapshot" USING btree ("period_id","run_number","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_attr_type_null_parent_code" ON "product_attribute_options" USING btree ("attribute_type","code") WHERE parent_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_attr_type_parent_code" ON "product_attribute_options" USING btree ("attribute_type","parent_id","code") WHERE parent_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "statutory_filing_uniq" ON "statutory_filing_status" USING btree ("module_type","financial_year","filing_period","state","company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tds_monthly_user_period" ON "tds_monthly_records" USING btree ("user_id","period_id");--> statement-breakpoint
CREATE UNIQUE INDEX "vsq_vendor_subgroup_unique" ON "vendor_subgroup_qualification" USING btree ("vendor_id","subgroup_code");