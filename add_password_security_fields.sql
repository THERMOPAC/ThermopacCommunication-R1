-- Add password security enhancement fields to users table
-- This migration adds support for:
-- 1. Flag to force password updates
-- 2. Password history tracking (last 5 passwords)
-- 3. Last password change timestamp

ALTER TABLE users 
ADD COLUMN password_needs_update BOOLEAN DEFAULT FALSE,
ADD COLUMN password_history JSONB DEFAULT '[]'::jsonb,
ADD COLUMN last_password_change TIMESTAMP;

-- Set password_needs_update = true for all existing users to force password reset
UPDATE users SET password_needs_update = TRUE WHERE id IS NOT NULL;

-- Add index for performance on password_needs_update queries
CREATE INDEX idx_users_password_needs_update ON users(password_needs_update);

-- Comment explaining the password_history structure
COMMENT ON COLUMN users.password_history IS 'JSON array storing hashed passwords from last 5 password changes for security validation';