BEGIN;

CREATE TYPE public.staff_role AS ENUM ('ADMIN', 'OPERATOR', 'RESPONDER');
CREATE TYPE public.incident_category AS ENUM (
  'MEDICAL_ASSISTANCE',
  'CROWD_SAFETY',
  'LOST_PERSON',
  'INFRASTRUCTURE',
  'OTHER'
);
CREATE TYPE public.incident_priority AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE public.incident_status AS ENUM (
  'REPORTED',
  'UNDER_REVIEW',
  'ASSIGNED',
  'ACKNOWLEDGED',
  'EN_ROUTE',
  'ON_SCENE',
  'RESOLVED',
  'CLOSED',
  'DUPLICATE',
  'CANCELLED'
);
CREATE TYPE public.location_source AS ENUM (
  'GPS',
  'MAP_PIN',
  'LANDMARK',
  'VERBAL',
  'NOT_PROVIDED'
);
CREATE TYPE public.team_membership_role AS ENUM ('LEAD', 'MEMBER');
CREATE TYPE public.assignment_status AS ENUM (
  'PENDING',
  'ACKNOWLEDGED',
  'DECLINED',
  'COMPLETED',
  'CANCELLED'
);
CREATE TYPE public.reporter_contact_method AS ENUM ('PHONE', 'SMS', 'EMAIL', 'NONE');
CREATE TYPE public.incident_event_type AS ENUM (
  'REPORT_CREATED',
  'STATUS_CHANGED',
  'PRIORITY_CHANGED',
  'ASSIGNMENT_CREATED',
  'ASSIGNMENT_ACKNOWLEDGED',
  'LOCATION_UPDATED',
  'CONTACT_UPDATED',
  'DUPLICATE_LINKED',
  'DEMO_SEEDED'
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  display_name text NOT NULL
    CHECK (char_length(btrim(display_name)) BETWEEN 1 AND 120),
  role public.staff_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.zones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_code text NOT NULL UNIQUE
    CHECK (zone_code ~ '^[A-Z][A-Z0-9_-]{1,15}$'),
  name text NOT NULL
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  description text NOT NULL
    CHECK (char_length(btrim(description)) BETWEEN 1 AND 500),
  is_demo boolean NOT NULL DEFAULT false,
  fictional_location_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT zones_demo_locations_are_labelled
    CHECK (
      NOT is_demo
      OR (
        fictional_location_label IS NOT NULL
        AND char_length(btrim(fictional_location_label)) BETWEEN 1 AND 200
      )
    )
);

CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_code text NOT NULL UNIQUE
    CHECK (team_code ~ '^[A-Z][A-Z0-9_-]{1,15}$'),
  name text NOT NULL
    CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  capabilities text[] NOT NULL,
  is_demo boolean NOT NULL DEFAULT false,
  fictional_team_label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT teams_capabilities_nonempty
    CHECK (
      cardinality(capabilities) BETWEEN 1 AND 12
      AND array_position(capabilities, NULL) IS NULL
    ),
  CONSTRAINT teams_demo_labelled
    CHECK (
      NOT is_demo
      OR (
        fictional_team_label IS NOT NULL
        AND char_length(btrim(fictional_team_label)) BETWEEN 1 AND 200
      )
    )
);

-- Normalized many-to-many service-zone coverage; each side is protected by a foreign key.
CREATE TABLE public.team_zone_coverage (
  team_id uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  zone_id uuid NOT NULL REFERENCES public.zones (id) ON DELETE RESTRICT,
  covered_since timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, zone_id)
);

CREATE TABLE public.team_memberships (
  team_id uuid NOT NULL REFERENCES public.teams (id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  membership_role public.team_membership_role NOT NULL DEFAULT 'MEMBER',
  active boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, profile_id)
);

