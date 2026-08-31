CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS app;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staybuddy_app') THEN
    CREATE ROLE staybuddy_app NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION app.current_hotel_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.hotel_id', true), '')::uuid
$$;

CREATE OR REPLACE FUNCTION app.current_actor_id()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.actor_id', true), '')
$$;

CREATE TABLE IF NOT EXISTS hotels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  legal_name text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL CHECK (status IN ('DRAFT', 'ONBOARDING', 'PILOT', 'LIVE', 'SUSPENDED')),
  timezone text NOT NULL,
  country_code char(2) NOT NULL,
  room_count integer NOT NULL CHECK (room_count > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hotel_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  name text NOT NULL,
  timezone text NOT NULL,
  country_code char(2) NOT NULL,
  province text,
  district text,
  latitude numeric(9,6),
  longitude numeric(9,6),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hotel_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  app_installation_key_hash text NOT NULL UNIQUE,
  app_installation_key_hint text NOT NULL,
  app_name text NOT NULL,
  ios_bundle_id text NOT NULL UNIQUE,
  android_package text NOT NULL UNIQUE,
  minimum_version text NOT NULL DEFAULT '1.0.0',
  status text NOT NULL CHECK (status IN ('DRAFT', 'READY', 'BUILDING', 'REVIEW', 'LIVE', 'PAUSED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hotel_brand_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  version integer NOT NULL CHECK (version > 0),
  is_active boolean NOT NULL DEFAULT false,
  voice_profile text NOT NULL CHECK (voice_profile IN ('FIVE_STAR_RESORT', 'FIVE_STAR_BOUTIQUE')),
  theme jsonb NOT NULL,
  supported_locales text[] NOT NULL CHECK (cardinality(supported_locales) = 4),
  default_locale text NOT NULL CHECK (default_locale IN ('en', 'th', 'zh-CN', 'ru')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS hotel_brand_profiles_one_active
  ON hotel_brand_profiles (hotel_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS hotel_features (
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  feature_key text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hotel_id, feature_key)
);

CREATE TABLE IF NOT EXISTS hotel_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  code text NOT NULL,
  name text NOT NULL,
  default_sla_minutes integer NOT NULL CHECK (default_sla_minutes > 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, code)
);

CREATE TABLE IF NOT EXISTS staff_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email_hash text NOT NULL UNIQUE,
  encrypted_email text NOT NULL,
  status text NOT NULL CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hotel_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  staff_identity_id uuid NOT NULL REFERENCES staff_identities(id),
  role text NOT NULL CHECK (role IN ('HOTEL_OWNER', 'HOTEL_ADMIN', 'FRONT_DESK', 'DEPARTMENT_MANAGER', 'DEPARTMENT_AGENT')),
  department_id uuid REFERENCES hotel_departments(id),
  status text NOT NULL CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, staff_identity_id)
);

CREATE TABLE IF NOT EXISTS hotel_commercial_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  version integer NOT NULL CHECK (version > 0),
  list_price_per_room_minor integer NOT NULL DEFAULT 15000 CHECK (list_price_per_room_minor = 15000),
  minimum_billable_rooms integer NOT NULL DEFAULT 50 CHECK (minimum_billable_rooms = 50),
  discount_minor integer NOT NULL DEFAULT 0 CHECK (discount_minor >= 0),
  waiver_reason text,
  commerce_commission_basis_points integer NOT NULL DEFAULT 500 CHECK (commerce_commission_basis_points = 500),
  ai_markup_basis_points integer NOT NULL DEFAULT 1250 CHECK (ai_markup_basis_points = 1250),
  effective_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, version)
);

CREATE TABLE IF NOT EXISTS app_build_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  hotel_app_id uuid NOT NULL REFERENCES hotel_apps(id),
  platform text NOT NULL CHECK (platform IN ('IOS', 'ANDROID')),
  profile text NOT NULL CHECK (profile IN ('DEVELOPMENT', 'PREVIEW', 'PRODUCTION')),
  status text NOT NULL CHECK (status IN ('QUEUED', 'VALIDATING', 'BUILDING', 'BUILT', 'SUBMITTED', 'REVIEW', 'LIVE', 'FAILED', 'CANCELLED')),
  version text NOT NULL,
  provider_reference text,
  failure_code text,
  requested_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  key text NOT NULL,
  request_fingerprint text NOT NULL,
  status text NOT NULL CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED')),
  response_status integer,
  response_body jsonb,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, key)
);

CREATE TABLE IF NOT EXISTS outbox_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid REFERENCES hotels(id),
  event_type text NOT NULL,
  schema_version integer NOT NULL CHECK (schema_version > 0),
  aggregate_type text NOT NULL,
  aggregate_id text NOT NULL,
  payload jsonb NOT NULL,
  trace_id text NOT NULL,
  correlation_id text NOT NULL,
  causation_id text,
  idempotency_key text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  available_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 0,
  processed_at timestamptz,
  dead_lettered_at timestamptz,
  last_error_code text
);

CREATE INDEX IF NOT EXISTS outbox_events_pending_idx
  ON outbox_events (available_at, occurred_at) WHERE processed_at IS NULL AND dead_lettered_at IS NULL;

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid REFERENCES hotels(id),
  actor_type text NOT NULL,
  actor_id text,
  actor_role text,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text NOT NULL,
  reason text,
  sensitive_fields text[] NOT NULL DEFAULT '{}',
  trace_id text NOT NULL,
  correlation_id text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION app.prevent_append_only_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'append-only table % cannot be updated or deleted', TG_TABLE_NAME USING ERRCODE = '55000';
END
$$;

DROP TRIGGER IF EXISTS audit_logs_append_only ON audit_logs;
CREATE TRIGGER audit_logs_append_only
BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION app.prevent_append_only_change();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'hotels', 'hotel_locations', 'hotel_apps', 'hotel_brand_profiles', 'hotel_features',
    'hotel_departments', 'hotel_memberships', 'hotel_commercial_configs', 'app_build_jobs',
    'idempotency_keys', 'outbox_events', 'audit_logs'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    IF table_name = 'hotels' THEN
      EXECUTE 'CREATE POLICY tenant_isolation ON hotels USING (id = app.current_hotel_id()) WITH CHECK (id = app.current_hotel_id())';
    ELSE
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I USING (hotel_id = app.current_hotel_id()) WITH CHECK (hotel_id = app.current_hotel_id())',
        table_name
      );
    END IF;
  END LOOP;
END
$$;

REVOKE ALL ON SCHEMA public FROM staybuddy_app;
GRANT USAGE ON SCHEMA public, app TO staybuddy_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON hotels, hotel_locations, hotel_apps, hotel_brand_profiles,
  hotel_features, hotel_departments, hotel_memberships, hotel_commercial_configs, app_build_jobs,
  idempotency_keys, outbox_events TO staybuddy_app;
GRANT SELECT, INSERT ON audit_logs TO staybuddy_app;
REVOKE ALL ON staff_identities FROM staybuddy_app;
