-- Migration: Create invitations and matches tables
-- Description: Tables for matchmaking (invitations) and active matches (matches)
-- Created: 2026-02-19

-- 1. INVITATIONS TABLE
CREATE TABLE IF NOT EXISTS public.invitations (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
    room_id text NOT NULL UNIQUE, -- Unique room identifier for the match
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    expires_at timestamptz DEFAULT (now() + interval '1 hour'), -- Auto-expire after 1 hour
    CONSTRAINT no_self_invite CHECK (sender_id != receiver_id)
);

-- Indexes for invitations
CREATE INDEX IF NOT EXISTS idx_invitations_receiver ON public.invitations(receiver_id, status);
CREATE INDEX IF NOT EXISTS idx_invitations_sender ON public.invitations(sender_id, status);
CREATE INDEX IF NOT EXISTS idx_invitations_room ON public.invitations(room_id);
CREATE INDEX IF NOT EXISTS idx_invitations_status ON public.invitations(status, created_at);

-- 2. MATCHES TABLE (for active matches and match history)
CREATE TABLE IF NOT EXISTS public.matches (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    room_id text NOT NULL UNIQUE, -- Links to invitations.room_id
    player_white uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    player_black uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    current_turn text CHECK (current_turn IN ('white', 'black')),
    status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'active', 'finished', 'abandoned')),
    
    -- Game state (for persistence/reconnection)
    board_state jsonb, -- Legacy field, prefer state
    state jsonb, -- Current game state (GameState type)
    cube_value int DEFAULT 1 CHECK (cube_value IN (1, 2, 4, 8, 16, 32, 64)),
    cube_owner text CHECK (cube_owner IN ('white', 'black')),
    
    -- Match result
    winner_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
    winner_color text CHECK (winner_color IN ('white', 'black')),
    final_score int DEFAULT 0,
    win_method text CHECK (win_method IN ('normal', 'gammon', 'backgammon')),
    
    -- Metadata
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    finished_at timestamptz,
    
    -- Tournament link (optional)
    tournament_id uuid REFERENCES public.tournaments(id) ON DELETE SET NULL
);

-- Indexes for matches
CREATE INDEX IF NOT EXISTS idx_matches_room ON public.matches(room_id);
CREATE INDEX IF NOT EXISTS idx_matches_players ON public.matches(player_white, player_black);
CREATE INDEX IF NOT EXISTS idx_matches_status ON public.matches(status, created_at);
CREATE INDEX IF NOT EXISTS idx_matches_tournament ON public.matches(tournament_id) WHERE tournament_id IS NOT NULL;

-- 3. RLS POLICIES FOR INVITATIONS

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

-- Users can view invitations they sent or received
DROP POLICY IF EXISTS "Users can view own invitations" ON public.invitations;
CREATE POLICY "Users can view own invitations"
    ON public.invitations FOR SELECT
    TO authenticated
    USING (sender_id = auth.uid() OR receiver_id = auth.uid());

-- Users can create invitations (as sender)
DROP POLICY IF EXISTS "Users can create invitations" ON public.invitations;
CREATE POLICY "Users can create invitations"
    ON public.invitations FOR INSERT
    TO authenticated
    WITH CHECK (sender_id = auth.uid());

-- Users can update invitations they received (accept/reject)
DROP POLICY IF EXISTS "Users can update received invitations" ON public.invitations;
CREATE POLICY "Users can update received invitations"
    ON public.invitations FOR UPDATE
    TO authenticated
    USING (receiver_id = auth.uid())
    WITH CHECK (receiver_id = auth.uid());

-- Admins can view all invitations
DROP POLICY IF EXISTS "Admins can view all invitations" ON public.invitations;
CREATE POLICY "Admins can view all invitations"
    ON public.invitations FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 4. RLS POLICIES FOR MATCHES

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- Users can view matches they are part of
DROP POLICY IF EXISTS "Users can view own matches" ON public.matches;
CREATE POLICY "Users can view own matches"
    ON public.matches FOR SELECT
    TO authenticated
    USING (player_white = auth.uid() OR player_black = auth.uid());

-- Users can create matches (when accepting invitation)
DROP POLICY IF EXISTS "Users can create matches" ON public.matches;
CREATE POLICY "Users can create matches"
    ON public.matches FOR INSERT
    TO authenticated
    WITH CHECK (player_white = auth.uid() OR player_black = auth.uid());

-- Users can update matches they are part of
DROP POLICY IF EXISTS "Users can update own matches" ON public.matches;
CREATE POLICY "Users can update own matches"
    ON public.matches FOR UPDATE
    TO authenticated
    USING (player_white = auth.uid() OR player_black = auth.uid())
    WITH CHECK (player_white = auth.uid() OR player_black = auth.uid());

-- Admins can view all matches
DROP POLICY IF EXISTS "Admins can view all matches" ON public.matches;
CREATE POLICY "Admins can view all matches"
    ON public.matches FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE id = auth.uid() AND role = 'admin'
        )
    );

-- 5. TRIGGER: Auto-create match when invitation is accepted
CREATE OR REPLACE FUNCTION public.handle_invitation_accepted()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create match if status changed to 'accepted'
    IF NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted') THEN
        INSERT INTO public.matches (
            room_id,
            player_white,
            player_black,
            status,
            cube_value,
            cube_owner
        ) VALUES (
            NEW.room_id,
            NEW.sender_id,  -- sender = white (as per game logic)
            NEW.receiver_id, -- receiver = black
            'active',
            1,
            NULL
        )
        ON CONFLICT (room_id) DO NOTHING; -- Prevent duplicates
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trigger_invitation_accepted ON public.invitations;
CREATE TRIGGER trigger_invitation_accepted
    AFTER UPDATE ON public.invitations
    FOR EACH ROW
    WHEN (NEW.status = 'accepted' AND (OLD.status IS NULL OR OLD.status != 'accepted'))
    EXECUTE FUNCTION public.handle_invitation_accepted();

-- 6. FUNCTION: Clean up expired invitations (can be called by cron or manually)
CREATE OR REPLACE FUNCTION public.cleanup_expired_invitations()
RETURNS int AS $$
DECLARE
    deleted_count int;
BEGIN
    UPDATE public.invitations
    SET status = 'expired'
    WHERE status = 'pending' AND expires_at < now();
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. UPDATE TRIGGER for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_invitations_updated_at ON public.invitations;
CREATE TRIGGER update_invitations_updated_at
    BEFORE UPDATE ON public.invitations
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_matches_updated_at ON public.matches;
CREATE TRIGGER update_matches_updated_at
    BEFORE UPDATE ON public.matches
    FOR EACH ROW
    EXECUTE FUNCTION public.update_updated_at_column();
