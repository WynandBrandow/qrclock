-- Payroll readiness and hardening (audit, 29 Oct 2026).
--
-- 1. Time records can't be deleted and clock events/corrections are append-only, enforced by
--    triggers (Fair Work: keep 7 years, alter only to correct, keep the correction visible).
--    Test data (names starting 'TEST ') can be purged/backdated only through two guarded
--    functions that switch the guard off for their own transaction.
-- 2. Approvals become an append-only history (timesheet_approvals) with a content hash.
-- 3. Paid rest breaks vs unpaid meal breaks; meal-break rule; public holidays.
-- 4. Employee payroll fields; PIN lockout made atomic and escalating; sessions revocable.
-- 5. One repeat-scan rule (latest kiosk/phone punch by created_at) in record_punch.

-- ── 1. Records can't be deleted with their employee or company ─────────────────────────────────
alter table public.clock_events
  drop constraint clock_events_employee_id_fkey,
  add constraint clock_events_employee_id_fkey foreign key (employee_id) references public.employees(id) on delete restrict,
  drop constraint clock_events_company_id_fkey,
  add constraint clock_events_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict;
alter table public.event_corrections
  drop constraint event_corrections_employee_id_fkey,
  add constraint event_corrections_employee_id_fkey foreign key (employee_id) references public.employees(id) on delete restrict,
  drop constraint event_corrections_company_id_fkey,
  add constraint event_corrections_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict;
alter table public.employees
  drop constraint employees_company_id_fkey,
  add constraint employees_company_id_fkey foreign key (company_id) references public.companies(id) on delete restrict;

-- The guard: true only inside purge_test_data / backdate_test_events.
create or replace function public.records_unlocked() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(current_setting('qrclock.unlock', true), '') = 'on'
$$;

create or replace function public.clock_events_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.records_unlocked() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'clock events are permanent records and cannot be deleted';
  end if;
  -- Only the status (active → superseded/voided) and the review fields may change.
  if new.kind is distinct from old.kind or new.occurred_at is distinct from old.occurred_at
     or new.employee_id is distinct from old.employee_id or new.company_id is distinct from old.company_id
     or new.source is distinct from old.source or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by or new.replaces_id is distinct from old.replaces_id
     or new.paid_break is distinct from old.paid_break
     or (new.flag is distinct from old.flag)
     or (old.status <> 'active' and new.status is distinct from old.status) then
    raise exception 'clock events are append-only: use correct_event, add_event or void_event';
  end if;
  return new;
end $$;

create or replace function public.append_only_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.records_unlocked() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  raise exception '% is append-only', tg_table_name;
end $$;

-- ── 3 (schema first, the guard references it). Breaks ──────────────────────────────────────────
alter table public.clock_events add column paid_break boolean;   -- set on break_start only
alter table public.companies
  add column rest_breaks boolean not null default false,          -- offer a separate paid rest break
  add column meal_break_after_hours numeric(4,2) not null default 5 check (meal_break_after_hours between 0 and 24),
  add column min_meal_break_minutes int not null default 30 check (min_meal_break_minutes between 0 and 240);

create trigger clock_events_guard before update or delete on public.clock_events
  for each row execute function public.clock_events_guard();
create trigger event_corrections_guard before update or delete on public.event_corrections
  for each row execute function public.append_only_guard();

-- Corrections carry the event time so history can be queried by date range.
alter table public.event_corrections add column event_time timestamptz;
alter table public.event_corrections disable trigger event_corrections_guard;
update public.event_corrections c set event_time = coalesce(
  (c.after->>'occurred_at')::timestamptz, (c.before->>'occurred_at')::timestamptz,
  (select e.occurred_at from public.clock_events e where e.id = c.original_event_id));
alter table public.event_corrections enable trigger event_corrections_guard;
create index event_corrections_employee_time on public.event_corrections (employee_id, event_time);

create index clock_events_replaces on public.clock_events (replaces_id) where replaces_id is not null;
create index clock_events_kiosk on public.clock_events (kiosk_id) where kiosk_id is not null;
create index clock_events_created_by on public.clock_events (created_by) where created_by is not null;

-- ── 2. Approval history ────────────────────────────────────────────────────────────────────────
drop table public.weekly_timesheets;

