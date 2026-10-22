--
-- PostgreSQL database dump
--
-- Dumped from database version 17.6
-- Dumped by pg_dump version 18.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: public; Type: SCHEMA; Schema: -; Owner: -
--

CREATE SCHEMA public;


--
-- Name: SCHEMA public; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON SCHEMA public IS 'standard public schema';


--
-- Name: booking_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.booking_status AS ENUM (
    'pending',
    'confirmed',
    'cancelled',
    'processing'
);


--
-- Name: expense_category; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.expense_category AS ENUM (
    'electricity',
    'salary',
    'rent',
    'marketing',
    'other'
);


--
-- Name: invoice_status; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.invoice_status AS ENUM (
    'pending',
    'paid',
    'overdue',
    'partial'
);


--
-- Name: payment_method; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.payment_method AS ENUM (
    'cash',
    'credit_card',
    'baridimob'
);


--
-- Name: user_role; Type: TYPE; Schema: public; Owner: -
--

CREATE TYPE public.user_role AS ENUM (
    'super_admin',
    'sales_agent',
    'cashier',
    'viewer'
);


--
-- Name: auth_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.auth_role() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select role::text from public.profiles where id = auth.uid()
$$;


--
-- Name: enforce_commission_payment_guardrail(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.enforce_commission_payment_guardrail() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.status = 'PAID' THEN
    IF NEW.invoice_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.invoices i
        WHERE i.id = NEW.invoice_id
          AND i.status = 'paid'
          AND COALESCE(i.amount_paid, 0) >= COALESCE(i.grand_total, 0)
      ) THEN
        RETURN NEW;
      END IF;
    END IF;

    IF NEW.booking_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.id = NEW.booking_id
          AND b.status = 'confirmed'
      ) THEN
        RETURN NEW;
      END IF;
    END IF;

    RAISE EXCEPTION 'Commission payouts are blocked until the related invoice is fully paid or the booking is confirmed.';
  END IF;

  IF NEW.status = 'READY_TO_PAY' THEN
    IF NEW.invoice_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.invoices i
        WHERE i.id = NEW.invoice_id
          AND i.status = 'paid'
          AND COALESCE(i.amount_paid, 0) >= COALESCE(i.grand_total, 0)
      ) THEN
        RETURN NEW;
      END IF;
    END IF;

    IF NEW.booking_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1
        FROM public.bookings b
        WHERE b.id = NEW.booking_id
          AND b.status = 'confirmed'
      ) THEN
        RETURN NEW;
      END IF;
    END IF;

    RAISE EXCEPTION 'A commission cannot be marked READY_TO_PAY before the invoice is fully settled or the booking is confirmed.';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: ensure_bank_entries_are_ledger_safe(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.ensure_bank_entries_are_ledger_safe() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.debit IS NULL THEN
    NEW.debit := 0;
  END IF;

  IF NEW.credit IS NULL THEN
    NEW.credit := 0;
  END IF;

  IF NEW.debit < 0 OR NEW.credit < 0 THEN
    RAISE EXCEPTION 'Bank ledger entries cannot contain negative debit or credit values.';
  END IF;

  IF NEW.debit > 0 AND NEW.credit > 0 THEN
    RAISE EXCEPTION 'A single bank entry cannot record both debit and credit in the same row.';
  END IF;

  IF NEW.debit = 0 AND NEW.credit = 0 THEN
    RAISE EXCEPTION 'A bank entry must contain either a debit or a credit value.';
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: execute_internal_transfer(uuid, uuid, numeric, timestamp without time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.execute_internal_transfer(source_account_id uuid, target_account_id uuid, transfer_amount numeric, transfer_date timestamp without time zone, transfer_description text) RETURNS void
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: execute_internal_transfer(uuid, uuid, numeric, numeric, timestamp without time zone, text); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.execute_internal_transfer(source_account_id uuid, target_account_id uuid, source_amount numeric, target_amount numeric, transfer_date timestamp without time zone, transfer_description text) RETURNS void
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: generate_client_reference(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_client_reference() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  prefix text;
BEGIN
  IF NEW.reference IS NOT NULL AND NEW.reference <> '' THEN
    RETURN NEW;
  END IF;

  prefix := 'CL' || to_char(COALESCE(NEW.created_at, NOW()), 'YYMM');
  NEW.reference := prefix || '-' || lpad(nextval('public.clients_reference_seq')::text, 5, '0');
  RETURN NEW;
END;
$$;


--
-- Name: generate_invoice_reference(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_invoice_reference() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.reference := 'INV-' ||
    TO_CHAR(NOW(), 'YYMM') || '-' ||
    LPAD(NEW.invoice_number::text, 5, '0');
  RETURN NEW;
END;
$$;


--
-- Name: generate_supplier_reference(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.generate_supplier_reference() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  prefix text;
BEGIN
  IF NEW.reference IS NOT NULL AND NEW.reference <> '' THEN
    RETURN NEW;
  END IF;

  prefix := 'SU' || to_char(COALESCE(NEW.created_at, NOW()), 'YYMM');
  NEW.reference := prefix || '-' || lpad(nextval('public.suppliers_reference_seq')::text, 5, '0');
  RETURN NEW;
END;
$$;


--
-- Name: get_my_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_my_role() RETURNS text
    LANGUAGE sql STABLE
    AS $$
  SELECT role::text FROM profiles WHERE id = auth.uid()
$$;


--
-- Name: get_user_role(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.get_user_role() RETURNS public.user_role
    LANGUAGE sql SECURITY DEFINER
    AS $$
  SELECT role
  FROM public.profiles
  WHERE id = auth.uid()
  LIMIT 1;
$$;


--
-- Name: reconcile_financial_account_balance(uuid); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.reconcile_financial_account_balance(p_account_id uuid) RETURNS numeric
    LANGUAGE plpgsql
    AS $$
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


--
-- Name: save_service_template_workflow(uuid, text, text, text, text, jsonb); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.save_service_template_workflow(p_template_id uuid, p_title text, p_country_id text, p_visa_type_id text, p_professional_status text, p_stages jsonb) RETURNS void
    LANGUAGE plpgsql
    SET search_path TO 'public'
    AS $$
DECLARE
  stage_record JSONB;
  step_record JSONB;
  item_record JSONB;
  v_stage_id UUID;
  v_step_id UUID;
  v_item_id UUID;
  stage_ids UUID[] := ARRAY[]::UUID[];
  step_ids UUID[];
  item_ids UUID[];
  stage_index INTEGER := 0;
  step_index INTEGER;
  item_index INTEGER;
  item_price NUMERIC(12, 2);
  item_is_done BOOLEAN;
  stage_title TEXT;
  step_title TEXT;
  item_title TEXT;
BEGIN
  IF p_template_id IS NULL THEN
    RAISE EXCEPTION 'Template id is required.';
  END IF;

  IF NULLIF(BTRIM(p_title), '') IS NULL THEN
    RAISE EXCEPTION 'Template title is required.';
  END IF;

  IF NULLIF(BTRIM(p_country_id), '') IS NULL
    OR NULLIF(BTRIM(p_visa_type_id), '') IS NULL
    OR NULLIF(BTRIM(p_professional_status), '') IS NULL THEN
    RAISE EXCEPTION 'Country, visa type, and professional status are required.';
  END IF;

  IF p_stages IS NULL OR jsonb_typeof(p_stages) <> 'array' THEN
    RAISE EXCEPTION 'Workflow stages must be a JSON array.';
  END IF;

  UPDATE service_templates
  SET title = BTRIM(p_title),
      country_id = BTRIM(p_country_id),
      visa_type_id = BTRIM(p_visa_type_id),
      professional_status = BTRIM(p_professional_status)
  WHERE id = p_template_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template % does not exist.', p_template_id;
  END IF;

  FOR stage_record IN
    SELECT value FROM jsonb_array_elements(p_stages) AS stage_rows(value)
  LOOP
    stage_title := NULLIF(BTRIM(stage_record->>'title'), '');
    IF stage_title IS NULL THEN
      RAISE EXCEPTION 'Every stage must have a title.';
    END IF;
    IF stage_record ? 'steps' AND COALESCE(jsonb_typeof(stage_record->'steps'), 'null') <> 'array' THEN
      RAISE EXCEPTION 'Steps for stage "%" must be a JSON array.', stage_title;
    END IF;

    v_stage_id := NULLIF(stage_record->>'id', '')::UUID;
    IF v_stage_id IS NOT NULL THEN
      IF v_stage_id = ANY(stage_ids) THEN
        RAISE EXCEPTION 'Stage id % appears more than once.', v_stage_id;
      END IF;

      UPDATE service_stages
      SET title = stage_title,
          sort_order = stage_index
      WHERE id = v_stage_id
        AND service_template_id = p_template_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Stage id % does not belong to template %.', v_stage_id, p_template_id;
      END IF;
    ELSE
      INSERT INTO service_stages (service_template_id, title, sort_order)
      VALUES (p_template_id, stage_title, stage_index)
      RETURNING id INTO v_stage_id;
    END IF;
    stage_ids := array_append(stage_ids, v_stage_id);

    step_index := 0;
    step_ids := ARRAY[]::UUID[];
    FOR step_record IN
      SELECT value
      FROM jsonb_array_elements(COALESCE(stage_record->'steps', '[]'::jsonb)) AS step_rows(value)
    LOOP
      step_title := NULLIF(BTRIM(step_record->>'title'), '');
      IF step_title IS NULL THEN
        RAISE EXCEPTION 'Every step in stage "%" must have a title.', stage_title;
      END IF;
      IF step_record ? 'items' AND COALESCE(jsonb_typeof(step_record->'items'), 'null') <> 'array' THEN
        RAISE EXCEPTION 'Items for step "%" must be a JSON array.', step_title;
      END IF;

      v_step_id := NULLIF(step_record->>'id', '')::UUID;
      IF v_step_id IS NOT NULL THEN
        IF v_step_id = ANY(step_ids) THEN
          RAISE EXCEPTION 'Step id % appears more than once in stage %.', v_step_id, v_stage_id;
        END IF;

        UPDATE service_steps
        SET title = step_title,
            sort_order = step_index
        WHERE id = v_step_id
          AND stage_id = v_stage_id;

        IF NOT FOUND THEN
          RAISE EXCEPTION 'Step id % does not belong to stage %.', v_step_id, v_stage_id;
        END IF;
      ELSE
        INSERT INTO service_steps (stage_id, title, sort_order)
        VALUES (v_stage_id, step_title, step_index)
        RETURNING id INTO v_step_id;
      END IF;
      step_ids := array_append(step_ids, v_step_id);

      item_index := 0;
      item_ids := ARRAY[]::UUID[];
      FOR item_record IN
        SELECT value
        FROM jsonb_array_elements(COALESCE(step_record->'items', '[]'::jsonb)) AS item_rows(value)
      LOOP
        item_title := NULLIF(BTRIM(item_record->>'title'), '');
        IF item_title IS NULL THEN
          RAISE EXCEPTION 'Every item in step "%" must have a title.', step_title;
        END IF;

        item_price := COALESCE(NULLIF(item_record->>'estimated_price', '')::NUMERIC, 0);
        IF item_price < 0 THEN
          RAISE EXCEPTION 'Estimated price for item "%" cannot be negative.', item_title;
        END IF;
        item_is_done := COALESCE((item_record->>'is_done')::BOOLEAN, FALSE);

        v_item_id := NULLIF(item_record->>'id', '')::UUID;
        IF v_item_id IS NOT NULL THEN
          IF v_item_id = ANY(item_ids) THEN
            RAISE EXCEPTION 'Item id % appears more than once in step %.', v_item_id, v_step_id;
          END IF;

          UPDATE service_items
          SET title = item_title,
              standard_note = COALESCE(item_record->>'standard_note', ''),
              estimated_price = item_price,
              drive_url = NULLIF(item_record->>'drive_url', ''),
              is_done = item_is_done,
              sort_order = item_index
          WHERE id = v_item_id
            AND step_id = v_step_id;

          IF NOT FOUND THEN
            RAISE EXCEPTION 'Item id % does not belong to step %.', v_item_id, v_step_id;
          END IF;
        ELSE
          INSERT INTO service_items (
            step_id,
            title,
            standard_note,
            estimated_price,
            drive_url,
            is_done,
            sort_order
          )
          VALUES (
            v_step_id,
            item_title,
            COALESCE(item_record->>'standard_note', ''),
            item_price,
            NULLIF(item_record->>'drive_url', ''),
            item_is_done,
            item_index
          )
          RETURNING id INTO v_item_id;
        END IF;
        item_ids := array_append(item_ids, v_item_id);

        item_index := item_index + 1;
      END LOOP;

      DELETE FROM service_items
      WHERE step_id = v_step_id
        AND id <> ALL(item_ids);

      step_index := step_index + 1;
    END LOOP;

    DELETE FROM service_steps
    WHERE stage_id = v_stage_id
      AND id <> ALL(step_ids);

    stage_index := stage_index + 1;
  END LOOP;

  DELETE FROM service_stages
  WHERE service_template_id = p_template_id
    AND id <> ALL(stage_ids);
END;
$$;


--
-- Name: set_updated_at(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


--
-- Name: sync_booking_status_from_invoice(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_booking_status_from_invoice() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF NEW.booking_id IS NOT NULL THEN
    IF NEW.status = 'paid' THEN
      UPDATE bookings SET status = 'confirmed' WHERE id = NEW.booking_id;
    ELSIF NEW.status = 'pending' AND OLD.status IS DISTINCT FROM 'paid' THEN
      UPDATE bookings SET status = 'processing' WHERE id = NEW.booking_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;


--
-- Name: sync_supplier_bookings_count(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_supplier_bookings_count() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.supplier_id IS NOT NULL THEN
    UPDATE suppliers
    SET bookings_count = (
      SELECT COUNT(DISTINCT booking_id)
      FROM booking_service_lines
      WHERE supplier_id = NEW.supplier_id
    )
    WHERE id = NEW.supplier_id;

  ELSIF TG_OP = 'DELETE' AND OLD.supplier_id IS NOT NULL THEN
    UPDATE suppliers
    SET bookings_count = (
      SELECT COUNT(DISTINCT booking_id)
      FROM booking_service_lines
      WHERE supplier_id = OLD.supplier_id
    )
    WHERE id = OLD.supplier_id;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.supplier_id IS NOT NULL THEN
      UPDATE suppliers
      SET bookings_count = (
        SELECT COUNT(DISTINCT booking_id)
        FROM booking_service_lines
        WHERE supplier_id = OLD.supplier_id
      )
      WHERE id = OLD.supplier_id;
    END IF;
    IF NEW.supplier_id IS NOT NULL THEN
      UPDATE suppliers
      SET bookings_count = (
        SELECT COUNT(DISTINCT booking_id)
        FROM booking_service_lines
        WHERE supplier_id = NEW.supplier_id
      )
      WHERE id = NEW.supplier_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


--
-- Name: sync_supplier_debt(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_supplier_debt() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- On INSERT: add cost_price as debt to the supplier
  IF TG_OP = 'INSERT' AND NEW.supplier_id IS NOT NULL AND NEW.cost_price > 0 THEN
    UPDATE suppliers
    SET supplier_debt = supplier_debt + NEW.cost_price
    WHERE id = NEW.supplier_id;

  -- On UPDATE: adjust by the delta (handles supplier change too)
  ELSIF TG_OP = 'UPDATE' THEN
    -- Remove old debt from old supplier
    IF OLD.supplier_id IS NOT NULL AND OLD.cost_price > 0 THEN
      UPDATE suppliers
      SET supplier_debt = supplier_debt - OLD.cost_price
      WHERE id = OLD.supplier_id;
    END IF;
    -- Add new debt to new supplier
    IF NEW.supplier_id IS NOT NULL AND NEW.cost_price > 0 THEN
      UPDATE suppliers
      SET supplier_debt = supplier_debt + NEW.cost_price
      WHERE id = NEW.supplier_id;
    END IF;

  -- On DELETE: remove the debt
  ELSIF TG_OP = 'DELETE' AND OLD.supplier_id IS NOT NULL AND OLD.cost_price > 0 THEN
    UPDATE suppliers
    SET supplier_debt = supplier_debt - OLD.cost_price
    WHERE id = OLD.supplier_id;
  END IF;

  RETURN NEW;
END;
$$;


--
-- Name: sync_supplier_debt_from_service_line(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.sync_supplier_debt_from_service_line() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.supplier_id IS NOT NULL AND NEW.cost_price > 0 THEN
    UPDATE suppliers SET supplier_debt = supplier_debt + NEW.cost_price WHERE id = NEW.supplier_id;

  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.supplier_id IS NOT NULL AND OLD.cost_price > 0 THEN
      UPDATE suppliers SET supplier_debt = supplier_debt - OLD.cost_price WHERE id = OLD.supplier_id;
    END IF;
    IF NEW.supplier_id IS NOT NULL AND NEW.cost_price > 0 THEN
      UPDATE suppliers SET supplier_debt = supplier_debt + NEW.cost_price WHERE id = NEW.supplier_id;
    END IF;

  ELSIF TG_OP = 'DELETE' AND OLD.supplier_id IS NOT NULL AND OLD.cost_price > 0 THEN
    UPDATE suppliers SET supplier_debt = supplier_debt - OLD.cost_price WHERE id = OLD.supplier_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agency_links; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agency_links (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    url text NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    category text
);


--
-- Name: agency_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agency_settings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agency_name text DEFAULT 'AIRVOY TRAVEL SERVICES'::text,
    logo_url text,
    address text,
    city text DEFAULT 'Algiers'::text,
    wilaya text,
    rc_number text,
    nif text,
    nis text,
    ai text,
    phone text,
    fax text,
    email text,
    bank_name text,
    bank_account text,
    iban text,
    created_at timestamp with time zone DEFAULT now(),
    package_type_descriptions jsonb DEFAULT '{"hajj": "Hajj package service including pilgrimage arrangements and hospitality support.", "omra": "Omra package service including travel, accommodation, and pilgrimage support.", "trip": "Standard trip package service.", "hotel_promotion": "Hotel promotion service with accommodation arrangements and stay support.", "ticket_promotion": "Air ticket promotion service with flight arrangements and travel support."}'::jsonb NOT NULL,
    commission_rules jsonb DEFAULT '{"hajj": {"amount": 0, "method": "percentage", "enabled": true, "percentage": 12, "target_type": "package"}, "omra": {"amount": 0, "method": "percentage", "enabled": true, "percentage": 12, "target_type": "package"}, "trip": {"amount": 0, "method": "percentage", "enabled": true, "percentage": 10, "target_type": "package"}, "hotel_promotion": {"amount": 0, "method": "amount", "enabled": true, "percentage": 0, "target_type": "package"}, "ticket_promotion": {"amount": 0, "method": "amount", "enabled": true, "percentage": 0, "target_type": "package"}}'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    enable_package_lines boolean DEFAULT true,
    admin_pin text,
    secure_delete_pin text,
    singleton_guard boolean DEFAULT true,
    CONSTRAINT agency_settings_singleton CHECK ((singleton_guard = true))
);


--
-- Name: agent_commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.agent_commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid NOT NULL,
    booking_id uuid,
    invoice_id uuid,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'PENDING_PAYMENT'::text NOT NULL,
    notes text,
    paid_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    salary_month text,
    CONSTRAINT agent_commissions_amount_positive CHECK ((amount >= (0)::numeric)),
    CONSTRAINT agent_commissions_status_check CHECK ((status = ANY (ARRAY['PENDING_PAYMENT'::text, 'READY_TO_PAY'::text, 'PAID'::text, 'CANCELLED'::text]))),
    CONSTRAINT agent_commissions_status_valid CHECK ((status = ANY (ARRAY['PENDING_PAYMENT'::text, 'READY_TO_PAY'::text, 'PAID'::text, 'CANCELLED'::text])))
);


--
-- Name: bank_entries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bank_entries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    operation_date timestamp with time zone DEFAULT now() NOT NULL,
    description text NOT NULL,
    operation_type text NOT NULL,
    third_party text,
    debit numeric(14,2) DEFAULT 0 NOT NULL,
    credit numeric(14,2) DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    agent_id uuid,
    CONSTRAINT bank_entries_amounts_valid CHECK (((debit >= (0)::numeric) AND (credit >= (0)::numeric) AND ((debit > (0)::numeric) OR (credit > (0)::numeric)) AND (NOT ((debit > (0)::numeric) AND (credit > (0)::numeric)))))
);


--
-- Name: booking_packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    package_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: booking_service_lines; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_service_lines (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    service_type_id uuid,
    supplier_id uuid,
    description text,
    quantity integer DEFAULT 1 NOT NULL,
    unit_price numeric DEFAULT 0 NOT NULL,
    cost_price numeric DEFAULT 0 NOT NULL,
    details jsonb DEFAULT '{}'::jsonb NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    selling_price numeric DEFAULT 0,
    tva_rate numeric DEFAULT 0,
    CONSTRAINT booking_service_lines_tva_rate_check CHECK ((tva_rate = ANY (ARRAY[(0)::numeric, (9)::numeric, (19)::numeric])))
);


--
-- Name: booking_suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.booking_suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: bookings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.bookings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    package_id uuid,
    supplier_id uuid,
    status public.booking_status DEFAULT 'pending'::public.booking_status,
    created_at timestamp with time zone DEFAULT now(),
    service_id uuid,
    selling_price numeric DEFAULT 0.00,
    package_ids uuid[],
    finish_date date,
    cost_price numeric(12,2) DEFAULT 0 NOT NULL,
    note text,
    reference text,
    companions jsonb DEFAULT '[]'::jsonb,
    co_clients uuid[] DEFAULT '{}'::uuid[] NOT NULL,
    passengers jsonb DEFAULT '[]'::jsonb NOT NULL,
    agent_id uuid
);


--
-- Name: cities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_id uuid NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: client_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    order_date timestamp with time zone DEFAULT now(),
    end_date date,
    agent_id uuid,
    order_status text DEFAULT 'New'::text,
    service_type text,
    destination text,
    number_of_persons integer DEFAULT 1,
    budget numeric,
    client_name text NOT NULL,
    source_of_request text,
    note text,
    file_url text,
    created_at timestamp with time zone DEFAULT now(),
    email text,
    phone text
);


--
-- Name: client_services; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.client_services (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    client_id uuid,
    template_id uuid,
    stages_data jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    full_name text NOT NULL,
    phone text,
    email text,
    passport_number text,
    notes text,
    created_at timestamp with time zone DEFAULT now(),
    passport_link text,
    marital_status text,
    civil_status text,
    father_name text,
    mother_name text,
    visa_location text,
    address text,
    companions jsonb DEFAULT '[]'::jsonb,
    birth_date date,
    sex text,
    passport_validity_date date,
    reference text,
    city text,
    country text,
    tags jsonb DEFAULT '[]'::jsonb
);


--
-- Name: clients_reference_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.clients_reference_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: commission_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.commission_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    invoice_id uuid,
    target_type text DEFAULT 'package'::text NOT NULL,
    target_id uuid,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    status text DEFAULT 'pending'::text NOT NULL,
    paid_at timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT commission_payments_amount_positive CHECK ((amount >= (0)::numeric)),
    CONSTRAINT commission_payments_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text])))
);


--
-- Name: countries; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.countries (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: employee_commissions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.employee_commissions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    agent_id uuid,
    booking_id uuid,
    commission_amount numeric NOT NULL,
    status public.invoice_status DEFAULT 'pending'::public.invoice_status,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: expenses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.expenses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    category public.expense_category NOT NULL,
    amount numeric NOT NULL,
    method public.payment_method NOT NULL,
    recorded_by uuid,
    date timestamp with time zone DEFAULT now(),
    template_id uuid,
    note text,
    status text DEFAULT 'pending'::text NOT NULL,
    approved_by uuid,
    approved_at timestamp with time zone,
    rejected_reason text,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT expenses_amount_positive CHECK ((amount > (0)::numeric)),
    CONSTRAINT expenses_approval_rule CHECK (((status <> 'approved'::text) OR ((approved_by IS NOT NULL) AND (approved_at IS NOT NULL)))),
    CONSTRAINT expenses_method_valid CHECK ((method = ANY (ARRAY['cash'::public.payment_method, 'credit_card'::public.payment_method, 'baridimob'::public.payment_method]))),
    CONSTRAINT expenses_status_valid CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])))
);


