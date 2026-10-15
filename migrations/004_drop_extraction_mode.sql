-- Remove the unused extraction mode setting from folder configuration.
ALTER TABLE folder_config DROP COLUMN IF EXISTS extraction_mode;
