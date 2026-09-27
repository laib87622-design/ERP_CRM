-- Full banking schema bootstrap for Airvoy
-- Run this in Supabase SQL Editor to ensure all banking tables, indexes, policies, and grants exist.

create extension if not exists pgcrypto;

-- 1) Financial accounts master table
create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  currency text not null default 'DZD',
  country text,
  bank_name text,
  iban text,
  swift_bic text,
  initial_balance numeric(14,2) not null default 0,
  current_balance numeric(14,2) not null default 0,
  status text default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.financial_accounts
  add column if not exists country text,
  add column if not exists bank_name text,
  add column if not exists iban text,
  add column if not exists swift_bic text,
  add column if not exists initial_balance numeric(14,2) not null default 0,
  add column if not exists current_balance numeric(14,2) not null default 0,
  add column if not exists status text default 'active',
  add column if not exists updated_at timestamptz not null default now();

-- 2) Account transaction log
create table if not exists public.financial_account_transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.financial_accounts(id) on delete cascade,
  type text not null default 'manual',
  amount numeric(14,2) not null default 0,
  description text,
  reference text,
  source text not null default 'manual',
  created_at timestamptz not null default now()
);

alter table public.financial_account_transactions
  add column if not exists type text default 'manual',
  add column if not exists source text default 'manual';

-- 3) Ledger entries used by the banking dashboard and bank calculation pages
create table if not exists public.bank_entries (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.financial_accounts(id) on delete cascade,
  operation_date timestamptz not null default now(),
  description text not null default 'Bank entry',
  operation_type text not null default 'manual',
  third_party text,
  debit numeric(14,2) not null default 0,
  credit numeric(14,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.bank_entries
  add column if not exists operation_date timestamptz not null default now(),
  add column if not exists description text not null default 'Bank entry',
  add column if not exists operation_type text not null default 'manual',
  add column if not exists third_party text,
  add column if not exists debit numeric(14,2) not null default 0,
  add column if not exists credit numeric(14,2) not null default 0;

-- 4) Helpful indexes
create index if not exists idx_financial_accounts_currency
  on public.financial_accounts(currency);

create index if not exists idx_financial_accounts_status
  on public.financial_accounts(status);

create index if not exists idx_financial_accounts_label
  on public.financial_accounts(lower(label));

create index if not exists idx_financial_account_transactions_account_id
  on public.financial_account_transactions(account_id);

create index if not exists idx_financial_account_transactions_created_at
  on public.financial_account_transactions(created_at desc);

create index if not exists idx_bank_entries_account_id
  on public.bank_entries(account_id);

create index if not exists idx_bank_entries_operation_date
  on public.bank_entries(operation_date desc);

create index if not exists idx_bank_entries_operation_type
  on public.bank_entries(operation_type);

-- 5) Ensure tables are protected by RLS
alter table public.financial_accounts enable row level security;
alter table public.financial_account_transactions enable row level security;
alter table public.bank_entries enable row level security;

-- 6) Drop existing policies first so they can be recreated safely

drop policy if exists "Users can view all financial accounts" on public.financial_accounts;
drop policy if exists "Users can insert financial accounts" on public.financial_accounts;
drop policy if exists "Users can update financial accounts" on public.financial_accounts;
drop policy if exists "Users can delete financial accounts" on public.financial_accounts;

drop policy if exists "Users can view all financial account transactions" on public.financial_account_transactions;
drop policy if exists "Users can insert financial account transactions" on public.financial_account_transactions;
drop policy if exists "Users can update financial account transactions" on public.financial_account_transactions;
drop policy if exists "Users can delete financial account transactions" on public.financial_account_transactions;

drop policy if exists "Users can view all bank entries" on public.bank_entries;
drop policy if exists "Users can insert bank entries" on public.bank_entries;
drop policy if exists "Users can update bank entries" on public.bank_entries;
drop policy if exists "Users can delete bank entries" on public.bank_entries;

-- 7) RLS policies
create policy "Users can view all financial accounts"
  on public.financial_accounts
  for select
  using (true);

create policy "Users can insert financial accounts"
  on public.financial_accounts
  for insert
  with check (true);

create policy "Users can update financial accounts"
  on public.financial_accounts
  for update
  using (true)
  with check (true);

create policy "Users can delete financial accounts"
  on public.financial_accounts
  for delete
  using (true);

create policy "Users can view all financial account transactions"
  on public.financial_account_transactions
  for select
  using (true);

create policy "Users can insert financial account transactions"
  on public.financial_account_transactions
  for insert
  with check (true);

create policy "Users can update financial account transactions"
  on public.financial_account_transactions
  for update
  using (true)
  with check (true);

create policy "Users can delete financial account transactions"
  on public.financial_account_transactions
  for delete
  using (true);

create policy "Users can view all bank entries"
  on public.bank_entries
  for select
  using (true);

create policy "Users can insert bank entries"
  on public.bank_entries
  for insert
  with check (true);

create policy "Users can update bank entries"
  on public.bank_entries
  for update
  using (true)
  with check (true);

create policy "Users can delete bank entries"
  on public.bank_entries
  for delete
  using (true);

-- 8) Grants for app and privileged roles
grant usage on schema public to anon, authenticated, service_role;

grant select, insert, update, delete on public.financial_accounts to anon, authenticated, service_role;
grant select, insert, update, delete on public.financial_account_transactions to anon, authenticated, service_role;
grant select, insert, update, delete on public.bank_entries to anon, authenticated, service_role;

-- 9) Helper function to safely reconcile an account balance from monetary movement
create or replace function public.reconcile_financial_account_balance(p_account_id uuid)
returns numeric
language plpgsql
as $$
declare
  v_total numeric := 0;
begin
  if p_account_id is null then
    return 0;
  end if;

  select coalesce(sum(case when type in ('in', 'credit') then amount else -amount end), 0)
    into v_total
  from public.financial_account_transactions
  where account_id = p_account_id;

  update public.financial_accounts
  set current_balance = coalesce(initial_balance, 0) + coalesce(v_total, 0),
      updated_at = now()
  where id = p_account_id;

  return coalesce(v_total, 0);
end;
$$;

grant execute on function public.reconcile_financial_account_balance(uuid) to authenticated, service_role;

-- 10) Optional trigger to keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_financial_accounts_updated_at on public.financial_accounts;
create trigger trg_financial_accounts_updated_at
before update on public.financial_accounts
for each row
execute function public.set_updated_at();

-- End of schema bootstrap.