--
-- Name: financial_account_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_account_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    account_id uuid NOT NULL,
    type text DEFAULT 'manual'::text NOT NULL,
    amount numeric(14,2) DEFAULT 0 NOT NULL,
    description text,
    reference text,
    source text DEFAULT 'manual'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: financial_accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.financial_accounts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL,
    currency text DEFAULT 'DZD'::text NOT NULL,
    country text,
    initial_balance numeric(14,2) DEFAULT 0 NOT NULL,
    current_balance numeric(14,2) DEFAULT 0 NOT NULL,
    bank_name text,
    iban text,
    swift_bic text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'active'::text,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    accepted_payment_methods text[] DEFAULT '{cash,bank_transfer,credit_card,baridimob}'::text[]
);


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.invoices (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    booking_id uuid,
    client_id uuid,
    invoice_number integer NOT NULL,
    subtotal numeric NOT NULL,
    apply_tva boolean DEFAULT false,
    tva_amount numeric DEFAULT 0.00,
    grand_total numeric NOT NULL,
    status public.invoice_status DEFAULT 'pending'::public.invoice_status,
    due_date date,
    created_at timestamp with time zone DEFAULT now(),
    payment_method text,
    paid_at timestamp with time zone,
    is_expense boolean DEFAULT false NOT NULL,
    expense_category text,
    expense_template_id uuid,
    reference text,
    note text,
    is_template boolean DEFAULT false NOT NULL,
    amount_paid numeric DEFAULT 0,
    payment_type text DEFAULT 'full'::text,
    account_id uuid,
    agent_id uuid,
    CONSTRAINT invoices_payment_type_check CHECK ((payment_type = ANY (ARRAY['full'::text, 'partial'::text])))
);


