-- Global daily Gemini usage counter (shared across all players).
-- Source of truth for the "tokens FREE GRATIS" daily quota shown at game end.
-- The gemini-proxy edge function increments today's row after every Gemini call.
-- Clients (anon) can only READ the row; only service_role can increment.

create table if not exists public.gemini_usage (
  id text primary key,                 -- YYYY-MM-DD (UTC)
  calls int not null default 0,
  updated_at timestamptz not null default now()
);

create or replace function public.increment_gemini_calls(day text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  new_calls int;
begin
  insert into public.gemini_usage (id, calls)
  values (day, 1)
  on conflict (id) do update
    set calls = public.gemini_usage.calls + 1,
        updated_at = now()
  returning calls into new_calls;
  return new_calls;
end;
$$;

-- RLS: anon/authenticated can read today's usage; no one can write directly.
alter table public.gemini_usage enable row level security;

drop policy if exists "anon read gemini_usage" on public.gemini_usage;
create policy "anon read gemini_usage"
  on public.gemini_usage
  for select
  to anon, authenticated
  using (true);

-- Only service_role may execute the increment (prevents abuse/spam inflation).
revoke execute on function public.increment_gemini_calls(text) from public, anon;
grant execute on function public.increment_gemini_calls(text) to service_role;
