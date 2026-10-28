-- Daily job: at 02:30 Brisbane time, call the app's /api/cron/daily (keep-alive, encrypted backup,
-- retention, scan-log pruning). The bearer secret lives in Supabase Vault as 'qrclock_cron_secret'
-- (set once by hand, never in a migration); it must match CRON_SECRET on Vercel.
create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.call_daily_job() returns bigint
language plpgsql security definer set search_path = '' as $$
declare secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'qrclock_cron_secret';
  if secret is null then raise exception 'vault secret qrclock_cron_secret is missing'; end if;
  return net.http_post(
    url := 'https://qrclock.vercel.app/api/cron/daily',
    headers := jsonb_build_object('Authorization', 'Bearer ' || secret, 'Content-Type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
end $$;
revoke all on function public.call_daily_job() from public, anon, authenticated;

select cron.schedule('qrclock-daily', '30 16 * * *', 'select public.call_daily_job()');  -- 16:30 UTC = 02:30 AEST