CREATE TABLE public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category public.incident_category NOT NULL,
  priority public.incident_priority NOT NULL DEFAULT 'NORMAL',
  status public.incident_status NOT NULL DEFAULT 'REPORTED',
  summary text NOT NULL
    CHECK (char_length(btrim(summary)) BETWEEN 1 AND 4000),
  reported_at timestamptz NOT NULL DEFAULT now(),
  location_source public.location_source NOT NULL DEFAULT 'NOT_PROVIDED',
  latitude numeric(9, 6),
  longitude numeric(9, 6),
  location_accuracy_m numeric(10, 2),
  landmark text
    CHECK (landmark IS NULL OR char_length(btrim(landmark)) <= 240),
  zone_id uuid REFERENCES public.zones (id) ON DELETE RESTRICT,
  location_captured_at timestamptz,
  location_is_fictional boolean NOT NULL DEFAULT false,
  is_demo boolean NOT NULL DEFAULT false,
  idempotency_key_sha256 bytea,
  public_tracking_token_sha256 bytea,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incidents_latitude_range
    CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CONSTRAINT incidents_longitude_range
    CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  CONSTRAINT incidents_coordinates_are_a_pair
    CHECK ((latitude IS NULL) = (longitude IS NULL)),
  CONSTRAINT incidents_accuracy_nonnegative
    CHECK (location_accuracy_m IS NULL OR location_accuracy_m >= 0),
  CONSTRAINT incidents_accuracy_requires_coordinates
    CHECK (location_accuracy_m IS NULL OR latitude IS NOT NULL),
  CONSTRAINT incidents_coordinate_sources_have_coordinates
    CHECK (
      location_source NOT IN ('GPS', 'MAP_PIN')
      OR latitude IS NOT NULL
    ),
  CONSTRAINT incidents_demo_location_is_fictional
    CHECK (NOT is_demo OR location_is_fictional),
  CONSTRAINT incidents_idempotency_digest_is_sha256
    CHECK (idempotency_key_sha256 IS NULL OR octet_length(idempotency_key_sha256) = 32),
  CONSTRAINT incidents_tracking_digest_is_sha256
    CHECK (public_tracking_token_sha256 IS NULL OR octet_length(public_tracking_token_sha256) = 32)
);

CREATE TABLE public.reporter_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL UNIQUE
    REFERENCES public.incidents (id) ON DELETE CASCADE,
  contact_name text
    CHECK (contact_name IS NULL OR char_length(btrim(contact_name)) BETWEEN 1 AND 160),
  phone_e164 text
    CHECK (phone_e164 IS NULL OR phone_e164 ~ '^[+][1-9][0-9]{7,14}$'),
  email_address text
    CHECK (
      email_address IS NULL
      OR (
        char_length(email_address) <= 254
        AND email_address ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
      )
    ),
  preferred_contact_method public.reporter_contact_method NOT NULL DEFAULT 'NONE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reporter_contact_method_has_address
    CHECK (
      (preferred_contact_method NOT IN ('PHONE', 'SMS') OR phone_e164 IS NOT NULL)
      AND (preferred_contact_method <> 'EMAIL' OR email_address IS NOT NULL)
    )
);

CREATE TABLE public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents (id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams (id) ON DELETE RESTRICT,
  assigned_by_profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  status public.assignment_status NOT NULL DEFAULT 'PENDING',
  assigned_at timestamptz NOT NULL DEFAULT now(),
  acknowledgement_deadline timestamptz NOT NULL,
  acknowledged_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT assignments_acknowledgement_deadline_after_assignment
    CHECK (acknowledgement_deadline > assigned_at),
  CONSTRAINT assignments_acknowledgement_after_assignment
    CHECK (acknowledged_at IS NULL OR acknowledged_at >= assigned_at),
  CONSTRAINT assignments_acknowledged_has_timestamp
    CHECK (status <> 'ACKNOWLEDGED' OR acknowledged_at IS NOT NULL)
);

CREATE TABLE public.incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.incidents (id) ON DELETE CASCADE,
  actor_profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  event_type public.incident_event_type NOT NULL,
  status_before public.incident_status,
  status_after public.incident_status,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT incident_events_status_change_consistent
    CHECK (
      (
        event_type = 'STATUS_CHANGED'
        AND status_before IS NOT NULL
        AND status_after IS NOT NULL
        AND status_before <> status_after
      )
      OR (
        event_type <> 'STATUS_CHANGED'
        AND status_before IS NULL
        AND status_after IS NULL
      )
    )
);

