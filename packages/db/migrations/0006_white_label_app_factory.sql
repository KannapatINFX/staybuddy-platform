ALTER TABLE platform_role_grants DROP CONSTRAINT IF EXISTS platform_role_grants_role_check;
ALTER TABLE platform_role_grants ADD CONSTRAINT platform_role_grants_role_check CHECK (role IN (
  'STAYBUDDY_SUPER_ADMIN', 'STAYBUDDY_APP_OPS', 'STAYBUDDY_CONTENT_OPS',
  'STAYBUDDY_FINANCE', 'STAYBUDDY_SUPPORT'
));

ALTER TABLE hotel_apps ADD COLUMN IF NOT EXISTS build_config_version integer NOT NULL DEFAULT 1
  CHECK (build_config_version > 0);
ALTER TABLE hotel_apps ADD COLUMN IF NOT EXISTS build_config_status text NOT NULL DEFAULT 'MISSING'
  CHECK (build_config_status IN ('MISSING', 'VALID', 'BLOCKED'));
ALTER TABLE hotel_apps ADD COLUMN IF NOT EXISTS asset_status text NOT NULL DEFAULT 'MISSING'
  CHECK (asset_status IN ('MISSING', 'SYNTHETIC', 'APPROVED'));
ALTER TABLE hotel_apps ADD COLUMN IF NOT EXISTS asset_manifest jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE hotel_apps ADD COLUMN IF NOT EXISTS deep_link_config jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE hotel_apps ADD COLUMN IF NOT EXISTS store_listing jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE app_build_jobs ADD COLUMN IF NOT EXISTS commit_sha text NOT NULL DEFAULT 'unknown';
ALTER TABLE app_build_jobs ADD COLUMN IF NOT EXISTS source_config_version integer NOT NULL DEFAULT 1
  CHECK (source_config_version > 0);
ALTER TABLE app_build_jobs ADD COLUMN IF NOT EXISTS artifact_reference text;
ALTER TABLE app_build_jobs ADD COLUMN IF NOT EXISTS validation_summary jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE app_build_jobs ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE app_build_jobs ADD COLUMN IF NOT EXISTS completed_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS app_build_jobs_one_active_lane
  ON app_build_jobs (hotel_app_id, platform)
  WHERE status IN ('QUEUED', 'VALIDATING', 'BUILDING');
CREATE INDEX IF NOT EXISTS app_build_jobs_queue_order
  ON app_build_jobs (status, created_at, id)
  WHERE status IN ('QUEUED', 'VALIDATING', 'BUILDING');
CREATE UNIQUE INDEX IF NOT EXISTS app_build_jobs_tenant_id ON app_build_jobs (hotel_id, id);

CREATE TABLE IF NOT EXISTS app_build_status_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  hotel_app_id uuid NOT NULL,
  app_build_job_id uuid NOT NULL,
  prior_status text,
  status text NOT NULL CHECK (status IN (
    'QUEUED', 'VALIDATING', 'BUILDING', 'BUILT', 'FAILED', 'CANCELLED'
  )),
  provider_reference text,
  artifact_reference text,
  failure_code text,
  validation_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
  actor_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (hotel_id, hotel_app_id) REFERENCES hotel_apps(hotel_id, id),
  FOREIGN KEY (hotel_id, app_build_job_id) REFERENCES app_build_jobs(hotel_id, id)
);

CREATE OR REPLACE FUNCTION app.prevent_app_build_event_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'app build status events are append-only' USING ERRCODE = '55000';
END
$$;

DROP TRIGGER IF EXISTS app_build_status_events_append_only ON app_build_status_events;
CREATE TRIGGER app_build_status_events_append_only
BEFORE UPDATE OR DELETE ON app_build_status_events
FOR EACH ROW EXECUTE FUNCTION app.prevent_app_build_event_change();

ALTER TABLE app_build_status_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_build_status_events FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON app_build_status_events TO staybuddy_app
  USING (hotel_id = app.current_hotel_id())
  WITH CHECK (hotel_id = app.current_hotel_id());
CREATE POLICY platform_read ON app_build_status_events FOR SELECT TO staybuddy_platform
  USING (app.current_platform_role() IN ('STAYBUDDY_SUPER_ADMIN', 'STAYBUDDY_SUPPORT'));
