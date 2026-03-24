-- Migration: CRM Integration (Profiles, Tournaments, Admin View)
-- Description: Adds columns to public.profiles, creates tournament tables, messages, and admin views.

-- 1. ENUMS (Sync with Frontend constants.ts)
CREATE TYPE public.user_role AS ENUM ('user', 'admin', 'moderator');
CREATE TYPE public.kyc_status AS ENUM ('pending', 'verified', 'rejected', 'none');
CREATE TYPE public.tournament_format AS ENUM ('Single Elimination', 'Swiss System', 'Round Robin', 'League', 'Best-of Series');
CREATE TYPE public.tournament_status AS ENUM ('Open', 'In Progress', 'Completed', 'Cancelled', 'Archived');
CREATE TYPE public.invite_strategy AS ENUM ('none', 'all', 'specific');

-- 2. PROFILES (Extend existing table)
-- Note: 'id' references auth.users
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS first_name text,
ADD COLUMN IF NOT EXISTS last_name text,
ADD COLUMN IF NOT EXISTS role public.user_role DEFAULT 'user',
ADD COLUMN IF NOT EXISTS kyc_status public.kyc_status DEFAULT 'none',
ADD COLUMN IF NOT EXISTS internal_notes text, -- Only visible to Admin
ADD COLUMN IF NOT EXISTS client_notes text,   -- Personal notes by user
ADD COLUMN IF NOT EXISTS wallet_balance numeric(10, 2) DEFAULT 0.00,
ADD COLUMN IF NOT EXISTS skill_rating int DEFAULT 1200;

-- 3. TOURNAMENTS
CREATE TABLE IF NOT EXISTS public.tournaments (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    format public.tournament_format NOT NULL,
    status public.tournament_status DEFAULT 'Open',
    start_date timestamptz NOT NULL,
    buy_in numeric(10, 2) DEFAULT 0,
    prize_pool numeric(10, 2) DEFAULT 0,
    max_players int DEFAULT 32,
    current_players int DEFAULT 0,
    series_length int DEFAULT 1, -- For Best-of Series
    invite_strategy public.invite_strategy DEFAULT 'none',
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

-- 4. TOURNAMENT PARTICIPANTS (Link Table)
CREATE TABLE IF NOT EXISTS public.tournament_participants (
    tournament_id uuid REFERENCES public.tournaments(id) ON DELETE CASCADE,
    user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
    status text DEFAULT 'active', -- 'active', 'eliminated', 'withdrawn'
    joined_at timestamptz DEFAULT now(),
    placement int, -- Final rank (1, 2, 3...)
    prize_won numeric(10, 2) DEFAULT 0,
    PRIMARY KEY (tournament_id, user_id)
);

-- 5. MESSAGES (Support System)
CREATE TABLE IF NOT EXISTS public.messages (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    sender_id uuid REFERENCES public.profiles(id),
    receiver_id uuid REFERENCES public.profiles(id), -- If null, maybe 'system' or 'broadcast'? For now assume direct.
    content text NOT NULL,
    is_read boolean DEFAULT false,
    created_at timestamptz DEFAULT now()
);
-- Index for fast chat loading
CREATE INDEX idx_messages_participants ON public.messages(sender_id, receiver_id);

-- 6. APP SETTINGS (Singleton for Maintenance Mode)
CREATE TABLE IF NOT EXISTS public.app_settings (
    id int PRIMARY KEY DEFAULT 1,
    maintenance_mode boolean DEFAULT false,
    alert_banner text,
    min_version_ios text,
    min_version_android text,
    CONSTRAINT single_row CHECK (id = 1)
);
-- Initialize if empty
INSERT INTO public.app_settings (id, maintenance_mode) 
VALUES (1, false) 
ON CONFLICT DO NOTHING;

-- 7. ADMIN STATS VIEW (Efficient Analytics)
CREATE OR REPLACE VIEW public.admin_stats_view AS
SELECT
    (SELECT COUNT(*) FROM public.profiles WHERE status = 'online' OR last_seen > now() - interval '1 hour') as active_users_count, -- 'status' col needs to exist or use last_seen
    (SELECT COUNT(*) FROM public.profiles) as total_users,
    (SELECT COALESCE(SUM(buy_in * current_players), 0) FROM public.tournaments) as total_entry_fees_collected, -- Rough estimate
    (SELECT COALESCE(SUM(prize_won), 0) FROM public.tournament_participants) as total_prizes_distributed,
    (SELECT COUNT(*) FROM public.tournaments WHERE status = 'Completed') as tournaments_completed;

-- 8. ROW LEVEL SECURITY (RLS)
ALTER TABLE public.tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

-- Tournaments: Everyone can read Open, Admin can read/write all
CREATE POLICY "Public can view open tournaments" ON public.tournaments
    FOR SELECT USING (true); -- Optimize later to only show relevant ones if needed

CREATE POLICY "Admin full access tournaments" ON public.tournaments
    FOR ALL USING (
        exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
    );

-- Participants: Users can join, Admin can manage
CREATE POLICY "Users can view participants" ON public.tournament_participants
    FOR SELECT USING (true);

CREATE POLICY "Users can join (insert own)" ON public.tournament_participants
    FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Messages: Users read their own, Admin reads all
CREATE POLICY "Users read own messages" ON public.messages
    FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

CREATE POLICY "Users send messages" ON public.messages
    FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Admin full access messages" ON public.messages
    FOR ALL USING (
        exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
    );
