CREATE OR REPLACE FUNCTION app.current_platform_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.platform_role', true), '')
$$;

CREATE OR REPLACE FUNCTION app.current_department_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF(current_setting('app.department_id', true), '')::uuid
$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staybuddy_platform') THEN
    CREATE ROLE staybuddy_platform NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'staybuddy_runtime') THEN
    CREATE ROLE staybuddy_runtime NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT;
  END IF;
END
$$;

GRANT staybuddy_app, staybuddy_platform TO staybuddy_runtime;

DO $$
BEGIN
  EXECUTE format('GRANT staybuddy_app, staybuddy_platform TO %I', session_user);
END
$$;

CREATE TABLE IF NOT EXISTS platform_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject text NOT NULL UNIQUE,
  email_hash text NOT NULL UNIQUE,
  encrypted_email text NOT NULL,
  status text NOT NULL CHECK (status IN ('INVITED', 'ACTIVE', 'SUSPENDED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS platform_role_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_identity_id uuid NOT NULL REFERENCES platform_identities(id),
  role text NOT NULL CHECK (role IN (
    'STAYBUDDY_SUPER_ADMIN', 'STAYBUDDY_CONTENT_OPS', 'STAYBUDDY_FINANCE', 'STAYBUDDY_SUPPORT'
  )),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'SUSPENDED')),
  granted_by text NOT NULL,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform_identity_id, role)
);

ALTER TABLE idempotency_keys ALTER COLUMN hotel_id DROP NOT NULL;
ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS platform_scope text;
ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS idempotency_keys_hotel_id_key_key;
ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS idempotency_keys_scope_check;
ALTER TABLE idempotency_keys ADD CONSTRAINT idempotency_keys_scope_check CHECK (
  (hotel_id IS NOT NULL AND platform_scope IS NULL)
  OR (hotel_id IS NULL AND platform_scope IS NOT NULL AND length(platform_scope) BETWEEN 1 AND 120)
);
CREATE UNIQUE INDEX IF NOT EXISTS idempotency_keys_tenant_key
  ON idempotency_keys (hotel_id, key) WHERE hotel_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idempotency_keys_platform_key
  ON idempotency_keys (platform_scope, key) WHERE hotel_id IS NULL;

ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS locked_at timestamptz;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS locked_by text;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS producer text NOT NULL DEFAULT 'legacy';
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS actor jsonb NOT NULL DEFAULT '{"type":"SYSTEM"}'::jsonb;
ALTER TABLE outbox_events ADD COLUMN IF NOT EXISTS command_id text;
DROP INDEX IF EXISTS outbox_events_pending_idx;
CREATE INDEX IF NOT EXISTS outbox_events_pending_idx
  ON outbox_events (available_at, locked_at, occurred_at)
  WHERE processed_at IS NULL AND dead_lettered_at IS NULL;

CREATE OR REPLACE FUNCTION app.prevent_outbox_fact_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'outbox event facts cannot be deleted' USING ERRCODE = '55000';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.hotel_id IS DISTINCT FROM OLD.hotel_id
    OR NEW.event_type IS DISTINCT FROM OLD.event_type
    OR NEW.schema_version IS DISTINCT FROM OLD.schema_version
    OR NEW.aggregate_type IS DISTINCT FROM OLD.aggregate_type
    OR NEW.aggregate_id IS DISTINCT FROM OLD.aggregate_id
    OR NEW.payload IS DISTINCT FROM OLD.payload
    OR NEW.producer IS DISTINCT FROM OLD.producer
    OR NEW.actor IS DISTINCT FROM OLD.actor
    OR NEW.command_id IS DISTINCT FROM OLD.command_id
    OR NEW.trace_id IS DISTINCT FROM OLD.trace_id
    OR NEW.correlation_id IS DISTINCT FROM OLD.correlation_id
    OR NEW.causation_id IS DISTINCT FROM OLD.causation_id
    OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key
    OR NEW.occurred_at IS DISTINCT FROM OLD.occurred_at THEN
    RAISE EXCEPTION 'outbox event facts are immutable' USING ERRCODE = '55000';
  END IF;
  RETURN NEW;
