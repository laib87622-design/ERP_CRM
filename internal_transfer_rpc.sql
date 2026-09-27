create or replace function public.execute_internal_transfer(
  source_account_id uuid,
  target_account_id uuid,
  source_amount numeric,
  target_amount numeric,
  transfer_date timestamp,
  transfer_description text
)
returns void
language plpgsql
as $$
declare
  source_currency text;
  target_currency text;
  effective_target_amount numeric;
  effective_description text;
  exchange_rate numeric;
begin
  if source_account_id is null or target_account_id is null then
    raise exception 'Both source and target accounts are required';
  end if;

  if source_account_id = target_account_id then
    raise exception 'Source and target accounts must be different';
  end if;

  if source_amount is null or source_amount <= 0 then
    raise exception 'Transfer amount must be greater than zero';
  end if;

  effective_target_amount := coalesce(target_amount, source_amount);
  if effective_target_amount <= 0 then
    raise exception 'Target amount must be greater than zero';
  end if;

  select currency into source_currency from public.financial_accounts where id = source_account_id;
  select currency into target_currency from public.financial_accounts where id = target_account_id;

  effective_description := coalesce(transfer_description, 'Internal transfer');

  if source_currency is not null and target_currency is not null and source_currency <> target_currency then
    exchange_rate := source_amount / effective_target_amount;
    effective_description := effective_description || '. Exchange Rate: 1 ' || target_currency || ' = ' || round(exchange_rate, 4) || ' ' || source_currency;
  end if;

  insert into public.bank_entries (
    account_id,
    operation_date,
    description,
    operation_type,
    third_party,
    debit,
    credit,
    created_at
  )
  values (
    source_account_id,
    coalesce(transfer_date, now()),
    effective_description,
    'Bank transfer',
    (select label from public.financial_accounts where id = target_account_id),
    source_amount,
    0,
    now()
  );

  insert into public.bank_entries (
    account_id,
    operation_date,
    description,
    operation_type,
    third_party,
    debit,
    credit,
    created_at
  )
  values (
    target_account_id,
    coalesce(transfer_date, now()),
    effective_description,
    'Bank transfer',
    (select label from public.financial_accounts where id = source_account_id),
    0,
    effective_target_amount,
    now()
  );

  update public.financial_accounts
  set current_balance = current_balance - source_amount
  where id = source_account_id;

  update public.financial_accounts
  set current_balance = current_balance + effective_target_amount
  where id = target_account_id;
end;
$$;

grant execute on function public.execute_internal_transfer(uuid, uuid, numeric, numeric, timestamp, text) to authenticated;
grant execute on function public.execute_internal_transfer(uuid, uuid, numeric, numeric, timestamp, text) to service_role;