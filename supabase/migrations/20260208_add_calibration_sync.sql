-- Add calibration sync tables for registered users
-- Stores hand tracking calibration data per device

CREATE TABLE IF NOT EXISTS user_hand_calibrations (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_fingerprint TEXT NOT NULL,
  device_name TEXT,
  calibration_data JSONB NOT NULL,
  quality_score TEXT CHECK (quality_score IN ('excellent', 'good', 'poor', 'unknown')),
  error_pixels NUMERIC(10, 2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW(),
  
  CONSTRAINT unique_user_device UNIQUE(user_id, device_fingerprint)
);

-- Alerts for new devices requiring calibration
CREATE TABLE IF NOT EXISTS user_device_alerts (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL CHECK (alert_type IN ('new_device_calibration_needed', 'calibration_quality_low')),
  device_fingerprint TEXT NOT NULL,
  device_name TEXT,
  message TEXT NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_calibrations_user_id ON user_hand_calibrations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_calibrations_device ON user_hand_calibrations(user_id, device_fingerprint);
CREATE INDEX IF NOT EXISTS idx_user_calibrations_last_used ON user_hand_calibrations(last_used_at DESC);
CREATE INDEX IF NOT EXISTS idx_device_alerts_user_id ON user_device_alerts(user_id, is_read);
CREATE INDEX IF NOT EXISTS idx_device_alerts_created ON user_device_alerts(created_at DESC);

-- Enable Row Level Security
ALTER TABLE user_hand_calibrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_device_alerts ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_hand_calibrations
DROP POLICY IF EXISTS "Users can read their own calibrations" ON user_hand_calibrations;
CREATE POLICY "Users can read their own calibrations"
  ON user_hand_calibrations FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own calibrations" ON user_hand_calibrations;
CREATE POLICY "Users can insert their own calibrations"
  ON user_hand_calibrations FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own calibrations" ON user_hand_calibrations;
CREATE POLICY "Users can update their own calibrations"
  ON user_hand_calibrations FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own calibrations" ON user_hand_calibrations;
CREATE POLICY "Users can delete their own calibrations"
  ON user_hand_calibrations FOR DELETE
  USING (auth.uid() = user_id);

-- RLS Policies for user_device_alerts
DROP POLICY IF EXISTS "Users can read their own alerts" ON user_device_alerts;
CREATE POLICY "Users can read their own alerts"
  ON user_device_alerts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can mark their alerts as read" ON user_device_alerts;
CREATE POLICY "Users can mark their alerts as read"
  ON user_device_alerts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Function to automatically create alert when user accesses from new device
CREATE OR REPLACE FUNCTION check_new_device_calibration()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if user has other devices and this is a new one
  IF NOT EXISTS (
    SELECT 1 FROM user_hand_calibrations
    WHERE user_id = NEW.user_id
    AND device_fingerprint != NEW.device_fingerprint
    LIMIT 1
  ) THEN
    -- First device, no alert needed
    RETURN NEW;
  END IF;
  
  -- Create alert for new device calibration
  INSERT INTO user_device_alerts (
    user_id,
    alert_type,
    device_fingerprint,
    device_name,
    message,
    is_read
  ) VALUES (
    NEW.user_id,
    'new_device_calibration_needed',
    NEW.device_fingerprint,
    NEW.device_name,
    'Nueva calibración guardada en ' || COALESCE(NEW.device_name, 'dispositivo desconocido') || '. Asegúrate de calibrar en cada dispositivo que uses.',
    FALSE
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create alerts on new device calibration
DROP TRIGGER IF EXISTS trigger_new_device_calibration ON user_hand_calibrations;
CREATE TRIGGER trigger_new_device_calibration
  AFTER INSERT ON user_hand_calibrations
  FOR EACH ROW
  EXECUTE FUNCTION check_new_device_calibration();

COMMENT ON TABLE user_hand_calibrations IS 'Stores hand tracking calibration data for each user device';
COMMENT ON TABLE user_device_alerts IS 'Alerts users when they use a new device that needs calibration';
COMMENT ON COLUMN user_hand_calibrations.device_fingerprint IS 'Unique fingerprint using FingerprintJS';
COMMENT ON COLUMN user_hand_calibrations.calibration_data IS 'JSONB containing version, corners, timestamp, quality, error';
