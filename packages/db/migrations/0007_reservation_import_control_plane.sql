CREATE TABLE reservation_import_previews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  source_system text NOT NULL,
  source_sha256 text NOT NULL,
  encrypted_source text NOT NULL,
  mapping jsonb NOT NULL,
  total_rows integer NOT NULL CHECK (total_rows >= 0),
  valid_rows integer NOT NULL CHECK (valid_rows >= 0),
  rejected_rows integer NOT NULL CHECK (rejected_rows >= 0),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  CHECK (valid_rows + rejected_rows = total_rows)
);

ALTER TABLE reservation_import_batches
  ADD COLUMN preview_id uuid REFERENCES reservation_import_previews(id),
  ADD COLUMN retry_of_batch_id uuid REFERENCES reservation_import_batches(id),
  ADD COLUMN created_rows integer NOT NULL DEFAULT 0 CHECK (created_rows >= 0),
  ADD COLUMN updated_rows integer NOT NULL DEFAULT 0 CHECK (updated_rows >= 0),
  ADD COLUMN unchanged_rows integer NOT NULL DEFAULT 0 CHECK (unchanged_rows >= 0),
  ADD COLUMN conflicted_rows integer NOT NULL DEFAULT 0 CHECK (conflicted_rows >= 0),
  ADD COLUMN last_error_code text;

ALTER TABLE reservations ADD COLUMN source_payload_sha256 text;
UPDATE reservations
SET source_payload_sha256 = encode(digest(source_payload::text, 'sha256'), 'hex')
WHERE source_payload_sha256 IS NULL;
ALTER TABLE reservations ALTER COLUMN source_payload_sha256 SET NOT NULL;

ALTER TABLE reservation_mapping_profiles ADD CONSTRAINT reservation_mapping_profiles_hotel_id_id_key UNIQUE (hotel_id, id);
ALTER TABLE reservation_import_previews ADD CONSTRAINT reservation_import_previews_hotel_id_id_key UNIQUE (hotel_id, id);
ALTER TABLE reservation_import_batches ADD CONSTRAINT reservation_import_batches_hotel_id_id_key UNIQUE (hotel_id, id);
ALTER TABLE reservations ADD CONSTRAINT reservations_hotel_id_id_key UNIQUE (hotel_id, id);

ALTER TABLE reservation_import_batches
  ADD CONSTRAINT reservation_import_batches_mapping_tenant_fk
    FOREIGN KEY (hotel_id, mapping_profile_id) REFERENCES reservation_mapping_profiles(hotel_id, id),
  ADD CONSTRAINT reservation_import_batches_preview_tenant_fk
    FOREIGN KEY (hotel_id, preview_id) REFERENCES reservation_import_previews(hotel_id, id),
  ADD CONSTRAINT reservation_import_batches_retry_tenant_fk
    FOREIGN KEY (hotel_id, retry_of_batch_id) REFERENCES reservation_import_batches(hotel_id, id);
ALTER TABLE reservations
  ADD CONSTRAINT reservations_batch_tenant_fk
    FOREIGN KEY (hotel_id, import_batch_id) REFERENCES reservation_import_batches(hotel_id, id);
ALTER TABLE reservation_rooms
  ADD CONSTRAINT reservation_rooms_reservation_tenant_fk
    FOREIGN KEY (hotel_id, reservation_id) REFERENCES reservations(hotel_id, id);
ALTER TABLE stays
  ADD CONSTRAINT stays_reservation_tenant_fk
    FOREIGN KEY (hotel_id, reservation_id) REFERENCES reservations(hotel_id, id);
ALTER TABLE reservation_import_rejections
  ADD CONSTRAINT reservation_import_rejections_batch_tenant_fk
    FOREIGN KEY (hotel_id, batch_id) REFERENCES reservation_import_batches(hotel_id, id);

CREATE INDEX reservation_import_previews_expiry_idx
  ON reservation_import_previews (expires_at) WHERE consumed_at IS NULL;
CREATE INDEX reservation_import_batches_history_idx
  ON reservation_import_batches (hotel_id, created_at DESC);

ALTER TABLE reservation_import_previews ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservation_import_previews FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON reservation_import_previews TO staybuddy_app
  USING (hotel_id = app.current_hotel_id())
  WITH CHECK (hotel_id = app.current_hotel_id());
GRANT SELECT, INSERT, UPDATE, DELETE ON reservation_import_previews TO staybuddy_app;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'reservation_mapping_profiles', 'reservation_import_previews', 'reservation_import_batches',
    'reservations', 'reservation_import_rejections'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS platform_reservation_read ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY platform_reservation_read ON %I FOR SELECT TO staybuddy_platform USING (app.current_platform_role() IN (''STAYBUDDY_SUPER_ADMIN'', ''STAYBUDDY_SUPPORT''))',
      table_name
    );
    EXECUTE format('GRANT SELECT ON %I TO staybuddy_platform', table_name);
  END LOOP;
END
$$;
