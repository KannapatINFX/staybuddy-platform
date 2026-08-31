CREATE TABLE IF NOT EXISTS hotel_guest_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  normalized_email_hash text NOT NULL,
  encrypted_email text NOT NULL,
  preferred_locale text NOT NULL CHECK (preferred_locale IN ('en', 'th', 'zh-CN', 'ru')),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'LOCKED', 'DELETION_PENDING', 'DEIDENTIFIED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, normalized_email_hash)
);

CREATE TABLE IF NOT EXISTS guest_auth_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  hotel_guest_account_id uuid NOT NULL REFERENCES hotel_guest_accounts(id),
  provider text NOT NULL CHECK (provider IN ('EMAIL', 'APPLE', 'GOOGLE')),
  provider_subject text NOT NULL,
  provider_email_encrypted text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, provider, provider_subject)
);

CREATE TABLE IF NOT EXISTS guest_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  hotel_guest_account_id uuid NOT NULL REFERENCES hotel_guest_accounts(id),
  installation_id text NOT NULL,
  platform text NOT NULL CHECK (platform IN ('IOS', 'ANDROID', 'WEB_TEST')),
  app_version text NOT NULL,
  locale text NOT NULL CHECK (locale IN ('en', 'th', 'zh-CN', 'ru')),
  status text NOT NULL CHECK (status IN ('ACTIVE', 'REVOKED')),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, installation_id)
);

CREATE TABLE IF NOT EXISTS guest_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  hotel_guest_account_id uuid NOT NULL REFERENCES hotel_guest_accounts(id),
  guest_device_id uuid NOT NULL REFERENCES guest_devices(id),
  refresh_token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  guest_device_id uuid NOT NULL REFERENCES guest_devices(id),
  provider text NOT NULL CHECK (provider IN ('APNS', 'FCM')),
  provider_token_encrypted text,
  permission_status text NOT NULL CHECK (permission_status IN ('GRANTED', 'DECLINED', 'UNDETERMINED', 'REVOKED')),
  last_validated_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, guest_device_id)
);

CREATE TABLE IF NOT EXISTS stay_claims (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  stay_id uuid NOT NULL REFERENCES stays(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  revoked_at timestamptz,
  issued_by_staff_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stay_claim_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  stay_claim_id uuid NOT NULL REFERENCES stay_claims(id),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  installation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prearrival_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  stay_id uuid NOT NULL REFERENCES stays(id),
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  claimed_by_account_id uuid REFERENCES hotel_guest_accounts(id),
  claimed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prearrival_invitation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  prearrival_invitation_id uuid NOT NULL REFERENCES prearrival_invitations(id),
  expires_at timestamptz NOT NULL,
  completed_at timestamptz,
  installation_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS stay_guest_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  stay_id uuid NOT NULL REFERENCES stays(id),
  hotel_guest_account_id uuid NOT NULL REFERENCES hotel_guest_accounts(id),
  reservation_room_id uuid REFERENCES reservation_rooms(id),
  relationship text NOT NULL CHECK (relationship IN ('PRIMARY', 'COMPANION')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (hotel_id, stay_id, hotel_guest_account_id)
);

CREATE TABLE IF NOT EXISTS consent_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  purpose text NOT NULL CHECK (purpose IN ('TERMS', 'PRIVACY', 'MARKETING', 'PARTNER_OFFERS')),
  channel text NOT NULL CHECK (channel IN ('SERVICE', 'EMAIL', 'PUSH', 'IN_APP')),
  version text NOT NULL,
  required boolean NOT NULL DEFAULT false,
  effective_at timestamptz NOT NULL,
  retired_at timestamptz,
  UNIQUE (hotel_id, purpose, channel, version)
);

CREATE TABLE IF NOT EXISTS consent_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  hotel_guest_account_id uuid NOT NULL REFERENCES hotel_guest_accounts(id),
  consent_definition_id uuid NOT NULL REFERENCES consent_definitions(id),
  purpose text NOT NULL,
  channel text NOT NULL,
  granted boolean NOT NULL,
  definition_version text NOT NULL,
  locale text NOT NULL CHECK (locale IN ('en', 'th', 'zh-CN', 'ru')),
  source text NOT NULL CHECK (source IN ('ONBOARDING', 'SETTINGS', 'POLICY_UPDATE')),
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS consent_current (
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  hotel_guest_account_id uuid NOT NULL REFERENCES hotel_guest_accounts(id),
  purpose text NOT NULL,
  channel text NOT NULL,
  consent_event_id uuid NOT NULL REFERENCES consent_events(id),
  granted boolean NOT NULL,
  definition_version text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (hotel_id, hotel_guest_account_id, purpose, channel)
);

CREATE TABLE IF NOT EXISTS email_otp_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES hotels(id),
  normalized_email_hash text NOT NULL,
  encrypted_email text NOT NULL,
  code_hash text NOT NULL,
  installation_id text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS consent_events_append_only ON consent_events;
CREATE TRIGGER consent_events_append_only
BEFORE UPDATE OR DELETE ON consent_events
FOR EACH ROW EXECUTE FUNCTION app.prevent_append_only_change();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'hotel_guest_accounts', 'guest_auth_identities', 'guest_devices', 'guest_sessions', 'push_subscriptions',
    'stay_claims', 'stay_claim_sessions', 'prearrival_invitations', 'prearrival_invitation_sessions', 'stay_guest_memberships',
    'consent_definitions', 'consent_events', 'consent_current', 'email_otp_challenges'
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

REVOKE UPDATE, DELETE ON consent_events FROM staybuddy_app;
