-- ============================================
-- WALLET & BETTING SYSTEM SETUP
-- ============================================

-- 1. Create wallets table
create table if not exists public.wallets (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  saldo_actual integer default 5000 not null,
  saldo_reservado integer default 0 not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security
alter table public.wallets enable row level security;

-- Policies for wallets
create policy "Users can view their own wallet." on public.wallets
  for select using (auth.uid() = user_id);

create policy "Users can insert their own wallet." on public.wallets
  for insert with check (auth.uid() = user_id);

create policy "Users can update own wallet." on public.wallets
  for update using (auth.uid() = user_id);

-- Index for faster lookups
create index if not exists wallets_user_id_idx on public.wallets(user_id);

-- 2. Create transactions table
create table if not exists public.transactions (
  id uuid default gen_random_uuid() primary key,
  tx_id text default 'TX-' || gen_random_uuid()::text unique not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  match_id uuid references public.matches(id) on delete set null,
  tipo text not null check (tipo in ('deposit', 'withdrawal', 'win', 'loss', 'stake_reserve', 'stake_release', 'bonus')),
  amount integer not null,
  saldo_anterior integer not null,
  saldo_nuevo integer not null,
  description text,
  synced_to_crm boolean default false,
  crm_sync_timestamp timestamp with time zone,
  timestamp timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable Row Level Security for transactions
alter table public.transactions enable row level security;

create policy "Users can view their own transactions." on public.transactions
  for select using (auth.uid() = user_id);

create policy "Users can insert their own transactions." on public.transactions
  for insert with check (auth.uid() = user_id);

-- Index for faster lookups
create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists transactions_match_id_idx on public.transactions(match_id);
create index if not exists transactions_tx_id_idx on public.transactions(tx_id);

-- 3. Function: Reserve stake (move from saldo_actual to saldo_reservado)
create or replace function public.reserve_stake(p_user_id uuid, p_amount integer)
returns boolean
language plpgsql
security definer
as $$
declare
  v_saldo_actual integer;
begin
  -- Get current balance
  select saldo_actual into v_saldo_actual
  from public.wallets
  where user_id = p_user_id;
  
  -- Check if enough balance
  if v_saldo_actual < p_amount then
    raise exception 'Insufficient balance';
  end if;
  
  -- Reserve the stake
  update public.wallets
  set 
    saldo_actual = saldo_actual - p_amount,
    saldo_reservado = saldo_reservado + p_amount,
    updated_at = timezone('utc'::text, now())
  where user_id = p_user_id;
  
  return true;
end;
$$;

-- 4. Function: Update reserved stake (for doubling)
create or replace function public.update_reserved_stake(p_user_id uuid, p_new_amount integer)
returns boolean
language plpgsql
security definer
as $$
declare
  v_saldo_actual integer;
  v_current_reserved integer;
  v_difference integer;
begin
  -- Get current balances
  select saldo_actual, saldo_reservado into v_saldo_actual, v_current_reserved
  from public.wallets
  where user_id = p_user_id;
  
  -- Calculate difference
  v_difference := p_new_amount - v_current_reserved;
  
  -- Check if enough balance for additional reserve
  if v_difference > 0 and v_saldo_actual < v_difference then
    raise exception 'Insufficient balance for additional stake';
  end if;
  
  -- Update the reserved stake
  update public.wallets
  set 
    saldo_actual = saldo_actual - v_difference,
    saldo_reservado = p_new_amount,
    updated_at = timezone('utc'::text, now())
  where user_id = p_user_id;
  
  return true;
end;
$$;

-- 5. Function: Release reserved stake (return to saldo_actual)
create or replace function public.release_stake(p_user_id uuid, p_amount integer)
returns boolean
language plpgsql
security definer
as $$
begin
  update public.wallets
  set 
    saldo_actual = saldo_actual + p_amount,
    saldo_reservado = greatest(saldo_reservado - p_amount, 0),
    updated_at = timezone('utc'::text, now())
  where user_id = p_user_id;
  
  return true;
end;
$$;

-- 6. Function: Process match result (winner gets pot, loser loses reserved stake)
create or replace function public.process_match_result(p_match_id uuid)
returns boolean
language plpgsql
security definer
as $$
declare
  v_match record;
  v_winner_id uuid;
  v_loser_id uuid;
  v_winner_payout integer;
begin
  -- Get match details
  select * into v_match
  from public.matches
  where id = p_match_id;
  
  if not found then
    raise exception 'Match not found';
  end if;
  
  -- Determine winner and loser
  if v_match.winner_color = 'white' then
    v_winner_id := v_match.player_white;
    v_loser_id := v_match.player_black;
  else
    v_winner_id := v_match.player_black;
    v_loser_id := v_match.player_white;
  end if;
  
  v_winner_payout := v_match.winner_payout;
  
  -- Loser: Release and deduct their reserved stake + any excess (Gammon/Backgammon)
  update public.wallets
  set 
    saldo_actual = saldo_actual - (greatest(v_winner_payout - saldo_reservado, 0)),
    saldo_reservado = 0,
    updated_at = timezone('utc'::text, now())
  where user_id = v_loser_id;
  
  -- Create transaction for loser
  insert into public.transactions (user_id, match_id, tipo, amount, saldo_anterior, saldo_nuevo, description)
  select 
    v_loser_id,
    p_match_id,
    'loss',
    v_winner_payout,
    w.saldo_actual + (greatest(v_winner_payout - w.saldo_reservado, 0)),
    w.saldo_actual,
    'Lost match'
  from public.wallets w
  where w.user_id = v_loser_id;
  
  -- Winner: Release their reserved stake and add winnings (Pot = Own Reserved + Opponent's Stake)
  update public.wallets
  set 
    saldo_actual = saldo_actual + saldo_reservado + v_winner_payout,
    saldo_reservado = 0,
    updated_at = timezone('utc'::text, now())
  where user_id = v_winner_id;
  
  -- Create transaction for winner
  insert into public.transactions (user_id, match_id, tipo, amount, saldo_anterior, saldo_nuevo, description)
  select 
    v_winner_id,
    p_match_id,
    'win',
    v_winner_payout,
    w.saldo_actual - v_winner_payout,
    w.saldo_actual,
    'Won match'
  from public.wallets w
  where w.user_id = v_winner_id;
  
  return true;
end;
$$;

-- 7. Trigger: Auto-create wallet for new users
create or replace function public.handle_new_user_wallet()
returns trigger
language plpgsql
security definer
as $$
begin
  insert into public.wallets (user_id, saldo_actual, saldo_reservado)
  values (new.id, 5000, 0)
  on conflict (user_id) do nothing;
  return new;
end;
$$;

-- Create trigger if not exists
drop trigger if exists on_auth_user_created_wallet on auth.users;
create trigger on_auth_user_created_wallet
  after insert on auth.users
  for each row execute procedure public.handle_new_user_wallet();

-- 8. Create wallets for existing users (who don't have one)
insert into public.wallets (user_id, saldo_actual, saldo_reservado)
select id, 5000, 0
from auth.users
where id not in (select user_id from public.wallets)
on conflict (user_id) do nothing;
