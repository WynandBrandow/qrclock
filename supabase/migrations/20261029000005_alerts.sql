-- Alerts: an opt-in daily summary email to managers, and a record of server errors so problems
-- are seen (on Review and in the summary) instead of disappearing into short-lived logs.
alter table public.companies add column daily_summary boolean not null default false;

create table public.app_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  path text,
  method text,
  message text not null,
  digest text
);
create index app_errors_time on public.app_errors (created_at desc);
alter table public.app_errors enable row level security;