--
-- Name: invoices_invoice_number_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.invoices_invoice_number_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: invoices_invoice_number_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.invoices_invoice_number_seq OWNED BY public.invoices.invoice_number;


--
-- Name: marketing_campaigns; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.marketing_campaigns (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    platform text NOT NULL,
    budget numeric DEFAULT 0.00 NOT NULL,
    status text DEFAULT 'active'::text,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: master_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.master_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    country_id text NOT NULL,
    visa_type_id text NOT NULL,
    professional_status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    user_id uuid NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    channel text DEFAULT 'push'::text NOT NULL,
    type text DEFAULT 'info'::text NOT NULL,
    is_read boolean DEFAULT false NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    read_at timestamp with time zone,
    route text,
    CONSTRAINT notifications_channel_valid CHECK ((channel = ANY (ARRAY['system'::text, 'email'::text, 'sms'::text, 'push'::text]))),
    CONSTRAINT notifications_type_valid CHECK ((type = ANY (ARRAY['info'::text, 'success'::text, 'warning'::text, 'error'::text])))
);


--
-- Name: package_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.package_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_type text DEFAULT 'trip'::text NOT NULL,
    type text DEFAULT 'national'::text NOT NULL,
    label text NOT NULL,
    service_ref text,
    country text,
    destination text,
    departure_date date,
    return_date date,
    duration_nights integer,
    departure_point text,
    transport text,
    hotels jsonb DEFAULT '[]'::jsonb,
    transfert boolean DEFAULT false,
    excursion text,
    visa_included boolean DEFAULT false,
    assurance boolean DEFAULT true,
    plan_de_vol text,
    is_active boolean DEFAULT true,
    brochure_url text,
    created_by uuid,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now(),
    is_available boolean DEFAULT true,
    selling_price numeric DEFAULT 0,
    cost_price numeric DEFAULT 0,
    supplier_id uuid,
    photos jsonb DEFAULT '[]'::jsonb,
    travel_schedule jsonb DEFAULT '[]'::jsonb NOT NULL,
    inclusions jsonb DEFAULT '[]'::jsonb NOT NULL,
    exclusions jsonb DEFAULT '[]'::jsonb NOT NULL,
    cancellation_policy text,
    good_to_know text,
    location text,
    distance_from_haram numeric,
    flight_details jsonb DEFAULT '{}'::jsonb,
    target_tags jsonb DEFAULT '[]'::jsonb,
    stock integer DEFAULT 0 NOT NULL,
    hotel_details jsonb DEFAULT '{}'::jsonb,
    description text,
    supplier_drive_link text,
    CONSTRAINT package_templates_template_type_check CHECK ((template_type = ANY (ARRAY['trip'::text, 'hajj'::text, 'omra'::text, 'ticket_promotion'::text, 'hotel_promotion'::text])))
);


--
-- Name: packages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.packages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    template_id uuid,
    title text NOT NULL,
    cost_price numeric DEFAULT 0,
    selling_price numeric DEFAULT 0,
    is_available boolean DEFAULT true,
    supplier_id uuid,
    brochure_url text,
    created_at timestamp with time zone DEFAULT now(),
    destination text,
    price numeric DEFAULT 0 NOT NULL,
    pricing_mode text DEFAULT 'fixed'::text NOT NULL
);


--
-- Name: packages_legacy; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.packages_legacy (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    destination text NOT NULL,
    price numeric NOT NULL,
    inclusions jsonb DEFAULT '[]'::jsonb,
    is_available boolean DEFAULT true,
    created_at timestamp with time zone DEFAULT now(),
    supplier_id uuid,
    cost_price numeric(12,2) DEFAULT 0 NOT NULL,
    pricing_mode text DEFAULT 'fixed'::text NOT NULL
);


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id uuid NOT NULL,
    full_name text NOT NULL,
    role public.user_role DEFAULT 'viewer'::public.user_role NOT NULL,
    created_at timestamp with time zone DEFAULT now(),
    base_salary numeric DEFAULT 0,
    avatar_url text,
    permissions jsonb DEFAULT '{"clients": true, "finance": false, "bookings": true, "settings": false, "dashboard": true}'::jsonb,
    salary_pay_day integer,
    CONSTRAINT profiles_salary_pay_day_check CHECK (((salary_pay_day >= 1) AND (salary_pay_day <= 31)))
);


--
-- Name: proposals; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.proposals (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    request_id uuid,
    total_price numeric DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    requirement_check_list jsonb DEFAULT '[]'::jsonb,
    add_inclusions jsonb DEFAULT '[]'::jsonb,
    enabled_fields jsonb DEFAULT '{"visa": true, "assurance": true, "destination": true, "accommodation": true, "transportation": true}'::jsonb,
    destination jsonb DEFAULT '[]'::jsonb,
    visa jsonb DEFAULT '[]'::jsonb,
    transportation jsonb DEFAULT '[]'::jsonb,
    accommodation jsonb DEFAULT '[]'::jsonb,
    assurance jsonb DEFAULT '[]'::jsonb
);


--
-- Name: recurring_expense_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.recurring_expense_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    category text DEFAULT 'general'::text NOT NULL,
    amount numeric(12,2) DEFAULT 0 NOT NULL,
    payment_method text DEFAULT 'cash'::text NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: relationship_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.relationship_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    label text NOT NULL
);


--
-- Name: service_clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_clients (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_template_id uuid NOT NULL,
    client_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: service_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_items (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    step_id uuid NOT NULL,
    title text NOT NULL,
    drive_url text,
    is_done boolean DEFAULT false,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    standard_note text DEFAULT ''::text NOT NULL,
    estimated_price numeric(12,2) DEFAULT 0 NOT NULL
);


--
-- Name: service_stages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_stages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_template_id uuid NOT NULL,
    title text NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: service_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    stage_id uuid NOT NULL,
    title text NOT NULL,
    sort_order integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now()
);


--
-- Name: service_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_templates (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    country_id text NOT NULL,
    visa_type_id text NOT NULL,
    title text NOT NULL,
    stages_data jsonb DEFAULT '[]'::jsonb NOT NULL,
    name text,
    client_id uuid,
    supplier_id uuid,
    package_id uuid,
    professional_status text
);


--
-- Name: service_type_fields; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_type_fields (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_type_id uuid NOT NULL,
    name text NOT NULL,
    field_key text NOT NULL,
    field_type text DEFAULT 'text'::text NOT NULL,
    options jsonb DEFAULT '[]'::jsonb,
    required boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT service_type_fields_field_type_check CHECK ((field_type = ANY (ARRAY['text'::text, 'number'::text, 'date'::text, 'select'::text, 'checkbox'::text, 'textarea'::text])))
);


--
-- Name: service_type_suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_type_suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    service_type_id uuid NOT NULL,
    supplier_id uuid NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: service_types; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.service_types (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    name_ar text,
    description text,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    category text
);


--
-- Name: supplier_payments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.supplier_payments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    supplier_id uuid NOT NULL,
    amount numeric NOT NULL,
    payment_method public.payment_method NOT NULL,
    note text,
    paid_at timestamp with time zone DEFAULT now(),
    created_at timestamp with time zone DEFAULT now(),
    account_id uuid
);


--
-- Name: suppliers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.suppliers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name text NOT NULL,
    star_rating numeric(2,1) DEFAULT 0.0,
    supplier_debt numeric DEFAULT 0.00,
    bookings_count integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now(),
    website_url text,
    phone text,
    fax text,
    address text,
    country text,
    state_province text,
    email text,
    nif text,
    nis text,
    rc text,
    reference text,
    type text DEFAULT 'General'::text NOT NULL
);


--
-- Name: suppliers_reference_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.suppliers_reference_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tasks; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tasks (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    title text NOT NULL,
    status text DEFAULT 'To Do'::text,
    priority text DEFAULT 'Medium'::text,
    client_id uuid,
    supplier_id uuid,
    created_at timestamp with time zone DEFAULT now(),
    service_id uuid,
    package_id uuid
);


--
-- Name: invoices invoice_number; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices ALTER COLUMN invoice_number SET DEFAULT nextval('public.invoices_invoice_number_seq'::regclass);


--
-- Name: agency_links agency_links_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_links
    ADD CONSTRAINT agency_links_pkey PRIMARY KEY (id);


--
-- Name: agency_settings agency_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_settings
    ADD CONSTRAINT agency_settings_pkey PRIMARY KEY (id);


--
-- Name: agency_settings agency_settings_singleton_guard_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agency_settings
    ADD CONSTRAINT agency_settings_singleton_guard_key UNIQUE (singleton_guard);


--
-- Name: agent_commissions agent_commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_commissions
    ADD CONSTRAINT agent_commissions_pkey PRIMARY KEY (id);


--
-- Name: bank_entries bank_entries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_entries
    ADD CONSTRAINT bank_entries_pkey PRIMARY KEY (id);


--
-- Name: booking_packages booking_packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_packages
    ADD CONSTRAINT booking_packages_pkey PRIMARY KEY (id);


--
-- Name: booking_packages booking_packages_unique_pair; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_packages
    ADD CONSTRAINT booking_packages_unique_pair UNIQUE (booking_id, package_id);


--
-- Name: booking_service_lines booking_service_lines_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_service_lines
    ADD CONSTRAINT booking_service_lines_pkey PRIMARY KEY (id);


--
-- Name: booking_suppliers booking_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_suppliers
    ADD CONSTRAINT booking_suppliers_pkey PRIMARY KEY (id);


