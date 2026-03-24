-- Supabase SQL Script: game_history_analysis table setup

-- Create the table for storing game board snapshots and AI evaluations
CREATE TABLE public.game_history_analysis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    game_id UUID NOT NULL, -- references matches(id) or invitations(room_id) depending on your DB
    turn_number INTEGER NOT NULL,
    player_color TEXT CHECK (player_color IN ('white', 'black')) NOT NULL,
    board_snapshot JSONB NOT NULL,
    ai_evaluation TEXT,
    is_win_move BOOLEAN DEFAULT FALSE,
    tension_metric TEXT CHECK (tension_metric IN ('Low', 'Medium', 'Critical')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Optimization: Add index for faster querying of a game's history
CREATE INDEX idx_game_history_game_id ON public.game_history_analysis (game_id);

-- Optional Optimization: Add index for quickly finding winning moves across all games
CREATE INDEX idx_game_history_win_moves ON public.game_history_analysis (is_win_move) WHERE is_win_move = TRUE;

-- Enable Row Level Security
ALTER TABLE public.game_history_analysis ENABLE ROW LEVEL SECURITY;

-- Create policies (Adjust based on actual privacy requirements)
-- Assuming anyone authenticated can read, or restrict to matched players if needed.
-- For now, allowing read access to authenticated users to analyze games.
CREATE POLICY "Enable read access for authenticated users" 
    ON public.game_history_analysis FOR SELECT 
    TO authenticated 
    USING (true);

-- Allowing insert access (Usually from the edge function or secure client)
CREATE POLICY "Enable insert access for authenticated users" 
    ON public.game_history_analysis FOR INSERT 
    TO authenticated 
    WITH CHECK (true);

-- Adding comment to table
COMMENT ON TABLE public.game_history_analysis IS 'Stores snapshots of the board per turn for AI commentary and long-term memory analysis';
