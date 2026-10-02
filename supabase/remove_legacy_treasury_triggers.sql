DO $$
DECLARE
  legacy_trigger record;
BEGIN
  FOR legacy_trigger IN
    SELECT table_namespace.nspname AS table_schema,
           table_record.relname AS table_name,
           trigger_record.tgname AS trigger_name
    FROM pg_trigger AS trigger_record
    JOIN pg_class AS table_record
      ON table_record.oid = trigger_record.tgrelid
    JOIN pg_namespace AS table_namespace
      ON table_namespace.oid = table_record.relnamespace
    JOIN pg_proc AS function_record
      ON function_record.oid = trigger_record.tgfoid
    JOIN pg_namespace AS function_namespace
      ON function_namespace.oid = function_record.pronamespace
    WHERE NOT trigger_record.tgisinternal
      AND function_namespace.nspname = 'public'
      AND function_record.proname IN (
        'sync_treasury_on_expense_approved',
        'sync_on_supplier_payment'
      )
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS %I ON %I.%I',
      legacy_trigger.trigger_name,
      legacy_trigger.table_schema,
      legacy_trigger.table_name
    );
  END LOOP;
END;
$$;

DROP FUNCTION IF EXISTS public.sync_treasury_on_expense_approved();
DROP FUNCTION IF EXISTS public.sync_on_supplier_payment();