-- Add level column to conversations table.
-- Level is determined by the configured support folder for each application
-- (e.g. SOPORTE BASICO = level 1, SOPORTE AVANZADO = level 2).

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS level INTEGER;
