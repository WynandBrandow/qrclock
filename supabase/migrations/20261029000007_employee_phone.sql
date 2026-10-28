-- A contact phone number for each employee (optional; Australian mobiles stored as typed).
alter table public.employees add column phone text check (phone is null or length(phone) <= 30);
