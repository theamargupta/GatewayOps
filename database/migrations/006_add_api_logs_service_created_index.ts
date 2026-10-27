import { Knex } from 'knex';

// Serves "filter by service, newest first" (GET /logs?service=...) without a sort.
export async function up(knex: Knex) {
  return knex.raw(
    'CREATE INDEX IF NOT EXISTS idx_api_logs_service_created ON api_logs (service_id, created_at DESC)',
  );
}

export async function down(knex: Knex) {
  return knex.raw('DROP INDEX IF EXISTS idx_api_logs_service_created');
}
