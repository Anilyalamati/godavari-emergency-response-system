-- Synthetic demonstration data only. All labels, locations, and incidents below are fictional.
-- No staff profiles, memberships, assignments, reporter contacts, coordinates, or tokens are seeded.

INSERT INTO public.zones (
  id,
  zone_code,
  name,
  description,
  is_demo,
  fictional_location_label,
  created_at
)
VALUES
  (
    '00000000-0000-4000-8000-000000000101',
    'DEMO-Z01',
    'Amber Loop',
    'Fictional demonstration zone for database fixtures; it has no real-world boundary.',
    true,
    'FICTIONAL DEMONSTRATION AREA ONLY — not a real place or boundary.',
    '2026-10-26 09:00:00+05:30'
  ),
  (
    '00000000-0000-4000-8000-000000000102',
    'DEMO-Z02',
    'Paper Lantern Walk',
    'Fictional demonstration zone for database fixtures; it has no real-world boundary.',
    true,
    'FICTIONAL DEMONSTRATION AREA ONLY — not a real place or boundary.',
    '2026-10-26 09:00:00+05:30'
  ),
  (
    '00000000-0000-4000-8000-000000000103',
    'DEMO-Z03',
    'Mango-Glass Garden',
    'Fictional demonstration zone for database fixtures; it has no real-world boundary.',
    true,
    'FICTIONAL DEMONSTRATION AREA ONLY — not a real place or boundary.',
    '2026-10-26 09:00:00+05:30'
  ),
  (
    '00000000-0000-4000-8000-000000000104',
    'DEMO-Z04',
    'Copper Thread Court',
    'Fictional demonstration zone for database fixtures; it has no real-world boundary.',
    true,
    'FICTIONAL DEMONSTRATION AREA ONLY — not a real place or boundary.',
    '2026-10-26 09:00:00+05:30'
  ),
  (
    '00000000-0000-4000-8000-000000000105',
    'DEMO-Z05',
    'Riverglass Commons',
    'Fictional demonstration zone for database fixtures; it has no real-world boundary.',
    true,
    'FICTIONAL DEMONSTRATION AREA ONLY — not a real place or boundary.',
    '2026-10-26 09:00:00+05:30'
  )
ON CONFLICT (id) DO UPDATE SET
  zone_code = EXCLUDED.zone_code,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  is_demo = EXCLUDED.is_demo,
  fictional_location_label = EXCLUDED.fictional_location_label,
  created_at = EXCLUDED.created_at;

INSERT INTO public.teams (
  id,
  team_code,
  name,
  capabilities,
  is_demo,
  fictional_team_label,
  created_at
)
VALUES
  (
    '00000000-0000-4000-8000-000000000201',
    'DEMO-T01',
    'Amber Wayfinding Unit',
    ARRAY['public_guidance', 'wayfinding'],
    true,
    'FICTIONAL DEMONSTRATION TEAM — no real personnel or service.',
    '2026-10-26 09:00:00+05:30'
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    'DEMO-T02',
    'Paper Lantern Crowd Support',
    ARRAY['crowd_observation', 'crowd_guidance'],
    true,
    'FICTIONAL DEMONSTRATION TEAM — no real personnel or service.',
    '2026-10-26 09:00:00+05:30'
  ),
  (
    '00000000-0000-4000-8000-000000000203',
    'DEMO-T03',
    'Riverglass Welfare Link',
    ARRAY['welfare_check', 'accessibility_support'],
    true,
    'FICTIONAL DEMONSTRATION TEAM — no real personnel or service.',
    '2026-10-26 09:00:00+05:30'
  )
ON CONFLICT (id) DO UPDATE SET
  team_code = EXCLUDED.team_code,
  name = EXCLUDED.name,
  capabilities = EXCLUDED.capabilities,
  is_demo = EXCLUDED.is_demo,
  fictional_team_label = EXCLUDED.fictional_team_label,
  created_at = EXCLUDED.created_at;

INSERT INTO public.team_zone_coverage (team_id, zone_id, covered_since)
VALUES
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000101',
    '2026-10-26 09:00:00+05:30'
  ),
  (
    '00000000-0000-4000-8000-000000000201',
    '00000000-0000-4000-8000-000000000102',
    '2026-10-26 09:00:00+05:30'
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000102',
    '2026-10-26 09:00:00+05:30'
  ),
  (
    '00000000-0000-4000-8000-000000000202',
    '00000000-0000-4000-8000-000000000103',
    '2026-10-26 09:00:00+05:30'
  ),
  (
    '00000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000104',
    '2026-10-26 09:00:00+05:30'
  ),
  (
    '00000000-0000-4000-8000-000000000203',
    '00000000-0000-4000-8000-000000000105',
    '2026-10-26 09:00:00+05:30'
  )