create table public.timesheet_approvals (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  employee_id uuid not null references public.employees(id) on delete restrict,
  period_start date not null,
  period_end date not null,
  worked_minutes int not null,
  break_minutes int not null,
  shift_count int not null,
  minutes_by_category jsonb not null default '{}',
  content_hash text not null,
  approved_by uuid not null references public.employees(id),
  approved_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.employees(id),
  revoke_reason text,
  check ((revoked_at is null) = (revoked_by is null))
);
create unique index timesheet_approvals_current on public.timesheet_approvals (employee_id, period_start) where revoked_at is null;
create index timesheet_approvals_company_period on public.timesheet_approvals (company_id, period_start);
alter table public.timesheet_approvals enable row level security;

create or replace function public.approvals_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.records_unlocked() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then raise exception 'approvals are permanent records'; end if;
  -- The only change allowed: revoking a current approval, with who/when/why.
  if old.revoked_at is not null or new.revoked_at is null or coalesce(trim(new.revoke_reason), '') = ''
     or (to_jsonb(new) - array['revoked_at','revoked_by','revoke_reason']) <> (to_jsonb(old) - array['revoked_at','revoked_by','revoke_reason']) then
    raise exception 'approvals can only be revoked, with a reason';
  end if;
  return new;
end $$;
create trigger timesheet_approvals_guard before update or delete on public.timesheet_approvals
  for each row execute function public.approvals_guard();

-- ── 3. Public holidays (per company; part-day allowed, e.g. Christmas Eve from 6 pm in Qld) ────
create table public.public_holidays (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  date date not null,
  name text not null,
  from_time time not null default '00:00',
  to_time time not null default '24:00',
  check (from_time < to_time),
  unique (company_id, date, from_time)
);
alter table public.public_holidays enable row level security;

-- ── 4. Employees: payroll fields, PIN lockout, revocable PIN sessions ──────────────────────────
alter table public.employees
  add column payroll_code text,
  add column employment_type text check (employment_type in ('full_time', 'part_time', 'casual')),
  add column start_date date,
  add column pin_lock_count int not null default 0,
  add column pin_version int not null default 0;

-- Reserve one PIN attempt atomically, before the PIN is checked. Parallel guesses each take a
-- slot, so at most 5 can be checked per lock window. Locks escalate (15 min, 1 h, 4 h, 24 h) and
-- the fifth lock in a row holds until an admin sets a new PIN.
create or replace function public.pin_attempt(p_token text)
returns table (employee_id uuid, pin_hash text, pin_version int, locked_until timestamptz)
language plpgsql security definer set search_path = '' as $$
declare emp public.employees;
begin
  select * into emp from public.employees where qr_token = p_token and active for update;
  if not found or emp.pin_hash is null then return; end if;
  if emp.pin_locked_until is not null and emp.pin_locked_until > now() then
    return query select emp.id, null::text, emp.pin_version, emp.pin_locked_until; return;
  end if;
  if emp.pin_failed_count >= 5 then
    update public.employees set pin_failed_count = 0, pin_lock_count = emp.pin_lock_count + 1,
      pin_locked_until = case when emp.pin_lock_count + 1 >= 5 then 'infinity'::timestamptz
        else now() + (array[interval '15 minutes', interval '1 hour', interval '4 hours', interval '24 hours'])[emp.pin_lock_count + 1] end
    where id = emp.id returning * into emp;
    return query select emp.id, null::text, emp.pin_version, emp.pin_locked_until; return;
  end if;
  update public.employees set pin_failed_count = emp.pin_failed_count + 1 where id = emp.id;
  return query select emp.id, emp.pin_hash, emp.pin_version, null::timestamptz;
end $$;

create or replace function public.pin_succeeded(p_employee_id uuid) returns void
language sql security definer set search_path = '' as $$
  update public.employees set pin_failed_count = 0, pin_lock_count = 0, pin_locked_until = null where id = p_employee_id
$$;

-- ── Kiosk health ───────────────────────────────────────────────────────────────────────────────
alter table public.kiosks add column last_heartbeat_at timestamptz, add column client_info jsonb;

