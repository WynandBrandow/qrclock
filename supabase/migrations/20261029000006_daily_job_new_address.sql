-- QR Clock moved to https://clock.ccov.co.za; the daily job calls it there.
create or replace function public.call_daily_job() returns bigint
language plpgsql security definer set search_path = '' as $$
declare secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'qrclock_cron_secret';
  if secret is null then raise exception 'vault secret qrclock_cron_secret is missing'; end if;
  return net.http_post(
    url := 'https://clock.ccov.co.za/api/cron/daily',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end $$;
revoke all on function public.call_daily_job() from public, anon, authenticated;
