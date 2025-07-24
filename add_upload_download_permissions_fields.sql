-- Add canUpload and canDownload fields to module_permissions table
ALTER TABLE module_permissions 
ADD COLUMN can_upload BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN can_download BOOLEAN DEFAULT FALSE NOT NULL;

-- Add canUpload and canDownload fields to role_module_permissions table
ALTER TABLE role_module_permissions 
ADD COLUMN can_upload BOOLEAN DEFAULT FALSE NOT NULL,
ADD COLUMN can_download BOOLEAN DEFAULT FALSE NOT NULL;

-- Update existing permissions to have download access where view access exists
-- This provides a reasonable default for existing users
UPDATE module_permissions 
SET can_download = TRUE 
WHERE can_view = TRUE;

UPDATE role_module_permissions 
SET can_download = TRUE 
WHERE can_view = TRUE;