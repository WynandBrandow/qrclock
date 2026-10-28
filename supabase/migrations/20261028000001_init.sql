-- qrclock: QR code employee time clock.
--
-- Access model: the browser never reads these tables. Every read and write goes through the
-- Next.js server with the service-role key, after the server has checked who the viewer is and
-- what role they hold. RLS is on for every table with no policies, so the anon and authenticated
-- keys see nothing.
--
-- Clock events are append-only. A correction marks the original 'superseded' (or 'voided') and,
-- for an edit, inserts a replacement that points back at it. Every correction is logged in
-- event_corrections with who, when, why, and the before/after values.

create extension if not exists pgcrypto with schema extensions;

create or replace function public.new_token() returns text
language sql volatile set search_path = '' as $$
  select replace(replace(rtrim(encode(extensions.gen_random_bytes(18), 'base64'), '='), '+', '-'), '/', '_')
$$;

-- ── Companies (multi-company ready; one row today) ──────────────────────────────────────────────
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  timezone text not null default 'Australia/Brisbane',
  week_start smallint not null default 1 check (week_start between 0 and 6),   -- 0 = Sunday, 1 = Monday
  track_breaks boolean not null default true,
  breaks_paid boolean not null default false,
  duplicate_window_seconds int not null default 60 check (duplicate_window_seconds between 5 and 3600),
  long_shift_hours int not null default 14 check (long_shift_hours between 1 and 48),
  record_location boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  full_name text not null,
  email text check (email is null or email = lower(email)),
  user_id uuid unique references auth.users(id) on delete set null,
  role text not null default 'employee' check (role in ('employee', 'manager', 'admin')),
  qr_token text not null unique default public.new_token(),
  qr_issued_at timestamptz not null default now(),
  pin_hash text,
  pin_failed_count int not null default 0,
  pin_locked_until timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index employees_company_email on public.employees (company_id, email) where email is not null;
create index employees_email on public.employees (email) where email is not null;

create table public.kiosks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  location_id uuid references public.locations(id) on delete set null,
  name text not null,
  device_secret_hash text unique,
  pairing_code_hash text unique,
  pairing_expires_at timestamptz,
  paired_at timestamptz,
  last_seen_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.clock_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  kind text not null check (kind in ('clock_in', 'clock_out', 'break_start', 'break_end')),
  occurred_at timestamptz not null,
  source text not null check (source in ('kiosk', 'manager', 'phone')),
  kiosk_id uuid references public.kiosks(id) on delete set null,
  location_id uuid references public.locations(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'superseded', 'voided')),
  replaces_id uuid references public.clock_events(id),
  flag text,
  flag_resolved_at timestamptz,
  flag_resolved_by uuid references public.employees(id),
  flag_note text,
  created_at timestamptz not null default now(),
  created_by uuid references public.employees(id)
);
create index clock_events_employee_time on public.clock_events (employee_id, occurred_at) where status = 'active';
create index clock_events_company_time on public.clock_events (company_id, occurred_at) where status = 'active';
create index clock_events_open_flags on public.clock_events (company_id) where flag is not null and flag_resolved_at is null and status = 'active';

create table public.event_corrections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  action text not null check (action in ('edit', 'add', 'void', 'resolve')),
  original_event_id uuid references public.clock_events(id),
  new_event_id uuid references public.clock_events(id),
  reason text not null check (length(trim(reason)) > 0),
  before jsonb,
  after jsonb,
  corrected_by uuid not null references public.employees(id),
  corrected_at timestamptz not null default now()
);
create index event_corrections_employee on public.event_corrections (employee_id, corrected_at);

-- Weekly totals as approved by a manager (a snapshot; live totals are computed from events).
create table public.weekly_timesheets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  week_start date not null,
  worked_minutes int not null,
  break_minutes int not null,
  shift_count int not null,
  approved_by uuid not null references public.employees(id),
  approved_at timestamptz not null default now(),
  unique (employee_id, week_start)
);

