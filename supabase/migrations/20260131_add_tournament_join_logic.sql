-- Migration: add_player_count_trigger
-- Purpose: Add trigger to auto-update tournament current_players count if not exists
-- Created: 2026-01-31

-- Create trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_tournament_player_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE tournaments 
    SET current_players = current_players + 1 
    WHERE id = NEW.tournament_id;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE tournaments 
    SET current_players = GREATEST(0, current_players - 1) 
    WHERE id = OLD.tournament_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists to ensure clean slate or avoid error if I simply try to create it
DROP TRIGGER IF EXISTS tournament_participant_count_trigger ON tournament_participants;

-- Create trigger
CREATE TRIGGER tournament_participant_count_trigger
AFTER INSERT OR DELETE ON tournament_participants
FOR EACH ROW EXECUTE FUNCTION update_tournament_player_count();