--
-- Name: booking_suppliers booking_suppliers_unique_pair; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_suppliers
    ADD CONSTRAINT booking_suppliers_unique_pair UNIQUE (booking_id, supplier_id);


--
-- Name: bookings bookings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_pkey PRIMARY KEY (id);


--
-- Name: cities cities_country_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_country_name_unique UNIQUE (country_id, name);


--
-- Name: cities cities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_pkey PRIMARY KEY (id);


--
-- Name: client_requests client_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_requests
    ADD CONSTRAINT client_requests_pkey PRIMARY KEY (id);


--
-- Name: client_services client_services_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_services
    ADD CONSTRAINT client_services_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: clients clients_reference_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_reference_unique UNIQUE (reference);


--
-- Name: commission_payments commission_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.commission_payments
    ADD CONSTRAINT commission_payments_pkey PRIMARY KEY (id);


--
-- Name: countries countries_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_name_key UNIQUE (name);


--
-- Name: countries countries_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.countries
    ADD CONSTRAINT countries_pkey PRIMARY KEY (id);


--
-- Name: employee_commissions employee_commissions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_commissions
    ADD CONSTRAINT employee_commissions_pkey PRIMARY KEY (id);


--
-- Name: expenses expenses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_pkey PRIMARY KEY (id);


--
-- Name: financial_account_transactions financial_account_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_account_transactions
    ADD CONSTRAINT financial_account_transactions_pkey PRIMARY KEY (id);


--
-- Name: financial_accounts financial_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_accounts
    ADD CONSTRAINT financial_accounts_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: marketing_campaigns marketing_campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.marketing_campaigns
    ADD CONSTRAINT marketing_campaigns_pkey PRIMARY KEY (id);


--
-- Name: master_templates master_templates_country_id_visa_type_id_professional_statu_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_templates
    ADD CONSTRAINT master_templates_country_id_visa_type_id_professional_statu_key UNIQUE (country_id, visa_type_id, professional_status);


--
-- Name: master_templates master_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.master_templates
    ADD CONSTRAINT master_templates_pkey PRIMARY KEY (id);


--
-- Name: notifications notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_pkey PRIMARY KEY (id);


--
-- Name: package_templates package_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_templates
    ADD CONSTRAINT package_templates_pkey PRIMARY KEY (id);


--
-- Name: packages_legacy packages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages_legacy
    ADD CONSTRAINT packages_pkey PRIMARY KEY (id);


--
-- Name: packages packages_pkey1; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_pkey1 PRIMARY KEY (id);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: proposals proposals_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_pkey PRIMARY KEY (id);


--
-- Name: recurring_expense_templates recurring_expense_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.recurring_expense_templates
    ADD CONSTRAINT recurring_expense_templates_pkey PRIMARY KEY (id);


--
-- Name: relationship_types relationship_types_label_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_types
    ADD CONSTRAINT relationship_types_label_key UNIQUE (label);


--
-- Name: relationship_types relationship_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.relationship_types
    ADD CONSTRAINT relationship_types_pkey PRIMARY KEY (id);


--
-- Name: service_clients service_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_clients
    ADD CONSTRAINT service_clients_pkey PRIMARY KEY (id);


--
-- Name: service_clients service_clients_unique_pair; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_clients
    ADD CONSTRAINT service_clients_unique_pair UNIQUE (service_template_id, client_id);


--
-- Name: service_items service_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_items
    ADD CONSTRAINT service_items_pkey PRIMARY KEY (id);


--
-- Name: service_stages service_stages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_stages
    ADD CONSTRAINT service_stages_pkey PRIMARY KEY (id);


--
-- Name: service_steps service_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_steps
    ADD CONSTRAINT service_steps_pkey PRIMARY KEY (id);


--
-- Name: service_templates service_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_templates
    ADD CONSTRAINT service_templates_pkey PRIMARY KEY (id);


--
-- Name: service_type_fields service_type_fields_key_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_type_fields
    ADD CONSTRAINT service_type_fields_key_unique UNIQUE (service_type_id, field_key);


--
-- Name: service_type_fields service_type_fields_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_type_fields
    ADD CONSTRAINT service_type_fields_pkey PRIMARY KEY (id);


--
-- Name: service_type_suppliers service_type_suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_type_suppliers
    ADD CONSTRAINT service_type_suppliers_pkey PRIMARY KEY (id);


--
-- Name: service_type_suppliers service_type_suppliers_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_type_suppliers
    ADD CONSTRAINT service_type_suppliers_unique UNIQUE (service_type_id, supplier_id);


--
-- Name: service_types service_types_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_types
    ADD CONSTRAINT service_types_pkey PRIMARY KEY (id);


--
-- Name: supplier_payments supplier_payments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_pkey PRIMARY KEY (id);


--
-- Name: suppliers suppliers_reference_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.suppliers
    ADD CONSTRAINT suppliers_reference_unique UNIQUE (reference);


--
-- Name: tasks tasks_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_pkey PRIMARY KEY (id);


--
-- Name: agent_commissions_booking_invoice_agent_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX agent_commissions_booking_invoice_agent_unique ON public.agent_commissions USING btree (booking_id, invoice_id, agent_id);


--
-- Name: booking_packages_booking_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_packages_booking_idx ON public.booking_packages USING btree (booking_id);


--
-- Name: booking_packages_package_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_packages_package_idx ON public.booking_packages USING btree (package_id);


--
-- Name: booking_suppliers_booking_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_suppliers_booking_idx ON public.booking_suppliers USING btree (booking_id);


--
-- Name: booking_suppliers_supplier_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX booking_suppliers_supplier_idx ON public.booking_suppliers USING btree (supplier_id);


--
-- Name: bookings_co_clients_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_co_clients_idx ON public.bookings USING gin (co_clients);


--
-- Name: bookings_package_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_package_id_idx ON public.bookings USING btree (package_id);


--
-- Name: bookings_passengers_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX bookings_passengers_idx ON public.bookings USING gin (passengers);


--
-- Name: expenses_date_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_date_idx ON public.expenses USING btree (date DESC);


--
-- Name: expenses_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_status_idx ON public.expenses USING btree (status);


--
-- Name: expenses_template_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX expenses_template_idx ON public.expenses USING btree (template_id);


--
-- Name: idx_agent_salary_month_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_agent_salary_month_unique ON public.agent_commissions USING btree (agent_id, salary_month) WHERE (salary_month IS NOT NULL);


--
-- Name: idx_bank_entries_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_entries_account_id ON public.bank_entries USING btree (account_id);


--
-- Name: idx_bank_entries_operation_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_entries_operation_date ON public.bank_entries USING btree (operation_date DESC);


--
-- Name: idx_bank_entries_operation_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_bank_entries_operation_type ON public.bank_entries USING btree (operation_type);


--
-- Name: idx_cities_country_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cities_country_id ON public.cities USING btree (country_id);


--
-- Name: idx_cities_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cities_name ON public.cities USING btree (lower(name));


--
-- Name: idx_countries_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_countries_name ON public.countries USING btree (lower(name));


--
-- Name: idx_financial_account_transactions_account_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_account_transactions_account_id ON public.financial_account_transactions USING btree (account_id);


--
-- Name: idx_financial_account_transactions_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_account_transactions_created_at ON public.financial_account_transactions USING btree (created_at DESC);


--
-- Name: idx_financial_accounts_currency; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_accounts_currency ON public.financial_accounts USING btree (currency);


--
-- Name: idx_financial_accounts_label; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_accounts_label ON public.financial_accounts USING btree (lower(label));


--
-- Name: idx_financial_accounts_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_financial_accounts_status ON public.financial_accounts USING btree (status);


--
-- Name: idx_master_templates_country; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_master_templates_country ON public.master_templates USING btree (country_id);


--
-- Name: idx_master_templates_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_master_templates_status ON public.master_templates USING btree (professional_status);


--
-- Name: idx_master_templates_visa; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_master_templates_visa ON public.master_templates USING btree (visa_type_id);


--
-- Name: idx_service_type_fields_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_service_type_fields_type ON public.service_type_fields USING btree (service_type_id, sort_order);


--
-- Name: invoices_is_expense_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX invoices_is_expense_idx ON public.invoices USING btree (is_expense);


--
-- Name: master_template_matrix_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX master_template_matrix_idx ON public.service_templates USING btree (country_id, visa_type_id, professional_status) WHERE (client_id IS NULL);


--
-- Name: notifications_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_idx ON public.notifications USING btree (user_id, created_at DESC);


--
-- Name: notifications_user_unread_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX notifications_user_unread_idx ON public.notifications USING btree (user_id, is_read, created_at DESC);


--
-- Name: package_templates_country_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX package_templates_country_idx ON public.package_templates USING btree (country);


--
-- Name: package_templates_exclusions_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX package_templates_exclusions_idx ON public.package_templates USING gin (exclusions);


--
-- Name: package_templates_inclusions_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX package_templates_inclusions_idx ON public.package_templates USING gin (inclusions);


--
-- Name: package_templates_travel_schedule_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX package_templates_travel_schedule_idx ON public.package_templates USING gin (travel_schedule);


--
-- Name: package_templates_type_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX package_templates_type_idx ON public.package_templates USING btree (template_type);


--
-- Name: recurring_expense_templates_active_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX recurring_expense_templates_active_idx ON public.recurring_expense_templates USING btree (is_active);


--
-- Name: recurring_expense_templates_name_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX recurring_expense_templates_name_unique ON public.recurring_expense_templates USING btree (lower(name)) WHERE (is_active = true);


--
-- Name: service_clients_client_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_clients_client_idx ON public.service_clients USING btree (client_id);


--
-- Name: service_clients_service_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX service_clients_service_idx ON public.service_clients USING btree (service_template_id);


--
-- Name: supplier_payments_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX supplier_payments_account_idx ON public.supplier_payments USING btree (account_id);


--
-- Name: suppliers_website_url_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX suppliers_website_url_idx ON public.suppliers USING btree (website_url);


--
-- Name: invoices trg_booking_status_from_invoice; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_booking_status_from_invoice AFTER INSERT OR UPDATE ON public.invoices FOR EACH ROW EXECUTE FUNCTION public.sync_booking_status_from_invoice();


--
-- Name: bookings trg_booking_supplier_debt; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_booking_supplier_debt AFTER INSERT OR DELETE OR UPDATE ON public.bookings FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_debt();


--
-- Name: clients trg_clients_generate_reference; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_clients_generate_reference BEFORE INSERT ON public.clients FOR EACH ROW EXECUTE FUNCTION public.generate_client_reference();


--
-- Name: agent_commissions trg_enforce_commission_payment_guardrail; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_enforce_commission_payment_guardrail BEFORE INSERT OR UPDATE OF status, invoice_id ON public.agent_commissions FOR EACH ROW EXECUTE FUNCTION public.enforce_commission_payment_guardrail();


--
-- Name: bank_entries trg_ensure_bank_entries_are_ledger_safe; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_ensure_bank_entries_are_ledger_safe BEFORE INSERT OR UPDATE OF debit, credit ON public.bank_entries FOR EACH ROW EXECUTE FUNCTION public.ensure_bank_entries_are_ledger_safe();


--
-- Name: financial_accounts trg_financial_accounts_updated_at; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_financial_accounts_updated_at BEFORE UPDATE ON public.financial_accounts FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


--
-- Name: invoices trg_invoice_reference; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_invoice_reference BEFORE INSERT ON public.invoices FOR EACH ROW WHEN (((new.reference IS NULL) OR (new.reference = ''::text))) EXECUTE FUNCTION public.generate_invoice_reference();


--
-- Name: booking_service_lines trg_service_line_supplier_debt; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_service_line_supplier_debt AFTER INSERT OR DELETE OR UPDATE ON public.booking_service_lines FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_debt_from_service_line();


