-- Production-grade finance schema patch for Airvoy ERP.
-- This file is intended for the Supabase SQL editor and includes:
-- - table definitions and guardrails
-- - approval workflow for expenses before they hit treasury
-- - strict checks and indexes
-- - RLS policies for authenticated users

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS agency_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agency_name text NOT NULL DEFAULT 'AIRVOY',
  logo_url text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  city text NOT NULL DEFAULT '',
  wilaya text NOT NULL DEFAULT '',
  rc_number text NOT NULL DEFAULT '',
  nif text NOT NULL DEFAULT '',
  nis text NOT NULL DEFAULT '',
  ai text NOT NULL DEFAULT '',
  phone text NOT NULL DEFAULT '',
  fax text NOT NULL DEFAULT '',
  email text NOT NULL DEFAULT '',
  bank_name text NOT NULL DEFAULT '',
  bank_account text NOT NULL DEFAULT '',
  iban text NOT NULL DEFAULT '',
  package_type_descriptions jsonb NOT NULL DEFAULT '{
    "trip": "Standard trip package service.",
    "hajj": "Hajj package service including pilgrimage arrangements and hospitality support.",
    "omra": "Omra package service including travel, accommodation, and pilgrimage support.",
    "ticket_promotion": "Air ticket promotion service with flight arrangements and travel support.",
    "hotel_promotion": "Hotel promotion service with accommodation arrangements and stay support."
  }'::jsonb,
  commission_rules jsonb NOT NULL DEFAULT '{
    "trip": {"enabled": true, "target_type": "package", "method": "percentage", "amount": 0, "percentage": 10},
    "hajj": {"enabled": true, "target_type": "package", "method": "percentage", "amount": 0, "percentage": 12},
    "omra": {"enabled": true, "target_type": "package", "method": "percentage", "amount": 0, "percentage": 12},
    "ticket_promotion": {"enabled": true, "target_type": "package", "method": "amount", "amount": 0, "percentage": 0},
    "hotel_promotion": {"enabled": true, "target_type": "package", "method": "amount", "amount": 0, "percentage": 0}
  }'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commission_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NULL,
  target_type text NOT NULL DEFAULT 'package',
  target_id uuid NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'cancelled')),
  paid_at timestamptz NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT commission_payments_amount_positive CHECK (amount >= 0)
);

CREATE TABLE IF NOT EXISTS agent_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  booking_id uuid NULL,
  invoice_id uuid NULL,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'PENDING_PAYMENT' CHECK (status IN ('PENDING_PAYMENT', 'READY_TO_PAY', 'PAID', 'CANCELLED')),
  notes text,
  paid_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT agent_commissions_amount_positive CHECK (amount >= 0),
  CONSTRAINT agent_commissions_agent_fk FOREIGN KEY (agent_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  CONSTRAINT agent_commissions_booking_fk FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  CONSTRAINT agent_commissions_invoice_fk FOREIGN KEY (invoice_id) REFERENCES invoices(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS agent_commissions_agent_idx
  ON public.agent_commissions (agent_id, status);

CREATE INDEX IF NOT EXISTS agent_commissions_booking_idx
  ON public.agent_commissions (booking_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS agent_commissions_booking_invoice_agent_unique
  ON public.agent_commissions (booking_id, invoice_id, agent_id);

CREATE TABLE IF NOT EXISTS booking_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  package_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_packages_booking_fk
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT booking_packages_package_fk
    FOREIGN KEY (package_id) REFERENCES packages(id) ON DELETE CASCADE,
  CONSTRAINT booking_packages_unique_pair UNIQUE (booking_id, package_id)
);

CREATE TABLE IF NOT EXISTS booking_suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT booking_suppliers_booking_fk
    FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  CONSTRAINT booking_suppliers_supplier_fk
    FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE CASCADE,
  CONSTRAINT booking_suppliers_unique_pair UNIQUE (booking_id, supplier_id)
);

CREATE TABLE IF NOT EXISTS service_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_template_id uuid NOT NULL,
  client_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_clients_service_fk
    FOREIGN KEY (service_template_id) REFERENCES service_templates(id) ON DELETE CASCADE,
  CONSTRAINT service_clients_client_fk
    FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
  CONSTRAINT service_clients_unique_pair UNIQUE (service_template_id, client_id)
);

CREATE INDEX IF NOT EXISTS booking_packages_booking_idx
  ON booking_packages (booking_id);

CREATE INDEX IF NOT EXISTS booking_packages_package_idx
  ON booking_packages (package_id);

CREATE INDEX IF NOT EXISTS booking_suppliers_booking_idx
  ON booking_suppliers (booking_id);

CREATE INDEX IF NOT EXISTS booking_suppliers_supplier_idx
  ON booking_suppliers (supplier_id);

CREATE INDEX IF NOT EXISTS service_clients_service_idx
  ON service_clients (service_template_id);

CREATE INDEX IF NOT EXISTS service_clients_client_idx
  ON service_clients (client_id);