CREATE POLICY platform_write ON app_build_status_events FOR INSERT TO staybuddy_platform
  WITH CHECK (app.current_platform_role() = 'STAYBUDDY_SUPER_ADMIN');

CREATE POLICY app_ops_read_hotels ON hotels FOR SELECT TO staybuddy_platform
  USING (app.current_platform_role() = 'STAYBUDDY_APP_OPS');
CREATE POLICY app_ops_read_apps ON hotel_apps FOR SELECT TO staybuddy_platform
  USING (app.current_platform_role() = 'STAYBUDDY_APP_OPS');
CREATE POLICY app_ops_write_apps ON hotel_apps FOR UPDATE TO staybuddy_platform
  USING (app.current_platform_role() = 'STAYBUDDY_APP_OPS')
  WITH CHECK (app.current_platform_role() = 'STAYBUDDY_APP_OPS');
CREATE POLICY app_ops_read_builds ON app_build_jobs FOR SELECT TO staybuddy_platform
  USING (app.current_platform_role() = 'STAYBUDDY_APP_OPS');
CREATE POLICY app_ops_write_builds ON app_build_jobs FOR ALL TO staybuddy_platform
  USING (app.current_platform_role() = 'STAYBUDDY_APP_OPS')
  WITH CHECK (app.current_platform_role() = 'STAYBUDDY_APP_OPS');
CREATE POLICY app_ops_read_build_events ON app_build_status_events FOR SELECT TO staybuddy_platform
  USING (app.current_platform_role() = 'STAYBUDDY_APP_OPS');
CREATE POLICY app_ops_write_build_events ON app_build_status_events FOR INSERT TO staybuddy_platform
  WITH CHECK (app.current_platform_role() = 'STAYBUDDY_APP_OPS');

-- App Ops can use only app-factory command scopes and can emit only app lifecycle evidence.
-- These narrow policies avoid expanding the role into hotel onboarding or unrelated platform work.
CREATE POLICY app_ops_read_idempotency ON idempotency_keys FOR SELECT TO staybuddy_platform
  USING (
    app.current_platform_role() = 'STAYBUDDY_APP_OPS'
    AND hotel_id IS NULL
    AND (platform_scope LIKE 'hotel-app.build-config:%' OR platform_scope LIKE 'app-build.%')
  );
CREATE POLICY app_ops_insert_idempotency ON idempotency_keys FOR INSERT TO staybuddy_platform
  WITH CHECK (
    app.current_platform_role() = 'STAYBUDDY_APP_OPS'
    AND hotel_id IS NULL
    AND (platform_scope LIKE 'hotel-app.build-config:%' OR platform_scope LIKE 'app-build.%')
  );
CREATE POLICY app_ops_update_idempotency ON idempotency_keys FOR UPDATE TO staybuddy_platform
  USING (
    app.current_platform_role() = 'STAYBUDDY_APP_OPS'
    AND hotel_id IS NULL
    AND (platform_scope LIKE 'hotel-app.build-config:%' OR platform_scope LIKE 'app-build.%')
  )
  WITH CHECK (
    app.current_platform_role() = 'STAYBUDDY_APP_OPS'
    AND hotel_id IS NULL
    AND (platform_scope LIKE 'hotel-app.build-config:%' OR platform_scope LIKE 'app-build.%')
  );
CREATE POLICY app_ops_insert_audit ON audit_logs FOR INSERT TO staybuddy_platform
  WITH CHECK (
    app.current_platform_role() = 'STAYBUDDY_APP_OPS'
    AND actor_role = 'STAYBUDDY_APP_OPS'
    AND action LIKE 'app.%'
  );
CREATE POLICY app_ops_insert_outbox ON outbox_events FOR INSERT TO staybuddy_platform
  WITH CHECK (
    app.current_platform_role() = 'STAYBUDDY_APP_OPS'
    AND event_type LIKE 'app.%'
    AND actor->>'role' = 'STAYBUDDY_APP_OPS'
  );

GRANT SELECT, INSERT ON app_build_status_events TO staybuddy_app;
GRANT SELECT, INSERT ON app_build_status_events TO staybuddy_platform;
GRANT SELECT, UPDATE ON hotel_apps TO staybuddy_platform;
GRANT SELECT, INSERT, UPDATE ON app_build_jobs TO staybuddy_platform;
