-- Phone clocking: staff scan a QR poster at the depot with their own phone. Each location gets a
-- poster code and optional coordinates; a phone punch stores only the distance from the depot
-- (never the GPS position) and is flagged when far away or when no location was shared.
alter table public.locations
  add column qr_token text not null unique default public.new_token(),
  add column latitude double precision check (latitude between -90 and 90),
  add column longitude double precision check (longitude between -180 and 180),
  add column radius_m int not null default 200 check (radius_m between 25 and 5000);

alter table public.companies
  add column phone_clocking boolean not null default false,
  add column phone_require_location boolean not null default false;   -- true = refuse far/unknown, false = record + flag

alter table public.clock_events add column distance_m int;

-- The append-only guard now also protects the distance.
create or replace function public.clock_events_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if public.records_unlocked() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'clock events are permanent records and cannot be deleted';
  end if;
  if new.kind is distinct from old.kind or new.occurred_at is distinct from old.occurred_at
     or new.employee_id is distinct from old.employee_id or new.company_id is distinct from old.company_id
     or new.source is distinct from old.source or new.created_at is distinct from old.created_at
     or new.created_by is distinct from old.created_by or new.replaces_id is distinct from old.replaces_id
     or new.paid_break is distinct from old.paid_break or new.distance_m is distinct from old.distance_m
     or (new.flag is distinct from old.flag)
     or (old.status <> 'active' and new.status is distinct from old.status) then
    raise exception 'clock events are append-only: use correct_event, add_event or void_event';
  end if;
  return new;
end $$;

drop function public.record_punch(uuid, text, text, uuid, boolean);
create function public.record_punch(
  p_employee_id uuid, p_kind text, p_source text, p_kiosk_id uuid default null, p_paid_break boolean default false,
  p_location_id uuid default null, p_distance_m int default null, p_extra_flag text default null
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

  v_flag := case
    when p_kind = 'clock_in'    and state <> 'off'      then 'clock_in_while_open'
    when p_kind = 'clock_out'   and state = 'off'       then 'clock_out_without_shift'
    when p_kind = 'break_start' and state <> 'working'  then 'break_without_shift'
    when p_kind = 'break_end'   and state <> 'on_break' then 'break_end_without_break'
    else p_extra_flag end;

  if co.record_location then
    v_location := p_location_id;
    if v_location is null and p_kiosk_id is not null then
      select location_id into v_location from public.kiosks where id = p_kiosk_id;
    end if;
  end if;

  insert into public.clock_events (company_id, employee_id, kind, occurred_at, source, kiosk_id, location_id, flag, paid_break, distance_m)
  values (emp.company_id, emp.id, p_kind, v_now, p_source, case when co.record_location then p_kiosk_id end, v_location, v_flag,
          case when p_kind = 'break_start' then coalesce(p_paid_break, false) end, p_distance_m)
  returning id into new_id;

  return jsonb_build_object('ok', true, 'event_id', new_id, 'kind', p_kind, 'occurred_at', v_now, 'flag', v_flag);
end $$;
revoke all on function public.record_punch(uuid, text, text, uuid, boolean, uuid, int, text) from public, anon, authenticated;
grant execute on function public.record_punch(uuid, text, text, uuid, boolean, uuid, int, text) to service_role;