-- Every kiosk scan, including rejected ones (unknown code, duplicate, inactive employee).
create table public.scan_log (
  id bigint generated always as identity primary key,
  company_id uuid references public.companies(id) on delete cascade,
  kiosk_id uuid references public.kiosks(id) on delete set null,
  employee_id uuid references public.employees(id) on delete set null,
  result text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index scan_log_company_time on public.scan_log (company_id, created_at desc);

alter table public.companies enable row level security;
alter table public.locations enable row level security;
alter table public.employees enable row level security;
alter table public.kiosks enable row level security;
alter table public.clock_events enable row level security;
alter table public.event_corrections enable row level security;
alter table public.weekly_timesheets enable row level security;
alter table public.scan_log enable row level security;

-- ── Punch: the one way a kiosk or phone records an event ────────────────────────────────────────
-- Locks the employee row so two devices scanning at once can't both record. Rejects a repeat
-- within the company's duplicate window. Records unusual events but flags them for review.
create or replace function public.record_punch(
  p_employee_id uuid, p_kind text, p_source text, p_kiosk_id uuid default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  emp public.employees;
  co public.companies;
  last_ev public.clock_events;
  state text;
  v_flag text;
  v_location uuid;
  new_id uuid;
  v_now timestamptz := now();
begin
  select * into emp from public.employees where id = p_employee_id for update;
  if not found or not emp.active then
    return jsonb_build_object('ok', false, 'reason', 'inactive');
  end if;
  select * into co from public.companies where id = emp.company_id;

  if p_kind in ('break_start', 'break_end') and not co.track_breaks then
    return jsonb_build_object('ok', false, 'reason', 'breaks_disabled');
  end if;

  select * into last_ev from public.clock_events
   where employee_id = emp.id and status = 'active'
   order by occurred_at desc, created_at desc limit 1;

  if last_ev.id is not null and last_ev.created_at > v_now - make_interval(secs => co.duplicate_window_seconds) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate',
      'last_kind', last_ev.kind, 'last_at', last_ev.occurred_at);
  end if;

  state := case
    when last_ev.id is null or last_ev.kind = 'clock_out' then 'off'
    when last_ev.kind = 'break_start' then 'on_break'
    else 'working' end;

  v_flag := case
    when p_kind = 'clock_in'    and state <> 'off'      then 'clock_in_while_open'
    when p_kind = 'clock_out'   and state = 'off'       then 'clock_out_without_shift'
    when p_kind = 'clock_out'   and state = 'on_break'  then 'clock_out_during_break'
    when p_kind = 'break_start' and state <> 'working'  then 'break_without_shift'
    when p_kind = 'break_end'   and state <> 'on_break' then 'break_end_without_break'
    else null end;

  if p_kiosk_id is not null and co.record_location then
    select location_id into v_location from public.kiosks where id = p_kiosk_id;
  end if;

  insert into public.clock_events (company_id, employee_id, kind, occurred_at, source, kiosk_id, location_id, flag)
  values (emp.company_id, emp.id, p_kind, v_now, p_source, case when co.record_location then p_kiosk_id end, v_location, v_flag)
  returning id into new_id;

  return jsonb_build_object('ok', true, 'event_id', new_id, 'kind', p_kind, 'occurred_at', v_now, 'flag', v_flag);
end $$;

-- ── Manager corrections (originals are kept) ────────────────────────────────────────────────────
create or replace function public.correct_event(
  p_event_id uuid, p_kind text, p_occurred_at timestamptz, p_reason text, p_by uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  old public.clock_events;
  new_id uuid;
begin
  select * into old from public.clock_events where id = p_event_id for update;
  if not found or old.status <> 'active' then raise exception 'event not active'; end if;

  update public.clock_events set status = 'superseded',
    flag_resolved_at = case when flag is not null and flag_resolved_at is null then now() else flag_resolved_at end,
    flag_resolved_by = case when flag is not null and flag_resolved_at is null then p_by else flag_resolved_by end
  where id = old.id;

  insert into public.clock_events (company_id, employee_id, kind, occurred_at, source, kiosk_id, location_id, replaces_id, created_by)
  values (old.company_id, old.employee_id, p_kind, p_occurred_at, 'manager', old.kiosk_id, old.location_id, old.id, p_by)
  returning id into new_id;

  insert into public.event_corrections (company_id, employee_id, action, original_event_id, new_event_id, reason, before, after, corrected_by)
  values (old.company_id, old.employee_id, 'edit', old.id, new_id, p_reason,
    jsonb_build_object('kind', old.kind, 'occurred_at', old.occurred_at, 'flag', old.flag),
    jsonb_build_object('kind', p_kind, 'occurred_at', p_occurred_at), p_by);
  return new_id;
end $$;

create or replace function public.add_event(
  p_employee_id uuid, p_kind text, p_occurred_at timestamptz, p_reason text, p_by uuid
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  emp public.employees;
  new_id uuid;
begin
  select * into emp from public.employees where id = p_employee_id;
  if not found then raise exception 'employee not found'; end if;

  insert into public.clock_events (company_id, employee_id, kind, occurred_at, source, created_by)
  values (emp.company_id, emp.id, p_kind, p_occurred_at, 'manager', p_by)
  returning id into new_id;

  insert into public.event_corrections (company_id, employee_id, action, new_event_id, reason, after, corrected_by)
  values (emp.company_id, emp.id, 'add', new_id, p_reason,
    jsonb_build_object('kind', p_kind, 'occurred_at', p_occurred_at), p_by);
  return new_id;
end $$;

create or replace function public.void_event(p_event_id uuid, p_reason text, p_by uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare old public.clock_events;
begin
  select * into old from public.clock_events where id = p_event_id for update;
  if not found or old.status <> 'active' then raise exception 'event not active'; end if;

  update public.clock_events set status = 'voided',
    flag_resolved_at = case when flag is not null and flag_resolved_at is null then now() else flag_resolved_at end,
    flag_resolved_by = case when flag is not null and flag_resolved_at is null then p_by else flag_resolved_by end
  where id = old.id;

  insert into public.event_corrections (company_id, employee_id, action, original_event_id, reason, before, corrected_by)
  values (old.company_id, old.employee_id, 'void', old.id, p_reason,
    jsonb_build_object('kind', old.kind, 'occurred_at', old.occurred_at, 'flag', old.flag), p_by);
end $$;

create or replace function public.resolve_flag(p_event_id uuid, p_note text, p_by uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare old public.clock_events;
begin
  select * into old from public.clock_events where id = p_event_id for update;
  if not found or old.flag is null or old.flag_resolved_at is not null then raise exception 'nothing to resolve'; end if;

  update public.clock_events set flag_resolved_at = now(), flag_resolved_by = p_by, flag_note = p_note where id = old.id;

  insert into public.event_corrections (company_id, employee_id, action, original_event_id, reason, before, corrected_by)
  values (old.company_id, old.employee_id, 'resolve', old.id, p_note, jsonb_build_object('flag', old.flag), p_by);
end $$;

revoke all on function public.record_punch(uuid, text, text, uuid) from public, anon, authenticated;
revoke all on function public.correct_event(uuid, text, timestamptz, text, uuid) from public, anon, authenticated;
revoke all on function public.add_event(uuid, text, timestamptz, text, uuid) from public, anon, authenticated;
revoke all on function public.void_event(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.resolve_flag(uuid, text, uuid) from public, anon, authenticated;
revoke all on function public.new_token() from public, anon, authenticated;
grant execute on function public.record_punch(uuid, text, text, uuid) to service_role;
grant execute on function public.correct_event(uuid, text, timestamptz, text, uuid) to service_role;
grant execute on function public.add_event(uuid, text, timestamptz, text, uuid) to service_role;
grant execute on function public.void_event(uuid, text, uuid) to service_role;
grant execute on function public.resolve_flag(uuid, text, uuid) to service_role;
grant execute on function public.new_token() to service_role;
