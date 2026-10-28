-- Clocking out straight from a break is a normal choice on the kiosk: the break ends at clock-out.
-- It is no longer flagged for review.
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
