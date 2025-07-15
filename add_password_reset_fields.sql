-- Add password reset token fields to users table
-- This migration adds support for secure password reset functionality

ALTER TABLE users 
ADD COLUMN reset_token VARCHAR(255),
ADD COLUMN reset_token_expires_at TIMESTAMP;

-- Add index for performance on reset token queries
CREATE INDEX idx_users_reset_token ON users(reset_token);
CREATE INDEX idx_users_reset_token_expires_at ON users(reset_token_expires_at);

-- Comment explaining the reset token fields
COMMENT ON COLUMN users.reset_token IS 'Secure token for password reset, single-use and time-limited';
COMMENT ON COLUMN users.reset_token_expires_at IS 'Expiration timestamp for reset token, typically 15 minutes from generation';