END
$$;

DROP TRIGGER IF EXISTS outbox_events_fact_immutable ON outbox_events;
CREATE TRIGGER outbox_events_fact_immutable
BEFORE UPDATE OR DELETE ON outbox_events
FOR EACH ROW EXECUTE FUNCTION app.prevent_outbox_fact_change();

CREATE UNIQUE INDEX IF NOT EXISTS hotel_departments_tenant_id ON hotel_departments (hotel_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS hotel_apps_tenant_id ON hotel_apps (hotel_id, id);

ALTER TABLE hotel_memberships DROP CONSTRAINT IF EXISTS hotel_memberships_department_id_fkey;
ALTER TABLE hotel_memberships
  ADD CONSTRAINT hotel_memberships_tenant_department_fkey
  FOREIGN KEY (hotel_id, department_id) REFERENCES hotel_departments(hotel_id, id);

ALTER TABLE app_build_jobs DROP CONSTRAINT IF EXISTS app_build_jobs_hotel_app_id_fkey;
ALTER TABLE app_build_jobs
  ADD CONSTRAINT app_build_jobs_tenant_app_fkey
  FOREIGN KEY (hotel_id, hotel_app_id) REFERENCES hotel_apps(hotel_id, id);

ALTER TABLE hotel_memberships DROP CONSTRAINT IF EXISTS hotel_memberships_department_scope_check;
ALTER TABLE hotel_memberships ADD CONSTRAINT hotel_memberships_department_scope_check CHECK (
  role NOT IN ('DEPARTMENT_MANAGER', 'DEPARTMENT_AGENT') OR department_id IS NOT NULL
);

CREATE OR REPLACE FUNCTION app.staff_identity_is_active(identity_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM staff_identities WHERE id = identity_id AND status = 'ACTIVE'
  )
$$;

REVOKE ALL ON FUNCTION app.staff_identity_is_active(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app.staff_identity_is_active(uuid) TO staybuddy_app;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'hotels', 'hotel_locations', 'hotel_apps', 'hotel_brand_profiles', 'hotel_features',
    'hotel_departments', 'hotel_memberships', 'hotel_commercial_configs', 'app_build_jobs',
    'idempotency_keys', 'outbox_events', 'audit_logs',
    'reservation_mapping_profiles', 'reservation_import_batches', 'reservations', 'reservation_rooms',
    'stays', 'reservation_import_rejections', 'hotel_guest_accounts', 'guest_auth_identities',
    'guest_devices', 'guest_sessions', 'push_subscriptions', 'stay_claims', 'stay_claim_sessions',
    'prearrival_invitations', 'prearrival_invitation_sessions', 'stay_guest_memberships',
    'consent_definitions', 'consent_events', 'consent_current', 'email_otp_challenges'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    IF table_name = 'hotels' THEN
      EXECUTE 'CREATE POLICY tenant_isolation ON hotels TO staybuddy_app USING (id = app.current_hotel_id()) WITH CHECK (id = app.current_hotel_id())';
    ELSE
      EXECUTE format(
        'CREATE POLICY tenant_isolation ON %I TO staybuddy_app USING (hotel_id = app.current_hotel_id()) WITH CHECK (hotel_id = app.current_hotel_id())',
        table_name
      );
    END IF;
  END LOOP;
END
$$;

ALTER TABLE platform_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_identities FORCE ROW LEVEL SECURITY;
ALTER TABLE platform_role_grants ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_role_grants FORCE ROW LEVEL SECURITY;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'hotels', 'hotel_locations', 'hotel_apps', 'hotel_brand_profiles', 'hotel_features',
    'hotel_departments', 'hotel_memberships', 'hotel_commercial_configs', 'app_build_jobs',
    'consent_definitions', 'idempotency_keys', 'outbox_events', 'audit_logs'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS platform_read ON %I', table_name);
    EXECUTE format('DROP POLICY IF EXISTS platform_write ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY platform_read ON %I FOR SELECT TO staybuddy_platform USING (app.current_platform_role() IN (''STAYBUDDY_SUPER_ADMIN'', ''STAYBUDDY_SUPPORT''))',
      table_name
    );
    EXECUTE format(
      'CREATE POLICY platform_write ON %I FOR ALL TO staybuddy_platform USING (app.current_platform_role() = ''STAYBUDDY_SUPER_ADMIN'') WITH CHECK (app.current_platform_role() = ''STAYBUDDY_SUPER_ADMIN'')',
      table_name
    );
  END LOOP;
END
$$;

CREATE POLICY tenant_resolver_read_hotels ON hotels
  FOR SELECT TO staybuddy_platform
  USING (app.current_platform_role() = 'STAYBUDDY_TENANT_RESOLVER');
CREATE POLICY tenant_resolver_read_apps ON hotel_apps
  FOR SELECT TO staybuddy_platform
  USING (app.current_platform_role() = 'STAYBUDDY_TENANT_RESOLVER');
CREATE POLICY tenant_resolver_read_brand ON hotel_brand_profiles
  FOR SELECT TO staybuddy_platform
  USING (app.current_platform_role() = 'STAYBUDDY_TENANT_RESOLVER');
CREATE POLICY tenant_resolver_read_features ON hotel_features
  FOR SELECT TO staybuddy_platform
  USING (app.current_platform_role() = 'STAYBUDDY_TENANT_RESOLVER');

CREATE POLICY platform_system_outbox ON outbox_events
  FOR ALL TO staybuddy_platform
  USING (app.current_platform_role() = 'STAYBUDDY_SYSTEM' AND hotel_id IS NULL)
  WITH CHECK (app.current_platform_role() = 'STAYBUDDY_SYSTEM' AND hotel_id IS NULL);

CREATE POLICY platform_identity_read ON platform_identities
  FOR SELECT TO staybuddy_platform
  USING (app.current_platform_role() IN ('STAYBUDDY_AUTHENTICATOR', 'STAYBUDDY_SUPER_ADMIN'));
CREATE POLICY platform_identity_write ON platform_identities
  FOR ALL TO staybuddy_platform
  USING (app.current_platform_role() = 'STAYBUDDY_SUPER_ADMIN')
  WITH CHECK (app.current_platform_role() = 'STAYBUDDY_SUPER_ADMIN');
CREATE POLICY platform_grant_read ON platform_role_grants
  FOR SELECT TO staybuddy_platform
  USING (app.current_platform_role() IN ('STAYBUDDY_AUTHENTICATOR', 'STAYBUDDY_SUPER_ADMIN'));
CREATE POLICY platform_grant_write ON platform_role_grants
  FOR ALL TO staybuddy_platform
  USING (app.current_platform_role() = 'STAYBUDDY_SUPER_ADMIN')
  WITH CHECK (app.current_platform_role() = 'STAYBUDDY_SUPER_ADMIN');

GRANT USAGE ON SCHEMA public, app TO staybuddy_platform;
GRANT SELECT ON hotels, hotel_locations, hotel_apps, hotel_brand_profiles, hotel_features,
  hotel_departments, hotel_memberships, hotel_commercial_configs, app_build_jobs,
  consent_definitions, idempotency_keys, outbox_events, audit_logs,
  platform_identities, platform_role_grants TO staybuddy_platform;
GRANT INSERT, UPDATE, DELETE ON hotels, hotel_locations, hotel_apps, hotel_brand_profiles,
  hotel_features, hotel_departments, hotel_memberships, hotel_commercial_configs, app_build_jobs,
  consent_definitions, idempotency_keys, outbox_events, platform_identities, platform_role_grants
  TO staybuddy_platform;
GRANT INSERT ON audit_logs TO staybuddy_platform;

REVOKE ALL ON ALL TABLES IN SCHEMA public FROM staybuddy_runtime;