--
-- Name: booking_service_lines trg_supplier_bookings_count; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_supplier_bookings_count AFTER INSERT OR DELETE OR UPDATE ON public.booking_service_lines FOR EACH ROW EXECUTE FUNCTION public.sync_supplier_bookings_count();


--
-- Name: suppliers trg_suppliers_generate_reference; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER trg_suppliers_generate_reference BEFORE INSERT ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.generate_supplier_reference();


--
-- Name: agent_commissions agent_commissions_agent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_commissions
    ADD CONSTRAINT agent_commissions_agent_fk FOREIGN KEY (agent_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: agent_commissions agent_commissions_booking_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_commissions
    ADD CONSTRAINT agent_commissions_booking_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- Name: agent_commissions agent_commissions_invoice_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.agent_commissions
    ADD CONSTRAINT agent_commissions_invoice_fk FOREIGN KEY (invoice_id) REFERENCES public.invoices(id) ON DELETE SET NULL;


--
-- Name: bank_entries bank_entries_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_entries
    ADD CONSTRAINT bank_entries_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.financial_accounts(id) ON DELETE CASCADE;


--
-- Name: bank_entries bank_entries_agent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bank_entries
    ADD CONSTRAINT bank_entries_agent_fk FOREIGN KEY (agent_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: booking_packages booking_packages_booking_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_packages
    ADD CONSTRAINT booking_packages_booking_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_packages booking_packages_package_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_packages
    ADD CONSTRAINT booking_packages_package_fk FOREIGN KEY (package_id) REFERENCES public.packages(id) ON DELETE CASCADE;


--
-- Name: booking_service_lines booking_service_lines_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_service_lines
    ADD CONSTRAINT booking_service_lines_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_service_lines booking_service_lines_service_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_service_lines
    ADD CONSTRAINT booking_service_lines_service_type_id_fkey FOREIGN KEY (service_type_id) REFERENCES public.service_types(id) ON DELETE SET NULL;


--
-- Name: booking_service_lines booking_service_lines_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_service_lines
    ADD CONSTRAINT booking_service_lines_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: booking_suppliers booking_suppliers_booking_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_suppliers
    ADD CONSTRAINT booking_suppliers_booking_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: booking_suppliers booking_suppliers_supplier_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.booking_suppliers
    ADD CONSTRAINT booking_suppliers_supplier_fk FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_agent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_agent_fk FOREIGN KEY (agent_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: bookings bookings_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.package_templates(id) ON DELETE SET NULL;


--
-- Name: bookings bookings_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.service_templates(id);


--
-- Name: bookings bookings_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.bookings
    ADD CONSTRAINT bookings_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: cities cities_country_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cities
    ADD CONSTRAINT cities_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id) ON DELETE CASCADE;


--
-- Name: client_requests client_requests_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_requests
    ADD CONSTRAINT client_requests_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES auth.users(id);


--
-- Name: client_services client_services_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_services
    ADD CONSTRAINT client_services_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: client_services client_services_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.client_services
    ADD CONSTRAINT client_services_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.service_templates(id);


--
-- Name: employee_commissions employee_commissions_agent_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_commissions
    ADD CONSTRAINT employee_commissions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id);


--
-- Name: employee_commissions employee_commissions_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.employee_commissions
    ADD CONSTRAINT employee_commissions_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id);


--
-- Name: expenses expenses_recorded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id);


--
-- Name: expenses expenses_template_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.expenses
    ADD CONSTRAINT expenses_template_fk FOREIGN KEY (template_id) REFERENCES public.recurring_expense_templates(id) ON DELETE SET NULL;


--
-- Name: financial_account_transactions financial_account_transactions_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.financial_account_transactions
    ADD CONSTRAINT financial_account_transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.financial_accounts(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_agent_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_agent_fk FOREIGN KEY (agent_id) REFERENCES auth.users(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_booking_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_booking_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE SET NULL;


--
-- Name: invoices invoices_booking_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id) ON DELETE CASCADE;


--
-- Name: invoices invoices_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: notifications notifications_user_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notifications
    ADD CONSTRAINT notifications_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;


--
-- Name: package_templates package_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_templates
    ADD CONSTRAINT package_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id);


--
-- Name: package_templates package_templates_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.package_templates
    ADD CONSTRAINT package_templates_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: packages_legacy packages_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages_legacy
    ADD CONSTRAINT packages_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE SET NULL;


--
-- Name: packages packages_supplier_id_fkey1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_supplier_id_fkey1 FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: packages packages_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.packages
    ADD CONSTRAINT packages_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.package_templates(id) ON DELETE SET NULL;


--
-- Name: profiles profiles_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id);


--
-- Name: proposals proposals_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.proposals
    ADD CONSTRAINT proposals_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.client_requests(id) ON DELETE CASCADE;


--
-- Name: service_clients service_clients_client_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_clients
    ADD CONSTRAINT service_clients_client_fk FOREIGN KEY (client_id) REFERENCES public.clients(id) ON DELETE CASCADE;


--
-- Name: service_clients service_clients_service_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_clients
    ADD CONSTRAINT service_clients_service_fk FOREIGN KEY (service_template_id) REFERENCES public.service_templates(id) ON DELETE CASCADE;


--
-- Name: service_items service_items_step_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_items
    ADD CONSTRAINT service_items_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.service_steps(id) ON DELETE CASCADE;


--
-- Name: service_stages service_stages_service_template_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_stages
    ADD CONSTRAINT service_stages_service_template_id_fkey FOREIGN KEY (service_template_id) REFERENCES public.service_templates(id) ON DELETE CASCADE;


--
-- Name: service_steps service_steps_stage_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_steps
    ADD CONSTRAINT service_steps_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.service_stages(id) ON DELETE CASCADE;


--
-- Name: service_templates service_templates_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_templates
    ADD CONSTRAINT service_templates_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: service_templates service_templates_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_templates
    ADD CONSTRAINT service_templates_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id);


--
-- Name: service_templates service_templates_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_templates
    ADD CONSTRAINT service_templates_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: service_type_fields service_type_fields_service_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_type_fields
    ADD CONSTRAINT service_type_fields_service_type_id_fkey FOREIGN KEY (service_type_id) REFERENCES public.service_types(id) ON DELETE CASCADE;


--
-- Name: service_type_suppliers service_type_suppliers_service_type_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_type_suppliers
    ADD CONSTRAINT service_type_suppliers_service_type_id_fkey FOREIGN KEY (service_type_id) REFERENCES public.service_types(id) ON DELETE CASCADE;


--
-- Name: service_type_suppliers service_type_suppliers_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.service_type_suppliers
    ADD CONSTRAINT service_type_suppliers_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: supplier_payments supplier_payments_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.financial_accounts(id) ON DELETE SET NULL;


--
-- Name: supplier_payments supplier_payments_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.supplier_payments
    ADD CONSTRAINT supplier_payments_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id) ON DELETE CASCADE;


--
-- Name: tasks tasks_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: tasks tasks_package_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages_legacy(id);


--
-- Name: tasks tasks_service_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.service_templates(id) ON DELETE SET NULL;


--
-- Name: tasks tasks_supplier_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tasks
    ADD CONSTRAINT tasks_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id);


--
-- Name: agency_settings Allow authenticated full access to agency_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated full access to agency_settings" ON public.agency_settings TO authenticated USING (true);


--
-- Name: agent_commissions Allow authenticated full access to agent_commissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated full access to agent_commissions" ON public.agent_commissions TO authenticated USING (true);


--
-- Name: bank_entries Allow authenticated full access to bank_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated full access to bank_entries" ON public.bank_entries TO authenticated USING (true);


--
-- Name: bookings Allow authenticated full access to bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated full access to bookings" ON public.bookings TO authenticated USING (true);


--
-- Name: invoices Allow authenticated full access to invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated full access to invoices" ON public.invoices TO authenticated USING (true);


--
-- Name: profiles Allow authenticated full access to profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated full access to profiles" ON public.profiles TO authenticated USING (true);


--
-- Name: proposals Allow authenticated full access to proposals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated full access to proposals" ON public.proposals TO authenticated USING (true);


--
-- Name: bank_entries Allow authenticated inserts to bank_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated inserts to bank_entries" ON public.bank_entries FOR INSERT TO authenticated WITH CHECK (true);


--
-- Name: bank_entries Allow authenticated reads on bank_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow authenticated reads on bank_entries" ON public.bank_entries FOR SELECT TO authenticated USING (true);


--
-- Name: agency_settings Allow public read access to agency_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Allow public read access to agency_settings" ON public.agency_settings FOR SELECT TO anon USING (true);


--
-- Name: agency_links Auth full access agency_links; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth full access agency_links" ON public.agency_links TO authenticated USING (true);


--
-- Name: agency_settings Auth full access agency_settings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth full access agency_settings" ON public.agency_settings TO authenticated USING (true);


--
-- Name: agent_commissions Auth full access agent_commissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth full access agent_commissions" ON public.agent_commissions TO authenticated USING (true);


--
-- Name: bank_entries Auth full access bank_entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth full access bank_entries" ON public.bank_entries TO authenticated USING (true);


--
-- Name: bookings Auth full access bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth full access bookings" ON public.bookings TO authenticated USING (true);


--
-- Name: client_requests Auth full access client_requests; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth full access client_requests" ON public.client_requests TO authenticated USING (true);


--
-- Name: clients Auth full access clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth full access clients" ON public.clients TO authenticated USING (true);


--
-- Name: financial_accounts Auth full access financial_accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth full access financial_accounts" ON public.financial_accounts TO authenticated USING (true);


--
-- Name: invoices Auth full access invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth full access invoices" ON public.invoices TO authenticated USING (true);


--
-- Name: profiles Auth full access profiles; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth full access profiles" ON public.profiles TO authenticated USING (true);


--
-- Name: proposals Auth full access proposals; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth full access proposals" ON public.proposals TO authenticated USING (true);


--
-- Name: relationship_types Auth full access relationship_types; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth full access relationship_types" ON public.relationship_types TO authenticated USING (true);


--
-- Name: suppliers Auth full access suppliers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth full access suppliers" ON public.suppliers TO authenticated USING (true);


--
-- Name: tasks Auth full access tasks; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Auth full access tasks" ON public.tasks TO authenticated USING (true);


--
-- Name: expenses Cashiers can manage expenses; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Cashiers can manage expenses" ON public.expenses USING ((public.get_user_role() = 'cashier'::public.user_role));


--
-- Name: invoices Cashiers can manage invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Cashiers can manage invoices" ON public.invoices USING ((public.get_user_role() = 'cashier'::public.user_role));


--
-- Name: bookings Cashiers can read bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Cashiers can read bookings" ON public.bookings FOR SELECT USING ((public.get_user_role() = 'cashier'::public.user_role));


--
-- Name: clients Cashiers can read clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Cashiers can read clients" ON public.clients FOR SELECT USING ((public.get_user_role() = 'cashier'::public.user_role));


--
-- Name: marketing_campaigns Cashiers can view marketing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Cashiers can view marketing" ON public.marketing_campaigns FOR SELECT USING ((public.get_user_role() = 'cashier'::public.user_role));


--
-- Name: agent_commissions Enable all operations for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all operations for authenticated users" ON public.agent_commissions TO authenticated USING (true) WITH CHECK (true);


--
-- Name: booking_suppliers Enable all operations for authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable all operations for authenticated users" ON public.booking_suppliers TO authenticated USING (true) WITH CHECK (true);


--
-- Name: notifications Enable deletes for users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable deletes for users" ON public.notifications FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: notifications Enable updates for users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Enable updates for users" ON public.notifications FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: bank_entries Finance permission required for bank; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Finance permission required for bank" ON public.bank_entries TO authenticated USING ((EXISTS ( SELECT 1
   FROM public.profiles
  WHERE ((profiles.id = auth.uid()) AND (((profiles.permissions ->> 'finance'::text))::boolean = true)))));