ON CONFLICT (team_id, zone_id) DO UPDATE SET
  covered_since = EXCLUDED.covered_since;

INSERT INTO public.incidents (
  id,
  category,
  priority,
  status,
  summary,
  reported_at,
  location_source,
  latitude,
  longitude,
  location_accuracy_m,
  landmark,
  zone_id,
  location_captured_at,
  location_is_fictional,
  is_demo,
  created_at,
  updated_at
)
VALUES
  (
    '00000000-0000-4000-8000-000000000301',
    'CROWD_SAFETY',
    'NORMAL',
    'REPORTED',
    '[SYNTHETIC DEMO] Fictional example of a wayfinding question; no real report was made.',
    '2026-10-26 09:15:00+05:30',
    'LANDMARK',
    NULL,
    NULL,
    NULL,
    'FICTIONAL MARKER A-1 — not a real landmark.',
    '00000000-0000-4000-8000-000000000101',
    '2026-10-26 09:14:00+05:30',
    true,
    true,
    '2026-10-26 09:15:00+05:30',
    '2026-10-26 09:15:00+05:30'
  ),
  (
    '00000000-0000-4000-8000-000000000302',
    'LOST_PERSON',
    'NORMAL',
    'UNDER_REVIEW',
    '[SYNTHETIC DEMO] Fictional example for testing an incident state; no person is involved.',
    '2026-10-26 10:05:00+05:30',
    'LANDMARK',
    NULL,
    NULL,
    NULL,
    'FICTIONAL MARKER B-2 — not a real landmark.',
    '00000000-0000-4000-8000-000000000103',
    '2026-10-26 10:04:00+05:30',
    true,
    true,
    '2026-10-26 10:05:00+05:30',
    '2026-10-26 10:05:00+05:30'
  ),
  (
    '00000000-0000-4000-8000-000000000303',
    'INFRASTRUCTURE',
    'LOW',
    'RESOLVED',
    '[SYNTHETIC DEMO] Fictional example of a resolved notice; it describes no real hazard.',
    '2026-10-26 11:30:00+05:30',
    'LANDMARK',
    NULL,
    NULL,
    NULL,
    'FICTIONAL MARKER C-3 — not a real landmark.',
    '00000000-0000-4000-8000-000000000105',
    '2026-10-26 11:29:00+05:30',
    true,
    true,
    '2026-10-26 11:30:00+05:30',
    '2026-10-26 11:30:00+05:30'
  )
ON CONFLICT (id) DO UPDATE SET
  category = EXCLUDED.category,
  priority = EXCLUDED.priority,
  status = EXCLUDED.status,
  summary = EXCLUDED.summary,
  reported_at = EXCLUDED.reported_at,
  location_source = EXCLUDED.location_source,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  location_accuracy_m = EXCLUDED.location_accuracy_m,
  landmark = EXCLUDED.landmark,
  zone_id = EXCLUDED.zone_id,
  location_captured_at = EXCLUDED.location_captured_at,
  location_is_fictional = EXCLUDED.location_is_fictional,
  is_demo = EXCLUDED.is_demo,
  created_at = EXCLUDED.created_at,
  updated_at = EXCLUDED.updated_at;

INSERT INTO public.incident_events (
  id,
  incident_id,
  actor_profile_id,
  event_type,
  occurred_at
)
VALUES
  (
    '00000000-0000-4000-8000-000000000401',
    '00000000-0000-4000-8000-000000000301',
    NULL,
    'DEMO_SEEDED',
    '2026-10-26 09:15:00+05:30'
  ),
  (
    '00000000-0000-4000-8000-000000000402',
    '00000000-0000-4000-8000-000000000302',
    NULL,
    'DEMO_SEEDED',
    '2026-10-26 10:05:00+05:30'
  ),
  (
    '00000000-0000-4000-8000-000000000403',
    '00000000-0000-4000-8000-000000000303',
    NULL,
    'DEMO_SEEDED',
    '2026-10-26 11:30:00+05:30'
  )
ON CONFLICT (id) DO UPDATE SET
  incident_id = EXCLUDED.incident_id,
  actor_profile_id = EXCLUDED.actor_profile_id,
  event_type = EXCLUDED.event_type,
  status_before = NULL,
  status_after = NULL,
  occurred_at = EXCLUDED.occurred_at;

INSERT INTO public.configuration (
  configuration_key,
  value,
  description,
  updated_by_profile_id,
  updated_at
)
VALUES (
  'demo_data_label',
  '{"is_demo": true, "label": "Fictional demonstration data only"}'::jsonb,
  'Non-secret label for the synthetic demonstration dataset.',
  NULL,
  '2026-10-26 09:00:00+05:30'
)
ON CONFLICT (configuration_key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_by_profile_id = EXCLUDED.updated_by_profile_id,
  updated_at = EXCLUDED.updated_at;