CREATE TABLE public.configuration (
  configuration_key text PRIMARY KEY
    CHECK (configuration_key ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  value jsonb NOT NULL CHECK (jsonb_typeof(value) = 'object'),
  description text NOT NULL
    CHECK (char_length(btrim(description)) BETWEEN 1 AND 500),
  updated_by_profile_id uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX profiles_role_idx ON public.profiles (role);
CREATE INDEX team_zone_coverage_zone_id_idx ON public.team_zone_coverage (zone_id);
CREATE INDEX team_memberships_profile_id_active_idx
  ON public.team_memberships (profile_id, active);
CREATE INDEX incidents_status_reported_at_idx
  ON public.incidents (status, reported_at DESC);
CREATE INDEX incidents_zone_reported_at_idx
  ON public.incidents (zone_id, reported_at DESC)
  WHERE zone_id IS NOT NULL;
CREATE UNIQUE INDEX incidents_idempotency_key_sha256_uidx
  ON public.incidents (idempotency_key_sha256)
  WHERE idempotency_key_sha256 IS NOT NULL;
CREATE UNIQUE INDEX incidents_public_tracking_token_sha256_uidx
  ON public.incidents (public_tracking_token_sha256)
  WHERE public_tracking_token_sha256 IS NOT NULL;
CREATE INDEX assignments_incident_status_idx
  ON public.assignments (incident_id, status);
CREATE INDEX assignments_team_deadline_idx
  ON public.assignments (team_id, acknowledgement_deadline);
CREATE INDEX assignments_assigned_by_profile_id_idx
  ON public.assignments (assigned_by_profile_id)
  WHERE assigned_by_profile_id IS NOT NULL;
CREATE INDEX incident_events_incident_occurred_at_idx
  ON public.incident_events (incident_id, occurred_at DESC);
CREATE INDEX incident_events_actor_profile_id_idx
  ON public.incident_events (actor_profile_id)
  WHERE actor_profile_id IS NOT NULL;
CREATE INDEX configuration_updated_by_profile_id_idx
  ON public.configuration (updated_by_profile_id)
  WHERE updated_by_profile_id IS NOT NULL;

COMMENT ON TABLE public.profiles IS
  'Controlled staff profile and role mapping for existing Supabase Auth identities; never public self-registration.';
COMMENT ON TABLE public.zones IS
  'Operational zone catalogue. Stage 2 seeds only explicitly fictional demonstration zones.';
COMMENT ON TABLE public.teams IS
  'Team capabilities catalogue. Stage 2 seeds only explicitly fictional teams, not staff.';
COMMENT ON TABLE public.team_zone_coverage IS
  'Normalized team-to-service-zone relation; foreign-key checked.';
COMMENT ON TABLE public.team_memberships IS
  'Memberships of provisioned staff profiles; no synthetic memberships are seeded.';
COMMENT ON TABLE public.incidents IS
  'Restricted operational incident record. Reporter contact details are held separately.';
COMMENT ON COLUMN public.incidents.idempotency_key_sha256 IS
  'Optional 32-byte SHA-256 digest of a high-entropy public submission key; never store its raw value.';
COMMENT ON COLUMN public.incidents.public_tracking_token_sha256 IS
  'Optional 32-byte SHA-256 digest of a high-entropy tracking token; never store or expose its raw value.';
COMMENT ON TABLE public.reporter_contacts IS
  'Restricted reporter contact details, separated from operational incident fields.';
COMMENT ON TABLE public.assignments IS
  'Restricted team assignment records with an explicit acknowledgement deadline.';
COMMENT ON TABLE public.incident_events IS
  'Restricted, timestamped incident event metadata; intentionally has no free-text field for contact data.';
COMMENT ON TABLE public.configuration IS
  'Restricted non-secret application configuration. Do not store credentials or tokens in value.';

-- Supabase checks both grants and RLS. Keep the public schema inaccessible to browser roles.
REVOKE ALL ON SCHEMA public FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA public TO service_role;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_zone_coverage ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reporter_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incident_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuration ENABLE ROW LEVEL SECURITY;

-- Intentionally create no policies: no anon or authenticated direct API access in Stage 2.
REVOKE ALL PRIVILEGES ON TABLE
  public.profiles,
  public.zones,
  public.teams,
  public.team_zone_coverage,
  public.team_memberships,
  public.incidents,
  public.reporter_contacts,
  public.assignments,
  public.incident_events,
  public.configuration
FROM PUBLIC, anon, authenticated;

-- Backend-only role. It bypasses RLS in Supabase and must never be exposed to a browser.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.profiles,
  public.zones,
  public.teams,
  public.team_zone_coverage,
  public.team_memberships,
  public.incidents,
  public.reporter_contacts,
  public.assignments,
  public.incident_events,
  public.configuration
TO service_role;

-- Future public-schema tables also start without client grants; later stages must grant narrowly.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated, service_role;

COMMIT;