--
-- Name: bookings Sales Agents can manage bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sales Agents can manage bookings" ON public.bookings USING ((public.get_user_role() = 'sales_agent'::public.user_role));


--
-- Name: client_services Sales Agents can manage client services; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sales Agents can manage client services" ON public.client_services USING ((public.get_user_role() = 'sales_agent'::public.user_role));


--
-- Name: clients Sales Agents can manage clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sales Agents can manage clients" ON public.clients USING ((public.get_user_role() = 'sales_agent'::public.user_role));


--
-- Name: invoices Sales Agents can manage invoices; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sales Agents can manage invoices" ON public.invoices USING ((public.get_user_role() = ANY (ARRAY['super_admin'::public.user_role, 'sales_agent'::public.user_role, 'cashier'::public.user_role]))) WITH CHECK ((public.get_user_role() = ANY (ARRAY['super_admin'::public.user_role, 'sales_agent'::public.user_role, 'cashier'::public.user_role])));


--
-- Name: service_items Sales Agents can manage items; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sales Agents can manage items" ON public.service_items USING ((public.get_user_role() = 'sales_agent'::public.user_role));


--
-- Name: service_stages Sales Agents can manage stages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sales Agents can manage stages" ON public.service_stages USING ((public.get_user_role() = 'sales_agent'::public.user_role));


--
-- Name: service_steps Sales Agents can manage steps; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sales Agents can manage steps" ON public.service_steps USING ((public.get_user_role() = 'sales_agent'::public.user_role));


--
-- Name: employee_commissions Sales Agents can read their own commissions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sales Agents can read their own commissions" ON public.employee_commissions FOR SELECT USING (((public.get_user_role() = 'sales_agent'::public.user_role) AND (agent_id = auth.uid())));


--
-- Name: marketing_campaigns Sales Agents can view marketing; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sales Agents can view marketing" ON public.marketing_campaigns FOR SELECT USING ((public.get_user_role() = 'sales_agent'::public.user_role));


--
-- Name: packages_legacy Sales Agents can view packages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sales Agents can view packages" ON public.packages_legacy FOR SELECT USING ((public.get_user_role() = 'sales_agent'::public.user_role));


--
-- Name: suppliers Sales Agents can view suppliers; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sales Agents can view suppliers" ON public.suppliers FOR SELECT USING ((public.get_user_role() = 'sales_agent'::public.user_role));


--
-- Name: service_templates Sales Agents can view templates; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Sales Agents can view templates" ON public.service_templates FOR SELECT USING ((public.get_user_role() = 'sales_agent'::public.user_role));


--
-- Name: bookings Super Admins bypass RLS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super Admins bypass RLS" ON public.bookings USING ((public.get_user_role() = 'super_admin'::public.user_role));


--
-- Name: client_services Super Admins bypass RLS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super Admins bypass RLS" ON public.client_services USING ((public.get_user_role() = 'super_admin'::public.user_role));


--
-- Name: clients Super Admins bypass RLS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super Admins bypass RLS" ON public.clients USING ((public.get_user_role() = 'super_admin'::public.user_role));


--
-- Name: employee_commissions Super Admins bypass RLS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super Admins bypass RLS" ON public.employee_commissions USING ((public.get_user_role() = 'super_admin'::public.user_role));


--
-- Name: expenses Super Admins bypass RLS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super Admins bypass RLS" ON public.expenses USING ((public.get_user_role() = 'super_admin'::public.user_role));


--
-- Name: invoices Super Admins bypass RLS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super Admins bypass RLS" ON public.invoices USING ((public.get_user_role() = 'super_admin'::public.user_role));


--
-- Name: marketing_campaigns Super Admins bypass RLS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super Admins bypass RLS" ON public.marketing_campaigns USING ((public.get_user_role() = 'super_admin'::public.user_role));


--
-- Name: packages_legacy Super Admins bypass RLS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super Admins bypass RLS" ON public.packages_legacy USING ((public.get_user_role() = 'super_admin'::public.user_role));


--
-- Name: profiles Super Admins bypass RLS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super Admins bypass RLS" ON public.profiles USING ((public.get_user_role() = 'super_admin'::public.user_role));


--
-- Name: service_items Super Admins bypass RLS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super Admins bypass RLS" ON public.service_items USING ((public.get_user_role() = 'super_admin'::public.user_role));


--
-- Name: service_stages Super Admins bypass RLS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super Admins bypass RLS" ON public.service_stages USING ((public.get_user_role() = 'super_admin'::public.user_role));


--
-- Name: service_steps Super Admins bypass RLS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super Admins bypass RLS" ON public.service_steps USING ((public.get_user_role() = 'super_admin'::public.user_role));


--
-- Name: service_templates Super Admins bypass RLS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super Admins bypass RLS" ON public.service_templates USING ((public.get_user_role() = 'super_admin'::public.user_role));


--
-- Name: suppliers Super Admins bypass RLS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super Admins bypass RLS" ON public.suppliers USING ((public.get_user_role() = 'super_admin'::public.user_role));


--
-- Name: tasks Super Admins bypass RLS; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Super Admins bypass RLS" ON public.tasks USING (true);


--
-- Name: bank_entries Users can delete bank entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete bank entries" ON public.bank_entries FOR DELETE USING (true);


--
-- Name: financial_account_transactions Users can delete financial account transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete financial account transactions" ON public.financial_account_transactions FOR DELETE USING (true);


--
-- Name: financial_accounts Users can delete financial accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can delete financial accounts" ON public.financial_accounts FOR DELETE USING (true);


--
-- Name: bank_entries Users can insert bank entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert bank entries" ON public.bank_entries FOR INSERT WITH CHECK (true);


--
-- Name: financial_account_transactions Users can insert financial account transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert financial account transactions" ON public.financial_account_transactions FOR INSERT WITH CHECK (true);


--
-- Name: financial_accounts Users can insert financial accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can insert financial accounts" ON public.financial_accounts FOR INSERT WITH CHECK (true);


--
-- Name: bank_entries Users can update bank entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update bank entries" ON public.bank_entries FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: financial_account_transactions Users can update financial account transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update financial account transactions" ON public.financial_account_transactions FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: financial_accounts Users can update financial accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can update financial accounts" ON public.financial_accounts FOR UPDATE USING (true) WITH CHECK (true);


--
-- Name: bank_entries Users can view all bank entries; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view all bank entries" ON public.bank_entries FOR SELECT USING (true);


--
-- Name: financial_account_transactions Users can view all financial account transactions; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view all financial account transactions" ON public.financial_account_transactions FOR SELECT USING (true);


--
-- Name: financial_accounts Users can view all financial accounts; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Users can view all financial accounts" ON public.financial_accounts FOR SELECT USING (true);


--
-- Name: bookings Viewers can read bookings; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Viewers can read bookings" ON public.bookings FOR SELECT USING ((public.get_user_role() = 'viewer'::public.user_role));


--
-- Name: clients Viewers can read clients; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Viewers can read clients" ON public.clients FOR SELECT USING ((public.get_user_role() = 'viewer'::public.user_role));


--
-- Name: packages_legacy Viewers can read packages; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "Viewers can read packages" ON public.packages_legacy FOR SELECT USING ((public.get_user_role() = 'viewer'::public.user_role));


--
-- Name: agency_links; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agency_links ENABLE ROW LEVEL SECURITY;

--
-- Name: agency_settings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agency_settings ENABLE ROW LEVEL SECURITY;

--
-- Name: agency_settings agency_settings_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agency_settings_read ON public.agency_settings FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: agency_settings agency_settings_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY agency_settings_write ON public.agency_settings USING ((public.get_my_role() = 'super_admin'::text));


--
-- Name: agent_commissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.agent_commissions ENABLE ROW LEVEL SECURITY;

--
-- Name: bank_entries; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bank_entries ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_packages booking packages are readable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "booking packages are readable by authenticated users" ON public.booking_packages FOR SELECT TO authenticated USING (true);


--
-- Name: booking_packages booking packages can be deleted by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "booking packages can be deleted by authenticated users" ON public.booking_packages FOR DELETE TO authenticated USING (true);


--
-- Name: booking_packages booking packages can be managed by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "booking packages can be managed by authenticated users" ON public.booking_packages FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: booking_packages booking packages can be updated by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "booking packages can be updated by authenticated users" ON public.booking_packages FOR UPDATE TO authenticated USING (true) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: booking_packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_packages ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_service_lines; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_service_lines ENABLE ROW LEVEL SECURITY;

--
-- Name: booking_suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.booking_suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

--
-- Name: bookings bookings_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bookings_all_authenticated ON public.bookings USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: booking_service_lines bsl_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bsl_read ON public.booking_service_lines FOR SELECT TO authenticated USING (true);


--
-- Name: booking_service_lines bsl_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY bsl_write ON public.booking_service_lines TO authenticated USING ((public.auth_role() = ANY (ARRAY['super_admin'::text, 'sales_agent'::text]))) WITH CHECK ((public.auth_role() = ANY (ARRAY['super_admin'::text, 'sales_agent'::text])));


--
-- Name: client_requests; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_requests ENABLE ROW LEVEL SECURITY;

--
-- Name: client_services; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.client_services ENABLE ROW LEVEL SECURITY;

--
-- Name: client_services client_services_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY client_services_all_authenticated ON public.client_services USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.clients ENABLE ROW LEVEL SECURITY;

--
-- Name: clients clients_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY clients_all_authenticated ON public.clients USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: commission_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.commission_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_commissions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.employee_commissions ENABLE ROW LEVEL SECURITY;

--
-- Name: employee_commissions employee_commissions_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY employee_commissions_all_authenticated ON public.employee_commissions USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: expenses; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

--
-- Name: expenses expenses are readable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "expenses are readable by authenticated users" ON public.expenses FOR SELECT TO authenticated USING (true);


--
-- Name: expenses expenses can be created by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "expenses can be created by authenticated users" ON public.expenses FOR INSERT TO authenticated WITH CHECK (((auth.uid() IS NOT NULL) AND (amount > (0)::numeric) AND (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])) AND (method = ANY (ARRAY['cash'::public.payment_method, 'credit_card'::public.payment_method, 'baridimob'::public.payment_method]))));


--
-- Name: expenses expenses can be deleted by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "expenses can be deleted by authenticated users" ON public.expenses FOR DELETE TO authenticated USING (true);


--
-- Name: expenses expenses can be updated by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "expenses can be updated by authenticated users" ON public.expenses FOR UPDATE TO authenticated USING (true) WITH CHECK (((auth.uid() IS NOT NULL) AND (amount > (0)::numeric) AND (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])) AND (method = ANY (ARRAY['cash'::public.payment_method, 'credit_card'::public.payment_method, 'baridimob'::public.payment_method]))));


--
-- Name: expenses expenses_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expenses_all_authenticated ON public.expenses USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: expenses expenses_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expenses_delete ON public.expenses FOR DELETE USING ((public.get_my_role() = 'super_admin'::text));


--
-- Name: expenses expenses_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expenses_insert ON public.expenses FOR INSERT WITH CHECK ((public.get_my_role() = ANY (ARRAY['super_admin'::text, 'cashier'::text])));


--
-- Name: expenses expenses_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expenses_read ON public.expenses FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: expenses expenses_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY expenses_update ON public.expenses FOR UPDATE USING ((public.get_my_role() = ANY (ARRAY['super_admin'::text, 'cashier'::text])));


--
-- Name: financial_account_transactions; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_account_transactions ENABLE ROW LEVEL SECURITY;

--
-- Name: financial_accounts; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.financial_accounts ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

--
-- Name: invoices invoices are readable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "invoices are readable by authenticated users" ON public.invoices FOR SELECT TO authenticated USING (true);


--
-- Name: invoices invoices are writable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "invoices are writable by authenticated users" ON public.invoices FOR INSERT TO authenticated WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: invoices invoices can be updated by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "invoices can be updated by authenticated users" ON public.invoices FOR UPDATE TO authenticated USING (true) WITH CHECK ((auth.uid() IS NOT NULL));


