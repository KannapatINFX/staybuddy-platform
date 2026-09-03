ALTER TABLE hotel_apps ADD COLUMN IF NOT EXISTS scheme text;
UPDATE hotel_apps
SET scheme = regexp_replace(lower(app_name), '[^a-z0-9]+', '', 'g')
WHERE scheme IS NULL;
ALTER TABLE hotel_apps ALTER COLUMN scheme SET NOT NULL;
ALTER TABLE hotel_apps ADD CONSTRAINT hotel_apps_scheme_format
  CHECK (scheme ~ '^[a-z][a-z0-9-]*$');
ALTER TABLE hotel_apps ADD COLUMN IF NOT EXISTS config_version integer NOT NULL DEFAULT 1
  CHECK (config_version > 0);
ALTER TABLE hotel_apps ADD COLUMN IF NOT EXISTS maintenance_active boolean NOT NULL DEFAULT false;
ALTER TABLE hotel_apps ADD COLUMN IF NOT EXISTS maintenance_message_key text;

CREATE TABLE IF NOT EXISTS hotel_onboarding_profiles (
  hotel_id uuid PRIMARY KEY REFERENCES hotels(id),
  sales_reference text,
  encrypted_primary_contact_name text NOT NULL,
  primary_contact_email_hash text NOT NULL,
  encrypted_primary_contact_email text NOT NULL,
  encrypted_primary_contact_phone text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS hotel_onboarding_steps (
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  step text NOT NULL CHECK (step IN (
    'TENANT_CREATED', 'BRAND_APP_CONFIG', 'DEPARTMENTS_STAFF', 'SERVICE_CATALOG',
    'RESERVATION_MAPPING', 'KNOWLEDGE', 'AUTOMATIONS', 'BILLING_WALLET',
    'APP_BUILD', 'QA_UAT', 'PUBLISH', 'PILOT', 'LIVE'
  )),
  status text NOT NULL CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETE', 'BLOCKED')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hotel_id, step)
);

CREATE TABLE IF NOT EXISTS hotel_service_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  code text NOT NULL,
  name text NOT NULL,
  department_code text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, code),
  FOREIGN KEY (hotel_id, department_code) REFERENCES hotel_departments(hotel_id, code)
);

CREATE TABLE IF NOT EXISTS hotel_public_config_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  hotel_app_id uuid NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  public_config jsonb NOT NULL,
  published_by text NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, hotel_app_id, version),
  FOREIGN KEY (hotel_id, hotel_app_id) REFERENCES hotel_apps(hotel_id, id)
);

CREATE OR REPLACE FUNCTION app.prevent_versioned_config_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'published hotel config versions are immutable' USING ERRCODE = '55000';
END
$$;

DROP TRIGGER IF EXISTS hotel_public_config_versions_immutable ON hotel_public_config_versions;
CREATE TRIGGER hotel_public_config_versions_immutable
BEFORE UPDATE OR DELETE ON hotel_public_config_versions
FOR EACH ROW EXECUTE FUNCTION app.prevent_versioned_config_change();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'hotel_onboarding_profiles', 'hotel_onboarding_steps', 'hotel_service_categories',
    'hotel_public_config_versions'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I TO staybuddy_app USING (hotel_id = app.current_hotel_id()) WITH CHECK (hotel_id = app.current_hotel_id())',
      table_name
    );
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

CREATE POLICY tenant_resolver_read_public_config ON hotel_public_config_versions
  FOR SELECT TO staybuddy_platform
  USING (app.current_platform_role() = 'STAYBUDDY_TENANT_RESOLVER');

GRANT SELECT, INSERT, UPDATE, DELETE ON hotel_onboarding_profiles, hotel_onboarding_steps,
  hotel_service_categories
  TO staybuddy_app, staybuddy_platform;
GRANT SELECT, INSERT ON hotel_public_config_versions TO staybuddy_app, staybuddy_platform;
GRANT SELECT ON hotel_public_config_versions TO staybuddy_platform;
