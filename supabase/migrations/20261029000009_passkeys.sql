-- Optional Face ID / fingerprint (passkey) confirmation for phone punches. The biometric never
-- leaves the phone: QR Clock stores only the passkey's public key and a use counter.
alter table public.companies add column phone_require_passkey boolean not null default false;

create table public.passkeys (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  credential_id text not null unique,           -- base64url
  public_key text not null,                     -- base64url COSE key
  counter bigint not null default 0,
  transports text[],
  device_label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
create index passkeys_employee on public.passkeys (employee_id);
alter table public.passkeys enable row level security;