--
-- Name: invoices invoices_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY invoices_all_authenticated ON public.invoices USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: marketing_campaigns; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;

--
-- Name: marketing_campaigns marketing_campaigns_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY marketing_campaigns_all_authenticated ON public.marketing_campaigns USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: notifications; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

--
-- Name: notifications notifications are readable by the owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications are readable by the owner" ON public.notifications FOR SELECT TO authenticated USING ((auth.uid() = user_id));


--
-- Name: notifications notifications can be created by the owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications can be created by the owner" ON public.notifications FOR INSERT TO authenticated WITH CHECK ((auth.uid() = user_id));


--
-- Name: notifications notifications can be deleted by the owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications can be deleted by the owner" ON public.notifications FOR DELETE TO authenticated USING ((auth.uid() = user_id));


--
-- Name: notifications notifications can be updated by the owner; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "notifications can be updated by the owner" ON public.notifications FOR UPDATE TO authenticated USING ((auth.uid() = user_id)) WITH CHECK ((auth.uid() = user_id));


--
-- Name: notifications notifications_own; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY notifications_own ON public.notifications USING ((user_id = auth.uid()));


--
-- Name: package_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.package_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: package_templates package_templates_delete; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_templates_delete ON public.package_templates FOR DELETE USING ((auth.role() = 'authenticated'::text));


--
-- Name: package_templates package_templates_insert; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_templates_insert ON public.package_templates FOR INSERT WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: package_templates package_templates_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_templates_read ON public.package_templates FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: package_templates package_templates_select; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_templates_select ON public.package_templates FOR SELECT USING ((auth.role() = 'authenticated'::text));


--
-- Name: package_templates package_templates_update; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_templates_update ON public.package_templates FOR UPDATE USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: package_templates package_templates_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY package_templates_write ON public.package_templates USING ((public.get_my_role() = ANY (ARRAY['super_admin'::text, 'sales_agent'::text])));


--
-- Name: packages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

--
-- Name: packages_legacy packages_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY packages_all_authenticated ON public.packages_legacy USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: packages_legacy; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.packages_legacy ENABLE ROW LEVEL SECURITY;

--
-- Name: packages packages_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY packages_read ON public.packages FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: packages packages_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY packages_write ON public.packages USING ((public.get_my_role() = ANY (ARRAY['super_admin'::text, 'sales_agent'::text])));


--
-- Name: profiles; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

--
-- Name: profiles profiles_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY profiles_all_authenticated ON public.profiles USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: proposals; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.proposals ENABLE ROW LEVEL SECURITY;

--
-- Name: recurring_expense_templates recurring templates are readable by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recurring templates are readable by authenticated users" ON public.recurring_expense_templates FOR SELECT TO authenticated USING (true);


--
-- Name: recurring_expense_templates recurring templates can be deleted by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recurring templates can be deleted by authenticated users" ON public.recurring_expense_templates FOR DELETE TO authenticated USING (true);


--
-- Name: recurring_expense_templates recurring templates can be managed by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recurring templates can be managed by authenticated users" ON public.recurring_expense_templates FOR INSERT TO authenticated WITH CHECK (((auth.uid() IS NOT NULL) AND (amount >= (0)::numeric)));


--
-- Name: recurring_expense_templates recurring templates can be updated by authenticated users; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY "recurring templates can be updated by authenticated users" ON public.recurring_expense_templates FOR UPDATE TO authenticated USING (true) WITH CHECK (((auth.uid() IS NOT NULL) AND (amount >= (0)::numeric)));


--
-- Name: recurring_expense_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.recurring_expense_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: relationship_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.relationship_types ENABLE ROW LEVEL SECURITY;

--
-- Name: service_clients; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_clients ENABLE ROW LEVEL SECURITY;

--
-- Name: service_clients service_clients_insert_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_clients_insert_all ON public.service_clients FOR INSERT WITH CHECK (true);


--
-- Name: service_clients service_clients_select_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_clients_select_all ON public.service_clients FOR SELECT USING (true);


--
-- Name: service_clients service_clients_update_all; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_clients_update_all ON public.service_clients FOR UPDATE USING (true) WITH CHECK (true);

--
-- Name: service_clients service_clients_delete_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_clients_delete_authenticated ON public.service_clients FOR DELETE TO authenticated USING (true);


--
-- Name: service_items; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_items ENABLE ROW LEVEL SECURITY;

--
-- Name: service_items service_items_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_items_all_authenticated ON public.service_items USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: booking_service_lines service_lines_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_lines_read ON public.booking_service_lines FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: booking_service_lines service_lines_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_lines_write ON public.booking_service_lines USING ((public.get_my_role() = ANY (ARRAY['super_admin'::text, 'sales_agent'::text])));


--
-- Name: service_stages; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_stages ENABLE ROW LEVEL SECURITY;

--
-- Name: service_stages service_stages_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_stages_all_authenticated ON public.service_stages USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: service_steps; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_steps ENABLE ROW LEVEL SECURITY;

--
-- Name: service_steps service_steps_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_steps_all_authenticated ON public.service_steps USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: service_templates; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_templates ENABLE ROW LEVEL SECURITY;

--
-- Name: service_templates service_templates_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_templates_all_authenticated ON public.service_templates USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: service_type_fields; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_type_fields ENABLE ROW LEVEL SECURITY;

--
-- Name: service_type_fields service_type_fields_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_type_fields_read ON public.service_type_fields FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: service_type_fields service_type_fields_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_type_fields_write ON public.service_type_fields USING ((public.get_my_role() = 'super_admin'::text));


--
-- Name: service_type_suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_type_suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: service_type_suppliers service_type_suppliers_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_type_suppliers_read ON public.service_type_suppliers FOR SELECT TO authenticated USING (true);


--
-- Name: service_type_suppliers service_type_suppliers_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_type_suppliers_write ON public.service_type_suppliers TO authenticated USING ((public.auth_role() = ANY (ARRAY['super_admin'::text, 'sales_agent'::text]))) WITH CHECK ((public.auth_role() = ANY (ARRAY['super_admin'::text, 'sales_agent'::text])));


--
-- Name: service_types; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.service_types ENABLE ROW LEVEL SECURITY;

--
-- Name: service_types service_types_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_types_read ON public.service_types FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: service_types service_types_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY service_types_write ON public.service_types USING ((public.get_my_role() = 'super_admin'::text));


--
-- Name: supplier_payments; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.supplier_payments ENABLE ROW LEVEL SECURITY;

--
-- Name: supplier_payments supplier_payments_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_payments_all_authenticated ON public.supplier_payments USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: supplier_payments supplier_payments_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_payments_read ON public.supplier_payments FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: supplier_payments supplier_payments_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY supplier_payments_write ON public.supplier_payments USING ((public.get_my_role() = ANY (ARRAY['super_admin'::text, 'cashier'::text])));


--
-- Name: suppliers; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

--
-- Name: suppliers suppliers_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY suppliers_all_authenticated ON public.suppliers USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: tasks; Type: ROW SECURITY; Schema: public; Owner: -
--

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

--
-- Name: tasks tasks_all_authenticated; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_all_authenticated ON public.tasks USING ((auth.role() = 'authenticated'::text)) WITH CHECK ((auth.role() = 'authenticated'::text));


--
-- Name: tasks tasks_read; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_read ON public.tasks FOR SELECT USING ((auth.uid() IS NOT NULL));


--
-- Name: tasks tasks_write; Type: POLICY; Schema: public; Owner: -
--

CREATE POLICY tasks_write ON public.tasks USING ((public.get_my_role() = ANY (ARRAY['super_admin'::text, 'sales_agent'::text])));


--
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: -
--

GRANT USAGE ON SCHEMA public TO postgres;
GRANT USAGE ON SCHEMA public TO anon;
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO service_role;


--
-- Name: FUNCTION auth_role(); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.auth_role() FROM PUBLIC;
GRANT ALL ON FUNCTION public.auth_role() TO anon;
GRANT ALL ON FUNCTION public.auth_role() TO authenticated;
GRANT ALL ON FUNCTION public.auth_role() TO service_role;


