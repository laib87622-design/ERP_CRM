create or replace function public.execute_internal_transfer(
  source_account_id uuid,
  target_account_id uuid,
  transfer_amount numeric,
  transfer_date timestamp,
  transfer_description text
)
returns void
language plpgsql
as $$
begin
  if source_account_id is null or target_account_id is null then
    raise exception 'Both source and target accounts are required';
  end if;

  if source_account_id = target_account_id then
    raise exception 'Source and target accounts must be different';
  end if;

  if transfer_amount is null or transfer_amount <= 0 then
    raise exception 'Transfer amount must be greater than zero';
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
    coalesce(transfer_description, 'Internal transfer'),
    'Bank transfer',
    (select label from public.financial_accounts where id = target_account_id),
    transfer_amount,
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
    coalesce(transfer_description, 'Internal transfer'),
    'Bank transfer',
    (select label from public.financial_accounts where id = source_account_id),
    0,
    transfer_amount,
    now()
  );

  update public.financial_accounts
  set current_balance = current_balance - transfer_amount
  where id = source_account_id;

  update public.financial_accounts
  set current_balance = current_balance + transfer_amount
  where id = target_account_id;
end;
$$;

grant execute on function public.execute_internal_transfer(uuid, uuid, numeric, timestamp, text) to authenticated;
grant execute on function public.execute_internal_transfer(uuid, uuid, numeric, timestamp, text) to service_role;