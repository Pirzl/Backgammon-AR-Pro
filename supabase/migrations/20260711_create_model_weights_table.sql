-- Migration: Create model_weights table for NN self-play training persistence
-- Allows the AI to save/load trained neural network weights from Supabase
-- so training progress survives page reloads.

CREATE TABLE IF NOT EXISTS model_weights (
  id TEXT PRIMARY KEY,                     -- always 'current' for the latest checkpoint
  weights JSONB NOT NULL,                  -- serialized NN weights (shapes + data arrays)
  trained_count INTEGER DEFAULT 0,         -- number of positions trained on
  total_updates INTEGER DEFAULT 0,         -- total weight update count
  games_played INTEGER DEFAULT 0,          -- self-play games completed
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Row-level security: allow all authenticated users to read/write model weights.
-- The model is shared across all users (single global AI).
ALTER TABLE model_weights ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read model weights"
  ON model_weights FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can update model weights"
  ON model_weights FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can upsert model weights"
  ON model_weights FOR UPDATE
  USING (auth.role() = 'authenticated');
