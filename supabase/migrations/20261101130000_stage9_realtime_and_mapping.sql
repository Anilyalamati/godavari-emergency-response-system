BEGIN;

-- Stage 9: Realtime updates and mapping
-- 1. Setup Supabase Realtime publication
-- Only operational records (incidents, assignments, incident_events) are published.
-- SENSITIVITY BOUNDARY: reporter_contacts and tracking tokens are EXPLICITLY EXCLUDED.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

-- Set REPLICA IDENTITY FULL so realtime row-level filters and payloads can access all columns
ALTER TABLE public.incidents REPLICA IDENTITY FULL;
ALTER TABLE public.assignments REPLICA IDENTITY FULL;
ALTER TABLE public.incident_events REPLICA IDENTITY FULL;

-- Add operational tables to realtime publication
DO $$
BEGIN
  -- Add incidents if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'incidents'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.incidents;
  END IF;

  -- Add assignments if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.assignments;
  END IF;

  -- Add incident_events if not already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'incident_events'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.incident_events;
  END IF;
END $$;

-- Ensure reporter_contacts is NOT in publication
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'reporter_contacts'
  ) THEN
    ALTER PUBLICATION supabase_realtime DROP TABLE public.reporter_contacts;
  END IF;
END $$;

-- 2. Store default Map Tile Configuration in public.configuration
INSERT INTO public.configuration (
  configuration_key,
  value,
  description,
  updated_at
)
VALUES (
  'map_tile_provider',
  jsonb_build_object(
    'tile_url', 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    'attribution', '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    'max_zoom', 19,
    'default_center', jsonb_build_array(17.001, 81.78),
    'default_zoom', 15
  ),
  'Configurable tile provider URL template and attribution for operational mapping.',
  now()
)
ON CONFLICT (configuration_key) DO UPDATE SET
  value = EXCLUDED.value,
  description = EXCLUDED.description,
  updated_at = EXCLUDED.updated_at;

COMMIT;
