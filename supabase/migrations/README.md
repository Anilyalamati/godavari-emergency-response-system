# Supabase migrations

Stage 2's versioned PostgreSQL foundation is in `20261026135100_stage2_database_foundation.sql`. It creates the requested application tables and initial incident-state enum, applies integrity constraints and indexes, enables RLS, and revokes direct browser-role access. It intentionally creates no anonymous or authenticated policies.

The repeatable synthetic fixtures are in `../seed.sql`; pgTAP acceptance checks are in `../tests/database_foundation.test.sql`. From the project root, use `pnpm db:reset` to rebuild the local database from migrations and seed, `pnpm db:seed` to safely reapply the fixture SQL, and `pnpm db:test` to run the SQL assertions. See the [database setup guide](../../docs/database-setup.md) for setup boundaries and the no-remote-link rule.