-- ── 5. record_punch: one repeat-scan rule, paid rest breaks, no double flag for a forgotten shift
drop function public.record_punch(uuid, text, text, uuid);
create function public.record_punch(
  p_employee_id uuid, p_kind text, p_source text, p_kiosk_id uuid default null, p_paid_break boolean default false
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  emp public.employees;
  co public.companies;
  last_ev public.clock_events;
  last_punch_at timestamptz;
  state text;
  stale boolean;
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

  -- Repeat scans: measured from the person's latest kiosk/phone punch, by when it was recorded.
  -- Manager corrections don't count, so back-filling yesterday never blocks a scan today.
  select max(created_at) into last_punch_at from public.clock_events
   where employee_id = emp.id and status = 'active' and source in ('kiosk', 'phone');
  if last_punch_at > v_now - make_interval(secs => co.duplicate_window_seconds) then
    return jsonb_build_object('ok', false, 'reason', 'duplicate');
  end if;

  select * into last_ev from public.clock_events
   where employee_id = emp.id and status = 'active'
   order by occurred_at desc, created_at desc limit 1;

  stale := last_ev.id is not null and last_ev.occurred_at < v_now - make_interval(hours => co.long_shift_hours);
  state := case
    when last_ev.id is null or last_ev.kind = 'clock_out' or stale then 'off'
    when last_ev.kind = 'break_start' then 'on_break'
    else 'working' end;

  -- A shift forgotten past the long-shift limit already shows as "no clock-out"; the fresh
  -- clock-in that follows it is not flagged a second time.
  v_flag := case
    when p_kind = 'clock_in'    and state <> 'off'      then 'clock_in_while_open'
    when p_kind = 'clock_out'   and state = 'off'       then 'clock_out_without_shift'
    when p_kind = 'break_start' and state <> 'working'  then 'break_without_shift'
    when p_kind = 'break_end'   and state <> 'on_break' then 'break_end_without_break'
    else null end;

  if p_kiosk_id is not null and co.record_location then
    select location_id into v_location from public.kiosks where id = p_kiosk_id;
  end if;

  insert into public.clock_events (company_id, employee_id, kind, occurred_at, source, kiosk_id, location_id, flag, paid_break)
  values (emp.company_id, emp.id, p_kind, v_now, p_source, case when co.record_location then p_kiosk_id end, v_location, v_flag,
          case when p_kind = 'break_start' then coalesce(p_paid_break, false) end)
  returning id into new_id;

  return jsonb_build_object('ok', true, 'event_id', new_id, 'kind', p_kind, 'occurred_at', v_now, 'flag', v_flag);
end $$;

-- Corrections keep the break type and record the event time for history queries.
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

  insert into public.clock_events (company_id, employee_id, kind, occurred_at, source, kiosk_id, location_id, replaces_id, created_by, paid_break)
  values (old.company_id, old.employee_id, p_kind, p_occurred_at, 'manager', old.kiosk_id, old.location_id, old.id, p_by,
          case when p_kind = 'break_start' then coalesce(old.paid_break, false) end)
  returning id into new_id;

  insert into public.event_corrections (company_id, employee_id, action, original_event_id, new_event_id, reason, before, after, corrected_by, event_time)
  values (old.company_id, old.employee_id, 'edit', old.id, new_id, p_reason,
    jsonb_build_object('kind', old.kind, 'occurred_at', old.occurred_at, 'flag', old.flag),
    jsonb_build_object('kind', p_kind, 'occurred_at', p_occurred_at), p_by, p_occurred_at);
  return new_id;
end $$;

drop function public.add_event(uuid, text, timestamptz, text, uuid);
create function public.add_event(
  p_employee_id uuid, p_kind text, p_occurred_at timestamptz, p_reason text, p_by uuid, p_paid_break boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  emp public.employees;
  new_id uuid;
begin
  select * into emp from public.employees where id = p_employee_id;
  if not found then raise exception 'employee not found'; end if;

  insert into public.clock_events (company_id, employee_id, kind, occurred_at, source, created_by, paid_break)
  values (emp.company_id, emp.id, p_kind, p_occurred_at, 'manager', p_by, case when p_kind = 'break_start' then coalesce(p_paid_break, false) end)
  returning id into new_id;

  insert into public.event_corrections (company_id, employee_id, action, new_event_id, reason, after, corrected_by, event_time)
  values (emp.company_id, emp.id, 'add', new_id, p_reason,
    jsonb_build_object('kind', p_kind, 'occurred_at', p_occurred_at), p_by, p_occurred_at);
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

  insert into public.event_corrections (company_id, employee_id, action, original_event_id, reason, before, corrected_by, event_time)
  values (old.company_id, old.employee_id, 'void', old.id, p_reason,
    jsonb_build_object('kind', old.kind, 'occurred_at', old.occurred_at, 'flag', old.flag), p_by, old.occurred_at);
end $$;

create or replace function public.resolve_flag(p_event_id uuid, p_note text, p_by uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare old public.clock_events;
begin
  select * into old from public.clock_events where id = p_event_id for update;
  if not found or old.flag is null or old.flag_resolved_at is not null then raise exception 'nothing to resolve'; end if;

  update public.clock_events set flag_resolved_at = now(), flag_resolved_by = p_by, flag_note = p_note where id = old.id;

  insert into public.event_corrections (company_id, employee_id, action, original_event_id, reason, before, corrected_by, event_time)
  values (old.company_id, old.employee_id, 'resolve', old.id, p_note, jsonb_build_object('flag', old.flag), p_by, old.occurred_at);
end $$;

-- ── Test-data helpers (refuse anything not named 'TEST …') ─────────────────────────────────────
create or replace function public.purge_test_data(p_employee_id uuid default null, p_company_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_employee_id is not null and not exists (select 1 from public.employees where id = p_employee_id and full_name like 'TEST %') then
    raise exception 'only TEST employees can be purged';
  end if;
  if p_company_id is not null and not exists (select 1 from public.companies where id = p_company_id and name like 'TEST %') then
    raise exception 'only TEST companies can be purged';
  end if;
  perform set_config('qrclock.unlock', 'on', true);
  delete from public.event_corrections where employee_id = p_employee_id or company_id = p_company_id;
  delete from public.timesheet_approvals where employee_id = p_employee_id or company_id = p_company_id;
  delete from public.scan_log where employee_id = p_employee_id or company_id = p_company_id;
  update public.clock_events set replaces_id = null where employee_id = p_employee_id or company_id = p_company_id;
  delete from public.clock_events where employee_id = p_employee_id or company_id = p_company_id;
  delete from public.employees where id = p_employee_id or company_id = p_company_id;
  delete from public.companies where id = p_company_id;
  perform set_config('qrclock.unlock', '', true);
end $$;

create or replace function public.backdate_test_events(p_employee_id uuid, p_seconds int) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.employees where id = p_employee_id and full_name like 'TEST %') then
    raise exception 'only TEST employees can be backdated';
  end if;
  perform set_config('qrclock.unlock', 'on', true);
  update public.clock_events set occurred_at = occurred_at - make_interval(secs => p_seconds),
    created_at = created_at - make_interval(secs => p_seconds)
  where employee_id = p_employee_id;
  perform set_config('qrclock.unlock', '', true);
end $$;

-- ── Grants: service role only ──────────────────────────────────────────────────────────────────
revoke all on function public.record_punch(uuid, text, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.add_event(uuid, text, timestamptz, text, uuid, boolean) from public, anon, authenticated;
revoke all on function public.pin_attempt(text) from public, anon, authenticated;
revoke all on function public.pin_succeeded(uuid) from public, anon, authenticated;
revoke all on function public.purge_test_data(uuid, uuid) from public, anon, authenticated;
revoke all on function public.backdate_test_events(uuid, int) from public, anon, authenticated;
revoke all on function public.records_unlocked() from public, anon, authenticated;
grant execute on function public.record_punch(uuid, text, text, uuid, boolean) to service_role;
grant execute on function public.add_event(uuid, text, timestamptz, text, uuid, boolean) to service_role;
grant execute on function public.pin_attempt(text) to service_role;
grant execute on function public.pin_succeeded(uuid) to service_role;
grant execute on function public.purge_test_data(uuid, uuid) to service_role;
grant execute on function public.backdate_test_events(uuid, int) to service_role;
grant execute on function public.records_unlocked() to service_role;
