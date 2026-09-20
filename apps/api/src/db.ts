import { Pool } from 'pg';

/**
 * The application connects as `orbit_app`, which holds INSERT and SELECT on the
 * immutable tables and nothing else. That is not a convention this module
 * follows; it is what the role is able to do.
 */
export const pool = new Pool({
  connectionString:
    process.env['ORBIT_DATABASE_URL']
    ?? `postgres://orbit_app:orbit_app_local_only@localhost/orbit2_dev`,
});
