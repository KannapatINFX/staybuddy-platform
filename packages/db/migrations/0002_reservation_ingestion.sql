CREATE TABLE IF NOT EXISTS reservation_mapping_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  name text NOT NULL,
  source_system text NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  mapping jsonb NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, name, version)
);

CREATE TABLE IF NOT EXISTS reservation_import_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  source_system text NOT NULL,
  mapping_profile_id uuid REFERENCES reservation_mapping_profiles(id),
  source_file_key text,
  source_file_sha256 text,
  status text NOT NULL CHECK (status IN ('UPLOADED', 'PREVIEWED', 'PROCESSING', 'COMPLETED', 'PARTIALLY_REJECTED', 'FAILED')),
  total_rows integer NOT NULL DEFAULT 0 CHECK (total_rows >= 0),
  accepted_rows integer NOT NULL DEFAULT 0 CHECK (accepted_rows >= 0),
  rejected_rows integer NOT NULL DEFAULT 0 CHECK (rejected_rows >= 0),
  requested_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  source_system text NOT NULL,
  external_reservation_id text NOT NULL,
  source_version text NOT NULL,
  status text NOT NULL CHECK (status IN ('CONFIRMED', 'MODIFIED', 'CANCELLED', 'NO_SHOW')),
  booking_source text NOT NULL,
  confirmation_code text NOT NULL,
  primary_guest_name text NOT NULL,
  primary_guest_email_encrypted text,
  primary_guest_email_hash text,
  primary_guest_phone_encrypted text,
  nationality char(2),
  preferred_locale text CHECK (preferred_locale IN ('en', 'th', 'zh-CN', 'ru')),
  check_in_at timestamptz NOT NULL,
  check_out_at timestamptz NOT NULL CHECK (check_out_at > check_in_at),
  source_payload jsonb NOT NULL,
  source_updated_at timestamptz NOT NULL,
  import_batch_id uuid REFERENCES reservation_import_batches(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, source_system, external_reservation_id)
);

CREATE INDEX IF NOT EXISTS reservations_arrival_idx ON reservations (hotel_id, check_in_at, status);

CREATE TABLE IF NOT EXISTS reservation_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  reservation_id uuid NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  external_room_id text,
  room_type text,
  room_number text,
  adults integer CHECK (adults >= 0),
  children integer CHECK (children >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stays (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  reservation_id uuid NOT NULL REFERENCES reservations(id),
  lifecycle text NOT NULL CHECK (lifecycle IN ('RESERVATION_IMPORTED', 'UPCOMING', 'PRE_ARRIVAL_ACTIVATED', 'IN_HOUSE', 'DEPARTING', 'PAST_GUEST', 'REPEAT_DIRECT_BOOKING')),
  activated_at timestamptz,
  departing_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, reservation_id)
);

CREATE TABLE IF NOT EXISTS reservation_import_rejections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  batch_id uuid NOT NULL REFERENCES reservation_import_batches(id) ON DELETE CASCADE,
  row_number integer NOT NULL CHECK (row_number > 0),
  error_code text NOT NULL,
  safe_detail text NOT NULL,
  raw_row_encrypted text,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'reservation_mapping_profiles', 'reservation_import_batches', 'reservations', 'reservation_rooms',
    'stays', 'reservation_import_rejections'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', table_name);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON %I', table_name);
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON %I USING (hotel_id = app.current_hotel_id()) WITH CHECK (hotel_id = app.current_hotel_id())',
      table_name
    );
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %I TO staybuddy_app', table_name);
  END LOOP;
END
$$;
