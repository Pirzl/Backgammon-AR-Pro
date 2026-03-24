-- Drop existing table if it exists (to ensure clean state)
DROP TABLE IF EXISTS app_settings CASCADE;

-- Create app_settings table for global application settings
CREATE TABLE app_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  games JSONB NOT NULL,
  maintenance_mode BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row CHECK (id = 1)
);

-- Insert default row
INSERT INTO app_settings (id, games, maintenance_mode) 
VALUES (
  1, 
  '[{"id": "ai", "name": "Play against the AI", "isActive": true}, {"id": "human", "name": "Play against humans", "isActive": true}]'::jsonb,
  false
);

-- Enable RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- Everyone can read settings (including anonymous)
CREATE POLICY "Anyone can read app settings"
  ON app_settings FOR SELECT
  TO public
  USING (true);

-- Only admins can update settings
CREATE POLICY "Only admins can update app settings"
  ON app_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.role = 'admin'
    )
  );

-- Create function to auto-update timestamp
CREATE OR REPLACE FUNCTION update_app_settings_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER app_settings_updated_at
  BEFORE UPDATE ON app_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_app_settings_timestamp();
