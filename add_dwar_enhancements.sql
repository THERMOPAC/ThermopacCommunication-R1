-- Add enhanced DWAR fields for satisfaction ratings and blocking support

ALTER TABLE daily_work_reports 
ADD COLUMN IF NOT EXISTS satisfaction_rating INTEGER CHECK (satisfaction_rating >= 1 AND satisfaction_rating <= 5),
ADD COLUMN IF NOT EXISTS challenge_level INTEGER CHECK (challenge_level >= 1 AND challenge_level <= 5),
ADD COLUMN IF NOT EXISTS blocked_tasks INTEGER DEFAULT 0;

-- Update the activities JSONB structure to support new fields
-- The JSONB will now support: {type, description, timeSpent, plannedHours, priority, status, taskId, blockedReason}