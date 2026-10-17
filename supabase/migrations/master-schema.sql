-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.profiles (
  id uuid NOT NULL,
  full_name text NOT NULL,
  role USER-DEFINED NOT NULL DEFAULT 'viewer'::user_role,
  created_at timestamp with time zone DEFAULT now(),
  base_salary numeric DEFAULT 0,
  avatar_url text,
  permissions jsonb DEFAULT '{"clients": true, "finance": false, "bookings": true, "settings": false, "dashboard": true}'::jsonb,
  salary_pay_day integer CHECK (salary_pay_day >= 1 AND salary_pay_day <= 31),
  CONSTRAINT profiles_pkey PRIMARY KEY (id),
  CONSTRAINT profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id)
);
CREATE TABLE public.suppliers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  star_rating numeric DEFAULT 0.0,
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
  reference text UNIQUE,
  type text NOT NULL DEFAULT 'General'::text,
  CONSTRAINT suppliers_pkey PRIMARY KEY (id)
);
CREATE TABLE public.clients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  reference text UNIQUE,
  city text,
  country text,
  tags jsonb DEFAULT '[]'::jsonb,
  CONSTRAINT clients_pkey PRIMARY KEY (id)
);
CREATE TABLE public.packages_legacy (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  destination text NOT NULL,
  price numeric NOT NULL,
  inclusions jsonb DEFAULT '[]'::jsonb,
  is_available boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  supplier_id uuid,
  cost_price numeric NOT NULL DEFAULT 0,
  pricing_mode text NOT NULL DEFAULT 'fixed'::text,
  CONSTRAINT packages_legacy_pkey PRIMARY KEY (id),
  CONSTRAINT packages_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id)
);
CREATE TABLE public.bookings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  package_id uuid,
  supplier_id uuid,
  status USER-DEFINED DEFAULT 'pending'::booking_status,
  created_at timestamp with time zone DEFAULT now(),
  service_id uuid,
  selling_price numeric DEFAULT 0.00,
  package_ids ARRAY,
  finish_date date,
  cost_price numeric NOT NULL DEFAULT 0,
  note text,
  reference text,
  companions jsonb DEFAULT '[]'::jsonb,
  co_clients ARRAY NOT NULL DEFAULT '{}'::uuid[],
  passengers jsonb NOT NULL DEFAULT '[]'::jsonb,
  agent_id uuid,
  CONSTRAINT bookings_pkey PRIMARY KEY (id),
  CONSTRAINT bookings_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT bookings_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id),
  CONSTRAINT bookings_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.service_templates(id),
  CONSTRAINT bookings_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.package_templates(id),
  CONSTRAINT bookings_agent_fk FOREIGN KEY (agent_id) REFERENCES auth.users(id)
);
CREATE TABLE public.invoices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  booking_id uuid,
  client_id uuid,
  invoice_number integer NOT NULL DEFAULT nextval('invoices_invoice_number_seq'::regclass),
  subtotal numeric NOT NULL,
  apply_tva boolean DEFAULT false,
  tva_amount numeric DEFAULT 0.00,
  grand_total numeric NOT NULL,
  status USER-DEFINED DEFAULT 'pending'::invoice_status,
  due_date date,
  created_at timestamp with time zone DEFAULT now(),
  payment_method text,
  paid_at timestamp with time zone,
  is_expense boolean NOT NULL DEFAULT false,
  expense_category text,
  expense_template_id uuid,
  reference text,
  note text,
  is_template boolean NOT NULL DEFAULT false,
  amount_paid numeric DEFAULT 0,
  payment_type text DEFAULT 'full'::text CHECK (payment_type = ANY (ARRAY['full'::text, 'partial'::text])),
  account_id uuid,
  agent_id uuid,
  CONSTRAINT invoices_pkey PRIMARY KEY (id),
  CONSTRAINT invoices_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id),
  CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT invoices_agent_fk FOREIGN KEY (agent_id) REFERENCES auth.users(id),
  CONSTRAINT invoices_booking_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id)
);
CREATE TABLE public.expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category USER-DEFINED NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0::numeric),
  method USER-DEFINED NOT NULL CHECK (method = ANY (ARRAY['cash'::payment_method, 'credit_card'::payment_method, 'baridimob'::payment_method])),
  recorded_by uuid,
  date timestamp with time zone DEFAULT now(),
  template_id uuid,
  note text,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])),
  approved_by uuid,
  approved_at timestamp with time zone,
  rejected_reason text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT expenses_pkey PRIMARY KEY (id),
  CONSTRAINT expenses_recorded_by_fkey FOREIGN KEY (recorded_by) REFERENCES public.profiles(id),
  CONSTRAINT expenses_template_fk FOREIGN KEY (template_id) REFERENCES public.recurring_expense_templates(id)
);
CREATE TABLE public.employee_commissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agent_id uuid,
  booking_id uuid,
  commission_amount numeric NOT NULL,
  status USER-DEFINED DEFAULT 'pending'::invoice_status,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT employee_commissions_pkey PRIMARY KEY (id),
  CONSTRAINT employee_commissions_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES public.profiles(id),
  CONSTRAINT employee_commissions_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id)
);
CREATE TABLE public.service_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  country_id text NOT NULL,
  visa_type_id text NOT NULL,
  title text NOT NULL,
  stages_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  name text,
  client_id uuid,
  supplier_id uuid,
  package_id uuid,
  professional_status text,
  CONSTRAINT service_templates_pkey PRIMARY KEY (id),
  CONSTRAINT service_templates_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT service_templates_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id),
  CONSTRAINT service_templates_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages(id)
);
CREATE TABLE public.client_services (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  client_id uuid,
  template_id uuid,
  stages_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT client_services_pkey PRIMARY KEY (id),
  CONSTRAINT client_services_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT client_services_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.service_templates(id)
);
CREATE TABLE public.marketing_campaigns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  platform text NOT NULL,
  budget numeric NOT NULL DEFAULT 0.00,
  status text DEFAULT 'active'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT marketing_campaigns_pkey PRIMARY KEY (id)
);
CREATE TABLE public.tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  status text DEFAULT 'To Do'::text,
  priority text DEFAULT 'Medium'::text,
  client_id uuid,
  supplier_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  service_id uuid,
  package_id uuid,
  CONSTRAINT tasks_pkey PRIMARY KEY (id),
  CONSTRAINT tasks_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id),
  CONSTRAINT tasks_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id),
  CONSTRAINT tasks_service_id_fkey FOREIGN KEY (service_id) REFERENCES public.service_templates(id),
  CONSTRAINT tasks_package_id_fkey FOREIGN KEY (package_id) REFERENCES public.packages_legacy(id)
);
CREATE TABLE public.service_stages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  service_template_id uuid NOT NULL,
  title text NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT service_stages_pkey PRIMARY KEY (id),
  CONSTRAINT service_stages_service_template_id_fkey FOREIGN KEY (service_template_id) REFERENCES public.service_templates(id)
);
CREATE TABLE public.service_steps (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL,
  title text NOT NULL,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT service_steps_pkey PRIMARY KEY (id),
  CONSTRAINT service_steps_stage_id_fkey FOREIGN KEY (stage_id) REFERENCES public.service_stages(id)
);
CREATE TABLE public.service_items (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  step_id uuid NOT NULL,
  title text NOT NULL,
  drive_url text,
  is_done boolean DEFAULT false,
  sort_order integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  standard_note text NOT NULL DEFAULT ''::text,
  estimated_price numeric NOT NULL DEFAULT 0,
  CONSTRAINT service_items_pkey PRIMARY KEY (id),
  CONSTRAINT service_items_step_id_fkey FOREIGN KEY (step_id) REFERENCES public.service_steps(id)
);
CREATE TABLE public.supplier_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  supplier_id uuid NOT NULL,
  amount numeric NOT NULL,
  payment_method USER-DEFINED NOT NULL,
  note text,
  paid_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  account_id uuid,
  CONSTRAINT supplier_payments_pkey PRIMARY KEY (id),
  CONSTRAINT supplier_payments_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id),
  CONSTRAINT supplier_payments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.financial_accounts(id)
);
CREATE TABLE public.booking_packages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  package_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT booking_packages_pkey PRIMARY KEY (id),
  CONSTRAINT booking_packages_booking_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id),
  CONSTRAINT booking_packages_package_fk FOREIGN KEY (package_id) REFERENCES public.packages(id)
);
CREATE TABLE public.recurring_expense_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  category text NOT NULL DEFAULT 'general'::text,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash'::text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT recurring_expense_templates_pkey PRIMARY KEY (id)
);
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  channel text NOT NULL DEFAULT 'push'::text CHECK (channel = ANY (ARRAY['system'::text, 'email'::text, 'sms'::text, 'push'::text])),
  type text NOT NULL DEFAULT 'info'::text CHECK (type = ANY (ARRAY['info'::text, 'success'::text, 'warning'::text, 'error'::text])),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  read_at timestamp with time zone,
  route text,
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_user_fk FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.booking_suppliers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT booking_suppliers_pkey PRIMARY KEY (id),
  CONSTRAINT booking_suppliers_booking_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id),
  CONSTRAINT booking_suppliers_supplier_fk FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id)
);
CREATE TABLE public.service_clients (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  service_template_id uuid NOT NULL,
  client_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT service_clients_pkey PRIMARY KEY (id),
  CONSTRAINT service_clients_service_fk FOREIGN KEY (service_template_id) REFERENCES public.service_templates(id),
  CONSTRAINT service_clients_client_fk FOREIGN KEY (client_id) REFERENCES public.clients(id)
);
CREATE TABLE public.service_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  name_ar text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  category text,
  CONSTRAINT service_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.service_type_suppliers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  service_type_id uuid NOT NULL,
  supplier_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT service_type_suppliers_pkey PRIMARY KEY (id),
  CONSTRAINT service_type_suppliers_service_type_id_fkey FOREIGN KEY (service_type_id) REFERENCES public.service_types(id),
  CONSTRAINT service_type_suppliers_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id)
);
CREATE TABLE public.booking_service_lines (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL,
  service_type_id uuid,
  supplier_id uuid,
  description text,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric NOT NULL DEFAULT 0,
  cost_price numeric NOT NULL DEFAULT 0,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  selling_price numeric DEFAULT 0,
  tva_rate numeric DEFAULT 0 CHECK (tva_rate = ANY (ARRAY[0::numeric, 9::numeric, 19::numeric])),
  CONSTRAINT booking_service_lines_pkey PRIMARY KEY (id),
  CONSTRAINT booking_service_lines_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES public.bookings(id),
  CONSTRAINT booking_service_lines_service_type_id_fkey FOREIGN KEY (service_type_id) REFERENCES public.service_types(id),
  CONSTRAINT booking_service_lines_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id)
);
CREATE TABLE public.service_type_fields (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  service_type_id uuid NOT NULL,
  name text NOT NULL,
  field_key text NOT NULL,
  field_type text NOT NULL DEFAULT 'text'::text CHECK (field_type = ANY (ARRAY['text'::text, 'number'::text, 'date'::text, 'select'::text, 'checkbox'::text, 'textarea'::text])),
  options jsonb DEFAULT '[]'::jsonb,
  required boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT service_type_fields_pkey PRIMARY KEY (id),
  CONSTRAINT service_type_fields_service_type_id_fkey FOREIGN KEY (service_type_id) REFERENCES public.service_types(id)
);
CREATE TABLE public.package_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  template_type text NOT NULL DEFAULT 'trip'::text CHECK (template_type = ANY (ARRAY['trip'::text, 'hajj'::text, 'omra'::text, 'ticket_promotion'::text, 'hotel_promotion'::text])),
  type text NOT NULL DEFAULT 'national'::text,
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
  travel_schedule jsonb NOT NULL DEFAULT '[]'::jsonb,
  inclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  exclusions jsonb NOT NULL DEFAULT '[]'::jsonb,
  cancellation_policy text,
  good_to_know text,
  location text,
  distance_from_haram numeric,
  flight_details jsonb DEFAULT '{}'::jsonb,
  target_tags jsonb DEFAULT '[]'::jsonb,
  stock integer NOT NULL DEFAULT 0,
  hotel_details jsonb DEFAULT '{}'::jsonb,
  description text,
  supplier_drive_link text,
  CONSTRAINT package_templates_pkey PRIMARY KEY (id),
  CONSTRAINT package_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.profiles(id),
  CONSTRAINT package_templates_supplier_id_fkey FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id)
);
CREATE TABLE public.packages (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  template_id uuid,
  title text NOT NULL,
  cost_price numeric DEFAULT 0,
  selling_price numeric DEFAULT 0,
  is_available boolean DEFAULT true,
  supplier_id uuid,
  brochure_url text,
  created_at timestamp with time zone DEFAULT now(),
  destination text,
  price numeric NOT NULL DEFAULT 0,
  pricing_mode text NOT NULL DEFAULT 'fixed'::text,
  CONSTRAINT packages_pkey PRIMARY KEY (id),
  CONSTRAINT packages_template_id_fkey FOREIGN KEY (template_id) REFERENCES public.package_templates(id),
  CONSTRAINT packages_supplier_id_fkey1 FOREIGN KEY (supplier_id) REFERENCES public.suppliers(id)
);
CREATE TABLE public.agency_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  package_type_descriptions jsonb NOT NULL DEFAULT '{"hajj": "Hajj package service including pilgrimage arrangements and hospitality support.", "omra": "Omra package service including travel, accommodation, and pilgrimage support.", "trip": "Standard trip package service.", "hotel_promotion": "Hotel promotion service with accommodation arrangements and stay support.", "ticket_promotion": "Air ticket promotion service with flight arrangements and travel support."}'::jsonb,
  commission_rules jsonb NOT NULL DEFAULT '{"hajj": {"amount": 0, "method": "percentage", "enabled": true, "percentage": 12, "target_type": "package"}, "omra": {"amount": 0, "method": "percentage", "enabled": true, "percentage": 12, "target_type": "package"}, "trip": {"amount": 0, "method": "percentage", "enabled": true, "percentage": 10, "target_type": "package"}, "hotel_promotion": {"amount": 0, "method": "amount", "enabled": true, "percentage": 0, "target_type": "package"}, "ticket_promotion": {"amount": 0, "method": "amount", "enabled": true, "percentage": 0, "target_type": "package"}}'::jsonb,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  enable_package_lines boolean DEFAULT true,
  admin_pin text,
  secure_delete_pin text,
  singleton_guard boolean DEFAULT true UNIQUE CHECK (singleton_guard = true),
  CONSTRAINT agency_settings_pkey PRIMARY KEY (id)
);
CREATE TABLE public.countries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT countries_pkey PRIMARY KEY (id)
);
CREATE TABLE public.cities (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  country_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT cities_pkey PRIMARY KEY (id),
  CONSTRAINT cities_country_id_fkey FOREIGN KEY (country_id) REFERENCES public.countries(id)
);
CREATE TABLE public.financial_accounts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  label text NOT NULL,
  currency text NOT NULL DEFAULT 'DZD'::text,
  country text,
  initial_balance numeric NOT NULL DEFAULT 0,
  current_balance numeric NOT NULL DEFAULT 0,
  bank_name text,
  iban text,
  swift_bic text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  status text DEFAULT 'active'::text,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  accepted_payment_methods ARRAY DEFAULT '{cash,bank_transfer,credit_card,baridimob}'::text[],
  CONSTRAINT financial_accounts_pkey PRIMARY KEY (id)
);
CREATE TABLE public.bank_entries (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  operation_date timestamp with time zone NOT NULL DEFAULT now(),
  description text NOT NULL,
  operation_type text NOT NULL,
  third_party text,
  debit numeric NOT NULL DEFAULT 0,
  credit numeric NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  agent_id uuid,
  CONSTRAINT bank_entries_pkey PRIMARY KEY (id),
  CONSTRAINT bank_entries_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.financial_accounts(id),
  CONSTRAINT bank_entries_agent_fk FOREIGN KEY (agent_id) REFERENCES auth.users(id)
);
CREATE TABLE public.financial_account_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL,
  type text NOT NULL DEFAULT 'manual'::text,
  amount numeric NOT NULL DEFAULT 0,
  description text,
  reference text,
  source text NOT NULL DEFAULT 'manual'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT financial_account_transactions_pkey PRIMARY KEY (id),
  CONSTRAINT financial_account_transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.financial_accounts(id)
);
CREATE TABLE public.commission_payments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  invoice_id uuid,
  target_type text NOT NULL DEFAULT 'package'::text,
  target_id uuid,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0::numeric),
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'paid'::text, 'cancelled'::text])),
  paid_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT commission_payments_pkey PRIMARY KEY (id)
);
CREATE TABLE public.agent_commissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL,
  booking_id uuid,
  invoice_id uuid,
  amount numeric NOT NULL DEFAULT 0 CHECK (amount >= 0::numeric),
  status text NOT NULL DEFAULT 'PENDING_PAYMENT'::text CHECK (status = ANY (ARRAY['PENDING_PAYMENT'::text, 'READY_TO_PAY'::text, 'PAID'::text, 'CANCELLED'::text])),
  notes text,
  paid_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  salary_month text,
  CONSTRAINT agent_commissions_pkey PRIMARY KEY (id),
  CONSTRAINT agent_commissions_agent_fk FOREIGN KEY (agent_id) REFERENCES auth.users(id),
  CONSTRAINT agent_commissions_booking_fk FOREIGN KEY (booking_id) REFERENCES public.bookings(id),
  CONSTRAINT agent_commissions_invoice_fk FOREIGN KEY (invoice_id) REFERENCES public.invoices(id)
);
CREATE TABLE public.master_templates (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  country_id text NOT NULL,
  visa_type_id text NOT NULL,
  professional_status text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT master_templates_pkey PRIMARY KEY (id)
);
CREATE TABLE public.client_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  phone text,
  CONSTRAINT client_requests_pkey PRIMARY KEY (id),
  CONSTRAINT client_requests_agent_id_fkey FOREIGN KEY (agent_id) REFERENCES auth.users(id)
);
CREATE TABLE public.proposals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
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
  assurance jsonb DEFAULT '[]'::jsonb,
  CONSTRAINT proposals_pkey PRIMARY KEY (id),
  CONSTRAINT proposals_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.client_requests(id)
);
CREATE TABLE public.relationship_types (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  label text NOT NULL UNIQUE,
  CONSTRAINT relationship_types_pkey PRIMARY KEY (id)
);
CREATE TABLE public.agency_links (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  url text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  category text,
  CONSTRAINT agency_links_pkey PRIMARY KEY (id)
);