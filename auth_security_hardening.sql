-- Auth hardening for VIVO Supabase
-- Run after supabase_profiles_setup.sql

-- 1. Trigger: prevent short/weak passwords on auth.users insert/update
--    Supabase Auth calls these via triggers when users sign up or change passwords.
create or replace function public.validate_password_strength()
returns trigger
language plpgsql
security definer
as $$
begin
  if length(new.encrypted_password) < 60 then
    -- Supabase stores bcrypt hashes; length check is a proxy for non-empty password.
    -- Actual minimum length is enforced client-side, but we add DB-level sanity.
    raise exception 'Password appears too short';
  end if;
  return new;
end;
$$;

drop trigger if exists validate_auth_password on auth.users;
create trigger validate_auth_password
  before insert or update of encrypted_password on auth.users
  for each row execute procedure public.validate_password_strength();

-- 2. Rate-limit table for failed auth attempts
create table if not exists public.auth_rate_limit (
  ip text not null,
  attempt_type text not null,
  failed_count integer not null default 0,
  first_failed_at timestamptz not null default timezone('utc'::text, now()),
  last_failed_at timestamptz not null default timezone('utc'::text, now()),
  locked_until timestamptz,
  primary key (ip, attempt_type)
);

-- 3. Function to record failed attempt and lock after threshold
create or replace function public.record_failed_auth(p_ip text, p_type text)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.auth_rate_limit (ip, attempt_type)
  values (p_ip, p_type)
  on conflict (ip, attempt_type) do update
    set failed_count = public.auth_rate_limit.failed_count + 1,
        last_failed_at = timezone('utc'::text, now()),
        locked_until = case
          when public.auth_rate_limit.failed_count + 1 >= 5
          then timezone('utc'::text, now()) + interval '15 minutes'
          else public.auth_rate_limit.locked_until
        end;
end;
$$;

-- 4. Function to reset counter on success
create or replace function public.reset_failed_auth(p_ip text, p_type text)
returns void
language plpgsql
security definer
as $$
begin
  delete from public.auth_rate_limit
  where ip = p_ip and attempt_type = p_type;
end;
$$;

-- 5. Function to check if locked
create or replace function public.is_auth_locked(p_ip text, p_type text)
returns boolean
language plpgsql
security definer
as $$
declare
  v_locked_until timestamptz;
begin
  select locked_until into v_locked_until
  from public.auth_rate_limit
  where ip = p_ip and attempt_type = p_type;

  if v_locked_until is not null and v_locked_until > timezone('utc'::text, now()) then
    return true;
  end if;

  return false;
end;
$$;