--
-- Name: FUNCTION enforce_commission_payment_guardrail(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.enforce_commission_payment_guardrail() TO anon;
GRANT ALL ON FUNCTION public.enforce_commission_payment_guardrail() TO authenticated;
GRANT ALL ON FUNCTION public.enforce_commission_payment_guardrail() TO service_role;


--
-- Name: FUNCTION ensure_bank_entries_are_ledger_safe(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.ensure_bank_entries_are_ledger_safe() TO anon;
GRANT ALL ON FUNCTION public.ensure_bank_entries_are_ledger_safe() TO authenticated;
GRANT ALL ON FUNCTION public.ensure_bank_entries_are_ledger_safe() TO service_role;


--
-- Name: FUNCTION execute_internal_transfer(source_account_id uuid, target_account_id uuid, transfer_amount numeric, transfer_date timestamp without time zone, transfer_description text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.execute_internal_transfer(source_account_id uuid, target_account_id uuid, transfer_amount numeric, transfer_date timestamp without time zone, transfer_description text) TO anon;
GRANT ALL ON FUNCTION public.execute_internal_transfer(source_account_id uuid, target_account_id uuid, transfer_amount numeric, transfer_date timestamp without time zone, transfer_description text) TO authenticated;
GRANT ALL ON FUNCTION public.execute_internal_transfer(source_account_id uuid, target_account_id uuid, transfer_amount numeric, transfer_date timestamp without time zone, transfer_description text) TO service_role;


--
-- Name: FUNCTION execute_internal_transfer(source_account_id uuid, target_account_id uuid, source_amount numeric, target_amount numeric, transfer_date timestamp without time zone, transfer_description text); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.execute_internal_transfer(source_account_id uuid, target_account_id uuid, source_amount numeric, target_amount numeric, transfer_date timestamp without time zone, transfer_description text) TO anon;
GRANT ALL ON FUNCTION public.execute_internal_transfer(source_account_id uuid, target_account_id uuid, source_amount numeric, target_amount numeric, transfer_date timestamp without time zone, transfer_description text) TO authenticated;
GRANT ALL ON FUNCTION public.execute_internal_transfer(source_account_id uuid, target_account_id uuid, source_amount numeric, target_amount numeric, transfer_date timestamp without time zone, transfer_description text) TO service_role;


--
-- Name: FUNCTION generate_client_reference(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_client_reference() TO anon;
GRANT ALL ON FUNCTION public.generate_client_reference() TO authenticated;
GRANT ALL ON FUNCTION public.generate_client_reference() TO service_role;


--
-- Name: FUNCTION generate_invoice_reference(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_invoice_reference() TO anon;
GRANT ALL ON FUNCTION public.generate_invoice_reference() TO authenticated;
GRANT ALL ON FUNCTION public.generate_invoice_reference() TO service_role;


--
-- Name: FUNCTION generate_supplier_reference(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.generate_supplier_reference() TO anon;
GRANT ALL ON FUNCTION public.generate_supplier_reference() TO authenticated;
GRANT ALL ON FUNCTION public.generate_supplier_reference() TO service_role;


--
-- Name: FUNCTION get_my_role(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_my_role() TO anon;
GRANT ALL ON FUNCTION public.get_my_role() TO authenticated;
GRANT ALL ON FUNCTION public.get_my_role() TO service_role;


--
-- Name: FUNCTION get_user_role(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.get_user_role() TO anon;
GRANT ALL ON FUNCTION public.get_user_role() TO authenticated;
GRANT ALL ON FUNCTION public.get_user_role() TO service_role;


--
-- Name: FUNCTION reconcile_financial_account_balance(p_account_id uuid); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.reconcile_financial_account_balance(p_account_id uuid) TO anon;
GRANT ALL ON FUNCTION public.reconcile_financial_account_balance(p_account_id uuid) TO authenticated;
GRANT ALL ON FUNCTION public.reconcile_financial_account_balance(p_account_id uuid) TO service_role;


--
-- Name: FUNCTION save_service_template_workflow(p_template_id uuid, p_title text, p_country_id text, p_visa_type_id text, p_professional_status text, p_stages jsonb); Type: ACL; Schema: public; Owner: -
--

REVOKE ALL ON FUNCTION public.save_service_template_workflow(p_template_id uuid, p_title text, p_country_id text, p_visa_type_id text, p_professional_status text, p_stages jsonb) FROM PUBLIC;
GRANT ALL ON FUNCTION public.save_service_template_workflow(p_template_id uuid, p_title text, p_country_id text, p_visa_type_id text, p_professional_status text, p_stages jsonb) TO anon;
GRANT ALL ON FUNCTION public.save_service_template_workflow(p_template_id uuid, p_title text, p_country_id text, p_visa_type_id text, p_professional_status text, p_stages jsonb) TO authenticated;
GRANT ALL ON FUNCTION public.save_service_template_workflow(p_template_id uuid, p_title text, p_country_id text, p_visa_type_id text, p_professional_status text, p_stages jsonb) TO service_role;


--
-- Name: FUNCTION set_updated_at(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.set_updated_at() TO anon;
GRANT ALL ON FUNCTION public.set_updated_at() TO authenticated;
GRANT ALL ON FUNCTION public.set_updated_at() TO service_role;


--
-- Name: FUNCTION sync_booking_status_from_invoice(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_booking_status_from_invoice() TO anon;
GRANT ALL ON FUNCTION public.sync_booking_status_from_invoice() TO authenticated;
GRANT ALL ON FUNCTION public.sync_booking_status_from_invoice() TO service_role;


--
-- Name: FUNCTION sync_supplier_bookings_count(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_supplier_bookings_count() TO anon;
GRANT ALL ON FUNCTION public.sync_supplier_bookings_count() TO authenticated;
GRANT ALL ON FUNCTION public.sync_supplier_bookings_count() TO service_role;


--
-- Name: FUNCTION sync_supplier_debt(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_supplier_debt() TO anon;
GRANT ALL ON FUNCTION public.sync_supplier_debt() TO authenticated;
GRANT ALL ON FUNCTION public.sync_supplier_debt() TO service_role;


--
-- Name: FUNCTION sync_supplier_debt_from_service_line(); Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON FUNCTION public.sync_supplier_debt_from_service_line() TO anon;
GRANT ALL ON FUNCTION public.sync_supplier_debt_from_service_line() TO authenticated;
GRANT ALL ON FUNCTION public.sync_supplier_debt_from_service_line() TO service_role;


--
-- Name: TABLE agency_links; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agency_links TO anon;
GRANT ALL ON TABLE public.agency_links TO authenticated;
GRANT ALL ON TABLE public.agency_links TO service_role;


--
-- Name: TABLE agency_settings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agency_settings TO anon;
GRANT ALL ON TABLE public.agency_settings TO authenticated;
GRANT ALL ON TABLE public.agency_settings TO service_role;


--
-- Name: TABLE agent_commissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.agent_commissions TO anon;
GRANT ALL ON TABLE public.agent_commissions TO authenticated;
GRANT ALL ON TABLE public.agent_commissions TO service_role;


--
-- Name: TABLE bank_entries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bank_entries TO anon;
GRANT ALL ON TABLE public.bank_entries TO authenticated;
GRANT ALL ON TABLE public.bank_entries TO service_role;


--
-- Name: TABLE booking_packages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.booking_packages TO anon;
GRANT ALL ON TABLE public.booking_packages TO authenticated;
GRANT ALL ON TABLE public.booking_packages TO service_role;


--
-- Name: TABLE booking_service_lines; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.booking_service_lines TO anon;
GRANT ALL ON TABLE public.booking_service_lines TO authenticated;
GRANT ALL ON TABLE public.booking_service_lines TO service_role;


--
-- Name: TABLE booking_suppliers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.booking_suppliers TO anon;
GRANT ALL ON TABLE public.booking_suppliers TO authenticated;
GRANT ALL ON TABLE public.booking_suppliers TO service_role;


--
-- Name: TABLE bookings; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.bookings TO anon;
GRANT ALL ON TABLE public.bookings TO authenticated;
GRANT ALL ON TABLE public.bookings TO service_role;


--
-- Name: TABLE cities; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.cities TO anon;
GRANT ALL ON TABLE public.cities TO authenticated;
GRANT ALL ON TABLE public.cities TO service_role;


--
-- Name: TABLE client_requests; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.client_requests TO anon;
GRANT ALL ON TABLE public.client_requests TO authenticated;
GRANT ALL ON TABLE public.client_requests TO service_role;


--
-- Name: TABLE client_services; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.client_services TO anon;
GRANT ALL ON TABLE public.client_services TO authenticated;
GRANT ALL ON TABLE public.client_services TO service_role;


--
-- Name: TABLE clients; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.clients TO anon;
GRANT ALL ON TABLE public.clients TO authenticated;
GRANT ALL ON TABLE public.clients TO service_role;


--
-- Name: SEQUENCE clients_reference_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.clients_reference_seq TO anon;
GRANT ALL ON SEQUENCE public.clients_reference_seq TO authenticated;
GRANT ALL ON SEQUENCE public.clients_reference_seq TO service_role;


--
-- Name: TABLE commission_payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.commission_payments TO anon;
GRANT ALL ON TABLE public.commission_payments TO authenticated;
GRANT ALL ON TABLE public.commission_payments TO service_role;


--
-- Name: TABLE countries; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.countries TO anon;
GRANT ALL ON TABLE public.countries TO authenticated;
GRANT ALL ON TABLE public.countries TO service_role;


--
-- Name: TABLE employee_commissions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.employee_commissions TO anon;
GRANT ALL ON TABLE public.employee_commissions TO authenticated;
GRANT ALL ON TABLE public.employee_commissions TO service_role;


--
-- Name: TABLE expenses; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.expenses TO anon;
GRANT ALL ON TABLE public.expenses TO authenticated;
GRANT ALL ON TABLE public.expenses TO service_role;


--
-- Name: TABLE financial_account_transactions; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financial_account_transactions TO anon;
GRANT ALL ON TABLE public.financial_account_transactions TO authenticated;
GRANT ALL ON TABLE public.financial_account_transactions TO service_role;


--
-- Name: TABLE financial_accounts; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.financial_accounts TO anon;
GRANT ALL ON TABLE public.financial_accounts TO authenticated;
GRANT ALL ON TABLE public.financial_accounts TO service_role;


--
-- Name: TABLE invoices; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.invoices TO anon;
GRANT ALL ON TABLE public.invoices TO authenticated;
GRANT ALL ON TABLE public.invoices TO service_role;


--
-- Name: SEQUENCE invoices_invoice_number_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.invoices_invoice_number_seq TO anon;
GRANT ALL ON SEQUENCE public.invoices_invoice_number_seq TO authenticated;
GRANT ALL ON SEQUENCE public.invoices_invoice_number_seq TO service_role;


--
-- Name: TABLE marketing_campaigns; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.marketing_campaigns TO anon;
GRANT ALL ON TABLE public.marketing_campaigns TO authenticated;
GRANT ALL ON TABLE public.marketing_campaigns TO service_role;


--
-- Name: TABLE master_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.master_templates TO anon;
GRANT ALL ON TABLE public.master_templates TO authenticated;
GRANT ALL ON TABLE public.master_templates TO service_role;


--
-- Name: TABLE notifications; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.notifications TO anon;
GRANT ALL ON TABLE public.notifications TO authenticated;
GRANT ALL ON TABLE public.notifications TO service_role;


--
-- Name: TABLE package_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.package_templates TO anon;
GRANT ALL ON TABLE public.package_templates TO authenticated;
GRANT ALL ON TABLE public.package_templates TO service_role;


--
-- Name: TABLE packages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.packages TO anon;
GRANT ALL ON TABLE public.packages TO authenticated;
GRANT ALL ON TABLE public.packages TO service_role;


--
-- Name: TABLE packages_legacy; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.packages_legacy TO anon;
GRANT ALL ON TABLE public.packages_legacy TO authenticated;
GRANT ALL ON TABLE public.packages_legacy TO service_role;


--
-- Name: TABLE profiles; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.profiles TO anon;
GRANT ALL ON TABLE public.profiles TO authenticated;
GRANT ALL ON TABLE public.profiles TO service_role;


--
-- Name: TABLE proposals; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.proposals TO anon;
GRANT ALL ON TABLE public.proposals TO authenticated;
GRANT ALL ON TABLE public.proposals TO service_role;


--
-- Name: TABLE recurring_expense_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.recurring_expense_templates TO anon;
GRANT ALL ON TABLE public.recurring_expense_templates TO authenticated;
GRANT ALL ON TABLE public.recurring_expense_templates TO service_role;


--
-- Name: TABLE relationship_types; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.relationship_types TO anon;
GRANT ALL ON TABLE public.relationship_types TO authenticated;
GRANT ALL ON TABLE public.relationship_types TO service_role;


--
-- Name: TABLE service_clients; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.service_clients TO anon;
GRANT ALL ON TABLE public.service_clients TO authenticated;
GRANT ALL ON TABLE public.service_clients TO service_role;


--
-- Name: TABLE service_items; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.service_items TO anon;
GRANT ALL ON TABLE public.service_items TO authenticated;
GRANT ALL ON TABLE public.service_items TO service_role;


--
-- Name: TABLE service_stages; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.service_stages TO anon;
GRANT ALL ON TABLE public.service_stages TO authenticated;
GRANT ALL ON TABLE public.service_stages TO service_role;


--
-- Name: TABLE service_steps; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.service_steps TO anon;
GRANT ALL ON TABLE public.service_steps TO authenticated;
GRANT ALL ON TABLE public.service_steps TO service_role;


--
-- Name: TABLE service_templates; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.service_templates TO anon;
GRANT ALL ON TABLE public.service_templates TO authenticated;
GRANT ALL ON TABLE public.service_templates TO service_role;


--
-- Name: TABLE service_type_fields; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.service_type_fields TO anon;
GRANT ALL ON TABLE public.service_type_fields TO authenticated;
GRANT ALL ON TABLE public.service_type_fields TO service_role;


--
-- Name: TABLE service_type_suppliers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.service_type_suppliers TO anon;
GRANT ALL ON TABLE public.service_type_suppliers TO authenticated;
GRANT ALL ON TABLE public.service_type_suppliers TO service_role;


--
-- Name: TABLE service_types; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.service_types TO anon;
GRANT ALL ON TABLE public.service_types TO authenticated;
GRANT ALL ON TABLE public.service_types TO service_role;


--
-- Name: TABLE supplier_payments; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.supplier_payments TO anon;
GRANT ALL ON TABLE public.supplier_payments TO authenticated;
GRANT ALL ON TABLE public.supplier_payments TO service_role;


--
-- Name: TABLE suppliers; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.suppliers TO anon;
GRANT ALL ON TABLE public.suppliers TO authenticated;
GRANT ALL ON TABLE public.suppliers TO service_role;


--
-- Name: SEQUENCE suppliers_reference_seq; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON SEQUENCE public.suppliers_reference_seq TO anon;
GRANT ALL ON SEQUENCE public.suppliers_reference_seq TO authenticated;
GRANT ALL ON SEQUENCE public.suppliers_reference_seq TO service_role;


--
-- Name: TABLE tasks; Type: ACL; Schema: public; Owner: -
--

GRANT ALL ON TABLE public.tasks TO anon;
GRANT ALL ON TABLE public.tasks TO authenticated;
GRANT ALL ON TABLE public.tasks TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: -
--

ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO postgres;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public GRANT ALL ON TABLES TO service_role;


--
-- PostgreSQL database dump complete
--