CREATE TABLE IF NOT EXISTS recurring_expense_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general',
  amount numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recurring_expense_templates_amount_positive CHECK (amount >= 0),
  CONSTRAINT recurring_expense_templates_method_valid CHECK (payment_method IN ('cash', 'credit_card', 'baridimob'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  channel text NOT NULL DEFAULT 'push',
  type text NOT NULL DEFAULT 'info',
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  CONSTRAINT notifications_channel_valid CHECK (channel IN ('system', 'email', 'sms', 'push')),
  CONSTRAINT notifications_type_valid CHECK (type IN ('info', 'success', 'warning', 'error')),
  CONSTRAINT notifications_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS recurring_expense_templates_active_idx
  ON recurring_expense_templates (is_active);

CREATE INDEX IF NOT EXISTS notifications_user_idx
  ON notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notifications_user_unread_idx
  ON notifications (user_id, is_read, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS recurring_expense_templates_name_unique
  ON recurring_expense_templates (LOWER(name))
  WHERE is_active = true;

ALTER TABLE packages
  ADD COLUMN IF NOT EXISTS cost_price numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pricing_mode text NOT NULL DEFAULT 'fixed';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'package_templates'
  ) THEN
    ALTER TABLE public.package_templates
      ADD COLUMN IF NOT EXISTS brochure_url text,
      ADD COLUMN IF NOT EXISTS photos jsonb,
      ADD COLUMN IF NOT EXISTS label_ar text,
      ADD COLUMN IF NOT EXISTS description text;
  END IF;
END $$;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS account_id uuid NULL,
  ADD COLUMN IF NOT EXISTS is_expense boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS expense_category text,
  ADD COLUMN IF NOT EXISTS expense_template_id uuid NULL,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS is_template boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'account_id'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_account_fk
      FOREIGN KEY (account_id) REFERENCES public.financial_accounts(id)
      ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE OR REPLACE FUNCTION public.generate_invoice_reference()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    RETURN NEW;
  END IF;

  UPDATE public.invoices
  SET reference = format(
    'INV-%s-%s',
    to_char(CURRENT_DATE, 'YYMM'),
    lpad(CAST(invoice_number AS text), 5, '0')
  )
  WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_generate_invoice_reference ON public.invoices;
CREATE TRIGGER trg_generate_invoice_reference
AFTER INSERT ON public.invoices
FOR EACH ROW
EXECUTE FUNCTION public.generate_invoice_reference();

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS co_clients uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS passengers jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cost_price numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS package_ids uuid[] NULL,
  ADD COLUMN IF NOT EXISTS supplier_ids uuid[] NULL,
  ADD COLUMN IF NOT EXISTS finish_date date NULL,
  ADD COLUMN IF NOT EXISTS reference text,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS agent_id uuid NULL;

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS agent_id uuid NULL;

ALTER TABLE bank_entries
  ADD COLUMN IF NOT EXISTS agent_id uuid NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bookings' AND column_name = 'agent_id') THEN
    ALTER TABLE public.bookings
      ADD CONSTRAINT bookings_agent_fk
      FOREIGN KEY (agent_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'agent_id') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_agent_fk
      FOREIGN KEY (agent_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'bank_entries' AND column_name = 'agent_id') THEN
    ALTER TABLE public.bank_entries
      ADD CONSTRAINT bank_entries_agent_fk
      FOREIGN KEY (agent_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS bookings_agent_idx
  ON public.bookings (agent_id);

CREATE INDEX IF NOT EXISTS invoices_agent_idx
  ON public.invoices (agent_id);

CREATE INDEX IF NOT EXISTS bank_entries_agent_idx
  ON public.bank_entries (agent_id);

ALTER TABLE public.bank_entries
  DROP CONSTRAINT IF EXISTS bank_entries_amounts_valid;

ALTER TABLE public.bank_entries
  ADD CONSTRAINT bank_entries_amounts_valid
  CHECK (
    debit >= 0
    AND credit >= 0
    AND (debit > 0 OR credit > 0)
    AND NOT (debit > 0 AND credit > 0)
  );

ALTER TABLE public.agent_commissions
  DROP CONSTRAINT IF EXISTS agent_commissions_status_valid;

ALTER TABLE public.agent_commissions
  ADD CONSTRAINT agent_commissions_status_valid
  CHECK (status IN ('PENDING_PAYMENT', 'READY_TO_PAY', 'PAID', 'CANCELLED'));

CREATE OR REPLACE FUNCTION public.enforce_commission_payment_guardrail()
RETURNS trigger
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

DROP TRIGGER IF EXISTS trg_enforce_commission_payment_guardrail ON public.agent_commissions;
CREATE TRIGGER trg_enforce_commission_payment_guardrail
BEFORE INSERT OR UPDATE OF status, invoice_id
ON public.agent_commissions
FOR EACH ROW
EXECUTE FUNCTION public.enforce_commission_payment_guardrail();

CREATE OR REPLACE FUNCTION public.ensure_bank_entries_are_ledger_safe()
RETURNS trigger
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

DROP TRIGGER IF EXISTS trg_ensure_bank_entries_are_ledger_safe ON public.bank_entries;
CREATE TRIGGER trg_ensure_bank_entries_are_ledger_safe
BEFORE INSERT OR UPDATE OF debit, credit
ON public.bank_entries
FOR EACH ROW
EXECUTE FUNCTION public.ensure_bank_entries_are_ledger_safe();

CREATE INDEX IF NOT EXISTS bookings_co_clients_idx
  ON public.bookings USING GIN (co_clients);

CREATE INDEX IF NOT EXISTS bookings_passengers_idx
  ON public.bookings USING GIN (passengers);

ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS website_url text NULL;

CREATE INDEX IF NOT EXISTS suppliers_website_url_idx
  ON suppliers (website_url);

ALTER TABLE expenses
  ADD COLUMN IF NOT EXISTS template_id uuid,
  ADD COLUMN IF NOT EXISTS note text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS approved_by uuid,
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text;

ALTER TABLE public.supplier_payments
  ADD COLUMN IF NOT EXISTS account_id uuid NULL;

CREATE INDEX IF NOT EXISTS supplier_payments_account_idx
  ON public.supplier_payments (account_id);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'expenses' AND column_name = 'amount'
  ) THEN
    ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_amount_positive;
    ALTER TABLE expenses ADD CONSTRAINT expenses_amount_positive CHECK (amount > 0);
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_status_valid;
  ALTER TABLE expenses ADD CONSTRAINT expenses_status_valid CHECK (status IN ('pending', 'approved', 'rejected'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_method_valid;
  ALTER TABLE expenses ADD CONSTRAINT expenses_method_valid CHECK (method IN ('cash', 'credit_card', 'baridimob'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_approval_rule;
  ALTER TABLE expenses
    ADD CONSTRAINT expenses_approval_rule
    CHECK (
      (status <> 'approved') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE expenses DROP CONSTRAINT IF EXISTS expenses_template_fk;
  ALTER TABLE expenses
    ADD CONSTRAINT expenses_template_fk
    FOREIGN KEY (template_id) REFERENCES recurring_expense_templates(id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS invoices_is_expense_idx
  ON invoices (is_expense);

CREATE INDEX IF NOT EXISTS expenses_template_idx
  ON expenses (template_id);

CREATE INDEX IF NOT EXISTS expenses_status_idx
  ON expenses (status);

CREATE INDEX IF NOT EXISTS expenses_date_idx
  ON expenses (date DESC);

ALTER TABLE recurring_expense_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "recurring templates are readable by authenticated users" ON recurring_expense_templates;
CREATE POLICY "recurring templates are readable by authenticated users"
  ON recurring_expense_templates
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "recurring templates can be managed by authenticated users" ON recurring_expense_templates;
CREATE POLICY "recurring templates can be managed by authenticated users"
  ON recurring_expense_templates
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL AND amount >= 0);

CREATE POLICY "recurring templates can be updated by authenticated users"
  ON recurring_expense_templates
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (auth.uid() IS NOT NULL AND amount >= 0);

CREATE POLICY "recurring templates can be deleted by authenticated users"
  ON recurring_expense_templates
  FOR DELETE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "expenses are readable by authenticated users" ON expenses;
CREATE POLICY "expenses are readable by authenticated users"
  ON expenses
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "expenses can be created by authenticated users" ON expenses;
CREATE POLICY "expenses can be created by authenticated users"
  ON expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND amount > 0
    AND status IN ('pending', 'approved', 'rejected')
    AND method IN ('cash', 'credit_card', 'baridimob')
  );

CREATE POLICY "expenses can be updated by authenticated users"
  ON expenses
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND amount > 0
    AND status IN ('pending', 'approved', 'rejected')
    AND method IN ('cash', 'credit_card', 'baridimob')
  );

CREATE POLICY "expenses can be deleted by authenticated users"
  ON expenses
  FOR DELETE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "invoices are readable by authenticated users" ON invoices;
CREATE POLICY "invoices are readable by authenticated users"
  ON invoices
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "invoices are writable by authenticated users" ON invoices;
CREATE POLICY "invoices are writable by authenticated users"
  ON invoices
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "invoices can be updated by authenticated users"
  ON invoices
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "booking packages are readable by authenticated users" ON booking_packages;
CREATE POLICY "booking packages are readable by authenticated users"
  ON booking_packages
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "booking packages can be managed by authenticated users"
  ON booking_packages
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "booking packages can be updated by authenticated users"
  ON booking_packages
  FOR UPDATE TO authenticated
  USING (true)
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "booking packages can be deleted by authenticated users"
  ON booking_packages
  FOR DELETE TO authenticated
  USING (true);

DROP POLICY IF EXISTS "notifications are readable by the owner" ON notifications;
CREATE POLICY "notifications are readable by the owner"
  ON notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications can be created by the owner" ON notifications;
CREATE POLICY "notifications can be created by the owner"
  ON notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications can be updated by the owner" ON notifications;
CREATE POLICY "notifications can be updated by the owner"
  ON notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications can be deleted by the owner" ON notifications;
CREATE POLICY "notifications can be deleted by the owner"
  ON notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

COMMIT;
